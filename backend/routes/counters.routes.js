// backend/routes/counters.routes.js
const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/authMiddleware');
const counters = require('../controllers/counter.controller');

// toutes les routes protégées
router.use(verifyToken);

// GET /api/counters         → compteurs actuels
router.get('/', counters.getCounters);

// GET /api/counters/next    → prochains numéros
router.get('/next', counters.getNextNumbers);

// PUT /api/counters         → mise à jour (body: { normal, cachee })
router.put('/', counters.updateCounters);

module.exports = router;
