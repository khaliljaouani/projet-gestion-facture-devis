// backend/controllers/devis.controller.js
const db = require('../db/database');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

/* ========= Promesses SQLite =========
   - db.get / db.all: OK avec promisify
   - db.run: il faut un wrapper pour récupérer this.lastID / this.changes
*/
const dbGet = promisify(db.get.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

/* ========= Utils ========= */
const pad5 = (n) => String(n).padStart(5, '0');
const cleanImmat = (plate) => String(plate || '').trim().toUpperCase();

/* ========= Schéma / colonnes ========= */
async function ensureDevisCreatedByColumn() {
  try {
    const cols = await dbAll(`PRAGMA table_info(devis)`);
    if (!cols.some((c) => c.name === 'created_by')) {
      await dbRun(`ALTER TABLE devis ADD COLUMN created_by TEXT`);
      console.log('🛠️ Colonne devis.created_by ajoutée');
    }
  } catch (e) {
    console.error('ensureDevisCreatedByColumn error:', e?.message || e);
  }
}

/* ========= Handlers ========= */

// POST /api/devis/complete
exports.createDevisComplet = async (req, res) => {
  try {
    const {
      client_id,
      immatriculation = '',
      kilometrage = 0,
      date_devis,
      montant_ttc = 0,
      statut = 'normal',
      lignes = [],
    } = req.body || {};

    if (!client_id) return res.status(400).json({ error: 'client_id manquant' });
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne à enregistrer' });
    }

    await ensureDevisCreatedByColumn();

    const createdBy = req.user
      ? ((`${req.user?.prenom ?? ''} ${req.user?.nom ?? ''}`.trim()) ||
         req.user?.email ||
         'Admin')
      : 'Admin';

    // --- TRANSACTION ---
    await dbRun('BEGIN IMMEDIATE TRANSACTION');
    try {
      // 1) prochain numéro de devis
      const rCnt = await dbGet(`SELECT last_number FROM counters WHERE type='devis'`);
      const next = ((rCnt?.last_number ?? 0) + 1);
      const numero = pad5(next);

      // 2) voiture (upsert simple)
      const clientIdNum = Number(client_id) || null;
      const immat = cleanImmat(immatriculation);
      let voitureId;

      if (immat !== '' && clientIdNum !== null) {
        const ex = await dbGet(
          `SELECT id FROM voitures WHERE immatriculation=? AND client_id=?`,
          [immat, clientIdNum]
        );
        if (ex?.id) {
          await dbRun(`UPDATE voitures SET kilometrage=? WHERE id=?`, [Number(kilometrage) || 0, ex.id]);
          voitureId = ex.id;
        } else {
          const rV = await dbRun(
            `INSERT INTO voitures (immatriculation, kilometrage, client_id)
             VALUES (?, ?, ?)`,
            [immat, Number(kilometrage) || 0, clientIdNum]
          );
          voitureId = rV.lastID; // ✅ grâce au wrapper dbRun
        }
      } else {
        const rV = await dbRun(
          `INSERT INTO voitures (immatriculation, kilometrage, client_id)
           VALUES (?, ?, ?)`,
          [immat, Number(kilometrage) || 0, clientIdNum]
        );
        voitureId = rV.lastID; // ✅
      }

      // 3) devis
      const rD = await dbRun(
        `INSERT INTO devis (numero, date_devis, montant_ttc, statut, voiture_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          numero,
          (date_devis && String(date_devis)) || new Date().toISOString().slice(0, 10),
          Number(montant_ttc) || 0,
          statut,
          voitureId,
          createdBy,
        ]
      );
      const devisId = rD.lastID; // ✅

      // 4) lignes
      const insL = `
        INSERT INTO devis_lignes
          (devis_id, reference, description, quantite, prix_unitaire, remise, tva, total_ht)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      for (const l of lignes) {
        await dbRun(insL, [
          devisId,
          (l?.reference || '').trim(),
          (l?.description || '').trim(),
          Number(l?.quantite) || 0,
          Number(l?.prix_unitaire) || 0,
          Number(l?.remise) || 0,
          Number(l?.tva) || 0,
          Number(l?.total_ht) || 0,
        ]);
      }

      // 5) compteur
      await dbRun(
  `UPDATE counters
   SET last_number = ?, updated_at = datetime('now')
   WHERE type = 'devis'`,
  [next] // next = ancien last_number + 1
);


      await dbRun('COMMIT');
      return res.status(201).json({
        message: '✅ Devis enregistré avec succès',
        devis_id: devisId,
        numero,
      });
    } catch (inner) {
      try { await dbRun('ROLLBACK'); } catch (_) {}
      throw inner;
    }
  } catch (err) {
    console.error('❌ createDevisComplet error:', err);
    return res
      .status(500)
      .json({ error: 'Erreur serveur', detail: err?.message || String(err) });
  }
};

// GET /api/devis
exports.getAllDevis = async (_req, res) => {
  try {
    const rows = await dbAll(
      `SELECT d.id, d.numero, d.date_devis, d.montant_ttc, d.statut, d.created_by,
              v.immatriculation, c.nom || ' ' || c.prenom AS client
       FROM devis d
       LEFT JOIN voitures v ON v.id = d.voiture_id
       LEFT JOIN clients c ON c.id = v.client_id
       ORDER BY d.id DESC`
    );
    res.json(rows || []);
  } catch (err) {
    console.error('❌ getAllDevis error:', err);
    res.status(500).json({ error: 'Erreur lecture devis', detail: err?.message || String(err) });
  }
};

// GET /api/devis/voitures/:id
exports.getDevisParVoiture = async (req, res) => {
  try {
    const voitureId = Number(req.params.id);
    if (!voitureId) return res.status(400).json({ error: 'id voiture invalide' });

    const rows = await dbAll(
      `SELECT d.id, d.numero, d.date_devis, d.montant_ttc, d.statut
       FROM devis d
       WHERE d.voiture_id = ?
       ORDER BY d.id DESC`,
      [voitureId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('❌ getDevisParVoiture error:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err?.message || String(err) });
  }
};

// GET /api/devis/:id/lignes
exports.getLignesByDevis = async (req, res) => {
  try {
    const devisId = Number(req.params.id);
    if (!devisId) return res.status(400).json({ error: 'id devis invalide' });

    const rows = await dbAll(
      `SELECT id, reference, description, quantite, prix_unitaire, remise, tva, total_ht
       FROM devis_lignes
       WHERE devis_id = ?
       ORDER BY id ASC`,
      [devisId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('❌ getLignesByDevis error:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err?.message || String(err) });
  }
};

// GET /api/devis/:id
exports.getDevisById = async (req, res) => {
  try {
    const devisId = Number(req.params.id);
    if (!devisId) return res.status(400).json({ error: 'id devis invalide' });

    const row = await dbGet(
      `SELECT d.id, d.numero, d.date_devis, d.montant_ttc, d.statut, d.created_by,
              v.immatriculation, v.kilometrage, c.nom, c.prenom
       FROM devis d
       LEFT JOIN voitures v ON v.id = d.voiture_id
       LEFT JOIN clients c ON c.id = v.client_id
       WHERE d.id = ?`,
      [devisId]
    );
    if (!row) return res.status(404).json({ error: 'Devis introuvable' });
    res.json(row);
  } catch (err) {
    console.error('❌ getDevisById error:', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err?.message || String(err) });
  }
};

// GET /api/devis/:id/pdf
exports.getDevisPdf = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id devis invalide' });

    const row = await dbGet(`SELECT numero FROM devis WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ error: 'Devis introuvable' });

    const baseDevis = req.locals?.DIR_DEVIS;
    if (!baseDevis) return res.status(500).json({ error: 'Chemin devis non initialisé' });

    const fileName = `devis_${row.numero}.pdf`;
    const filePath = path.join(baseDevis, fileName);

    if (!fs.existsSync(filePath)) return res.status(404).send(`PDF introuvable : ${fileName}`);
    res.sendFile(filePath);
  } catch (e) {
    console.error('getDevisPdf error:', e?.message || e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/devis/:id/pdf/regenerate
exports.regenerateDevisPdf = (_req, res) => res.status(204).end();
