'use strict';

// Maps project_versions rows to the public API shape (docs/API_CONTRACT.md
// section 21.1). Internal filesystem paths (snapshot_path) are excluded. The
// associated code_change is linked by parsing the version label and is passed
// in as the second argument by the service layer; its content hashes use
// the self-describing sha256:<hex> format from utils/hash.js.

function toPublicProjectVersion(row, changeInfo) {
  if (!row) return null;
  return {
    versionId: Number(row.id),
    projectId: Number(row.project_id),
    versionNumber: Number(row.version_number),
    label: row.label,
    description: row.description,
    createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    createdAt: row.created_at,
    changeId: changeInfo ? changeInfo.changeId : null,
    fileId: changeInfo ? changeInfo.fileId : null,
    filePath: changeInfo ? changeInfo.filePath : null,
    changeType: changeInfo ? changeInfo.changeType : null,
    diff: changeInfo ? changeInfo.diff : null,
    oldHash: changeInfo ? changeInfo.oldHash : null,
    newHash: changeInfo ? changeInfo.newHash : null,
  };
}

module.exports = { toPublicProjectVersion };
