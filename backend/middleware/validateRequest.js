'use strict';

const { validateObject } = require('../validators/requestValidator');
const apiResponse = require('../utils/apiResponse');

// Request validation middleware (foundation).
//
// Usage in a route:
//   router.post(
//     '/example',
//     validateRequest({ body: { name: { type: 'string', required: true } } }),
//     exampleController.doSomething,
//   );
//
// On failure it responds with the standard error envelope:
//   { success: false, error: { code: 'VALIDATION_ERROR', message, details } }
function validateRequest(schemas = {}) {
  return (req, res, next) => {
    const details = [];
    for (const [part, schema] of Object.entries(schemas)) {
      const { errors } = validateObject(req[part], schema);
      details.push(...errors);
    }
    if (details.length > 0) {
      return apiResponse.error(res, 'VALIDATION_ERROR', 'Request validation failed.', 400, details);
    }
    return next();
  };
}

module.exports = validateRequest;
