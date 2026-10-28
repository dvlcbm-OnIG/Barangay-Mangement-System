const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

const migrationDirectory = path.join(__dirname, "..", "migrations");

const ensureSchemaMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const applyMigrations = async () => {
  if (!fs.existsSync(migrationDirectory)) return;

  const files = fs
    .readdirSync(migrationDirectory)
    .filter((file) => file.toLowerCase().endsWith(".sql"))
    .sort();

  for (const file of files) {
    const migrationName = file;
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1 LIMIT 1", [migrationName]);
    if (exists.rowCount > 0) continue;

    const migrationSql = fs.readFileSync(path.join(migrationDirectory, file), "utf8");
    await pool.query(migrationSql);
    await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migrationName]);
  }
};

const ensureDatabaseSchema = async () => {
  await ensureSchemaMigrationsTable();

  const schemaStatements = [
    `CREATE TABLE IF NOT EXISTS residents (
      id SERIAL PRIMARY KEY,
      resident_id TEXT UNIQUE,
      full_name TEXT,
      birth_date DATE,
      sex TEXT,
      address TEXT,
      contact_number TEXT,
      civil_status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS document_requests (
      id SERIAL PRIMARY KEY,
      resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      document_type TEXT,
      date_requested DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS officials (
      id SERIAL PRIMARY KEY,
      official_id TEXT UNIQUE,
      full_name TEXT,
      position TEXT,
      term TEXT,
      contact_number TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      announcement_id TEXT UNIQUE,
      title TEXT,
      content TEXT,
      date_published DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY,
      complaint_id TEXT UNIQUE,
      resident_id INTEGER REFERENCES residents(id) ON DELETE SET NULL,
      complainant_name TEXT NOT NULL,
      complainant_contact TEXT,
      complaint_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Under Review', 'Validated', 'Resolved', 'Rejected')),
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      full_name TEXT,
      role TEXT DEFAULT 'staff',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }

  await applyMigrations();

  await pool.query("CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status)");
  await pool.query("CREATE INDEX IF NOT EXISTS complaints_priority_idx ON complaints (priority)");
  await pool.query("CREATE INDEX IF NOT EXISTS complaints_resident_id_idx ON complaints (resident_id)");

  const addColumns = [
    ["residents", "resident_id", "TEXT"],
    ["residents", "birth_date", "DATE"],
    ["residents", "contact_number", "TEXT"],
    ["residents", "civil_status", "TEXT"],
    ["document_requests", "status", "TEXT"],
    ["officials", "official_id", "TEXT"],
    ["announcements", "announcement_id", "TEXT"],
    ["complaints", "complaint_id", "TEXT"],
    ["complaints", "resident_id", "INTEGER"],
    ["complaints", "complainant_name", "TEXT"],
    ["complaints", "complainant_contact", "TEXT"],
    ["complaints", "complaint_type", "TEXT"],
    ["complaints", "subject", "TEXT"],
    ["complaints", "description", "TEXT"],
    ["complaints", "status", "TEXT"],
    ["complaints", "priority", "TEXT"],
    ["complaints", "resolved_at", "TIMESTAMP"],
    ["users", "role", "TEXT"],
  ];

  for (const [tableName, columnName, columnType] of addColumns) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnType}`);
  }
};

const seedDemoData = async () => {
  const residentCount = await pool.query("SELECT COUNT(*)::int AS total FROM residents");
  if (residentCount.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO residents (resident_id, full_name, birth_date, sex, address, contact_number, civil_status)
       VALUES
         ('RES-1001', 'Maria Santos', '1990-05-14', 'Female', 'Blk 2 Lot 5, Sampaguita St.', '09171234567', 'Married'),
         ('RES-1002', 'Pedro Dela Cruz', '1985-08-21', 'Male', 'Zone 4, Mabini Street', '09281234568', 'Married'),
         ('RES-1003', 'Ana Reyes', '2001-11-03', 'Female', 'Purok 7, San Isidro', '09391234569', 'Single')`
    );
  }

  const requestCount = await pool.query("SELECT COUNT(*)::int AS total FROM document_requests");
  if (requestCount.rows[0].total === 0) {
    const resident = await pool.query("SELECT id FROM residents ORDER BY id LIMIT 1");
    const residentId = resident.rows[0]?.id || 1;
    await pool.query(
      `INSERT INTO document_requests (resident_id, document_type, date_requested, status)
       VALUES
         ($1, 'Barangay Clearance', CURRENT_DATE, 'Pending'),
         ($1, 'Certificate of Residency', CURRENT_DATE - 1, 'Processing')`,
      [residentId]
    );
  }

  const officialCount = await pool.query("SELECT COUNT(*)::int AS total FROM officials");
  if (officialCount.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO officials (official_id, full_name, position, term, contact_number)
       VALUES
         ('OFF-1001', 'Eduardo Lim', 'Punong Barangay', '2025-2028', '09175551234'),
         ('OFF-1002', 'Rosalinda Ramos', 'Barangay Secretary', '2025-2028', '09285551235')`
    );
  }

  const announcementCount = await pool.query("SELECT COUNT(*)::int AS total FROM announcements");
  if (announcementCount.rows[0].total === 0) {
    await pool.query(
      `INSERT INTO announcements (announcement_id, title, content, date_published)
       VALUES
         ('ANN-1001', 'Community Cleanup Drive', 'Join us this Saturday for the barangay cleanup drive.', CURRENT_DATE),
         ('ANN-1002', 'Vaccination Schedule', 'Residents are invited to the free vaccination schedule at the barangay hall.', CURRENT_DATE - 2)`
    );
  }

};

module.exports = { ensureDatabaseSchema, seedDemoData };
