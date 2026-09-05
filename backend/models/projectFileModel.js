'use strict';

// Maps project_files rows to the public API file shape (docs/API_CONTRACT.md
// sections 10.1, 10.3). DB snake_case → API camelCase; internal columns
// (storage_path, content_hash) are never exposed.

function toPublicFile(row) {
  if (!row) return null;
  return {
    fileId: Number(row.id),
    projectId: Number(row.project_id),
    parentFileId: row.parent_file_id === null ? null : Number(row.parent_file_id),
    path: row.path,
    name: row.name,
    extension: row.extension,
    fileType: row.file_type,
    language: row.language,
    sizeBytes: Number(row.size_bytes) || 0,
    lineCount: Number(row.line_count) || 0,
    isBinary: Boolean(row.is_binary),
    isGenerated: Boolean(row.is_generated),
    isIgnored: Boolean(row.is_ignored),
    healthStatus: row.health_status,
    healthScore: Number(row.health_score) || 0,
    analysisStatus: row.analysis_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { toPublicFile };
