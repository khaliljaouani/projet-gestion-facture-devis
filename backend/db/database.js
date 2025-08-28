// backend/db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const desktopPath = path.join(os.homedir(), 'Desktop');
const gestionPath = path.join(desktopPath, 'gestion');
['', 'facture', 'facture/facture_cahcher', 'devis', 'base de donne'].forEach((dir) => {
  const full = path.join(gestionPath, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

const dbPath = path.join(gestionPath, 'base de donne', 'db.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Erreur DB :', err.message);
  else console.log('✅ DB connectée :', dbPath);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom_utilisateur TEXT UNIQUE NOT NULL,
      mot_de_passe   TEXT NOT NULL,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'admin'
    )
  `);
});

module.exports = db;
