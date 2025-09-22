// backend/controllers/facture.controller.js
const db = require('../db/database');
const path = require('path');
const fs = require('fs');

// ==== Wrappers SQLite (gardent this.lastID) ====
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const pad3 = (n) => String(n).padStart(3, '0');

// ==== Helpers schéma ====
async function ensureCreatedByColumn() {
  try {
    const cols = await dbAll(`PRAGMA table_info(factures)`);
    if (!cols.some(c => c.name === 'created_by')) {
      await dbRun(`ALTER TABLE factures ADD COLUMN created_by TEXT`);
    }
  } catch {}
}
async function ensureIdempotencyColumn() {
  try {
    const cols = await dbAll(`PRAGMA table_info(factures)`);
    if (!cols.some(c => c.name === 'request_id')) {
      await dbRun(`ALTER TABLE factures ADD COLUMN request_id TEXT`);
    }
    await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_factures_request_id
                 ON factures(request_id) WHERE request_id IS NOT NULL`);
  } catch {}
}
async function ensureCountersRows() {
  await dbRun(`INSERT OR IGNORE INTO counters(type, last_number, updated_at)
               VALUES ('normal',0,datetime('now'))`);
  await dbRun(`INSERT OR IGNORE INTO counters(type, last_number, updated_at)
               VALUES ('cachee',0,datetime('now'))`);
}

// ==== Handlers ====

// POST /api/factures/complete
exports.createFactureComplete = async (req, res) => {
  try {
    await ensureCreatedByColumn();
    await ensureIdempotencyColumn();
    await ensureCountersRows();

    const { voiture, facture, lignes = [], idempotencyKey } = req.body || {};
    if (!voiture || !facture || !Array.isArray(lignes)) {
      return res.status(400).json({ error: 'Payload incomplet (voiture/facture/lignes)' });
    }
    if (lignes.length === 0) return res.status(400).json({ error: 'Aucune ligne fournie' });

    const requestId = String(idempotencyKey || '').trim() || null;

    if (requestId) {
      const existing = await dbGet(`SELECT id, numero FROM factures WHERE request_id = ?`, [requestId]);
      if (existing) return res.json({ numero: existing.numero, factureId: existing.id, duplicate: true });
    }

    const type = String(facture.statut) === 'cachee' ? 'cachee' : 'normal';
    const prefix = type === 'cachee' ? 'C' : '';
    const dateFacture =
      (facture.date_facture && String(facture.date_facture)) ||
      new Date().toISOString().slice(0, 10);

    const immat = String(voiture.immatriculation || '').trim();
    const clientId = (voiture.client_id === '' || voiture.client_id == null) ? null : Number(voiture.client_id);

    const montantTTC = Number(facture.montant_ttc) || 0;
    const remise = Number(facture.remise) || 0;

    const createdBy = req.user?.username || req.user?.email || 'Admin';

    await dbRun('BEGIN IMMEDIATE');
    try {
      // compteur
      const rowCnt = await dbGet(`SELECT last_number FROM counters WHERE type = ?`, [type]);
      const next = ((rowCnt?.last_number ?? 0) + 1);
      const numero = `${prefix}${pad3(next)}`;

      // voiture (upsert)
      let voitureId;
      if (immat !== '' && clientId !== null) {
        const existingV = await dbGet(
          'SELECT id FROM voitures WHERE immatriculation = ? AND client_id = ?',
          [immat, clientId]
        );
        if (existingV?.id) {
          await dbRun('UPDATE voitures SET kilometrage = ? WHERE id = ?',
            [Number(voiture.kilometrage) || 0, existingV.id]);
          voitureId = existingV.id;
        } else {
          const r = await dbRun(
            'INSERT INTO voitures (immatriculation, kilometrage, client_id) VALUES (?,?,?)',
            [immat, Number(voiture.kilometrage) || 0, clientId]
          );
          voitureId = r.lastID;
        }
      } else {
        const r = await dbRun(
          'INSERT INTO voitures (immatriculation, kilometrage, client_id) VALUES (?,?,?)',
          [immat, Number(voiture.kilometrage) || 0, clientId]
        );
        voitureId = r.lastID;
      }

      // facture
      const rF = await dbRun(
        `INSERT INTO factures
          (numero, date_facture, montant_ttc, remise, statut, voiture_id, created_by, request_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          numero,
          dateFacture,
          montantTTC,
          remise,
          type === 'cachee' ? 'cachee' : 'normale',
          voitureId,
          createdBy,
          requestId,
        ]
      );
      const factureId = rF.lastID;

      // lignes
      const insL = `INSERT INTO facture_lignes
        (facture_id, reference, description, quantite, prix_unitaire, remise, tva, total_ht)
        VALUES (?,?,?,?,?,?,?,?)`;
      for (const L of lignes) {
        await dbRun(insL, [
          factureId,
          (L?.reference || '').trim(),
          (L?.description || '').trim(),
          Number(L?.quantite) || 0,
          Number(L?.prix_unitaire) || 0,
          Number(L?.remise) || 0,
          Number(L?.tva) || 0,
          Number(L?.total_ht) || 0,
        ]);
      }

      // incrément compteur
      await dbRun(
        `UPDATE counters SET last_number = ?, updated_at = datetime('now') WHERE type = ?`,
        [next, type]
      );

      await dbRun('COMMIT');
      return res.json({ numero, factureId });
    } catch (e) {
      try { await dbRun('ROLLBACK'); } catch (_) {}
      throw e;
    }
  } catch (err) {
    // dédup idempotence (conflit index)
    if (String(err?.message || '').includes('idx_factures_request_id')) {
      try {
        const rid = String(req.body?.idempotencyKey || '').trim();
        if (rid) {
          const existing = await dbGet(`SELECT id, numero FROM factures WHERE request_id = ?`, [rid]);
          if (existing) return res.json({ numero: existing.numero, factureId: existing.id, duplicate: true });
        }
      } catch {}
    }
    console.error('❌ createFactureComplete error:', err?.message || err);
    return res.status(500).json({ error: 'Enregistrement échoué', detail: err?.message || String(err) });
  }
};

