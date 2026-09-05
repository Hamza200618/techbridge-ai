'use strict';

const healthService = require('../services/healthService');
const apiResponse = require('../utils/apiResponse');

// GET /api/health
// Reports backend status and database connectivity
// (docs/API_CONTRACT.md section 7).
async function getHealth(req, res, next) {
  try {
    const health = await healthService.getHealthStatus();
    return apiResponse.success(res, health);
  } catch (error) {
    return next(error);
  }
}

module.exports = { getHealth };
