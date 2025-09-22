import React, { useEffect, useState } from 'react';
import { api } from '../apiBase';

const stripNext = (val) => {
  if (val == null || val === '') return '---';
  const s = String(val);
  if (/^C/i.test(s)) {
    const num = s.replace(/^C/i, '').replace(/^0+/, '');
    return 'C' + (num === '' ? '0' : num);
  }
  const n = s.replace(/^0+/, '');
  return n === '' ? '0' : n;
};

const CountersPage = () => {
  const [form, setForm] = useState({ normal: 0, cachee: 0, devis: 0 });
  const [next, setNext] = useState({ nextNormal: '', nextCachee: '', nextDevis: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const authHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadAll = async () => {
    setErr('');
    setMsg('');
    try {
      const headers = authHeader();
      if (!headers.Authorization) {
        setErr('Session expirée. Veuillez vous reconnecter.');
        return;
      }
      const [counters, nexts] = await Promise.all([
       api.get('/counters', { headers }),
api.get('/counters/next', { headers }),
      ]);

      setForm({
        normal: counters.data.normal ?? 0,
        cachee: counters.data.cachee ?? 0,
        devis:  counters.data.devis  ?? 0,
      });
      setNext(nexts.data);
    } catch (e) {
      // 401 explicite => message plus clair
      if (e?.response?.status === 401) {
        setErr('Non autorisé. Session expirée ou token invalide.');
      } else {
        setErr('Impossible de charger les compteurs.');
      }
    }
  };

  useEffect(() => { loadAll(); }, []);

  const save = async () => {
    setMsg('');
    setErr('');
    const n = Number(form.normal), c = Number(form.cachee), d = Number(form.devis);
    if (!Number.isInteger(n) || n < 0) return setErr("Le compteur 'normal' doit être un entier ≥ 0.");
    if (!Number.isInteger(c) || c < 0) return setErr("Le compteur 'cachée' doit être un entier ≥ 0.");
    if (!Number.isInteger(d) || d < 0) return setErr("Le compteur 'devis' doit être un entier ≥ 0.");
    try {
      const headers = authHeader();
      if (!headers.Authorization) {
        setErr('Session expirée. Veuillez vous reconnecter.');
        return;
      }
      await api.put('/counters', { normal: n, cachee: c, devis: d }, { headers });
      setMsg('Compteurs mis à jour ✔');
      loadAll();
    } catch (e) {
      if (e?.response?.status === 401) {
        setErr('Non autorisé. Session expirée ou token invalide.');
      } else {
        setErr('Erreur lors de la mise à jour.');
      }
    }
  };

  const nextNormalUI = Number(form.normal || 0) + 1;
  const nextCacheeUI = 'C' + (Number(form.cachee || 0) + 1);
  const nextDevisUI  = Number(form.devis  || 0) + 1;

  return (
    <div className="container py-3">
      <h3>Gestion des compteurs</h3>
      <p className="text-muted">
        Ces valeurs sont les <strong>derniers numéros utilisés</strong>. Le prochain = dernier + 1.
      </p>

      <div className="card p-3 mb-3">
        <label className="form-label">Dernier numéro Facture (Normal)</label>
        <input
          type="number" min="0" className="form-control"
          value={form.normal}
          onChange={e=>setForm(prev=>({...prev, normal:e.target.value}))}
        />
        <small className="text-muted">Prochain : <code>{nextNormalUI}</code></small>
      </div>

      <div className="card p-3 mb-3">
        <label className="form-label">Dernier numéro Facture (Cachée)</label>
        <input
          type="number" min="0" className="form-control"
          value={form.cachee}
          onChange={e=>setForm(prev=>({...prev, cachee:e.target.value}))}
        />
        <small className="text-muted">Prochain : <code>{nextCacheeUI}</code></small>
      </div>

      <div className="card p-3 mb-3">
        <label className="form-label">Dernier numéro Devis</label>
        <input
          type="number" min="0" className="form-control"
          value={form.devis}
          onChange={e=>setForm(prev=>({...prev, devis:e.target.value}))}
        />
        <small className="text-muted">Prochain : <code>{nextDevisUI}</code></small>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="d-flex justify-content-end" style={{gap:8}}>
        <a className="btn btn-light" href="/factures/nouvelle">Retour</a>
        <button className="btn btn-primary" onClick={save}>Enregistrer</button>
      </div>

      <hr />
      <div>
        <strong>Prochains numéros (backend) :</strong>&nbsp;
        <code>{stripNext(next.nextNormal)}</code> &nbsp;|&nbsp;
        <code>{stripNext(next.nextCachee)}</code> &nbsp;|&nbsp;
        <code>{stripNext(next.nextDevis)}</code>
      </div>
    </div>
  );
};

export default CountersPage;
