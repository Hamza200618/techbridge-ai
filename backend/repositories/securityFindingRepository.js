'use strict';

const { pool } = require('../config/database');

// Read access to the existing `security_findings` table. Rows are written by
// the analysis pipeline (analysisResultRepository); evidence is masked by
// the analyzer before it is stored. The affected file's path is joined in
// so finding lines can always show a real project path; the extra key is
// ignored by the public finding model.

const FINDING_SELECT = `
  SELECT sf.*, pf.path AS file_path
    FROM security_findings sf
    LEFT JOIN project_files pf ON pf.id = sf.file_id`;

const FINDING_ORDER = `FIELD(sf.severity, 'critical', 'high', 'medium', 'low', 'info'),
               sf.category ASC, sf.id ASC`;

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${FINDING_SELECT}
      WHERE sf.project_id = ?
      ORDER BY ${FINDING_ORDER}`,
    [projectId],
  );
  return rows;
}

async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `${FINDING_SELECT}
      WHERE sf.project_id = ? AND sf.file_id = ?
      ORDER BY ${FINDING_ORDER}`,
    [projectId, fileId],
  );
  return rows;
}

// Findings attached to any of the given files (impact analysis).
async function findByFileIds(projectId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `${FINDING_SELECT}
      WHERE sf.project_id = ? AND sf.file_id IN (${placeholders})
      ORDER BY ${FINDING_ORDER}`,
    [projectId, ...fileIds],
  );
  return rows;
}

async function findById(projectId, findingId) {
  const [rows] = await pool.query(
    `${FINDING_SELECT}
      WHERE sf.project_id = ? AND sf.id = ?`,
    [projectId, findingId],
  );
  return rows[0] || null;
}

module.exports = { findByProjectId, findById, findByFileId, findByFileIds };
