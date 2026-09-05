'use strict';

const securityService = require('../services/securityService');
const apiResponse = require('../utils/apiResponse');

// GET /api/projects/:projectId/security
// (docs/API_CONTRACT.md section 13.1)
async function getSecurityFindings(req, res, next) {
  try {
    const result = await securityService.getSecurityFindings(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/security/:findingId
async function getSecurityFindingById(req, res, next) {
  try {
    const explain = req.query.explain === 'true' || req.query.explain === '1';
    const result = await securityService.getSecurityFindingById(
      req.user.id,
      req.params.projectId,
      req.params.findingId,
      { explain },
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSecurityFindings,
  getSecurityFindingById,
};
