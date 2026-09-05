'use strict';

const fixGenerationService = require('../ai/fixing/fixGenerationService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/issues/:issueId/fix
// (docs/API_CONTRACT.md section 17.1)
async function generateFix(req, res, next) {
  try {
    const result = await fixGenerationService.generateFix(
      req.user.id,
      req.params.projectId,
      req.params.issueId,
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { generateFix };
