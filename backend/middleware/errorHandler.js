'use strict';

const { logger } = require('../utils/logger');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

// Converts unmatched routes into the standard 404 error envelope.
function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.'));
}

// Centralized error handling (docs/API_CONTRACT.md sections 4 and 30):
// - ApiError instances keep their status code and error code
// - malformed JSON / oversized bodies become clean client errors
// - anything else is sanitized to 500 INTERNAL_ERROR
// Stack traces are logged server-side only and never sent to the client.
function errorHandler(error, req, res, next) {
  if (error.type === 'entity.parse.failed') {
    return apiResponse.error(res, 'VALIDATION_ERROR', 'Invalid JSON body.', 400);
  }
  if (error.type === 'entity.too.large') {
    return apiResponse.error(res, 'PAYLOAD_TOO_LARGE', 'Request body is too large.', 413);
  }

  const isApiError = error instanceof ApiError;
  const statusCode = isApiError ? error.statusCode : error.status || 500;
  const code = isApiError ? error.code : 'INTERNAL_ERROR';
  const message = isApiError ? error.message : 'An unexpected internal error occurred.';

  if (statusCode >= 500) {
    logger.error('Request failed', {
      path: req.originalUrl,
      name: error.name,
      message: error.message,
    });
  } else {
    logger.warn('Request rejected', { path: req.originalUrl, code, statusCode });
  }

  return apiResponse.error(res, code, message, statusCode);
}

module.exports = { notFoundHandler, errorHandler };
