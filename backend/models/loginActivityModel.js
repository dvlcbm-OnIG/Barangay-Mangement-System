const { pool } = require("../db");

const createSuccessfulLogin = async ({ sessionId, user, expiresInMs, metadata }) => {
  const result = await pool.query(
    `INSERT INTO login_activity
      (session_id, user_id, account_identifier, event_type, session_status, expires_at,
       last_activity_at, ip_address, device_type, operating_system, browser, user_agent)
     VALUES ($1, $2, $3, 'login_success', 'active',
       NOW() + ($4 * INTERVAL '1 millisecond'), NOW(), $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      sessionId,
      user.id,
      user.username,
      expiresInMs,
      metadata.ipAddress,
      metadata.deviceType,
      metadata.operatingSystem,
      metadata.browser,
      metadata.userAgent,
    ]
  );
  return result.rows[0];
};

const createFailedLogin = async ({ accountIdentifier, failureReason, metadata }) => {
  await pool.query(
    `INSERT INTO login_activity
      (account_identifier, event_type, session_status, ip_address, device_type,
       operating_system, browser, user_agent, failure_reason)
     VALUES ($1, 'login_failed', 'failed', $2, $3, $4, $5, $6, $7)`,
    [
      accountIdentifier,
      metadata.ipAddress,
      metadata.deviceType,
      metadata.operatingSystem,
      metadata.browser,
      metadata.userAgent,
      failureReason,
    ]
  );
};

const markLoggedOut = async (sessionId) => {
  const result = await pool.query(
    `UPDATE login_activity
     SET session_status = 'logged_out', logout_at = NOW(), last_activity_at = NOW()
     WHERE session_id = $1 AND event_type = 'login_success'
       AND session_status = 'active' AND expires_at > NOW()`,
    [sessionId]
  );
  return result.rowCount;
};

const markExpired = async (sessionId) => {
  await pool.query(
    `UPDATE login_activity
     SET session_status = 'expired'
     WHERE session_id = $1 AND event_type = 'login_success' AND session_status = 'active'`,
    [sessionId]
  );
};

const expireElapsedSessions = async () => {
  await pool.query(
    `UPDATE login_activity
     SET session_status = 'expired'
     WHERE event_type = 'login_success'
       AND session_status = 'active'
       AND expires_at <= NOW()`
  );
};

const updateLastActivity = async (sessionId) => {
  await pool.query(
    `UPDATE login_activity SET last_activity_at = NOW()
     WHERE session_id = $1 AND session_status = 'active'`,
    [sessionId]
  );
};

const findPage = async ({ search, eventType, status, from, to, sort, page, limit }) => {
  const conditions = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (search) {
    const value = addParam(`%${search}%`);
    conditions.push(`(
      COALESCE(u.full_name, '') ILIKE ${value}
      OR COALESCE(u.username, '') ILIKE ${value}
      OR COALESCE(a.account_identifier, '') ILIKE ${value}
      OR COALESCE(a.user_id::text, '') ILIKE ${value}
    )`);
  }
  if (eventType === "success") conditions.push("a.event_type = 'login_success'");
  if (eventType === "failed") conditions.push("a.event_type = 'login_failed'");
  if (eventType === "logout") conditions.push("a.logout_at IS NOT NULL");
  if (status) conditions.push(`a.session_status = ${addParam(status)}`);
  if (from) {
    const value = addParam(from);
    conditions.push(`(a.login_at >= ${value} OR a.logout_at >= ${value})`);
  }
  if (to) {
    const value = addParam(to);
    conditions.push(`(a.login_at < ${value} OR a.logout_at < ${value})`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM login_activity a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}`,
    [...params]
  );

  const sortColumn = sort === "last_activity_at" ? "a.last_activity_at" : "a.login_at";
  const limitParam = addParam(limit);
  const offsetParam = addParam((page - 1) * limit);
  const result = await pool.query(
    `SELECT a.id, a.session_id, a.user_id, a.account_identifier, a.event_type,
       a.login_at, a.logout_at, a.expires_at, a.last_activity_at, a.session_status,
       a.ip_address, a.location_city, a.location_region, a.location_country,
       a.device_type, a.operating_system, a.browser, a.user_agent, a.failure_reason,
       u.username, u.full_name
     FROM login_activity a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereSql}
     ORDER BY ${sortColumn} DESC NULLS LAST, a.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params
  );

  return { data: result.rows, total: count.rows[0].total, page, limit };
};

const getSummary = async ({ from, to }) => {
  const params = [];
  let loginRangeSql = "";
  let logoutRangeSql = "";
  if (from) {
    const placeholder = `$${params.push(from)}`;
    loginRangeSql += ` AND login_at >= ${placeholder}`;
    logoutRangeSql += ` AND logout_at >= ${placeholder}`;
  }
  if (to) {
    const placeholder = `$${params.push(to)}`;
    loginRangeSql += ` AND login_at < ${placeholder}`;
    logoutRangeSql += ` AND logout_at < ${placeholder}`;
  }

  const result = await pool.query(
    `SELECT
       (COUNT(*) FILTER (WHERE event_type = 'login_success'${loginRangeSql}))::int AS successful_logins,
       (COUNT(*) FILTER (WHERE event_type = 'login_failed'${loginRangeSql}))::int AS failed_logins,
       (COUNT(*) FILTER (WHERE event_type = 'login_success'
          AND session_status = 'active' AND expires_at > NOW()))::int AS active_sessions,
       (COUNT(*) FILTER (WHERE logout_at IS NOT NULL${logoutRangeSql}))::int AS logouts
     FROM login_activity`,
    params
  );
  return result.rows[0];
};

module.exports = {
  createSuccessfulLogin,
  createFailedLogin,
  markLoggedOut,
  markExpired,
  expireElapsedSessions,
  updateLastActivity,
  findPage,
  getSummary,
};
