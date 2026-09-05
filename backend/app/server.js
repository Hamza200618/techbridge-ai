'use strict';

const config = require('../config/env'); // Must be required first: initializes dotenv.
const { logger } = require('../utils/logger');
const db = require('../config/database');
const projectStorage = require('../storage/projectStorage');
const analysisRunRepository = require('../repositories/analysisRunRepository');
const aiProviderManager = require('../ai/provider/aiProviderManager');
const { createApp } = require('./app');

let server;
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info(`Received ${signal} — shutting down gracefully`);

  // Do not hang forever if open connections refuse to close.
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async () => {
    clearTimeout(forceExitTimer);
    try {
      await db.closePool();
      logger.info('Database pool closed');
    } catch (error) {
      logger.error('Failed to close the database pool', { message: error.message });
    }
    process.exit(0);
  });
}

async function start() {
  // Guarantee storage/uploads|extracted|working|exports|temp exist.
  await projectStorage.ensureStorageLayout();

  const app = createApp();
  server = app.listen(config.port, () => {
    logger.info(`TechBridge AI backend listening on port ${config.port}`, { env: config.env });
  });

  // Startup connectivity check. Non-fatal on purpose: the backend must keep
  // running so GET /api/health can report the actual database status.
  const databaseConnected = await db.testConnection();
  if (databaseConnected) {
    logger.info('Database connection established', { database: config.db.database });

    // Analysis runs that were queued/running when the server stopped must
    // not stay in a non-terminal state forever.
    const staleRuns = await analysisRunRepository.failStaleRuns();
    if (staleRuns > 0) {
      logger.info('Marked interrupted analysis runs as failed', { count: staleRuns });
    }
  } else {
    logger.warn('Database is not reachable — starting anyway; /api/health will report it', {
      database: config.db.database,
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  if (!config.jwt.secret) {
    logger.warn('JWT_SECRET is not configured — authentication endpoints will return a controlled error');
  }

  // AI availability is informational only: the fallback chain is decided
  // per request by the provider manager, and a missing provider never
  // prevents the server from starting.
  const aiChain = aiProviderManager.getProviderChain();
  if (aiChain.length > 0) {
    logger.info('AI provider chain ready', { providers: aiChain });
  } else {
    logger.warn('No AI provider is configured — AI features will return a controlled error until keys are set');
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception — exiting', { name: error.name, message: error.message });
  process.exit(1);
});

start().catch((error) => {
  logger.error('Failed to start the server', { name: error.name, message: error.message });
  process.exit(1);
});
