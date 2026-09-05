'use strict';

const { pool } = require('../config/database');

// Data access for the existing project_files table. Discovery rows are
// written by the analyzer's persist step; this module only reads — with two
// narrow write exceptions made by the change-apply flow: recording the fresh
// content hash of applied content, and transitioning analysis_status back
// to 'pending' so a modified file is visibly stale until re-analysis
// (docs/API_CONTRACT.md section 18.1: mark analysis as potentially stale).
// Project deletion is handled by projectRepository — project_files cascades.

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM project_files WHERE project_id = ? ORDER BY path ASC',
    [projectId],
  );
  return rows;
}

async function findById(fileId) {
  const [rows] = await pool.query('SELECT * FROM project_files WHERE id = ?', [fileId]);
  return rows[0] || null;
}

// Loads a file row scoped to its project (docs/API_CONTRACT.md section 26:
// the requested resource must belong to the project). Used by components
// that already verified project ownership and want both checks in one read.
async function findByIdAndProject(projectId, fileId) {
  const [rows] = await pool.query(
    'SELECT * FROM project_files WHERE project_id = ? AND id = ?',
    [projectId, fileId],
  );
  return rows[0] || null;
}

// Loads several file rows scoped to their project (relationship neighbours,
// impact sets). Returns rows keyed by the caller's ids, ordered by path.
async function findByIds(projectId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT * FROM project_files
      WHERE project_id = ? AND id IN (${placeholders})
      ORDER BY path ASC`,
    [projectId, ...fileIds],
  );
  return rows;
}

// Marks a file's stored analysis as stale: the working copy changed under
// it, so its health, issues and findings predate the modification until the
// analyzer runs again (which re-inserts the row with fresh values).
async function markAnalysisPending(projectId, fileId) {
  await pool.query(
    "UPDATE project_files SET analysis_status = 'pending' WHERE project_id = ? AND id = ?",
    [projectId, fileId],
  );
}

// Records the content hash of applied content. The value must come from
// utils/hash.js storageHash (the analyzer's bare sha256 format) so the
// column stays comparable with discovery-written rows.
async function updateContentHash(projectId, fileId, hash) {
  await pool.query(
    'UPDATE project_files SET content_hash = ? WHERE project_id = ? AND id = ?',
    [hash, projectId, fileId],
  );
}

module.exports = {
  findByProjectId,
  findById,
  findByIdAndProject,
  findByIds,
  markAnalysisPending,
  updateContentHash,
};
