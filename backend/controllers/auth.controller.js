// backend/controllers/auth.controller.js
const db = require('../db/database');

// utilitaire
const normaliserTexte = (t) =>
  t.toString().trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();

exports.register = (req, res) => {
  const { prenom, nom, mot_de_passe, role } = req.body || {};
  if (!prenom || !nom || !mot_de_passe) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  const nom_utilisateur = `${normaliserTexte(prenom)}_${normaliserTexte(nom)}`;

  db.run(
    `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe, nom, prenom, role)
     VALUES (?, ?, ?, ?, ?)`,
    [nom_utilisateur, mot_de_passe, nom, prenom, role || 'admin'],
    function (err) {
      if (err) return res.status(400).json({ error: "Utilisateur existe déjà" });
      res.status(201).json({ 
        user: { id: this.lastID, nom_utilisateur, nom, prenom, role: role || 'admin' } 
      });
    }
  );
};

exports.login = (req, res) => {
  const { nom_utilisateur, mot_de_passe } = req.body || {};
  if (!nom_utilisateur || !mot_de_passe) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }

  db.get(
    `SELECT id, nom_utilisateur, nom, prenom, role
       FROM utilisateurs
      WHERE nom_utilisateur = ? AND mot_de_passe = ?`,
    [nom_utilisateur, mot_de_passe],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Erreur interne' });
      if (!user) return res.status(401).json({ error: 'Identifiants invalides' });
      res.json({ message: 'Connexion réussie', user });
    }
  );
};

// optionnel: liste tous les utilisateurs
exports.getAll = (_req, res) => {
  db.all(`SELECT id, nom_utilisateur, nom, prenom, role FROM utilisateurs ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erreur interne' });
    res.json(rows);
  });
};
