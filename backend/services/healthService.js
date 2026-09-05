'use strict';

const db = require('../config/database');

// Builds the health report for GET /api/health.
//
// The backend deliberately stays up when the database is unreachable —
// the response tells clients the actual database status through
// data.database.connected, and the endpoint always answers 200 while the
// application itself is running.
async function getHealthStatus() {
  let databaseConnected = false;
  try {
    databaseConnected = await db.testConnection();
  } catch (error) {
    databaseConnected = false;
  }

  return {
    status: 'ok',
    database: {
      connected: databaseConnected,
    },
  };
}

module.exports = { getHealthStatus };