// GET /api/factures/:id/pdf
exports.getFacturePdf = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    const row = await dbGet(`SELECT numero, statut FROM factures WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ error: 'Facture introuvable' });

    const baseFactures = req.locals?.DIR_FACTURES;
    const baseFacturesCache = req.locals?.DIR_FACTURES_CACHE;
    if (!baseFactures || !baseFacturesCache) {
      return res.status(500).json({ error: 'Chemins factures non initialisés' });
    }

    const subBase = row.statut === 'cachee' ? baseFacturesCache : baseFactures;
    const fileName = `facture_${row.numero}.pdf`;
    const filePath = path.join(subBase, fileName);

    if (!fs.existsSync(filePath)) return res.status(404).send(`PDF introuvable : ${fileName}`);
    res.sendFile(filePath);
  } catch (e) {
    console.error('getFacturePdf error:', e?.message || e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/factures/:id/pdf/regenerate
exports.regenerateFacturePdf = (_req, res) => res.status(204).end();

// GET /api/factures/:id/lignes
exports.getLignesByFacture = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });
    const rows = await dbAll(
      `SELECT id, reference, description, quantite, prix_unitaire, remise, tva, total_ht
       FROM facture_lignes WHERE facture_id = ?`,
      [id]
    );
    res.json(rows || []);
  } catch (e) {
    console.error('getLignesByFacture error:', e?.message || e);
    res.status(500).json({ error: 'Erreur lecture lignes' });
  }
};

// GET /api/factures/:id
exports.getFactureById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    const row = await dbGet(
      `SELECT id, numero, date_facture, montant_ttc, remise, statut, voiture_id, created_by
       FROM factures WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(row);
  } catch (e) {
    console.error('getFactureById error:', e?.message || e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/factures
// GET /api/factures
exports.getAllFactures = async (_req, res) => {
  try {
    await ensureCreatedByColumn();
    const rows = await dbAll(`
      SELECT
        f.id,
        f.numero,
        f.date_facture,
        f.montant_ttc,
        f.remise,
        f.statut,
        f.created_by,
        v.immatriculation,
        -- ✅ Concaténation null-safe + trim
        TRIM(COALESCE(c.nom, '') || ' ' || COALESCE(c.prenom, '')) AS client,
        -- (optionnel mais pratique pour le frontend)
        c.nom   AS nom_client,
        c.prenom AS prenom_client
      FROM factures f
      LEFT JOIN voitures v ON v.id = f.voiture_id
      LEFT JOIN clients c  ON c.id = v.client_id
      ORDER BY f.id DESC
    `);
    res.json(rows || []);
  } catch (e) {
    console.error('Erreur getAllFactures:', e?.message || e);
    res.status(500).json({ error: 'Erreur lecture factures' });
  }
};


// GET /api/voitures/:id/factures  (appelé par voiture.routes.js)
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
