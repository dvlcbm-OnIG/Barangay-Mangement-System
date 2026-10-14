const { pool } = require("../db");
const createResourceModel = require("./resourceModel");

const resourceModel = createResourceModel(
  "document_requests",
  ["resident_id", "document_type", "date_requested", "status"]
);

const findAllWithResidentNames = async () => {
  const result = await pool.query(
    `SELECT dr.*, r.full_name AS resident_name
     FROM document_requests dr
     LEFT JOIN residents r ON r.id = dr.resident_id
     ORDER BY dr.id ASC`
  );
  return result.rows;
};

const residentExists = async (id) => {
  const result = await pool.query("SELECT id FROM residents WHERE id = $1 LIMIT 1", [id]);
  return result.rowCount > 0;
};

module.exports = { ...resourceModel, findAllWithResidentNames, residentExists };
