const db = require('../db/database');

// --- Helpers promisifiés adaptés à sqlite3.run/get/all ---
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      // IMPORTANT: lastID/changes sont sur "this"
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

// Normalise: toute valeur -> string trim, vide => NULL
const toNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/**
 * POST /api/clients
 * Body: { civilite, nom, prenom, type, adresse, codePostal, ville, email, telephone }
 */
exports.createClient = async (req, res) => {
  try {
    const {
      civilite,
      nom,
      prenom,
      type,
      adresse,
      codePostal,
      ville,
      email,
      telephone,
    } = req.body || {};

    // "type" est un mot réservé -> l’échapper dans SQL
    const sql = `
      INSERT INTO clients (civilite, nom, prenom, "type", adresse, code_postal, ville, email, telephone)
      VALUES (?,?,?,?,?,?,?,?,?)
    `;
    const result = await dbRun(sql, [
      toNull(civilite),
      toNull(nom),
      toNull(prenom),
      toNull(type),
      toNull(adresse),
      toNull(codePostal),
      toNull(ville),
      toNull(email),
      toNull(telephone),
    ]);

    return res.status(201).json({
      id: result.lastID,
      civilite: toNull(civilite),
      nom: toNull(nom),
      prenom: toNull(prenom),
      type: toNull(type),
      adresse: toNull(adresse),
      codePostal: toNull(codePostal),
      ville: toNull(ville),
      email: toNull(email),
      telephone: toNull(telephone),
    });
  } catch (err) {
    console.error('❌ Erreur ajout client :', err);
    return res.status(500).json({
      message: "Erreur lors de l'ajout du client",
      error: err.message || String(err),
    });
  }
};

/**
 * GET /api/clients
 */
exports.getClients = async (_req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, civilite, nom, prenom, "type" AS type, adresse,
              code_postal AS codePostal, ville, email, telephone
       FROM clients
       ORDER BY id DESC`
    );
    res.json(rows || []);
  } catch (err) {
    console.error('❌ Erreur récupération clients :', err);
    res.status(500).json({
      message: 'Erreur lors de la récupération des clients',
      error: err.message || String(err),
    });
  }
};

/**
 * GET /api/clients/:id
 */
exports.getClientById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    const row = await dbGet(
      `SELECT id, civilite, nom, prenom, "type" AS type, adresse,
              code_postal AS codePostal, ville, email, telephone
       FROM clients
       WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Client introuvable' });
    res.json(row);
  } catch (err) {
    console.error('❌ Erreur récupération client :', err);
    res.status(500).json({ error: 'Erreur serveur', detail: err.message || String(err) });
  }
};

/**
 * PUT /api/clients/:id
 */
exports.updateClient = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    const {
      civilite,
      nom,
      prenom,
      type,
      adresse,
      codePostal,
      ville,
      email,
      telephone,
    } = req.body || {};

    const sql = `
      UPDATE clients
      SET civilite=?,
          nom=?,
          prenom=?,
          "type"=?,
          adresse=?,
          code_postal=?,
          ville=?,
          email=?,
          telephone=?
      WHERE id=?
    `;
    const result = await dbRun(sql, [
      toNull(civilite),
      toNull(nom),
      toNull(prenom),
      toNull(type),
      toNull(adresse),
      toNull(codePostal),
      toNull(ville),
      toNull(email),
      toNull(telephone),
      id,
    ]);

    if ((result.changes || 0) === 0) {
      return res.status(404).json({ message: 'Client introuvable pour mise à jour' });
    }
    res.json({ message: 'Client mis à jour avec succès' });
  } catch (err) {
    console.error('❌ Erreur mise à jour client :', err);
    res.status(500).json({
      message: 'Erreur lors de la mise à jour du client',
      error: err.message || String(err),
    });
  }
};

/**
 * DELETE /api/clients/:id
 */
exports.deleteClient = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalide' });

    const result = await dbRun(`DELETE FROM clients WHERE id = ?`, [id]);
    if ((result.changes || 0) === 0) {
      return res.status(404).json({ message: 'Client introuvable pour suppression' });
    }
    res.json({ message: 'Client supprimé avec succès' });
  } catch (err) {
    console.error('❌ Erreur suppression client :', err);
    res.status(500).json({
      message: 'Erreur lors de la suppression du client',
      error: err.message || String(err),
    });
  }
};
