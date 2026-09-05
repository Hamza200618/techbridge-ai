'use strict';

const { pool } = require('../config/database');

// Database access for the existing `projects` table. Columns are exactly
// those defined in database/schema.sql — no new columns, no new tables.
// (user_id, name, original_filename, storage_path, extracted_path,
// working_path, project_type, primary_language, framework, total_files,
// total_lines, total_size_bytes, health_score, status, analysis_progress)

// Whitelist of columns updateProject may touch.
const UPDATABLE_COLUMNS = [
  'name',
  'original_filename',
  'storage_path',
  'extracted_path',
  'working_path',
  'project_type',
  'primary_language',
  'framework',
  'total_files',
  'total_lines',
  'total_size_bytes',
  'health_score',
  'status',
  'analysis_progress',
];

async function createProject({ userId, name, originalFilename }) {
  const [result] = await pool.query(
    'INSERT INTO projects (user_id, name, original_filename) VALUES (?, ?, ?)',
    [userId, name, originalFilename],
  );
  return result.insertId;
}

async function findById(projectId) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);
  return rows[0] || null;
}

async function findByUserId(userId) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC', [userId]);
  return rows;
}

// Partial update restricted to UPDATABLE_COLUMNS. Column names come from the
// whitelist (never from user input); values are parameterized. An optional
// pooled connection lets callers include the update inside their own
// transaction (used by the analysis persist step).
async function updateProject(projectId, fields, connection = pool) {
  const updates = UPDATABLE_COLUMNS.filter((column) => fields[column] !== undefined);
  if (updates.length === 0) {
    return;
  }
  const setClause = updates.map((column) => `${column} = ?`).join(', ');
  const values = updates.map((column) => fields[column]);
  await connection.query(`UPDATE projects SET ${setClause} WHERE id = ?`, [...values, projectId]);
}

async function deleteProject(projectId) {
  await pool.query('DELETE FROM projects WHERE id = ?', [projectId]);
}

module.exports = { createProject, findById, findByUserId, updateProject, deleteProject };
