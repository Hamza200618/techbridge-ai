'use strict';

const { pool } = require('../config/database');

// Read access to the existing `project_dependencies` table. Rows are written
// by the analysis pipeline (analysisResultRepository); the manifest file each
// dependency was declared in links back through source_file_id.

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `SELECT * FROM project_dependencies
      WHERE project_id = ?
      ORDER BY FIELD(dependency_type, 'runtime', 'development', 'peer', 'optional', 'unknown'),
               name ASC`,
    [projectId],
  );
  return rows;
}

module.exports = { findByProjectId };
