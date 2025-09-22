// backend/routes/devis.routes.js
const express = require('express');
const path = require('path');
const os = require('os');

const router = express.Router();

const devisController = require('../controllers/devis.controller');
const { verifyToken, allowRoles } = require('../middleware/authMiddleware');
const validateId = require('../middleware/validateId');

// Prépare le répertoire PDF
function setDevisDir(req, _res, next) {
  const baseDesktop = path.join(os.homedir(), 'Desktop', 'gestion');
  req.locals = req.locals || {};
  req.locals.DIR_DEVIS = path.join(baseDesktop, 'devis');
  next();
}

// Sécurité globale
router.use(verifyToken);
router.use(allowRoles('admin', 'manager'));

// Param :id
router.param('id', (req, res, next, id) => validateId(req, res, next, id));

/* Création */
router.post('/complete', devisController.createDevisComplet);

/* Listes */
router.get('/', devisController.getAllDevis);
router.get('/voitures/:id', devisController.getDevisParVoiture);

/* Détails & lignes */
router.get('/:id/lignes', devisController.getLignesByDevis);
router.get('/:id', devisController.getDevisById);

/* PDF */
router.get('/:id/pdf', setDevisDir, devisController.getDevisPdf);
router.post('/:id/pdf/regenerate', setDevisDir, devisController.regenerateDevisPdf);

module.exports = router;
