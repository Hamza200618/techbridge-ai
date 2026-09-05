'use strict';

const path = require('path');

// Load backend/.env (resolved relative to this file so the server can be
// started from any working directory). The .env file must never be committed;
// only .env.example is version-controlled.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function parseIntOrDefault(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseFloatOrDefault(value, defaultValue) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// '*' (or an empty value) allows any origin — kept as the plain string the
// cors package expects. Anything else is treated as a comma-separated
// allowlist of exact origins.
function parseCorsOrigin(value) {
  const raw = value ? value.trim() : '';
  if (raw === '' || raw === '*') {
    return '*';
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// Megabyte-sized settings (upload limits) with safe defaults.
function parseMbOrDefault(value, defaultMb) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultMb : parsed;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseIntOrDefault(process.env.PORT, 5000),
  cors: {
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  },
  db: {
    // The techbridge_ai database already exists (database/schema.sql is the
    // source of truth). Only credentials and connection tuning live here.
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseIntOrDefault(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'techbridge_ai',
    connectionLimit: parseIntOrDefault(process.env.DB_CONNECTION_LIMIT, 10),
    connectTimeout: parseIntOrDefault(process.env.DB_CONNECT_TIMEOUT, 10000),
  },
  storage: {
    // Absolute path to the project storage root (docs/PROJECT_SPEC.md
    // section 10). Defaults to <repo>/storage; override with STORAGE_ROOT.
    root: process.env.STORAGE_ROOT
      ? path.resolve(process.env.STORAGE_ROOT)
      : path.join(__dirname, '..', '..', 'storage'),
  },
  upload: {
    maxFileSizeMb: parseMbOrDefault(process.env.MAX_UPLOAD_SIZE_MB, 50),
    maxZipEntries: parseIntOrDefault(process.env.MAX_ZIP_ENTRIES, 10000),
    maxZipUncompressedMb: parseMbOrDefault(process.env.MAX_ZIP_UNCOMPRESSED_MB, 500),
    maxFileSizeBytes: Math.round(parseMbOrDefault(process.env.MAX_UPLOAD_SIZE_MB, 50) * 1024 * 1024),
    maxZipUncompressedBytes: Math.round(
      parseMbOrDefault(process.env.MAX_ZIP_UNCOMPRESSED_MB, 500) * 1024 * 1024,
    ),
  },
  files: {
    // Cap for GET /api/projects/:projectId/files/:fileId/content responses.
    maxContentMb: parseMbOrDefault(process.env.MAX_FILE_CONTENT_MB, 2),
    maxContentBytes: Math.round(parseMbOrDefault(process.env.MAX_FILE_CONTENT_MB, 2) * 1024 * 1024),
  },
  jwt: {
    // Must be set via JWT_SECRET in the environment — never hardcoded.
    // Auth features refuse to run (controlled 500) when it is missing.
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  ai: {
    // Multi-provider AI system (docs/PROJECT_SPEC.md section 4). API keys
    // live ONLY in the environment — never hardcoded, never stored in MySQL,
    // never sent to the frontend (docs/API_CONTRACT.md section 29).
    // Fallback order: Groq -> Gemini -> OpenAI; AI_PRIMARY_PROVIDER moves
    // its provider to the front of that chain.
    primaryProvider: (process.env.AI_PRIMARY_PROVIDER || 'groq').trim().toLowerCase(),
    // Per-request timeout applied to every provider call.
    timeoutMs: parseIntOrDefault(process.env.AI_TIMEOUT_MS, 60000),
    // Focused AI context (docs/PROJECT_SPEC.md section 4.2, docs/TEAM_RULES.md
    // section 17): caps the rendered context handed to a provider and the
    // source excerpt included per selected file, so context stays bounded
    // regardless of project size.
    contextMaxChars: parseIntOrDefault(process.env.AI_CONTEXT_MAX_CHARS, 24000),
    contextFileExcerptChars: parseIntOrDefault(process.env.AI_CONTEXT_FILE_EXCERPT_CHARS, 4000),
    // AI chat (docs/API_CONTRACT.md sections 14-15): message size cap, how
    // many prior turns are replayed to the provider, and the generation
    // options for chat requests.
    chat: {
      maxMessageChars: parseIntOrDefault(process.env.AI_CHAT_MAX_MESSAGE_CHARS, 8000),
      historyMessages: parseIntOrDefault(process.env.AI_CHAT_HISTORY_MESSAGES, 20),
      maxTokens: parseIntOrDefault(process.env.AI_CHAT_MAX_TOKENS, 2048),
      temperature: parseFloatOrDefault(process.env.AI_CHAT_TEMPERATURE, 0.2),
    },
    providers: {
      groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        // Groq retired llama-3.3-70b-versatile (Aug 2026). gpt-oss-20b is the
        // documented free/developer replacement for the previous default.
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      },
    },
  },
};

module.exports = config;
