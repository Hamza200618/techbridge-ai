'use strict';

const express = require('express');
const cors = require('cors');
const config = require('../config/env');
const routes = require('../routes');
const requestLogger = require('../middleware/requestLogger');
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');

// Assembles the Express application. Kept separate from server.js so the
// app can be loaded by future tests without binding a port.
function createApp() {
  const app = express();

  // Do not advertise the framework.
  app.disable('x-powered-by');

  // CORS — allowed origins come from configuration (CORS_ORIGIN).
  app.use(cors({ origin: config.cors.origin }));

  // Request logging (before the parsers so parse errors are logged too).
  app.use(requestLogger);

  // JSON / urlencoded body parsing.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Root health check (standard cloud deployment / container liveness probe).
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      service: 'TechBridge AI Backend',
      status: 'healthy',
    });
  });

  // API routes (base URL: /api — docs/API_CONTRACT.md section 2).
  app.use('/api', routes);

  // Unmatched routes + centralized error handling.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
