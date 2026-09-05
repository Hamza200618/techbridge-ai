'use strict';

const exportService = require('../services/exportService');
const apiResponse = require('../utils/apiResponse');

// POST /api/projects/:projectId/export
// (docs/API_CONTRACT.md section 25.1)
async function exportProject(req, res, next) {
  try {
    const result = await exportService.exportProject(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/exports
async function getProjectExports(req, res, next) {
  try {
    const result = await exportService.getProjectExports(req.user.id, req.params.projectId);
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

// GET /api/projects/:projectId/exports/:exportId/download
async function downloadExport(req, res, next) {
  try {
    return await exportService.downloadExport(
      req.user.id,
      req.params.projectId,
      req.params.exportId,
      res,
    );
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  exportProject,
  getProjectExports,
  downloadExport,
};
