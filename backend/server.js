// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// --- 1) DB: l'import initialise/ouvre la base (tables, etc.)
const db = require('./db/database');

const app = express();
const PORT = Number(process.env.PORT || 4001);

// --- 2) Middlewares globaux
app.use(express.json({ limit: '10mb' }));

// CORS: autorise Vite (5173), Electron et en-tête Authorization/Idempotency-Key
const corsOptions = {
  origin: [/^http:\/\/localhost:\d+$/], // ex: http://localhost:5173
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// --- 3) Chargement et montage des routeurs
const authRoutes     = requireSafe('./routes/auth.routes',     '/api/auth');
const clientRoutes   = requireSafe('./routes/client.routes',   '/api/clients');
const factureRoutes  = requireSafe('./routes/facture.routes',  '/api/factures');
const devisRoutes    = requireSafe('./routes/devis.routes',    '/api/devis');
const countersRoutes = requireSafe('./routes/counters.routes', '/api/counters');
const voitureRoutes  = requireSafe('./routes/voiture.routes',  '/api/voitures');

// statistiques: accepte plusieurs noms possibles
const statsRoutes =
  requireFirstFound(
    ['./routes/statistiques.routes', './routes/statistique.routes', './routes/stats.routes'],
    '/api/stats'
  );

// Montage effectif (uniquement si le require a réussi)
if (authRoutes)     app.use('/api/auth',     authRoutes);
if (clientRoutes)   app.use('/api/clients',  clientRoutes);
if (factureRoutes)  app.use('/api/factures', factureRoutes);
if (devisRoutes)    app.use('/api/devis',    devisRoutes);
if (countersRoutes) app.use('/api/counters', countersRoutes);
if (voitureRoutes)  app.use('/api/voitures', voitureRoutes);
if (statsRoutes)    app.use('/api/stats',    statsRoutes);

// --- 4) Healthcheck (utile pour Electron / supervision)
app.get('/health', (_req, res) => res.json({ ok: true }));

// --- 5) Servir le frontend buildé (PROD)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Toutes les routes non-API renvoient index.html (SPA)
  app.get(/^\/(?!api)(.*)/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// --- 6) 404 propre pour les routes API inconnues
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// --- 7) Gestion d’erreurs générique
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- 8) Démarrage
app.listen(PORT, () => {
  console.log(`✅ Backend démarré sur http://localhost:${PORT}`);
});

// --- 9) Arrêt propre (fermeture DB)
function closeDbAndExit(code = 0) {
  try {
    if (db && typeof db.close === 'function') {
      return db.close(() => process.exit(code));
    }
  } catch (_) {}
  process.exit(code);
}
process.on('SIGINT',  () => closeDbAndExit(0));
process.on('SIGTERM', () => closeDbAndExit(0));
process.on('exit',    () => { try { if (db && typeof db.close === 'function') db.close(); } catch (_) {} });

// ======================
// Helpers de chargement
// ======================
function requireSafe(modulePath, mountPath) {
  try {
    const mod = require(modulePath);
    console.log(`✅ Routeur ${mountPath} chargé`);
    return mod;
  } catch (e) {
    console.warn(`ℹ️ Routeur ${mountPath} non chargé (${modulePath} manquant ou invalide).`);
    console.warn('   →', e.code || '', e.message);
    return null;
  }
}

function requireFirstFound(paths, mountPath) {
  for (const p of paths) {
    try {
      const mod = require(p);
      console.log(`✅ Routeur ${mountPath} chargé depuis ${p}`);
      return mod;
    } catch (_) { /* try next */ }
  }
  console.warn(`ℹ️ Routeur ${mountPath} non chargé (aucun des fichiers: ${paths.join(', ')})`);
  return null;
}
