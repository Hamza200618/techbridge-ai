'use strict';

// Helpers for the standard response envelopes defined in
// docs/API_CONTRACT.md (section 4).

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

function error(res, code, message, statusCode = 500, details = undefined) {
  const body = { success: false, error: { code, message } };
  if (details) {
    body.error.details = details;
  }
  return res.status(statusCode).json(body);
}

module.exports = { success, error };
