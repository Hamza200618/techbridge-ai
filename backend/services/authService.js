'use strict';

const userRepository = require('../repositories/userRepository');
const { toPublicUser } = require('../models/userModel');
const passwordHasher = require('../security/passwordHasher');
const tokenService = require('../security/tokenService');
const ApiError = require('../utils/apiError');

// Business logic for authentication (docs/API_CONTRACT.md section 6).
// Uses only the existing `users` table.

// Pre-computed bcrypt hash compared against when the email is unknown, so
// login takes roughly the same time whether or not the account exists.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function emailAlreadyExistsError() {
  return new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists.');
}

// POST /api/auth/register
async function register({ name, email, password }) {
  const fullName = name.trim();
  const normalizedEmail = normalizeEmail(email);

  const existing = await userRepository.findByEmail(normalizedEmail);
  if (existing) {
    throw emailAlreadyExistsError();
  }

  const passwordHash = await passwordHasher.hashPassword(password);

  let userId;
  try {
    userId = await userRepository.createUser({ fullName, email: normalizedEmail, passwordHash });
  } catch (error) {
    // The unique index on users.email is the final authority in case of a
    // concurrent registration race.
    if (error.code === 'ER_DUP_ENTRY') {
      throw emailAlreadyExistsError();
    }
    throw error;
  }

  const user = await userRepository.findById(userId);
  return toPublicUser(user);
}

// POST /api/auth/login
async function login({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userRepository.findByEmailWithPasswordHash(normalizedEmail);

  if (!user) {
    // Constant-time behaviour for unknown accounts (see DUMMY_HASH).
    await passwordHasher.comparePassword(password, DUMMY_HASH);
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const passwordMatches = await passwordHasher.comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  if (!user.is_active) {
    throw new ApiError(403, 'FORBIDDEN', 'This account is disabled.');
  }

  const token = tokenService.signToken({ userId: user.id });
  return { user: toPublicUser(user), token };
}

// Resolves the currently authenticated user from a verified token payload.
// Used by GET /api/auth/me and the authenticate middleware.
async function getAuthenticatedUser(userId) {
  const user = await userRepository.findById(userId);
  if (!user || !user.is_active) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication required.');
  }
  return toPublicUser(user);
}

module.exports = { register, login, getAuthenticatedUser };
