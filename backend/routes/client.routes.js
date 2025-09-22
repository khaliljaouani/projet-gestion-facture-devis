// backend/routes/client.routes.js
const express = require('express');
const router = express.Router();

const clientController = require('../controllers/client.controller');
const voitureController = require('../controllers/voiture.controller');
const { verifyToken } = require('../middleware/authMiddleware');
const validateId = require('../middleware/validateId');

// Toutes les routes clients sont protégées
router.use(verifyToken);

// Valide :id une seule fois pour toutes les routes qui l'utilisent
router.param('id', (req, res, next, id) => validateId(req, res, next, id));

// CRUD clients
router.post('/', clientController.createClient);
router.get('/', clientController.getClients);
router.get('/:id', clientController.getClientById);
router.put('/:id', clientController.updateClient);
router.delete('/:id', clientController.deleteClient);

// Voitures d’un client
router.get('/:id/voitures', voitureController.getVoituresByClient);

module.exports = router;
