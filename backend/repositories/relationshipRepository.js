'use strict';

const { pool } = require('../config/database');

// Read access to the existing `code_relationships` table. Rows are written by
// the analysis pipeline and only describe imports that resolve to real
// project files (the analyzer never invents edges — docs/TEAM_RULES.md
// section 17). Source and target paths are joined in so callers never need a
// second lookup, and relationship lines can always show real paths.

const EDGE_SELECT = `
  SELECT cr.id, cr.project_id, cr.source_file_id, cr.target_file_id,
         cr.relationship_type, cr.symbol_name, cr.created_at,
         src.path AS source_path, tgt.path AS target_path
    FROM code_relationships cr
    JOIN project_files src ON src.id = cr.source_file_id
    LEFT JOIN project_files tgt ON tgt.id = cr.target_file_id`;

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${EDGE_SELECT}
     WHERE cr.project_id = ?
     ORDER BY src.path ASC, tgt.path ASC`,
    [projectId],
  );
  return rows;
}

// Edges touching one file in either direction (imports it makes and imports
// other files make of it).
async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `${EDGE_SELECT}
     WHERE cr.project_id = ? AND (cr.source_file_id = ? OR cr.target_file_id = ?)
     ORDER BY src.path ASC, tgt.path ASC`,
    [projectId, fileId, fileId],
  );
  return rows;
}

module.exports = { findByProjectId, findByFileId };
