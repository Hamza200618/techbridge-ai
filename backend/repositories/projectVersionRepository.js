'use strict';

const { pool } = require('../config/database');

// Data access for the existing `project_versions` table (docs/PROJECT_SPEC.md
// section 5, docs/ARCHITECTURE.md section 19: applying a change records a
// version). The previous file content itself is preserved immutably in
// code_changes.old_content; the version row anchors the history: who applied
// what, when, and as which per-project version number. Rows cascade on
// project deletion; created_by is SET NULL by the schema.

// Allocates the next version number for the project and inserts the version
// row. The (project_id, version_number) unique key makes concurrent applies
// collide; the allocation is retried with a fresh MAX()+1 before giving up.
async function createNextVersion({ projectId, label, description, createdBy }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [rows] = await pool.query(
      'SELECT COALESCE(MAX(version_number), 0) AS maxVersion FROM project_versions WHERE project_id = ?',
      [projectId],
    );
    const versionNumber = Number(rows[0].maxVersion) + 1;
    try {
      const [result] = await pool.query(
        `INSERT INTO project_versions (project_id, version_number, label, description, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, versionNumber, label, description, createdBy],
      );
      return { id: result.insertId, versionNumber };
    } catch (error) {
      const isDuplicate = error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062);
      if (!isDuplicate) {
        throw error;
      }
    }
  }
  throw new Error('Could not allocate the next project version number.');
}

// Removes a version row — used only to roll back the version created while an
// apply attempt failed before its file write completed.
async function deleteById(versionId) {
  await pool.query('DELETE FROM project_versions WHERE id = ?', [versionId]);
}

async function countByProjectId(projectId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM project_versions WHERE project_id = ?',
    [projectId],
  );
  return Number(rows[0].count);
}

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number ASC',
    [projectId],
  );
  return rows;
}

module.exports = { createNextVersion, deleteById, countByProjectId, findByProjectId };
