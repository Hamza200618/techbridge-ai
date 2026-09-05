'use strict';

const mysql = require('mysql2/promise');
const config = require('./env');
const { logger } = require('../utils/logger');

// Connection pool for the existing `techbridge_ai` MySQL database.
// The schema in database/schema.sql is the source of truth: this module only
// opens connections — it never creates or modifies tables.
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  connectTimeout: config.db.connectTimeout,
  charset: 'utf8mb4',
});

// Pool-level failures (for example an idle connection dropped by the server)
// are logged here; the pool transparently re-establishes connections on demand.
pool.on('error', (error) => {
  logger.error('Database pool error', { code: error.code, errno: error.errno });
});

// Lightweight connectivity check used by the health endpoint and startup.
// Returns a boolean instead of throwing so callers can report status safely.
async function testConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.ping();
    return true;
  } catch (error) {
    logger.warn('Database connection check failed', { code: error.code });
    return false;
  } finally {
    if (connection) connection.release();
  }
}

// Ends the pool during graceful shutdown.
async function closePool() {
  await pool.end();
}

module.exports = { pool, testConnection, closePool };
