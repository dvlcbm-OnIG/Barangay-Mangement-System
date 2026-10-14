const pool = require("./db");

const getAllEmployees = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM employees ORDER BY id"
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = getAllEmployees