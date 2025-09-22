// frontend/src/pages/LignesDocument.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './LignesFacture.css';

export default function LignesDocument() {
  const { id, type } = useParams(); // 'factures' | 'devis'
  const navigate = useNavigate();

  const [lignes, setLignes] = useState([]);
  const [header, setHeader] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- API base ---
  const base = 'http://localhost:4001/api';
  const lignesUrl = `${base}/${type}/${id}/lignes`;
  const headerUrl = type === 'factures' ? `${base}/factures/${id}` : `${base}/devis/${id}`;
  const pdfUrl   = type === 'factures' ? `${base}/factures/${id}/pdf` : `${base}/devis/${id}/pdf`;
  const regenUrl = type === 'factures' ? `${base}/factures/${id}/pdf/regenerate` : `${base}/devis/${id}/pdf/regenerate`;

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    const headers = { Authorization: `Bearer ${token}` };

    (async () => {
      setLoading(true);
      try {
        const [lignesRes, headerRes] = await Promise.allSettled([
          axios.get(lignesUrl, { headers }),
          axios.get(headerUrl, { headers }),
        ]);
        setLignes(lignesRes.status === 'fulfilled' && Array.isArray(lignesRes.value.data) ? lignesRes.value.data : []);
        setHeader(headerRes.status === 'fulfilled' ? (headerRes.value.data || null) : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, type, navigate, lignesUrl, headerUrl]);

  const euro = (n) =>
    (Number(n || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  const totals = useMemo(() => {
    const lineHTs = (lignes || []).map((l) => {
      const q = Number(l.quantite ?? 0);
      const pu = Number(l.prix_unitaire ?? 0);
      return Number(l.total_ht ?? q * pu) || 0;
    });
    const totalHT = lineHTs.reduce((s, v) => s + v, 0);
    const remise = Number(header?.remise ?? 0);
    const baseApresRemise = totalHT - remise;

    let totalTVA = 0;
    (lignes || []).forEach((l, i) => {
      const part = totalHT > 0 ? lineHTs[i] / totalHT : 0;
      const base = lineHTs[i] - (remise * part);
      totalTVA += base * (Number(l.tva ?? 0) / 100);
    });
    const totalTTC = baseApresRemise + totalTVA;
    return { totalHT, remise, totalTVA, totalTTC };
  }, [lignes, header]);

  const isFacture = type === 'factures';

  /* ---------- normalisation du numéro (supprime les zéros à gauche) ---------- */
  function normalizeNumero(raw) {
    if (raw == null) return '';
    const s = String(raw);
    if (/^C/i.test(s)) {
      const num = s.replace(/^C/i, '').replace(/^0+/, '');
      return 'C' + (num === '' ? '0' : num);
    }
    const n = s.replace(/^0+/, '');
    return n === '' ? '0' : n;
  }

  /* =============================
     PDF HTML – style “modèle”
     ============================= */
  const THEME = {
    blue: "#1d5fbf",
    blueDark: "#0f4aa0",
    blueSoft: "#f3f7ff",
    greyText: "#6b7280",
    light: "#e9eef7",
    redLine: "#ea4335",
  };

  function buildHTML() {
    const numero = header?.numero || id;
    const dateStr =
      (header?.date_facture || header?.date_devis)
        ? new Date(header?.date_facture || header?.date_devis).toISOString().slice(0,10)
        : "-";

    const societe = {
      logo: "/pneuslogos.PNG",
      nom: "Rouen Pneus 76",
      adr1: "205 Avenue du 14 Juillet",
      adr2: "76300 Sotteville-lès-Rouen",
      tva:  "FR40984436972",
      tel:  "07 49 91 04 30",
      mail: "Pneurouen@gmail.com",
    };

    const client = {
      nom: (header?.nom || header?.client || "-"),
      adresse: header?.adresse || "-",
      villecp: header?.ville || "-",
      tel: header?.telephone || "-",
      immat: header?.immatriculation || "-",
      km: (header?.kilometrage ?? "-"),
    };

    const rows = (lignes || []).map(l => {
      const q = Number(l.quantite ?? 0);
      const pu = Number(l.prix_unitaire ?? 0);
      const tht = Number(l.total_ht ?? q * pu);
      const tva = Number(l.tva ?? 0);
      return `
        <tr>
          <td class="c-ref">${l.reference || "-"}</td>
          <td class="c-desc">${(l.description || "-").replace(/\n/g,"<br>")}</td>
          <td class="c-num">${q}</td>
          <td class="c-num">${pu.toFixed(2)} €</td>
          <td class="c-num">${tva} %</td>
          <td class="c-num">${tht.toFixed(2)} €</td>
        </tr>`;
    }).join("") || `
      <tr>
        <td class="c-ref">-</td>
        <td class="c-desc">-</td>
        <td class="c-num">1</td>
        <td class="c-num">0,00 €</td>
        <td class="c-num">20 %</td>
        <td class="c-num">0,00 €</td>
      </tr>`;

    const { totalHT, totalTVA, totalTTC } = totals;
    const TITRE = isFacture
      ? (String(header?.statut || "").toLowerCase().includes("cache") ? "FACTURE CACHÉE" : "FACTURE")
      : "DEVIS";

    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${TITRE} ${numero}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin:0; padding:0; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:210mm; min-height:297mm; padding:18mm 18mm 16mm 18mm; }

  .top { display:flex; justify-content:space-between; align-items:flex-start; }
  .societe { display:flex; gap:12px; }
  .logo { width:140px; height:60px; object-fit:contain; }
  .s-info { font: 12px/1.35 Arial, Helvetica, sans-serif; color:#111; }
  .s-info .nom { color:#d21f3c; font-weight:700; font-size:16px; margin:6px 0 2px; }
  .s-info .muted { color:${THEME.greyText}; }

  .titreBox { text-align:right; }
  .titreBox .t1 { color:${isFacture ? "#d21f3c" : THEME.blueDark}; font-weight:800; font-size:16px; letter-spacing:0.2px; }
  .titreBox .t1 .no { color:#c0302b; }
  .titreBox .date { margin-top:6px; color:${THEME.greyText}; font-size:11px; }
  .titreBox .rule { width:145px; height:6px; background:#f0b3b3; border-radius:6px; margin:6px 0 0 auto; }

  .clientWrap { display:flex; justify-content:flex-end; margin-top:14px; }
  .clientBox {
    width: 250px; padding:10px 12px; border:1px solid ${THEME.light};
    background:${THEME.blueSoft}; border-radius:8px; box-shadow:0 1px 0 rgba(0,0,0,.02) inset;
    font: 12px/1.4 Arial, Helvetica, sans-serif; color:#0f172a;
  }
  .clientBox table { width:100%; }
  .clientBox td.label { width:48%; color:#0f4aa0; font-weight:700; padding:2px 0; }
  .clientBox td.val { text-align:left; padding:2px 0; }

  table.lines { width:100%; border-collapse:collapse; margin-top:18px; font: 12px Arial, Helvetica, sans-serif; }
  table.lines thead th {
    background:${THEME.blue}; color:#fff; border:1px solid ${THEME.blueDark};
    padding:8px 6px; font-weight:700;
  }
  table.lines td { border:1px solid #d5dbe7; padding:7px 6px; }
  .c-ref{width:16%} .c-desc{width:44%} .c-num{text-align:right; width:10%}

  .totals { display:flex; justify-content:flex-end; margin-top:10px; }
  .t-grid { width:240px; }
  .t-row { display:flex; justify-content:space-between; padding:6px 8px; border:1px solid #d5dbe7; border-top:0; font: 12px Arial; }
  .t-row:first-child{ border-top:1px solid #d5dbe7; }
  .ttcBtn {
    display:flex; justify-content:space-between; align-items:center;
    background:${THEME.blue}; color:#fff; font-weight:800; padding:8px 10px; border-radius:6px;
    margin-top:8px; border:1px solid ${THEME.blueDark};
  }

  .condWrap { display:flex; gap:24px; margin:12px 0 8px; }
  .condCol { flex:1; font: 12px Arial; }
  .condCol .label { color:#111; font-weight:700; }
  .condCol .dots { color:${THEME.greyText}; }

  .footer { text-align:center; margin-top:28mm; color:#4b5563; font: 11px/1.35 Arial; }
  .footer .thanks { font-weight:700; margin-bottom:4px; }
  .footer .team { font-style:italic; margin-bottom:6px; }
  .footer .hr { width:140mm; height:3px; background:${THEME.redLine}; border-radius:999px; margin:10px auto 0; }
</style>
</head>
<body>
<div class="page">

  <div class="top">
    <div class="societe">
      <img class="logo" src="${societe.logo}" alt="logo"/>
      <div class="s-info">
        <div class="nom">O'PNEUS ROUEN</div>
        <div class="nom2">${societe.nom}</div>
        <div>${societe.adr1}</div>
        <div>${societe.adr2}</div>
        <div class="muted">Tél : ${societe.tel}</div>
        <div class="muted">${societe.tva}</div>
        <div class="muted">${societe.mail}</div>
      </div>
    </div>

    <div class="titreBox">
      <div class="t1">${TITRE} N° <span class="no">${numero}</span></div>
      <div class="date">Date : ${dateStr}</div>
      <div class="rule"></div>
    </div>
  </div>

  <div class="clientWrap">
    <div class="clientBox">
  <table>
    ${(() => {
      // Nettoyage d'une valeur (supprime null/undefined/-, espaces…)
      const clean = (v) => {
        const s = String(v ?? '')
          .replace(/\bnull\b/ig, '')
          .replace(/\bundefined\b/ig, '')
          .replace(/^\s*-\s*$/g, '')
          .trim();
        return s;
      };

      // Ville / CP (si tu as deux champs séparés, concatène-les proprement)
      const ville = clean(header?.ville);
      const cp    = clean(header?.code_postal || header?.cp);
      const villeCp = clean([ville, cp].filter(Boolean).join(' '));

      const rows = [
        { label: 'Nom du client :',  val: clean(client.nom) },
        { label: 'Adresse :',        val: clean(client.adresse) },
        { label: 'Ville/Code postal :', val: villeCp },
        { label: 'Téléphone :',      val: clean(client.tel) },
        { label: 'Immatriculation :',val: clean(client.immat) },
        { label: 'Kilométrage :',    val: clean(client.km) },
      ]
      // On ne garde que les lignes avec une valeur non vide
      .filter(r => r.val && r.val.length > 0)
      // On rend le HTML
      .map(r => `<tr><td class="label">${r.label}</td><td class="val">${r.val}</td></tr>`)
      .join('');

      // Si tout est vide, on affiche juste le nom s'il existe; sinon rien
      return rows || (clean(client.nom) ? 
        `<tr><td class="label">Nom du client :</td><td class="val">${clean(client.nom)}</td></tr>` 
        : ''
      );
    })()}
  </table>
</div>

  </div>

  <table class="lines">
    <thead>
      <tr>
        <th>Réf</th><th>Désignation</th><th>Quantité</th><th>PU HT</th><th>TVA</th><th>Total HT</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${isFacture ? `
  <div class="condWrap">
    <div class="condCol"><span class="label">Conditions de paiement :</span> <span class="dots">-</span></div>
    <div class="condCol"><span class="label">Méthodes de paiement :</span> <span class="dots">-</span></div>
  </div>` : `
  <div class="condWrap">
    <div class="condCol"><span class="label">Validité du devis :</span> <span class="dots">30 jours</span></div>
    <div class="condCol"><span class="label">Conditions :</span> <span class="dots">-</span></div>
  </div>`}

  <div class="totals">
    <div class="t-grid">
      <div class="t-row"><span>Total H.T</span><strong>${totalHT.toFixed(2)} €</strong></div>
      <div class="t-row"><span>T.V.A</span><strong>${totalTVA.toFixed(2)} €</strong></div>
      <div class="ttcBtn"><span>TOTAL T.T.C</span><span>${totalTTC.toFixed(2)} €</span></div>
    </div>
  </div>

  <div class="footer">
    <div class="thanks">Nous vous remercions pour votre confiance</div>
    <div class="team">L’équipe O’Pneus Rouen</div>
    <div>SAS au capital de 1000€ – Siret 984 436 972 00017</div>
    <div>N° TVA Intracommunautaire : FR40984436972</div>
    <div class="hr"></div>
  </div>

</div>
</body></html>`;
  }

  function pdfSaveType() {
    if (!isFacture) return 'devis';
    const statut = String(header?.statut || '').toLowerCase();
    return statut.includes('cache') ? 'facture_cachee' : 'facture';
  }

  // ✅ nom de fichier avec numéro normalisé (pas de zéros à gauche)
  function pdfFileName() {
    const brut = header?.numero || id;
    const numero = normalizeNumero(brut);
    return `${isFacture ? 'facture' : 'devis'}_${numero}.pdf`;
  }

  // Fallback API d’ouverture si ton backend expose /api/.../pdf
  async function openViaApi() {
    const token = localStorage.getItem('token');
    const res = await axios.get(pdfUrl, {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true
    });
    if (res.status !== 200) return false;
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  async function generateWithElectronThenOpen() {
    if (!window.electronAPI?.saveHTMLAsPDF) throw new Error('API Electron indisponible');
    const html = buildHTML();
    const fileName = pdfFileName();
    const typeSave = pdfSaveType();

    const r = await window.electronAPI.saveHTMLAsPDF({ html, fileName, type: typeSave });
    if (!r?.success) throw new Error(r?.error || 'saveHTMLAsPDF failed');

    // Ouverture locale
    if (r.path && window.electronAPI?.openPath) {
      const openRes = await window.electronAPI.openPath(r.path);
      if (openRes?.ok !== true) {
        console.warn('openPath error:', openRes?.msg);
        alert(`PDF généré : ${r.path}\n(ouverture auto indisponible)`);
      }
    }
  }

  async function onRegenerateClick() {
    try {
      // 1) si déjà disponible via l’API, on ouvre
      const already = await openViaApi();
      if (already) return;

      // 2) on tente la régénération côté back (si exposée)
      const token = localStorage.getItem('token');
      await axios.post(regenUrl, null, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true
      });

      // 3) génération locale + ouverture
      await generateWithElectronThenOpen();
    } catch (e) {
      console.error('Régénération/Ouverture PDF échouée', e);
      alert("Impossible d'ouvrir le PDF (ni via Electron, ni via l'API).");
    }
  }

  const euroFmt = (n)=> (Number(n||0)).toLocaleString('fr-FR',{minimumFractionDigits:2, maximumFractionDigits:2})+' €';

  return (
    <div className="ld-page pro">
      <div className="ld-header">
        <button className="btn-retour-ghost" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-left"></i> Retour
        </button>

        <h2 className="ld-title">Détails du {isFacture ? 'Facture' : 'Devis'}</h2>

        <div className="ld-actions">
          <button className="btn btn-primary" onClick={onRegenerateClick}>
            <i className="fas fa-sync-alt" /> Régénérer / Ouvrir PDF
          </button>
        </div>
      </div>

      <div className="ld-subheader">
        <div className="ld-meta-left">
          <span className={`pill pill-${isFacture ? 'blue' : 'purple'}`}>
            {(isFacture ? 'FACTURE' : 'DEVIS')}
          </span>
          {header?.numero && <span className="meta-item">N° {header.numero}</span>}
          {header?.date_facture && (
            <span className="meta-item">Date : {new Date(header.date_facture).toLocaleDateString('fr-FR')}</span>
          )}
          {header?.date_devis && (
            <span className="meta-item">Date : {new Date(header.date_devis).toLocaleDateString('fr-FR')}</span>
          )}
        </div>

        <div className="ld-totaux-mini">
          <div className="mini-row"><span>Total H.T</span><strong>{euroFmt(totals.totalHT)}</strong></div>
          {totals.remise > 0 && (
            <div className="mini-row"><span>Remise globale</span><strong>-{euroFmt(totals.remise)}</strong></div>
          )}
          <div className="mini-row"><span>TVA totale</span><strong>{euroFmt(totals.totalTVA)}</strong></div>
          <div className="mini-ttc"><span>TOTAL T.T.C</span><strong>{euroFmt(totals.totalTTC)}</strong></div>
        </div>
      </div>

      <div className="ld-grid">
        <div className="ld-card">
          <div className="ld-table-wrap">
            <table className="ld-table">
              <thead>
                <tr>
                  <th>Réf</th>
                  <th>Description</th>
                  <th className="th-num">Qté</th>
                  <th className="th-num">PU HT</th>
                  <th className="th-num">TVA</th>
                  <th className="th-num">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-4">Chargement…</td></tr>
                ) : (lignes || []).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-4">Aucune ligne trouvée.</td></tr>
                ) : (
                  (lignes || []).map((l, i) => {
                    const q = Number(l.quantite ?? 0);
                    const pu = Number(l.prix_unitaire ?? 0);
                    const lineTotal = Number(l.total_ht ?? (q * pu));
                    return (
                      <tr key={i}>
                        <td className="muted">{l.reference || '-'}</td>
                        <td className="desc">{l.description || '-'}</td>
                        <td className="num">{q}</td>
                        <td className="num">{euroFmt(pu)}</td>
                        <td className="num">{Number(l.tva ?? 0)} %</td>
                        <td className="num">{euroFmt(lineTotal)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="ld-side">
          <div className="ld-summary">
            <div className="sum-row"><span>Total H.T</span><strong>{euroFmt(totals.totalHT)}</strong></div>
            {totals.remise > 0 && (
              <>
                <div className="sum-row"><span>Remise globale</span><strong>-{euroFmt(totals.remise)}</strong></div>
                <div className="sum-row"><span>Base H.T après remise</span><strong>{euroFmt(totals.totalHT - totals.remise)}</strong></div>
              </>
            )}
            <div className="sum-row"><span>TVA totale</span><strong>{euroFmt(totals.totalTVA)}</strong></div>
            <div className="sum-row ttc"><span>TOTAL T.T.C</span><strong>{euroFmt(totals.totalTTC)}</strong></div>
          </div>
        </aside>
      </div>
    </div>
  );
}
