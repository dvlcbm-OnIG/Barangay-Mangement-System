const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : false,
});

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    : null;

module.exports = pool;
module.exports.pool = pool;
module.exports.supabase = supabase;
