'use strict';

const impactService = require('../services/impactService');
const apiResponse = require('../utils/apiResponse');

// GET /api/projects/:projectId/files/:fileId/impact
// (docs/API_CONTRACT.md section 22.1)
async function getFileImpact(req, res, next) {
  try {
    const explain = req.query.explain === 'true' || req.query.explain === '1';
    const result = await impactService.getFileImpact(
      req.user.id,
      req.params.projectId,
      req.params.fileId,
      { explain },
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getFileImpact };
