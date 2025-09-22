// backend/controllers/counter.controller.js
const db = require('../db/database');
const { promisify } = require('util');

const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));

/** GET /api/counters */
exports.getCounters = async (_req, res) => {
  try {
    const rows = await dbAll(`SELECT type, last_number FROM counters`);
    const get = (t) => Number(rows.find(r => r.type === t)?.last_number || 0);

    const normal = get('normal');
    const cachee = get('cachee');
    const devis  = get('devis');

    res.json({ normal, cachee, devis });
  } catch (err) {
    console.error('❌ Erreur getCounters :', err);
    res.status(500).json({ error: 'Erreur récupération compteurs' });
  }
};

/** GET /api/counters/next */
exports.getNextNumbers = async (_req, res) => {
  try {
    const rows = await dbAll(`SELECT type, last_number FROM counters`);
    const get = (t) => Number(rows.find(r => r.type === t)?.last_number || 0);

    const nextNormal = get('normal') + 1;           // 1,2,3…
    const nextCachee = 'C' + (get('cachee') + 1);   // C1,C2…
    const nextDevis  = get('devis') + 1;            // 1,2,3…

    res.json({ nextNormal, nextCachee, nextDevis });
  } catch (err) {
    console.error('❌ Erreur getNextNumbers :', err);
    res.status(500).json({ error: 'Erreur récupération prochains numéros' });
  }
};

/** PUT /api/counters  Body: { normal, cachee, devis } */
exports.updateCounters = async (req, res) => {
  try {
    const { normal, cachee, devis } = req.body || {};

    const isValidInt = (x) => Number.isInteger(x) && x >= 0;
    if (!isValidInt(normal) || !isValidInt(cachee) || !isValidInt(devis)) {
      return res.status(400).json({ error: 'Valeurs invalides (entiers ≥ 0 attendus)' });
    }

    await dbRun(
      `UPDATE counters SET last_number = ?, updated_at = datetime('now') WHERE type = 'normal'`,
      [normal]
    );
    await dbRun(
      `UPDATE counters SET last_number = ?, updated_at = datetime('now') WHERE type = 'cachee'`,
      [cachee]
    );
    await dbRun(
      `UPDATE counters SET last_number = ?, updated_at = datetime('now') WHERE type = 'devis'`,
      [devis]
    );

    res.json({ message: '✅ Compteurs mis à jour' });
  } catch (err) {
    console.error('❌ Erreur updateCounters :', err);
    res.status(500).json({ error: 'Erreur mise à jour compteurs' });
  }
};
