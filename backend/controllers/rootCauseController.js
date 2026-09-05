'use strict';

const rootCauseService = require('../services/rootCauseService');
const apiResponse = require('../utils/apiResponse');

// GET /api/projects/:projectId/issues/:issueId/root-cause
// (docs/API_CONTRACT.md section 23.1)
async function getIssueRootCause(req, res, next) {
  try {
    const explain = req.query.explain !== 'false' && req.query.explain !== '0';
    const result = await rootCauseService.getIssueRootCause(
      req.user.id,
      req.params.projectId,
      req.params.issueId,
      { explain },
    );
    return apiResponse.success(res, result);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getIssueRootCause };
