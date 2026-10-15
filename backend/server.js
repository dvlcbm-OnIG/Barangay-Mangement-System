const express = require("express");
const path = require("path");
const { pool } = require("./db");
const { ensureDatabaseSchema, seedDemoData } = require("./models/databaseSetup");
const { createConfiguredAdmin } = require("./models/userModel");
const { getSessionUser, requireAuth } = require("./auth");
const apiRoutes = require("./routes/apiRoutes");

const app = express();

app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  if (!getSessionUser(req)) return res.redirect("/login.html");
  res.sendFile(path.join(__dirname, "..", "Frontend", "index.html"));
});

app.get(["/login", "/login.html"], (req, res) => {
  if (getSessionUser(req)) return res.redirect("/");
  res.sendFile(path.join(__dirname, "..", "Frontend", "login.html"));
});

app.use(apiRoutes);
app.use(requireAuth, express.static(path.join(__dirname, "..", "Frontend")));

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await ensureDatabaseSchema();
    await seedDemoData();
    const adminCreated = await createConfiguredAdmin();
    if (adminCreated) console.log("Created or synchronized the configured administrator account");
    if (!process.env.ADMIN_USERNAME && !process.env.ADMIN_PASSWORD) {
      console.warn("No initial administrator configured; set ADMIN_USERNAME and ADMIN_PASSWORD if needed.");
    }
    console.log("Connected to the database");
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Could not initialize the server:", error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
