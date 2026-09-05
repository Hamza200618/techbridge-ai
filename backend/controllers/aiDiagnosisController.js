'use strict';

const aiDiagnosisService = require('../ai/diagnosis/aiDiagnosisService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/issues/:issueId/diagnose
// (docs/API_CONTRACT.md section 16.1)
async function diagnoseIssue(req, res, next) {
  try {
    const result = await aiDiagnosisService.diagnoseIssue(
      req.user.id,
      req.params.projectId,
      req.params.issueId,
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { diagnoseIssue };
