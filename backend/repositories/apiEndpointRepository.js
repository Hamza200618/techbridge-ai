'use strict';

const { pool } = require('../config/database');

// Read access to the existing `api_endpoints` table. Rows are written by the
// analysis pipeline (analysisResultRepository). The owning file's path is
// joined in so endpoint lines can always show a real project path.

const ENDPOINT_SELECT = `
  SELECT ae.*, pf.path AS file_path
    FROM api_endpoints ae
    LEFT JOIN project_files pf ON pf.id = ae.file_id`;

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${ENDPOINT_SELECT}
     WHERE ae.project_id = ?
     ORDER BY ae.route ASC, ae.method ASC`,
    [projectId],
  );
  return rows;
}

async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `${ENDPOINT_SELECT}
     WHERE ae.project_id = ? AND ae.file_id = ?
     ORDER BY ae.route ASC, ae.method ASC`,
    [projectId, fileId],
  );
  return rows;
}

// Endpoints defined in any of the given files (impact analysis asks for
// "everything the affected files expose").
async function findByFileIds(projectId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `${ENDPOINT_SELECT}
     WHERE ae.project_id = ? AND ae.file_id IN (${placeholders})
     ORDER BY ae.route ASC, ae.method ASC`,
    [projectId, ...fileIds],
  );
  return rows;
}

module.exports = { findByProjectId, findByFileId, findByFileIds };
