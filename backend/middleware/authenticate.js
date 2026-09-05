'use strict';

const tokenService = require('../security/tokenService');
const authService = require('../services/authService');
const ApiError = require('../utils/apiError');

// Route protection middleware (docs/API_CONTRACT.md section 26).
//
// Usage:
//   router.get('/private-thing', authenticate, controller.doSomething);
//
// Verifies the "Authorization: Bearer <token>" header, then reloads the
// user from the database so deleted or disabled accounts are rejected
// immediately. On success req.user holds the public user object.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication required.'));
  }

  let payload;
  try {
    payload = tokenService.verifyToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication token is invalid or expired.'));
    }
    return next(error);
  }

  authService
    .getAuthenticatedUser(payload.userId)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

module.exports = authenticate;
