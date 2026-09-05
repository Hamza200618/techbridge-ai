'use strict';

const authService = require('../services/authService');
const apiResponse = require('../utils/apiResponse');

// POST /api/auth/register
async function register(req, res, next) {
  try {
    const user = await authService.register(req.body);
    return apiResponse.success(res, { user }, 201);
  } catch (error) {
    return next(error);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    return apiResponse.success(res, { user, token });
  } catch (error) {
    return next(error);
  }
}

// POST /api/auth/logout
// Tokens are stateless (JWT): the client discards its token and the server
// confirms the logout. No server-side session exists to invalidate.
function logout(req, res, next) {
  return apiResponse.success(res, { message: 'Logged out successfully.' });
}

// GET /api/auth/me
// req.user is populated by the authenticate middleware.
function me(req, res, next) {
  return apiResponse.success(res, { user: req.user });
}

module.exports = { register, login, logout, me };
