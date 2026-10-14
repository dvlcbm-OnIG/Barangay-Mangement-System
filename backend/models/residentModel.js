const { pool } = require("../db");
const createResourceModel = require("./resourceModel");

const resourceModel = createResourceModel(
  "residents",
  ["resident_id", "full_name", "birth_date", "sex", "address", "contact_number", "civil_status"]
);

const findPage = async ({ search, page, limit }) => {
  const offset = (page - 1) * limit;
  const params = [];
  let whereSql = "";

  if (search) {
    whereSql =
      " WHERE resident_id::text ILIKE $1 OR full_name ILIKE $1 OR address ILIKE $1 OR contact_number ILIKE $1 OR civil_status ILIKE $1 OR sex ILIKE $1 OR birth_date::text ILIKE $1";
    params.push(`%${search}%`);
  }

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM residents${whereSql}`,
    params
  );
  const result = await pool.query(
    `SELECT * FROM residents${whereSql} ORDER BY id ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { rows: result.rows, total: countResult.rows[0].total, page, limit };
};

module.exports = { ...resourceModel, findPage };
