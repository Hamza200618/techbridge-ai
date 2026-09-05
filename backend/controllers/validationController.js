'use strict';

const validationService = require('../services/validationService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/validate
// (docs/API_CONTRACT.md section 24.1)
async function validateProject(req, res, next) {
  try {
    const type = req.body && req.body.type ? req.body.type : 'full';
    const result = await validationService.startValidation(req.user.id, req.params.projectId, { type });
    return apiResponse.success(res, { validationRun: result });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/validation
// (docs/API_CONTRACT.md section 24.2)
async function getValidationResults(req, res, next) {
  try {
    const result = await validationService.getValidationResults(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/validation/:runId
async function getValidationRunById(req, res, next) {
  try {
    const result = await validationService.getValidationRunById(
      req.user.id,
      req.params.projectId,
      req.params.runId,
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  validateProject,
  getValidationResults,
  getValidationRunById,
};
