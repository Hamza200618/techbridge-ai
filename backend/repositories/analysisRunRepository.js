'use strict';

const { pool } = require('../config/database');

// Data access for the existing `analysis_runs` table. Columns are exactly
// those defined in database/schema.sql.

function encodeMetadata(metadata) {
  if (metadata === null || metadata === undefined) return null;
  return JSON.stringify(metadata);
}

async function createRun({ projectId, runType }) {
  const [result] = await pool.query(
    'INSERT INTO analysis_runs (project_id, run_type, status, progress) VALUES (?, ?, ?, ?)',
    [projectId, runType, 'queued', 0],
  );
  return result.insertId;
}

async function findById(runId) {
  const [rows] = await pool.query('SELECT * FROM analysis_runs WHERE id = ?', [runId]);
  return rows[0] || null;
}

// A run that has been created but has not reached a terminal state.
async function findActiveByProjectId(projectId) {
  const [rows] = await pool.query(
    `SELECT * FROM analysis_runs
      WHERE project_id = ? AND status IN ('queued', 'running')
      ORDER BY id DESC LIMIT 1`,
    [projectId],
  );
  return rows[0] || null;
}

async function findLatestByProjectId(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM analysis_runs WHERE project_id = ? ORDER BY id DESC LIMIT 1',
    [projectId],
  );
  return rows[0] || null;
}

async function markRunning(runId, metadata) {
  await pool.query(
    `UPDATE analysis_runs
        SET status = 'running', started_at = CURRENT_TIMESTAMP, metadata = ?
      WHERE id = ?`,
    [encodeMetadata(metadata), runId],
  );
}

async function updateProgress(runId, progress, metadata) {
  await pool.query(
    'UPDATE analysis_runs SET progress = ?, metadata = ? WHERE id = ?',
    [progress, encodeMetadata(metadata), runId],
  );
}

async function markCompleted(runId, { filesAnalyzed, issuesFound, metadata }) {
  await pool.query(
    `UPDATE analysis_runs
        SET status = 'completed', progress = 100, files_analyzed = ?,
            issues_found = ?, completed_at = CURRENT_TIMESTAMP, metadata = ?
      WHERE id = ?`,
    [filesAnalyzed, issuesFound, encodeMetadata(metadata), runId],
  );
}

async function markFailed(runId, errorMessage, metadata) {
  await pool.query(
    `UPDATE analysis_runs
        SET status = 'failed', completed_at = CURRENT_TIMESTAMP,
            error_message = ?, metadata = ?
      WHERE id = ?`,
    [String(errorMessage).slice(0, 1000), encodeMetadata(metadata), runId],
  );
}

// Runs interrupted by a server restart must not stay "running" forever.
async function failStaleRuns() {
  const [result] = await pool.query(
    `UPDATE analysis_runs
        SET status = 'failed',
            completed_at = CURRENT_TIMESTAMP,
            error_message = 'Analysis interrupted by server restart.'
      WHERE status IN ('queued', 'running')`,
  );
  return result.affectedRows;
}

module.exports = {
  createRun,
  findById,
  findActiveByProjectId,
  findLatestByProjectId,
  markRunning,
  updateProgress,
  markCompleted,
  markFailed,
  failStaleRuns,
};
