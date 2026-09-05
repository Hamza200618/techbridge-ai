'use strict';

// Maps security_findings rows to the public API finding shape
// (docs/API_CONTRACT.md section 13.1). DB snake_case → API camelCase.
// Evidence was masked by the analyzer before storage.

function toPublicFinding(row) {
  if (!row) return null;
  return {
    findingId: Number(row.id),
    projectId: Number(row.project_id),
    fileId: row.file_id === null ? null : Number(row.file_id),
    filePath: row.file_path || null,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    evidence: row.evidence,
    recommendation: row.recommendation,
    status: row.status,
    createdAt: row.created_at,
  };
}

module.exports = { toPublicFinding };
