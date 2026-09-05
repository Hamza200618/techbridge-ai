'use strict';

const { pool } = require('../config/database');

// Data access repository for the existing `project_exports` table.
// Stores export archives generated from modified project working copies.

const EXPORT_SELECT = `
  SELECT id, project_id, version_id, filename, storage_path, size_bytes,
         status, created_at, expires_at
    FROM project_exports`;

async function createExport({ projectId, versionId = null, filename, storagePath, sizeBytes = null, status = 'creating' }) {
  const [result] = await pool.query(
    `INSERT INTO project_exports (project_id, version_id, filename, storage_path, size_bytes, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, versionId, filename, storagePath, sizeBytes, status],
  );
  return result.insertId;
}

async function updateExportStatus(id, { status, sizeBytes = null, storagePath = null }) {
  await pool.query(
    `UPDATE project_exports
        SET status = ?,
            size_bytes = COALESCE(?, size_bytes),
            storage_path = COALESCE(?, storage_path)
      WHERE id = ?`,
    [status, sizeBytes, storagePath, id],
  );
}

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `${EXPORT_SELECT}
      WHERE project_id = ?
      ORDER BY id DESC`,
    [projectId],
  );
  return rows;
}

async function findById(projectId, exportId) {
  const [rows] = await pool.query(
    `${EXPORT_SELECT}
      WHERE project_id = ? AND id = ?`,
    [projectId, exportId],
  );
  return rows[0] || null;
}

module.exports = {
  createExport,
  updateExportStatus,
  findByProjectId,
  findById,
};
