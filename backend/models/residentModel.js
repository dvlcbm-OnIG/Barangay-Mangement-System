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

  const searchTerms = search.trim().split(/\s+/).filter(Boolean);
  if (searchTerms.length > 0) {
    const searchableFields = [
      "resident_id::text",
      "full_name",
      "address",
      "contact_number",
      "civil_status",
      "sex",
      "birth_date::text",
    ];
    const termConditions = searchTerms.map((term) => {
      params.push(`%${term}%`);
      const placeholder = `$${params.length}`;
      return `(${searchableFields.map((field) => `${field} ILIKE ${placeholder}`).join(" OR ")})`;
    });
    whereSql = ` WHERE ${termConditions.join(" OR ")}`;
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
