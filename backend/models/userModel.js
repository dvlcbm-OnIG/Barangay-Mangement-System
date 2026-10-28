const { pool } = require("../db");
const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);
const HASH_PREFIX = "scrypt";

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedPassword) => {
  if (!storedPassword.startsWith(`${HASH_PREFIX}$`)) {
    const provided = Buffer.from(password);
    const stored = Buffer.from(storedPassword);
    const valid = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
    return { valid, needsRehash: valid };
  }

  const [, salt, storedHash] = storedPassword.split("$");
  if (!salt || !storedHash) return { valid: false, needsRehash: false };
  const derivedKey = await scrypt(password, salt, 64);
  const expected = Buffer.from(storedHash, "hex");
  const valid = expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey);
  return { valid, needsRehash: false };
};

const authenticate = async (username, password) => {
  const result = await pool.query(
    "SELECT id, username, password, full_name, role, resident_id, official_id FROM users WHERE username = $1 LIMIT 1",
    [username]
  );

  const user = result.rows[0];
  if (!user) return null;

  const validProfileLink =
    (user.role === "admin" && user.resident_id === null && user.official_id === null) ||
    (user.role === "resident" && user.resident_id !== null && user.official_id === null) ||
    (user.role === "official" && user.official_id !== null && user.resident_id === null);
  if (!validProfileLink) return null;

  const verification = await verifyPassword(password, user.password || "");
  if (!verification.valid) return null;

  if (verification.needsRehash) {
    const passwordHash = await hashPassword(password);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, user.id]);
  }

  const authenticatedUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  };
  if (user.role === "resident") authenticatedUser.resident_id = user.resident_id;
  if (user.role === "official") authenticatedUser.official_id = user.official_id;
  return authenticatedUser;
};

const createProfileAccount = async ({ profileType, profileId, username, password }) => {
  const profileConfig = {
    resident: { table: "residents", linkColumn: "resident_id" },
    official: { table: "officials", linkColumn: "official_id" },
  }[profileType];

  if (!profileConfig) {
    const error = new Error("Profile type must be resident or official.");
    error.code = "INVALID_PROFILE_TYPE";
    throw error;
  }

  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const profileResult = await client.query(
      `SELECT id, full_name FROM ${profileConfig.table} WHERE id = $1 FOR UPDATE`,
      [profileId]
    );
    if (profileResult.rowCount === 0) {
      const error = new Error("The selected profile was not found.");
      error.code = "PROFILE_NOT_FOUND";
      throw error;
    }

    const linkedAccount = await client.query(
      `SELECT id FROM users WHERE ${profileConfig.linkColumn} = $1 LIMIT 1`,
      [profileId]
    );
    if (linkedAccount.rowCount > 0) {
      const error = new Error("The selected profile already has a login account.");
      error.code = "PROFILE_ALREADY_LINKED";
      throw error;
    }

    const profile = profileResult.rows[0];
    const accountResult = await client.query(
      `INSERT INTO users (username, password, full_name, role, resident_id, official_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, full_name, role, resident_id, official_id`,
      [
        username,
        passwordHash,
        profile.full_name,
        profileType,
        profileType === "resident" ? profileId : null,
        profileType === "official" ? profileId : null,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;
    return accountResult.rows[0];
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (_rollbackError) {
        // Preserve the original failure for the caller.
      }
    }
    throw error;
  } finally {
    client.release();
  }
};

const createConfiguredAdmin = async () => {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username && !password) return false;
  if (!username || !password) {
    throw new Error("Set both ADMIN_USERNAME and ADMIN_PASSWORD to configure the initial administrator.");
  }

  const existing = await pool.query(
    "SELECT id, password, role FROM users WHERE username = $1 LIMIT 1",
    [username]
  );
  const passwordHash = await hashPassword(password);
  const fullName = process.env.ADMIN_FULL_NAME || "Barangay Administrator";

  if (existing.rowCount === 0) {
    await pool.query(
      "INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, 'admin')",
      [username, passwordHash, fullName]
    );
    return true;
  }

  const user = existing.rows[0];
  const verification = await verifyPassword(password, user.password || "");
  if (verification.valid && user.role === "admin" && !verification.needsRehash) return false;

  await pool.query(
    "UPDATE users SET password = $1, role = 'admin', full_name = $2 WHERE id = $3",
    [passwordHash, fullName, user.id]
  );
  return true;
};

module.exports = { authenticate, createConfiguredAdmin, createProfileAccount, hashPassword };
