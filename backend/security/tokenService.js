'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/apiError');

// JWT helpers. The secret comes only from the environment (JWT_SECRET) —
// never hardcoded, never logged, never sent to the client.

function ensureSecretConfigured() {
  if (!config.jwt.secret) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Authentication is not configured on the server.');
  }
}

// Signs an access token for the given payload (e.g. { userId }).
function signToken(payload) {
  ensureSecretConfigured();
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

// Verifies a token and returns its payload.
// Throws jwt errors (TokenExpiredError, JsonWebTokenError) for invalid input —
// callers map those to 401 responses.
function verifyToken(token) {
  ensureSecretConfigured();
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
