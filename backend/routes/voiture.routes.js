// backend/routes/voiture.routes.js
const express = require('express');
const router = express.Router();

const voitureController = require('../controllers/voiture.controller');
const factureController = require('../controllers/facture.controller');
const devisController = require('../controllers/devis.controller');
const { verifyToken } = require('../middleware/authMiddleware');
const validateId = require('../middleware/validateId');

// Toutes les routes voitures sont protégées
router.use(verifyToken);

// Valide :id de façon DRY pour toutes les routes concernées
router.param('id', (req, res, next, id) => validateId(req, res, next, id));

/* ---------- Routes spécifiques (AVANT /:id) ---------- */

// Voitures d’un client (cohérent avec client.routes: GET /api/clients/:id/voitures)
// Ici on expose aussi /api/voitures/clients/:id si tu veux l’utiliser côté front
router.get('/clients/:id', voitureController.getVoituresByClient);

// Factures liées à une voiture
router.get('/:id/factures', (req, res, next) =>
  typeof factureController.getFacturesParVoiture === 'function'
    ? factureController.getFacturesParVoiture(req, res, next)
    : res.status(501).json({ error: 'Handler facture.getFacturesParVoiture non disponible' })
);

// Devis liés à une voiture (optionnel)
router.get('/:id/devis', (req, res, next) =>
  typeof devisController?.getDevisParVoiture === 'function'
    ? devisController.getDevisParVoiture(req, res, next)
    : res.status(501).json({ error: 'Handler devis.getDevisParVoiture non disponible' })
);

/* ---------- CRUD voitures ---------- */

// Créer
router.post('/', voitureController.createVoiture);

// Lister toutes les voitures
router.get('/', voitureController.getAllVoitures);

// Lire / Mettre à jour / Supprimer
router.get('/:id', voitureController.getVoitureById);
router.put('/:id', voitureController.updateVoiture);
router.delete('/:id', voitureController.deleteVoiture);

module.exports = router;
