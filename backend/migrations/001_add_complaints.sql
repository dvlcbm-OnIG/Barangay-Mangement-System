CREATE TABLE IF NOT EXISTS complaints (
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
);

CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status);
CREATE INDEX IF NOT EXISTS complaints_priority_idx ON complaints (priority);
CREATE INDEX IF NOT EXISTS complaints_resident_id_idx ON complaints (resident_id);
