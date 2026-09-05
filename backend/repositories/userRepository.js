'use strict';

const { pool } = require('../config/database');

// Database access for the existing `users` table.
// Columns are exactly those defined in database/schema.sql — no new columns,
// no new tables. password_hash is only ever selected by
// findByEmailWithPasswordHash (used exclusively by login).

const PUBLIC_COLUMNS = 'id, full_name, email, avatar_url, role, is_active, created_at, updated_at';

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = ?`,
    [email],
  );
  return rows[0] || null;
}

// Login-only lookup: includes password_hash for bcrypt comparison.
async function findByEmailWithPasswordHash(email) {
  const [rows] = await pool.query(
    'SELECT id, full_name, email, password_hash, avatar_url, role, is_active, created_at, updated_at FROM users WHERE email = ?',
    [email],
  );
  return rows[0] || null;
}

async function createUser({ fullName, email, passwordHash }) {
  const [result] = await pool.query(
    'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
    [fullName, email, passwordHash],
  );
  return result.insertId;
}

module.exports = { findById, findByEmail, findByEmailWithPasswordHash, createUser };
