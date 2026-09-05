'use strict';

// Operational error carrying an HTTP status code and a stable error code
// from docs/API_CONTRACT.md (section 30). Services and controllers throw
// ApiError; the centralized error handler converts it into the standard
// error envelope.
class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, ApiError);
  }
}

module.exports = ApiError;
