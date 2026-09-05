'use strict';

const { pool } = require('../config/database');

// Data access for the existing `code_changes` table (docs/API_CONTRACT.md
// sections 17-20). Fix proposals are INSERTed with status 'proposed'; the
// apply/reject flow transitions the status — nothing here writes to the
// filesystem. Rows cascade on project/file deletion; issue, conversation
// and user references are SET NULL by the schema.

async function createChange({
  projectId,
  fileId,
  conversationId = null,
  issueId = null,
  changeType,
  description = null,
  oldContent = null,
  newContent = null,
  diffContent = null,
  status = 'proposed',
  createdBy = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO code_changes
       (project_id, file_id, conversation_id, issue_id, change_type, description,
        old_content, new_content, diff_content, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      fileId,
      conversationId,
      issueId,
      changeType,
      description,
      oldContent,
      newContent,
      diffContent,
      status,
      createdBy,
    ],
  );
  return result.insertId;
}

async function findById(changeId) {
  const [rows] = await pool.query('SELECT * FROM code_changes WHERE id = ?', [changeId]);
  return rows[0] || null;
}

// Loads a change row scoped to its project (docs/API_CONTRACT.md section 26:
// the requested resource must belong to the project). Used after project
// ownership was verified.
async function findByIdAndProject(projectId, changeId) {
  const [rows] = await pool.query(
    'SELECT * FROM code_changes WHERE project_id = ? AND id = ?',
    [projectId, changeId],
  );
  return rows[0] || null;
}

// Conditional status transition: the row is only updated while it is still
// in `fromStatus`. Returns false when another request already moved it — the
// serialization point protecting concurrent apply/reject of the same change.
async function updateStatus(changeId, fromStatus, toStatus) {
  const [result] = await pool.query(
    'UPDATE code_changes SET status = ? WHERE id = ? AND status = ?',
    [toStatus, changeId, fromStatus],
  );
  return result.affectedRows === 1;
}

async function countByProjectId(projectId) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM code_changes WHERE project_id = ?',
    [projectId],
  );
  return Number(rows[0].count);
}

async function findByProjectId(projectId) {
  const [rows] = await pool.query(
    `SELECT cc.*, pf.path AS file_path, pf.content_hash AS file_content_hash
       FROM code_changes cc
       LEFT JOIN project_files pf ON pf.id = cc.file_id
       WHERE cc.project_id = ?
       ORDER BY cc.created_at ASC, cc.id ASC`,
    [projectId],
  );
  return rows;
}

async function findByFileId(projectId, fileId) {
  const [rows] = await pool.query(
    `SELECT cc.*, pf.path AS file_path, pf.content_hash AS file_content_hash
       FROM code_changes cc
       LEFT JOIN project_files pf ON pf.id = cc.file_id
       WHERE cc.project_id = ? AND cc.file_id = ?
       ORDER BY cc.created_at ASC, cc.id ASC`,
    [projectId, fileId],
  );
  return rows;
}

module.exports = {
  createChange,
  findById,
  findByIdAndProject,
  updateStatus,
  countByProjectId,
  findByProjectId,
  findByFileId,
};
