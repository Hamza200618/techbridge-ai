'use strict';

const { pool } = require('../config/database');

// Read access to the existing `analysis_issues` table. Rows are written by
// the analysis pipeline (analysisResultRepository). The affected file's path
// is joined in so issue lines can always show a real project path; the extra
// key is ignored by the public issue model.

const ISSUE_SELECT = `
  SELECT ai.*, pf.path AS file_path
    FROM analysis_issues ai
    LEFT JOIN project_files pf ON pf.id = ai.file_id`;

const ISSUE_ORDER = `FIELD(ai.severity, 'critical', 'high', 'medium', 'low', 'info'),
               ai.title ASC, ai.id ASC`;

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${ISSUE_SELECT}
      WHERE ai.project_id = ?
      ORDER BY ${ISSUE_ORDER}`,
    [projectId],
  );
  return rows;
}

// Loads one issue scoped to its project (docs/API_CONTRACT.md section 26:
// the requested resource must belong to the project).
async function findById(projectId, issueId) {
  const [rows] = await pool.query(
    `${ISSUE_SELECT}
      WHERE ai.project_id = ? AND ai.id = ?`,
    [projectId, issueId],
  );
  return rows[0] || null;
}

async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `${ISSUE_SELECT}
      WHERE ai.project_id = ? AND ai.file_id = ?
      ORDER BY ${ISSUE_ORDER}`,
    [projectId, fileId],
  );
  return rows;
}

// Issues attached to any of the given files (impact analysis).
async function findByFileIds(projectId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `${ISSUE_SELECT}
      WHERE ai.project_id = ? AND ai.file_id IN (${placeholders})
      ORDER BY ${ISSUE_ORDER}`,
    [projectId, ...fileIds],
  );
  return rows;
}

module.exports = { findByProjectId, findById, findByFileId, findByFileIds };
