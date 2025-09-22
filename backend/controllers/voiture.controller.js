// backend/controllers/voiture.controller.js
const db = require('../db/database'); // adapte si ton fichier DB est ailleurs
const { promisify } = require('util');

const dbRun = promisify(db.run.bind(db));
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));

/* ---------- Helpers ---------- */
function immat(plate) {
  return String(plate || '').trim().toUpperCase();
}

/**
 * 🔹 Créer une voiture
 */
exports.createVoiture = async (req, res) => {
  try {
    const { immatriculation = '', kilometrage = 0, client_id } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id requis' });

    const result = await dbRun(
      `INSERT INTO voitures (immatriculation, kilometrage, client_id)
       VALUES (?, ?, ?)`,
      [immat(immatriculation), Number(kilometrage) || 0, Number(client_id)]
    );

    return res.status(201).json({
      message: '✅ Voiture ajoutée avec succès',
      id: result.lastID
    });
  } catch (err) {
    console.error('❌ Erreur createVoiture :', err);
    return res.status(500).json({ error: 'Erreur lors de la création de la voiture', detail: err.message });
  }
};

/**
 * 🔹 Lister les voitures d’un client
 */
exports.getVoituresByClient = async (req, res) => {
  try {
    const clientId = Number(req.params.id);
    if (!clientId) return res.status(400).json({ error: 'id client invalide' });

    const rows = await dbAll(
      `SELECT id, immatriculation, kilometrage, client_id
       FROM voitures
       WHERE client_id = ?
       ORDER BY id DESC`,
      [clientId]
    );

    return res.json(rows || []);
  } catch (err) {
    console.error('❌ Erreur getVoituresByClient :', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des voitures', detail: err.message });
  }
};

/**
 * 🔹 Récupérer une voiture par ID
 */
exports.getVoitureById = async (req, res) => {
  try {
    const voitureId = Number(req.params.id);
    if (!voitureId) return res.status(400).json({ error: 'id voiture invalide' });

    const row = await dbGet(
      `SELECT id, immatriculation, kilometrage, client_id
       FROM voitures
       WHERE id = ?`,
      [voitureId]
    );

    if (!row) return res.status(404).json({ error: 'Voiture non trouvée' });
    return res.json(row);
  } catch (err) {
    console.error('❌ Erreur getVoitureById :', err);
    return res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
};

/**
 * 🔹 Mettre à jour une voiture
 */
exports.updateVoiture = async (req, res) => {
  try {
    const voitureId = Number(req.params.id);
    if (!voitureId) return res.status(400).json({ error: 'id voiture invalide' });

    const { immatriculation = '', kilometrage = 0 } = req.body || {};

    const result = await dbRun(
      `UPDATE voitures
         SET immatriculation = ?, kilometrage = ?
       WHERE id = ?`,
      [immat(immatriculation), Number(kilometrage) || 0, voitureId]
    );

    if ((result.changes || 0) === 0) {
      return res.status(404).json({ error: 'Voiture introuvable pour mise à jour' });
    }
    return res.json({ message: '✅ Voiture mise à jour avec succès' });
  } catch (err) {
    console.error('❌ Erreur updateVoiture :', err);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour', detail: err.message });
  }
};

/**
 * 🔹 Supprimer une voiture
 */
exports.deleteVoiture = async (req, res) => {
  try {
    const voitureId = Number(req.params.id);
    if (!voitureId) return res.status(400).json({ error: 'id voiture invalide' });

    const result = await dbRun(`DELETE FROM voitures WHERE id = ?`, [voitureId]);

    if ((result.changes || 0) === 0) {
      return res.status(404).json({ error: 'Voiture introuvable pour suppression' });
    }
    return res.json({ message: '✅ Voiture supprimée avec succès' });
  } catch (err) {
    console.error('❌ Erreur deleteVoiture :', err);
    return res.status(500).json({ error: 'Erreur lors de la suppression', detail: err.message });
  }
};

/**
 * 🔹 Lister toutes les voitures
 */
exports.getAllVoitures = async (_req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, immatriculation, kilometrage, client_id
       FROM voitures
       ORDER BY id DESC`
    );
    return res.json(rows || []);
  } catch (err) {
    console.error('❌ Erreur getAllVoitures :', err);
    return res.status(500).json({ error: 'Erreur lors de la lecture', detail: err.message });
  }
};

// GET /api/voitures/:id/factures  (appelé par voiture.routes)
exports.getFacturesParVoiture = async (req, res) => {
  try {
    const voitureId = Number(req.params.id);
    if (!voitureId) return res.status(400).json({ error: 'id voiture invalide' });

    const rows = await dbAll(
      `SELECT f.id, f.numero, f.date_facture, f.remise, f.montant_ttc, f.statut
       FROM factures f
       WHERE f.voiture_id = ?
       ORDER BY f.id DESC`,
      [voitureId]
    );

    res.json(rows || []);
  } catch (e) {
    console.error('getFacturesParVoiture error:', e?.message || e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

