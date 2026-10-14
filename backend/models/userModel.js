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
    "SELECT id, username, password, full_name, role FROM users WHERE username = $1 LIMIT 1",
    [username]
  );

  const user = result.rows[0];
  if (!user) return null;

  const verification = await verifyPassword(password, user.password || "");
  if (!verification.valid || user.role !== "admin") return null;

  if (verification.needsRehash) {
    const passwordHash = await hashPassword(password);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [passwordHash, user.id]);
  }

  return { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
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

module.exports = { authenticate, createConfiguredAdmin, hashPassword };
