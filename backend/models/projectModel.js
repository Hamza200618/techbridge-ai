'use strict';

// Maps a `projects` table row (database/schema.sql) to the public API project
// shape. Internal filesystem paths (storage_path, extracted_path,
// working_path) and user_id are deliberately excluded — the frontend never
// needs them (docs/API_CONTRACT.md section 33).
function toPublicProject(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    originalFilename: row.original_filename,
    projectType: row.project_type,
    primaryLanguage: row.primary_language,
    framework: row.framework,
    totalFiles: Number(row.total_files) || 0,
    totalLines: Number(row.total_lines) || 0,
    totalSizeBytes: Number(row.total_size_bytes) || 0,
    healthScore: Number(row.health_score) || 0,
    status: row.status,
    analysisProgress: Number(row.analysis_progress) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { toPublicProject };
