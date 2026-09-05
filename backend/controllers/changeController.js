'use strict';

const changeService = require('../services/changeService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/changes/:changeId/apply
// (docs/API_CONTRACT.md section 18.1)
async function applyChange(req, res, next) {
  try {
    const result = await changeService.applyChange(
      req.user.id,
      req.params.projectId,
      req.params.changeId,
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// POST /api/projects/:projectId/changes/:changeId/reject
// (docs/API_CONTRACT.md section 19.1)
async function rejectChange(req, res, next) {
  try {
    const result = await changeService.rejectChange(
      req.user.id,
      req.params.projectId,
      req.params.changeId,
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/versions (docs/API_CONTRACT.md section 21.1)
async function getProjectVersions(req, res, next) {
  try {
    const result = await changeService.getProjectVersions(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/files/:fileId/versions (docs/API_CONTRACT.md section 21.2)
async function getFileVersions(req, res, next) {
  try {
    const result = await changeService.getFileVersions(req.user.id, req.params.projectId, req.params.fileId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { applyChange, rejectChange, getProjectVersions, getFileVersions };
