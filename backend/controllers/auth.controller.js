// backend/controllers/auth.controller.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // simple à installer sur Windows
const db = require('../db/database'); // adapte si besoin (sqlite)

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES_IN = '2d';

// Helpers (sqlite callback -> Promise)
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function makeToken(user) {
  const payload = { id: user.id, username: user.nom_utilisateur, role: user.role || 'user' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/** POST /api/auth/register */
// backend/controllers/auth.controller.js (dans register)
async function register(req, res) {
  try {
    let { nom_utilisateur, mot_de_passe, role = 'user', prenom = '', nom = '' } = req.body || {};

    // si nom_utilisateur n'est pas fourni, le créer depuis prenom/nom
    if (!nom_utilisateur) {
      const u = `${(prenom||'').toString()}_${(nom||'').toString()}`
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^a-z0-9_]/g, '');
      nom_utilisateur = u || null;
    }

    if (!nom_utilisateur || !mot_de_passe) {
      return res.status(400).json({ error: 'nom_utilisateur et mot_de_passe requis' });
    }

    const exists = await dbGet('SELECT id FROM users WHERE nom_utilisateur = ?', [nom_utilisateur]);
    if (exists) return res.status(409).json({ error: 'Utilisateur déjà existant' });

    const hash = await bcrypt.hash(String(mot_de_passe), 10);
    const result = await dbRun(
      'INSERT INTO users (nom_utilisateur, mot_de_passe, role, prenom, nom) VALUES (?,?,?,?,?)',
      [nom_utilisateur, hash, role, prenom, nom]
    );

    const user = { id: result.lastID, nom_utilisateur, role };
    const token = makeToken(user);

    return res.status(201).json({ token, user: { id: user.id, username: nom_utilisateur, role } });
  } catch (e) {
    console.error('❌ register:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/** POST /api/auth/login */
async function login(req, res) {
  try {
    const { nom_utilisateur, mot_de_passe } = req.body || {};
    if (!nom_utilisateur || !mot_de_passe) {
      return res.status(400).json({ error: 'nom_utilisateur et mot_de_passe requis' });
    }

    const user = await dbGet('SELECT * FROM users WHERE nom_utilisateur = ?', [nom_utilisateur]);
    if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

    const ok = await bcrypt.compare(String(mot_de_passe), String(user.mot_de_passe));
    if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = makeToken(user);
    return res.json({ token, user: { id: user.id, username: user.nom_utilisateur, role: user.role || 'user' } });
  } catch (e) {
    console.error('❌ login:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

/** GET /api/auth/users (admin) */
async function getAll(_req, res) {
  try {
    const rows = await dbAll('SELECT id, nom_utilisateur AS username, role FROM users ORDER BY id DESC');
    return res.json(rows);
  } catch (e) {
    console.error('❌ getAll users:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = { register, login, getAll };
