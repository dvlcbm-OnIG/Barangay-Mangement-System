const express = require("express");
const app = express();
const pool = require("./db");


//start server
async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to the database");
    app.listen(3000, () => {
      console.log("Server running on port 3000");
    });
  } catch (error) {
    console.error("Could not connect to the database:", error.message);
  }
}
startServer();
