const { pool } = require("../db");

const getSummary = async () => {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*)::int FROM residents) AS total_residents,
      (SELECT COUNT(*)::int FROM document_requests WHERE status ILIKE 'Pending') AS pending_requests,
      (SELECT COUNT(*)::int FROM officials) AS total_officials,
      (SELECT COUNT(*)::int FROM announcements) AS total_announcements`
  );
  return result.rows[0];
};

module.exports = { getSummary };
