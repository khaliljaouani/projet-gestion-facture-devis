const express = require('express');
const router = express.Router();
const stats = require('../controllers/statistique.controller');

// KPI + séries
router.get('/summary', stats.getSummary);
router.get('/daily', stats.getDaily);

// vues additionnelles utilisées par le Dashboard
router.get('/top-clients', stats.getTopClients);
router.get('/daily-docs', stats.getDailyDocs);

module.exports = router;
