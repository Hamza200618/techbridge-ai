'use strict';

const bcrypt = require('bcryptjs');

// Cost factor for bcrypt. 10 rounds keeps hash/verify latency acceptable
// while remaining far beyond trivial brute-force reach.
const SALT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
