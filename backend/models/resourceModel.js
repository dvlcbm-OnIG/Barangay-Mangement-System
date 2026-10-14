const { pool } = require("../db");

const createResourceModel = (tableName, fields, orderBy = "id ASC") => {
  const fieldSet = new Set(fields);

  return {
    async create(payload) {
      const entries = Object.entries(payload).filter(([field]) => fieldSet.has(field));
      const columns = entries.map(([field]) => field);
      const values = entries.map(([, value]) => value);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const result = await pool.query(
        `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        values
      );
      return result.rows[0];
    },

    async findAll() {
      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`);
      return result.rows;
    },

    async update(id, payload) {
      const entries = Object.entries(payload).filter(([field]) => fieldSet.has(field));
      const assignments = entries.map(([field], index) => `${field} = $${index + 1}`);
      const values = entries.map(([, value]) => value);
      values.push(id);
      const result = await pool.query(
        `UPDATE ${tableName} SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
        values
      );
      return result.rows[0] || null;
    },

    async delete(id) {
      const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING id`, [id]);
      return result.rowCount > 0;
    },
  };
};

module.exports = createResourceModel;
