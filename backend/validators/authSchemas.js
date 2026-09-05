'use strict';

// Request schemas for the authentication endpoints
// (docs/API_CONTRACT.md section 6).

// varchar(150) in the users table; bcrypt operates on at most 72 bytes.
const registerSchema = {
  name: { type: 'string', required: true, minLength: 2, maxLength: 150 },
  email: {
    type: 'string',
    required: true,
    maxLength: 255,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  password: { type: 'string', required: true, minLength: 8, maxLength: 72 },
};

const loginSchema = {
  email: { type: 'string', required: true, maxLength: 255 },
  password: { type: 'string', required: true, maxLength: 72 },
};

module.exports = { registerSchema, loginSchema };
