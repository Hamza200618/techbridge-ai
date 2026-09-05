'use strict';

const { pool } = require('../config/database');

// Read access to the existing `database_entities` table. Rows are written by
// the analysis pipeline (analysisResultRepository); names are detected facts
// only — credentials are never stored. The referencing file's path is joined
// in so entity lines can always show a real project path.

const ENTITY_SELECT = `
  SELECT de.*, pf.path AS file_path
    FROM database_entities de
    LEFT JOIN project_files pf ON pf.id = de.file_id`;

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${ENTITY_SELECT}
     WHERE de.project_id = ?
     ORDER BY de.entity_type ASC, de.name ASC`,
    [projectId],
  );
  return rows;
}

async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `${ENTITY_SELECT}
     WHERE de.project_id = ? AND de.file_id = ?
     ORDER BY de.entity_type ASC, de.name ASC`,
    [projectId, fileId],
  );
  return rows;
}

async function findByFileIds(projectId, fileIds) {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `${ENTITY_SELECT}
     WHERE de.project_id = ? AND de.file_id IN (${placeholders})
     ORDER BY de.entity_type ASC, de.name ASC`,
    [projectId, ...fileIds],
  );
  return rows;
}

module.exports = { findByProjectId, findByFileId, findByFileIds };
