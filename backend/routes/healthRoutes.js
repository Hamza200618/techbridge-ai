'use strict';

const express = require('express');
const healthController = require('../controllers/healthController');

const router = express.Router();

// GET /api/health (docs/API_CONTRACT.md section 7)
router.get('/', healthController.getHealth);

module.exports = router;
