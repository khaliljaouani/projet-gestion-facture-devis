const db = require('../db/database');

// --- helpers promisifiés (compat sqlite3) ---
const dbGet = (sql, params = []) =>
  new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
const dbAll = (sql, params = []) =>
  new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));

const toISO = (s) => (s ? new Date(s).toISOString().slice(0, 10) : null);

/* =======================
 *  KPI haut de page
 *  GET /api/stats/summary
 * ======================= */
exports.getSummary = async (_req, res) => {
  try {
    const rowEnc = await dbGet(
      `SELECT IFNULL(SUM(montant_ttc),0) AS s
       FROM factures
       WHERE (statut IS NULL OR statut NOT IN ('cachee','impayee'))`
    );
    const rowNorm = await dbGet(
      `SELECT COUNT(*) AS c
       FROM factures
       WHERE (statut IS NULL OR statut != 'cachee')`
    );
    const rowCache = await dbGet(
      `SELECT COUNT(*) AS c
       FROM factures
       WHERE statut = 'cachee'`
    );
    const rowDevis = await dbGet(`SELECT COUNT(*) AS c FROM devis`);

    res.json({
      totalEncaisse: Number(rowEnc?.s || 0),
      facturesNormales: Number(rowNorm?.c || 0),
      facturesCachees: Number(rowCache?.c || 0),
      devis: Number(rowDevis?.c || 0),
    });
  } catch (e) {
    console.error('getSummary error:', e);
    res.status(500).json({ error: 'Erreur lors du calcul du résumé.' });
  }
};

/* ============================
 *  Stats journalières par type
 *  GET /api/stats/daily?start&end
 * ============================ */
exports.getDaily = async (req, res) => {
  try {
    const { start, end } = req.query;
    const whereDevis = [];
    const whereFact = [];
    const pDevis = [];
    const pFact = [];

    if (start) { whereDevis.push(`date(date_devis) >= date(?)`); pDevis.push(start); }
    if (end)   { whereDevis.push(`date(date_devis) <= date(?)`); pDevis.push(end); }

    if (start) { whereFact.push(`date(date_facture) >= date(?)`); pFact.push(start); }
    if (end)   { whereFact.push(`date(date_facture) <= date(?)`); pFact.push(end); }

    const devisRows = await dbAll(
      `SELECT date(date_devis) AS date, IFNULL(SUM(montant_ttc),0) AS total, COUNT(*) AS count
       FROM devis
       ${whereDevis.length ? 'WHERE ' + whereDevis.join(' AND ') : ''}
       GROUP BY date(date_devis)`,
      pDevis
    );

    const factRows = await dbAll(
      `SELECT date(date_facture) AS date, IFNULL(SUM(montant_ttc),0) AS total, COUNT(*) AS count
       FROM factures
       ${whereFact.length ? 'WHERE ' + whereFact.join(' AND ') + ' AND ' : 'WHERE '}
       (statut IS NULL OR statut != 'cachee')
       GROUP BY date(date_facture)`,
      pFact
    );

    const factHiddenRows = await dbAll(
      `SELECT date(date_facture) AS date, IFNULL(SUM(montant_ttc),0) AS total, COUNT(*) AS count
       FROM factures
       ${whereFact.length ? 'WHERE ' + whereFact.join(' AND ') + ' AND ' : 'WHERE '}
       statut = 'cachee'
       GROUP BY date(date_facture)`,
      pFact
    );

    const rows = [
      ...devisRows.map(r => ({ type: 'devis', date: toISO(r.date), total: Number(r.total||0), count: Number(r.count||0) })),
      ...factRows.map(r => ({ type: 'facture', date: toISO(r.date), total: Number(r.total||0), count: Number(r.count||0) })),
      ...factHiddenRows.map(r => ({ type: 'facture_cachee', date: toISO(r.date), total: Number(r.total||0), count: Number(r.count||0) })),
    ].filter(Boolean).sort((a,b) => (a.date||'').localeCompare(b.date||''));

    res.json(rows);
  } catch (e) {
    console.error('getDaily error:', e);
    res.status(500).json({ error: 'Erreur stats journalières.' });
  }
};

/* ======================
 *  Top clients par CA
 *  GET /api/stats/top-clients?limit=5&start&end
 *  (ne compte pas les factures cachées)
 * ====================== */
exports.getTopClients = async (req, res) => {
  try {
    const { limit = 5, start, end } = req.query;
    const where = [];
    const p = [];

    if (start) { where.push(`date(f.date_facture) >= date(?)`); p.push(start); }
    if (end)   { where.push(`date(f.date_facture) <= date(?)`); p.push(end); }

    const rows = await dbAll(
      `SELECT c.id AS client_id,
              TRIM(IFNULL(c.nom,'') || ' ' || IFNULL(c.prenom,'')) AS nom_complet,
              IFNULL(SUM(f.montant_ttc),0) AS total
       FROM factures f
       LEFT JOIN voitures v ON v.id = f.voiture_id
       LEFT JOIN clients  c ON c.id = v.client_id
       ${where.length ? 'WHERE ' + where.join(' AND ') + ' AND ' : 'WHERE '}
       (f.statut IS NULL OR f.statut != 'cachee')
       GROUP BY c.id
       ORDER BY total DESC
       LIMIT ?`,
      [...p, Number(limit) || 5]
    );
    res.json(rows || []);
  } catch (e) {
    console.error('getTopClients error:', e);
    res.status(500).json({ error: 'Erreur top clients.' });
  }
};

/* ==========================================
 *  Documents d’un jour (pour le tableau bas)
 *  GET /api/stats/daily-docs?date=YYYY-MM-DD
 * ========================================== */
exports.getDailyDocs = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.json([]);

    // Devis du jour
    const devis = await dbAll(
      `SELECT date(d.date_devis) AS date, IFNULL(d.montant_ttc,0) AS montant,
              'devis' AS type,
              TRIM(IFNULL(c.nom,'') || ' ' || IFNULL(c.prenom,'')) AS client,
              NULL AS statut
       FROM devis d
       LEFT JOIN voitures v ON v.id = d.voiture_id
       LEFT JOIN clients  c ON c.id = v.client_id
       WHERE date(d.date_devis) = date(?)`,
      [date]
    );

    // Factures (normales + cachées) du jour
    const fact = await dbAll(
      `SELECT date(f.date_facture) AS date, IFNULL(f.montant_ttc,0) AS montant,
              CASE WHEN f.statut='cachee' THEN 'facture_cachee' ELSE 'facture' END AS type,
              TRIM(IFNULL(c.nom,'') || ' ' || IFNULL(c.prenom,'')) AS client,
              IFNULL(f.statut,'payee') AS statut
       FROM factures f
       LEFT JOIN voitures v ON v.id = f.voiture_id
       LEFT JOIN clients  c ON c.id = v.client_id
       WHERE date(f.date_facture) = date(?)`,
      [date]
    );

    const rows = [...devis, ...fact].map(r => ({
      date: toISO(r.date),
      client: r.client || '—',
      type: r.type,
      montant: Number(r.montant || 0),
      statut: r.statut || null,
    }));
    res.json(rows);
  } catch (e) {
    console.error('getDailyDocs error:', e);
    res.status(500).json({ error: 'Erreur documents du jour.' });
  }
};
