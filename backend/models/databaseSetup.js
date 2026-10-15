const { pool } = require("../db");

const ensureDatabaseSchema = async () => {
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
      resident_id INTEGER,
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
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      full_name TEXT,
      role TEXT DEFAULT 'staff',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS login_activity (
      id BIGSERIAL PRIMARY KEY,
      session_id UUID UNIQUE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      account_identifier TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failed')),
      login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      logout_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_activity_at TIMESTAMPTZ,
      session_status TEXT NOT NULL CHECK (session_status IN ('active', 'logged_out', 'expired', 'failed')),
      ip_address TEXT,
      location_city TEXT,
      location_region TEXT,
      location_country TEXT,
      device_type TEXT,
      operating_system TEXT,
      browser TEXT,
      user_agent TEXT,
      failure_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  ];

  for (const statement of schemaStatements) {
    await pool.query(statement);
  }

  await pool.query("CREATE INDEX IF NOT EXISTS login_activity_login_at_idx ON login_activity (login_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS login_activity_user_id_idx ON login_activity (user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS login_activity_event_type_idx ON login_activity (event_type)");
  await pool.query("CREATE INDEX IF NOT EXISTS login_activity_session_status_idx ON login_activity (session_status)");

  const addColumns = [
    ["residents", "resident_id", "TEXT"],
    ["residents", "birth_date", "DATE"],
    ["residents", "contact_number", "TEXT"],
    ["residents", "civil_status", "TEXT"],
    ["document_requests", "status", "TEXT"],
    ["officials", "official_id", "TEXT"],
    ["announcements", "announcement_id", "TEXT"],
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
