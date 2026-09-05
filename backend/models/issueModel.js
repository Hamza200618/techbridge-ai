'use strict';

// Maps analysis_issues rows to the public API issue shape
// (docs/API_CONTRACT.md section 12.1). DB snake_case → API camelCase.

function toPublicIssue(row) {
  if (!row) return null;
  return {
    issueId: Number(row.id),
    projectId: Number(row.project_id),
    fileId: row.file_id === null ? null : Number(row.file_id),
    issueType: row.issue_type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    rootCause: row.root_cause,
    suggestedFix: row.suggested_fix,
    evidence: row.evidence,
    detectionSource: row.detection_source,
    confidence: row.confidence === null ? null : Number(row.confidence),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { toPublicIssue };
