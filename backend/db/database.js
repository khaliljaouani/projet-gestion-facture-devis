// backend/db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const desktopPath = path.join(os.homedir(), 'Desktop'); // OK: même en FR Windows "Bureau" s’affiche, mais le chemin réel est "Desktop"
const gestionPath = path.join(desktopPath, 'gestion');

// Création des dossiers
['', 'facture', 'facture/facture_cacher', 'devis', 'base de donne'].forEach((dir) => {
  const full = path.join(gestionPath, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

const dbPath = path.join(gestionPath, 'base de donne', 'db.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Erreur DB :', err.message);
  else console.log('✅ DB connectée :', dbPath);
});

db.serialize(() => {
  // ✅ Recommandé: activer la contrainte FK et le mode WAL
  db.run(`PRAGMA foreign_keys = ON`);
  db.run(`PRAGMA journal_mode = WAL`);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom_utilisateur TEXT UNIQUE NOT NULL,
      mot_de_passe TEXT NOT NULL,
      prenom TEXT,
      nom TEXT,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Clients (tous champs autorisés à NULL)
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      civilite TEXT,
      nom TEXT,
      prenom TEXT,
      type TEXT,
      adresse TEXT,
      code_postal TEXT,
      ville TEXT,
      email TEXT,
      telephone TEXT
    );
  `);

  // Voitures
  db.run(`
    CREATE TABLE IF NOT EXISTS voitures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      immatriculation TEXT,
      kilometrage INTEGER,
      client_id INTEGER,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );
  `);

  // Factures
  db.run(`
    CREATE TABLE IF NOT EXISTS factures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT,                -- pas d'unicité ici, gérée ailleurs
      date_facture TEXT,
      montant_ttc REAL,
      remise REAL,
      statut TEXT,
      voiture_id INTEGER,
      created_by TEXT,
      request_id TEXT,
      FOREIGN KEY (voiture_id) REFERENCES voitures(id)
    );
  `);

  // Lignes de facture
  db.run(`
    CREATE TABLE IF NOT EXISTS facture_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facture_id INTEGER,
      reference TEXT,
      description TEXT,
      quantite REAL,
      prix_unitaire REAL,
      remise REAL,
      tva REAL,
      total_ht REAL,
      FOREIGN KEY (facture_id) REFERENCES factures(id)
    );
  `);

  // Devis
  db.run(`
    CREATE TABLE IF NOT EXISTS devis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT,
      date_devis TEXT,
      montant_ttc REAL,
      statut TEXT,
      voiture_id INTEGER,
      created_by TEXT,
      FOREIGN KEY (voiture_id) REFERENCES voitures(id)
    );
  `);

  // Lignes de devis
  db.run(`
    CREATE TABLE IF NOT EXISTS devis_lignes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      devis_id INTEGER,
      reference TEXT,
      description TEXT,
      quantite REAL,
      prix_unitaire REAL,
      remise REAL,
      tva REAL,
      total_ht REAL,
      FOREIGN KEY (devis_id) REFERENCES devis(id)
    );
  `);

  // Compteurs
  db.run(`
    CREATE TABLE IF NOT EXISTS counters (
      type TEXT PRIMARY KEY,              -- 'normal' | 'cachee' | 'devis'
      last_number INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
  `);

  // Seed counters
  db.run(`INSERT OR IGNORE INTO counters (type, last_number) VALUES ('normal', 0)`);
  db.run(`INSERT OR IGNORE INTO counters (type, last_number) VALUES ('cachee', 0)`);
  db.run(`INSERT OR IGNORE INTO counters (type, last_number) VALUES ('devis', 0)`);

  // Paramètres
  db.run(`
    CREATE TABLE IF NOT EXISTS parametres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_facture INTEGER,
      numero_facture_cachee INTEGER,
      numero_devis INTEGER
    );
  `);

  // ✅ Index utiles pour perfs
  db.run(`CREATE INDEX IF NOT EXISTS idx_voitures_client ON voitures(client_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_factures_voiture ON factures(voiture_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_devis_voiture ON devis(voiture_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes(devis_id)`);
});

module.exports = db;
