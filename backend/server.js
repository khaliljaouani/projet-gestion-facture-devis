// backend/server.js
const express = require('express');        // OK avec express 4 ou 5
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// 1) Initialise la DB + crée la table `utilisateurs` + arborescence Desktop/gestion/...
const db = require('./db/database');       // exporte l'instance sqlite3 et crée le schéma

// 2) App
const app = express();
const PORT = 4001;

// 3) Middlewares
app.use(cors());
app.use(bodyParser.json());

// 4) Routes API (auth)
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// 5) Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// 6) Servir le frontend buildé EN PROD
//    ⚠️ À placer APRES les routes /api pour ne pas intercepter l'API
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Express 4 ET 5 : ce RegExp évite le bug path-to-regexp de `*`
  // Il fait "toutes les routes qui ne commencent pas par /api"
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 7) Lancement serveur
app.listen(PORT, () => {
  console.log(`✅ Backend démarré sur http://localhost:${PORT}`);
});

// 8) Fermeture propre (utile quand Electron se ferme)
function closeDbAndExit(code = 0) {
  try {
    if (db && typeof db.close === 'function') {
      db.close(() => process.exit(code));
      return;
    }
  } catch (_) {}
  process.exit(code);
}
process.on('SIGINT', () => closeDbAndExit(0));
process.on('SIGTERM', () => closeDbAndExit(0));
process.on('exit', () => {
  try { if (db && typeof db.close === 'function') db.close(); } catch (_) {}
});
