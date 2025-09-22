// backend/routes/facture.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('../controllers/facture.controller');
const { verifyToken } = require('../middleware/authMiddleware');
const validateId = require('../middleware/validateId');
const path = require('path');
const os = require('os');

// Vérifie que les exports du contrôleur existent (erreur claire si manquant)
[
  'createFactureComplete',
  'getFacturePdf',
  'regenerateFacturePdf',
  'getLignesByFacture',
  'getAllFactures',
  'getFactureById',
].forEach((name) => {
  if (typeof ctrl[name] !== 'function') {
    throw new Error(`facture.controller: fonction manquante -> ${name}`);
  }
});

// Passe au contrôleur les dossiers PDF (adapte si besoin)
function setInvoiceDirs(req, _res, next) {
  const baseDesktop = path.join(os.homedir(), 'Desktop', 'gestion');
  req.locals = req.locals || {};
  req.locals.DIR_FACTURES = path.join(baseDesktop, 'facture');
  req.locals.DIR_FACTURES_CACHE = path.join(baseDesktop, 'facture', 'facture_cacher');
  next();
}

// 🔒 toutes les routes facture nécessitent un token
router.use(verifyToken);

// ⚙️ validateId s’applique à tout paramètre :id
router.param('id', (req, res, next, id) => validateId(req, res, next, id));

/* ---------- Création complète ---------- */
router.post('/complete', setInvoiceDirs, ctrl.createFactureComplete);

/* ---------- PDF ---------- */
router.get('/:id/pdf', setInvoiceDirs, ctrl.getFacturePdf);
router.post('/:id/pdf/regenerate', setInvoiceDirs, ctrl.regenerateFacturePdf);

/* ---------- Lignes / Détail / Liste ---------- */
router.get('/:id/lignes', ctrl.getLignesByFacture);
router.get('/:id', ctrl.getFactureById);
router.get('/', ctrl.getAllFactures);

module.exports = router;
