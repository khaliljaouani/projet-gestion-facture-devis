import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../apiBase';          // ← vérifie le chemin si besoin
import './ListeFactures.css';

export default function ListeFactures() {
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get('/factures', { signal: controller.signal });
        if (!alive) return;
        setFactures(Array.isArray(data) ? data : []);
      } catch (err) {
        // requête annulée -> on ignore
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        // 401 est déjà géré par l'interceptor (redirige vers /login)
        console.error('Erreur chargement factures', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  // ---------- Helpers d'affichage ----------
  const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '-');
  const fmtEuro = (n) =>
    (Number(n || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  // Reconstruit un nom de client fiable si f.client est null/''.
  // Essaie plusieurs clés: nom_client / nomClient / nom, idem pour prenom.
  const getClientName = (f) => {
    const nom =
      f.nom_client ?? f.nomClient ?? f.nom ?? '';
    const prenom =
      f.prenom_client ?? f.prenomClient ?? f.prenom ?? '';
    // Si l'API fournit déjà f.client (non vide), on l'utilise, sinon fallback.
    const fallback = [nom, prenom].filter(Boolean).join(' ').trim(); // "Nom Prénom" (prénom peut être vide)
    return (f.client && String(f.client).trim()) || fallback || '-';
  };

  const filtered = useMemo(() => {
    let rows = [...factures];

    if (search) {
      const s = search.toLowerCase().trim();
      rows = rows.filter((f) => {
        const clientName = getClientName(f).toLowerCase();
        return (
          (f.numero || '').toLowerCase().includes(s) ||
          clientName.includes(s) ||
          (f.immatriculation || '').toLowerCase().includes(s) ||
          (f.created_by || '').toLowerCase().includes(s)
        );
      });
    }

    if (status) rows = rows.filter((f) => (f.statut || '').toLowerCase() === status.toLowerCase());

    const pickDate = (f) => f.date_facture || f.date || f.created_at || null;

    if (month) {
      const [y, m] = month.split('-');
      rows = rows.filter((f) => {
        const dt = pickDate(f);
        if (!dt) return false;
        const d = new Date(dt);
        return String(d.getFullYear()) === y && String(d.getMonth() + 1).padStart(2, '0') === m;
      });
    } else if (year) {
      rows = rows.filter((f) => {
        const dt = pickDate(f);
        if (!dt) return false;
        return String(new Date(dt).getFullYear()) === String(year);
      });
    }

    return rows;
  }, [factures, search, status, month, year]);

  const resetFilters = () => { setSearch(''); setStatus(''); setMonth(''); setYear(''); };

  const handleDownload = async (id, numero = '') => {
    try {
      const res = await api.get(`/factures/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = numero ? `facture_${numero}.pdf` : `facture_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      // 401 géré par l’interceptor
      console.error('Erreur téléchargement PDF', err);
    }
  };

  return (
    <div className="lf-wrap">
      <div className="lf-bar">
        <div className="spacer" />
        <Link to="/app/factures/nouvelle" className="btn-primary">
          <i className="fas fa-plus" /> Nouvelle facture
        </Link>
      </div>

      <div className="card lf-header">
        <div className="lf-header-title">
          <h1>Liste des factures</h1>
          <span className="badge tone-neutral">{loading ? '…' : filtered.length}</span>
        </div>

        <div className="lf-filters">
          <div className="lf-search">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Rechercher : n°, client, immatriculation, admin"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Statut : Tous</option>
            <option value="normale">Normale</option>
            <option value="cachee">Cachée</option>
          </select>

          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <input type="number" min="2000" placeholder="Année" value={year} onChange={(e) => setYear(e.target.value)} />

          <button className="btn-ghost" onClick={resetFilters}>Réinitialiser</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="lf-skeleton"><div className="sk-row" /><div className="sk-row" /><div className="sk-row" /></div>
        ) : filtered.length === 0 ? (
          <div className="lf-empty"><i className="fas fa-folder-open" /><p>Aucune facture trouvée.</p></div>
        ) : (
          <div className="table-responsive">
            <table className="lf-table">
              <thead>
                <tr>
                  <th>Numéro</th><th>Client</th><th>Immatriculation</th><th>Date</th>
                  <th className="right">Total TTC</th><th>Statut</th><th>Réalisée par</th><th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const dateVal = f.date_facture || f.date || f.created_at;
                  return (
                    <tr key={f.id}>
                      <td className="fw">{f.numero || '-'}</td>
                      <td>{getClientName(f)}</td>
                      <td>{f.immatriculation || '-'}</td>
                      <td>{fmtDate(dateVal)}</td>
                      <td className="right">{fmtEuro(f.montant_ttc)}</td>
                      <td><span className={`status-badge ${String(f.statut || '').toLowerCase()}`}>{f.statut || '-'}</span></td>
                      <td><span className="chip">{f.created_by || '-'}</span></td>
                      <td className="center">
                        <Link to={`/app/documents/factures/${f.id}/lignes`} className="btn-ic" title="Voir détails">
                          <i className="fas fa-eye" />
                        </Link>
                        <button type="button" className="btn-ic" title="Télécharger PDF"
                                onClick={() => handleDownload(f.id, f.numero)}>
                          <i className="fas fa-file-pdf" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
