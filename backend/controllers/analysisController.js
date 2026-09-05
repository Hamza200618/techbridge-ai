'use strict';

const analysisService = require('../services/analysisService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/analyze (docs/API_CONTRACT.md section 11.1)
async function startAnalysis(req, res, next) {
  try {
    const analysisRun = await analysisService.startAnalysis(req.user.id, req.params.projectId);
    return apiResponse.success(res, { analysisRun });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/analysis (docs/API_CONTRACT.md section 11.2)
async function getAnalysisStatus(req, res, next) {
  try {
    const analysis = await analysisService.getAnalysisStatus(req.user.id, req.params.projectId);
    return apiResponse.success(res, analysis);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/issues (docs/API_CONTRACT.md section 12.1)
async function getIssues(req, res, next) {
  try {
    const issues = await analysisService.getIssues(req.user.id, req.params.projectId);
    return apiResponse.success(res, { issues });
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/security (docs/API_CONTRACT.md section 13.1)
async function getSecurityFindings(req, res, next) {
  try {
    const result = await analysisService.getSecurityFindings(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  startAnalysis,
  getAnalysisStatus,
  getIssues,
  getSecurityFindings,
};
