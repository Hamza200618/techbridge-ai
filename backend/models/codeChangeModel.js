'use strict';

// Maps code_changes rows to the public API shape (docs/API_CONTRACT.md
// section 17.1: change { id, status, description, diff }) plus the linkage
// the frontend needs for review. DB snake_case → API camelCase; the diff
// column diff_content is exposed as `diff`.

function toPublicChange(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    projectId: Number(row.project_id),
    fileId: Number(row.file_id),
    issueId: row.issue_id === null || row.issue_id === undefined ? null : Number(row.issue_id),
    conversationId: row.conversation_id === null || row.conversation_id === undefined
      ? null
      : Number(row.conversation_id),
    changeType: row.change_type,
    description: row.description,
    diff: row.diff_content,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toPublicFileVersion(row, { versionNumber, label, oldHash, newHash }) {
  if (!row) return null;
  return {
    versionNumber,
    label,
    status: row.status,
    changeId: Number(row.id),
    changeType: row.change_type,
    description: row.description,
    diff: row.diff_content,
    filePath: row.file_path,
    oldHash,
    newHash,
    createdAt: row.created_at,
  };
}

module.exports = { toPublicChange, toPublicFileVersion };
