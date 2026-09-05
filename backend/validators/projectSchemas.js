'use strict';

// Route parameter schemas for project and file endpoints
// (docs/API_CONTRACT.md sections 9-10). Express delivers req.params values
// as strings, hence the 'id' type (positive integer, numeric string or
// number).

const projectIdParams = {
  projectId: { type: 'id', required: true },
};

const projectFileParams = {
  projectId: { type: 'id', required: true },
  fileId: { type: 'id', required: true },
};

const projectIssueParams = {
  projectId: { type: 'id', required: true },
  issueId: { type: 'id', required: true },
};

const projectChangeParams = {
  projectId: { type: 'id', required: true },
  changeId: { type: 'id', required: true },
};

const projectFindingParams = {
  projectId: { type: 'id', required: true },
  findingId: { type: 'id', required: true },
};

const projectValidationRunParams = {
  projectId: { type: 'id', required: true },
  runId: { type: 'id', required: true },
};

const projectExportParams = {
  projectId: { type: 'id', required: true },
  exportId: { type: 'id', required: true },
};

module.exports = {
  projectIdParams,
  projectFileParams,
  projectIssueParams,
  projectChangeParams,
  projectFindingParams,
  projectValidationRunParams,
  projectExportParams,
};
