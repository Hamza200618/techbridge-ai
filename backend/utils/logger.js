'use strict';

// Minimal structured logger for the backend foundation.
// SECURITY (TEAM_RULES.md section 28): values whose keys look sensitive
// (passwords, tokens, API keys, ...) are masked before anything is written.

const SENSITIVE_KEY_PATTERN = /(password|passphrase|secret|token|api[-_]?key|authorization|credential)/i;
const MAX_DEPTH = 4;

function redact(value, depth = 0) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
      redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[Redacted]' : redact(item, depth + 1);
    }
    return redacted;
  }
  return value;
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    try {
      line += ` ${JSON.stringify(redact(meta))}`;
    } catch (error) {
      line += ' [Unserializable metadata]';
    }
  }
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};

module.exports = { logger };
