'use strict';

const { logger } = require('../utils/logger');

// Basic request logging: method, path, status code and duration.
// Mounted before the body parsers so parser errors are logged too.
function requestLogger(req, res, next) {
  const startTime = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startTime) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(0)}ms`);
  });
  next();
}

module.exports = requestLogger;
