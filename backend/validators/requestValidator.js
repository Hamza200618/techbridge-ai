'use strict';

// Lightweight, dependency-free request validation engine.
// Express-agnostic so it can be unit-tested and reused for any object
// (req.body, req.query, req.params, ...).
//
// Schema example:
//   {
//     email: { type: 'string', required: true, maxLength: 255, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
//     severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] },
//     page: { type: 'integer', min: 1 },
//     projectId: { type: 'id', required: true }, // positive integer (accepts "5" from req.params)
//   }

const TYPE_CHECKERS = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  integer: (value) => typeof value === 'number' && Number.isInteger(value),
  // Route parameter IDs arrive as strings; JSON payloads carry numbers.
  id: (value) =>
    (typeof value === 'number' && Number.isInteger(value) && value > 0) ||
    (typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0),
  boolean: (value) => typeof value === 'boolean',
  array: (value) => Array.isArray(value),
  object: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
};

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

// Returns an error message for a single field, or null when the value is valid.
function validateField(field, value, rule) {
  if (isMissing(value)) {
    return rule.required ? `${field} is required.` : null;
  }

  if (rule.type) {
    const checker = TYPE_CHECKERS[rule.type];
    if (!checker) {
      throw new Error(`Unknown validation type "${rule.type}" for field "${field}".`);
    }
    if (!checker(value)) {
      if (rule.type === 'id') {
        return `${field} must be a positive integer.`;
      }
      return `${field} must be of type ${rule.type}.`;
    }
  }

  if (rule.type === 'string' || rule.type === 'array') {
    const unit = rule.type === 'string' ? 'characters' : 'items';
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return `${field} must contain at least ${rule.minLength} ${unit}.`;
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return `${field} must contain at most ${rule.maxLength} ${unit}.`;
    }
  }

  if (rule.type === 'number' || rule.type === 'integer') {
    if (rule.min !== undefined && value < rule.min) {
      return `${field} must be at least ${rule.min}.`;
    }
    if (rule.max !== undefined && value > rule.max) {
      return `${field} must be at most ${rule.max}.`;
    }
  }

  if (rule.enum !== undefined && !rule.enum.includes(value)) {
    return `${field} must be one of: ${rule.enum.join(', ')}.`;
  }

  if (rule.pattern !== undefined && !rule.pattern.test(value)) {
    return `${field} has an invalid format.`;
  }

  if (typeof rule.custom === 'function') {
    const result = rule.custom(value);
    if (result !== true) {
      return typeof result === 'string' ? result : `${field} is invalid.`;
    }
  }

  return null;
}

// Validates `target` against `schema`.
// Returns { valid: boolean, errors: [{ field, message }] }.
function validateObject(target, schema) {
  const errors = [];
  const source = target || {};
  for (const [field, rule] of Object.entries(schema || {})) {
    const message = validateField(field, source[field], rule);
    if (message) {
      errors.push({ field, message });
    }
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validateObject };
