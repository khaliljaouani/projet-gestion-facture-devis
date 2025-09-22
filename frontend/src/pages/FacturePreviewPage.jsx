import React, { useEffect, useRef, useState } from 'react';
import './FacturePreview.css';
import { useNavigate } from 'react-router-dom';
import { api } from '../apiBase';

import ProgressOverlay from '../components/ProgressOverlay';
import { ToastProvider, useToast } from '../components/ToastProvider';

// ➜ PDF fidèle au preview
import { generateAndSaveFromSelector } from '../pdf/pdfTools';

export default function FacturePreviewPageWithProviders() {
  return (
    <ToastProvider>
      <FacturePreviewPage />
    </ToastProvider>
  );
}

function FacturePreviewPage() {
  const [factureData, setFactureData] = useState(null);
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const pdfRef = useRef(null);
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStep, setProgressStep] = useState('');
  const toast = useToast();

  const idemKeyRef = useRef(
    (globalThis.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random()))
  );

  // helpers d’affichage
  const clean = (v) =>
    String(v ?? '')
      .replace(/\bnull\b/ig, '')
      .replace(/\bundefined\b/ig, '')
      .trim();
  const joinNonEmpty = (...xs) => xs.map(clean).filter(Boolean).join(' ');

  // Charge le brouillon
  useEffect(() => {
    const raw = localStorage.getItem('facture-preview');
    if (!raw) return;
    try { setFactureData(JSON.parse(raw)); } catch { setFactureData(null); }
  }, []);

  // Logo -> dataURL (pour l’avoir dans le PDF)
  useEffect(() => {
    const toDataURL = async (path) => {
      try {
        const res = await fetch(path);
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    };
    toDataURL('/pneuslogos.PNG').then(setLogoDataUrl);
  }, []);

  // Empêche fermeture pendant sauvegarde
  useEffect(() => {
    const handler = (e) => { if (saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saving]);

  if (!factureData) return <p>Chargement des données…</p>;

  const euro = (v) =>
    Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const n = (x) => Number((x ?? 0).toString().replace(',', '.')) || 0;
  const calcHT = (l) => n(l.qty) * n(l.unitPrice);

  const remise = n(factureData.remise);
  const lignes = Array.isArray(factureData.lignes) ? factureData.lignes : [];
  const totalHT = lignes.reduce((sum, l) => sum + calcHT(l), 0);
  const totalHTRemise = totalHT - remise;
  const totalTVA = lignes.reduce((sum, l) => {
    const part = totalHT === 0 ? 0 : calcHT(l) / totalHT;
    const lineRemise = remise * part;
    const lineHTAfter = calcHT(l) - lineRemise;
    return sum + (lineHTAfter * n(l.vat)) / 100;
  }, 0);
  const totalTTC = totalHTRemise + totalTVA;

  // Impression navigateur (fallback manuel)
  const handlePrintOnly = () => window.print();

  // ---------- Enregistrement + génération PDF (fidèle au preview) ----------
  const saveFacture = async () => {
    if (saving) return;

    if (!factureData?.clientId) {
      toast.error('Client non sélectionné.');
      return;
    }
    const lignes = Array.isArray(factureData.lignes) ? factureData.lignes : [];
    if (!lignes.length) {
      toast.error('Aucune ligne.');
      return;
    }

    const n = (x) => Number((x ?? 0).toString().replace(',', '.')) || 0;
    const calcHT = (l) => n(l.qty) * n(l.unitPrice);

    const voiture = {
      immatriculation: factureData.immatriculation ?? '',
      kilometrage: factureData.kilometrage ?? '',
      client_id: factureData.clientId,
    };

    const remise = n(factureData.remise);
    const totalHT = lignes.reduce((s, l) => s + calcHT(l), 0);
    const totalHTRemise = totalHT - remise;
    const totalTVA = lignes.reduce((s, l) => {
      const part = totalHT === 0 ? 0 : calcHT(l) / totalHT;
      const lineRemise = remise * part;
      const htAfter = calcHT(l) - lineRemise;
      return s + (htAfter * n(l.vat)) / 100;
    }, 0);
    const totalTTC = totalHTRemise + totalTVA;

    const facture = {
      date_facture: factureData.dateFacture ?? '',
      montant_ttc: totalTTC,
      remise: remise,
      statut: factureData.isHidden ? 'cachee' : 'normale',
    };

    const lignesPayload = lignes.map((l) => ({
      reference: (l?.ref || '').trim(),
      description: (l?.designation || '').trim(),
      quantite: n(l?.qty),
      prix_unitaire: n(l?.unitPrice),
      remise: 0,
      tva: n(l?.vat),
      total_ht: calcHT(l),
    }));

    const payload = {
      voiture,
      facture,
      lignes: lignesPayload,
      idempotencyKey: idemKeyRef.current,
    };

    try {
      setSaving(true);
      setProgress(10); setProgressStep('Préparation des données…');

      setProgress(35); setProgressStep('Enregistrement en base…');
      const { data } = await api.post('/factures/complete', payload, { timeout: 15000 });

      const numero = data?.numero;
      if (!numero) {
        toast.error('Numéro non retourné par le serveur.');
        return;
      }

      setFactureData((prev) => ({ ...prev, numero }));

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const spanNumero = document.querySelector('[data-role="numero"]');
      if (spanNumero && (!spanNumero.textContent || /attribuer/i.test(spanNumero.textContent))) {
        spanNumero.textContent = numero;
      }

      setProgress(75); setProgressStep('Génération du PDF…');
      const type = factureData.isHidden ? 'facture_cachee' : 'facture';
      let pdfOk = false;
      try {
        await generateAndSaveFromSelector(`facture_${numero}.pdf`, {
          selector: '.preview-body',
          type
        });
        pdfOk = true;
      } catch {
        handlePrintOnly();
      }

      setProgress(100); setProgressStep('Terminé !');
      toast.success(`Facture ${numero} enregistrée${pdfOk ? ' et PDF généré' : ''}.`);
      localStorage.removeItem('facture-preview');

      await new Promise((r) => setTimeout(r, 400));
      navigate('/app/factures/liste');
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      if (status === 401) {
        toast.error('Non autorisé. Veuillez vous reconnecter.');
        navigate('/login');
      } else {
        console.error('❌ POST /factures/complete échoue =>', status, data || error.message);
        toast.error(data?.error || 'Erreur lors de l’enregistrement.');
      }
    } finally {
      setSaving(false);
      setProgress(0);
      setProgressStep('');
    }
  };

  /* ----------- bloc client : n’afficher que les lignes non vides ----------- */
  const clientRows = [
    { label: 'Nom du client :',   val: clean(factureData.clientNom) },
    { label: 'Adresse :',         val: clean(factureData.clientAdresse) },
    { label: 'Ville/Code postal :', val: clean(factureData.clientVilleCodePostal) },
    
    { label: 'Immatriculation :', val: clean(factureData.immatriculation) },
    { label: 'Kilométrage :',     val: clean(factureData.kilometrage) },
  ].filter(r => r.val);

  return (
    <div className="preview-container">
      <ProgressOverlay
        open={saving}
        progress={progress}
        title="Enregistrement de la facture"
        subtitle={progressStep}
      />

      <button
        onClick={() => navigate('/app/factures/nouvelle')}
        className="btn-retour-haut no-print"
        disabled={saving}
      >
        ⬅ Retour
      </button>

      {/* ======= APERÇU FACTURE (capturé tel quel pour le PDF) ======= */}
      <div className="preview-body" ref={pdfRef}>
        <div className="facture-header-line">
          <div className="header-left">
            <img src={logoDataUrl || '/pneuslogos.PNG'} alt="Logo" className="logo" />
            <div className="societe-info">
              <h2>Rouen Pneus 76</h2>
              <p>
                205 Avenue du 14 Juillet<br />
                76300 Sotteville-lès-Rouen<br />
                FR40984436972<br />
                Tél : 07 44 91 04 30<br />
                Pneurouen@gmail.com
              </p>
            </div>
          </div>

          <div className="header-right">
            <div className="facture-top-right">
              <div className="facture-label-barre">
                FACTURE {factureData.isHidden ? '' : ''}N°{' '}
                <span
                  data-role="numero"
                  style={!factureData.numero ? { marginLeft: 6, fontStyle: 'italic', color: '#888' } : undefined}
                >
                  {factureData.numero || "À attribuer à l’enregistrement"}
                </span>
              </div>
              <div className="facture-date">Date : {factureData.dateFacture || '-'}</div>
            </div>

            <div className="client-info-box">
              {clientRows.map((r, i) => (
                <div key={i}>
                  <span className="label">{r.label}</span>
                  <span className="value">{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="separator-line" />

        <table className="facture-table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th>Quantité</th>
              <th>PU HT</th>
              <th>TVA</th>
              <th>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((ligne, i) => (
              <tr key={i}>
                <td>{ligne?.designation || '-'}</td>
                <td>{n(ligne?.qty)}</td>
                <td>{euro(n(ligne?.unitPrice))}</td>
                <td>{n(ligne?.vat)} %</td>
                <td>{euro(calcHT(ligne))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totaux-grid">
          <div className="left-column">
            <p><strong>Conditions de paiement : {factureData.conditionsReglement || '-'}</strong></p>
            <p><strong>Méthodes de paiement : {factureData.modePaiement || '-'}</strong></p>
          </div>
          <div className="right-column">
            {remise > 0 && <div className="ligne-total"><span>Remise</span><span>-{euro(remise)}</span></div>}
            <div className="ligne-total"><span><strong>Total H.T</strong></span><span>{euro(totalHTRemise)}</span></div>
            <div className="ligne-total"><span>T.V.A</span><span>{euro(totalTVA)}</span></div>
            <div className="ttc-box-bordered"><span>TOTAL T.T.C</span><span>{euro(totalTTC)}</span></div>
          </div>
        </div>

        <div className="footer">
          <p><strong>Nous vous remercions pour votre confiance</strong></p>
          <p><em>L'équipe O’Pneus Rouen</em></p>
          <p>SAS au capital de 1000€ – Siret 984 436 972 00017</p>
          <p>N° TVA Intracommunautaire : FR40984436972</p>
          <div className="bottom-red-line" />
        </div>
      </div>

      <div className="preview-actions no-print">
  <button className="btn btn-primary" onClick={saveFacture} disabled={saving}>
    {saving ? '⏳ Enregistrement…' : '✅ Enregistrer'}
  </button>
  <button className="btn btn-light" onClick={handlePrintOnly} disabled={saving}>
    🖨️ Imprimer
  </button>
</div>

    </div>
  );
}