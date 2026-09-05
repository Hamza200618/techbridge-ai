'use strict';

const express = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const projectRoutes = require('./projectRoutes');

const router = express.Router();

// GET /api/health — backend liveness + database connectivity.
router.use('/health', healthRoutes);

// /api/auth — register, login, logout, current user.
router.use('/auth', authRoutes);

// /api/projects — project upload and management.
router.use('/projects', projectRoutes);

module.exports = router;
