'use strict';

const { pool } = require('../config/database');

// Data access repository for the existing `validation_runs` table.
// Stores project build, test, lint, and syntax validation execution results.

const RUN_SELECT = `
  SELECT id, project_id, type, status, command, output, error_output,
         exit_code, duration_ms, created_at
    FROM validation_runs`;

async function createRun({ projectId, type = 'full', status = 'queued', command = null }) {
  const [result] = await pool.query(
    `INSERT INTO validation_runs (project_id, type, status, command)
     VALUES (?, ?, ?, ?)`,
    [projectId, type, status, command],
  );
  return result.insertId;
}

async function markRunning(runId, command = null) {
  await pool.query(
    `UPDATE validation_runs
        SET status = 'running',
            command = COALESCE(?, command)
      WHERE id = ?`,
    [command, runId],
  );
}

async function updateRunResult(runId, { status, command, output, errorOutput, exitCode, durationMs }) {
  await pool.query(
    `UPDATE validation_runs
        SET status = ?,
            command = COALESCE(?, command),
            output = ?,
            error_output = ?,
            exit_code = ?,
            duration_ms = ?
      WHERE id = ?`,
    [status, command, output, errorOutput, exitCode, durationMs, runId],
  );
}

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${RUN_SELECT}
      WHERE project_id = ?
      ORDER BY id DESC`,
    [projectId],
  );
  return rows;
}

async function findById(projectId, runId) {
  const [rows] = await pool.query(
    `${RUN_SELECT}
      WHERE project_id = ? AND id = ?`,
    [projectId, runId],
  );
  return rows[0] || null;
}

async function findLatestByProjectId(projectId) {
  const [rows] = await pool.query(
    `${RUN_SELECT}
      WHERE project_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [projectId],
  );
  return rows[0] || null;
}

module.exports = {
  createRun,
  markRunning,
  updateRunResult,
  findByProjectId,
  findById,
  findLatestByProjectId,
};
