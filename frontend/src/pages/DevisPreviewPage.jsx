// src/pages/DevisPreviewPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import './FacturePreview.css';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import ProgressOverlay from '../components/ProgressOverlay';
import { ToastProvider, useToast } from '../components/ToastProvider';

import { generateAndSaveFromSelector } from '../pdf/pdfTools';

export default function DevisPreviewPageWithProviders() {
  return (
    <ToastProvider>
      <DevisPreviewPage />
    </ToastProvider>
  );
}

function DevisPreviewPage() {
  const [devisData, setDevisData] = useState(null);
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

  // Helpers d’affichage / calcul
  const clean = (v) =>
    String(v ?? '')
      .replace(/\bnull\b/ig, '')
      .replace(/\bundefined\b/ig, '')
      .trim();
  const euro = (v) =>
    Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const n = (x) => Number((x ?? 0).toString().replace(',', '.')) || 0;
  const calcHT = (l) => n(l.qty) * n(l.unitPrice);

  // Charge la preview stockée
  useEffect(() => {
    try {
      const raw = localStorage.getItem('devis-preview');
      if (raw) setDevisData(JSON.parse(raw));
    } catch {
      setDevisData(null);
    }
  }, []);

  // Logo -> dataURL (pour éviter les images manquantes si Electron indispo)
  useEffect(() => {
    const toDataURL = async (path) => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
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

  // Impression navigateur (fallback)
  const handlePrintOnly = () => window.print();

  if (!devisData) return <p>Chargement des données…</p>;

  // Totaux identiques à la facture
  const remise = n(devisData.remise);
  const lignes = Array.isArray(devisData.lignes) ? devisData.lignes : [];
  const totalHT = lignes.reduce((sum, l) => sum + calcHT(l), 0);
  const totalHTRemise = totalHT - remise;
  const totalTVA = lignes.reduce((sum, l) => {
    const part = totalHT === 0 ? 0 : calcHT(l) / totalHT;
    const lineRemise = remise * part;
    const lineHTAfter = calcHT(l) - lineRemise;
    return sum + (lineHTAfter * n(l.vat)) / 100;
  }, 0);
  const totalTTC = totalHTRemise + totalTVA;

  // ---------- Enregistrement + génération PDF (mêmes étapes que facture) ----------
  const saveDevis = async () => {
    if (saving) return;
    if (!devisData?.clientId) {
      toast.error('Client non sélectionné.');
      return;
    }
    if (!lignes.length) {
      toast.error('Aucune ligne.');
      return;
    }

    const payload = {
      client_id: devisData.clientId,
      immatriculation: devisData.immatriculation ?? '',
      kilometrage: devisData.kilometrage ?? '',
      date_devis: devisData.dateDevis ?? '',
      montant_ttc: totalTTC,
      statut: 'normal',
      lignes: lignes.map((l) => ({
        reference: (l?.ref || '').trim(),
        description: (l?.designation || '').trim(),
        quantite: n(l?.qty),
        prix_unitaire: n(l?.unitPrice),
        tva: n(l?.vat),
        total_ht: calcHT(l),
      })),
    };

    try {
      setSaving(true);
      setProgress(10); setProgressStep('Préparation des données…');

      const token = localStorage.getItem('token');
      setProgress(35); setProgressStep('Enregistrement en base…');

      const { data } = await axios.post(
        'http://localhost:4001/api/devis/complete',
        payload,
        { headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idemKeyRef.current } }
      );

      const numero = data?.numero;
      if (!numero) {
        toast.error('Numéro de devis non retourné par le serveur.');
        return;
      }

      setDevisData((prev) => ({ ...prev, numero }));

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const spanNumero = document.querySelector('[data-role="numero-devis"]');
      if (spanNumero && (!spanNumero.textContent || /attribuer/i.test(spanNumero.textContent))) {
        spanNumero.textContent = numero;
      }

      setProgress(75); setProgressStep('Génération du PDF…');
      let pdfOk = false;
      try {
        await generateAndSaveFromSelector(`devis_${numero}.pdf`, {
          selector: '.preview-body',
          type: 'devis'
        });
        pdfOk = true;
      } catch {
        handlePrintOnly();
      }

      setProgress(100); setProgressStep('Terminé !');
      toast.success(`Devis ${numero} enregistré${pdfOk ? ' et PDF généré' : ''}.`);
      localStorage.removeItem('devis-preview');

      await new Promise((r) => setTimeout(r, 400));
      navigate('/app/devis/liste');
    } catch (error) {
      console.error('❌ POST /devis/complete échoue =>', error?.response?.status, error?.response?.data || error.message);
      toast.error('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
      setProgress(0);
      setProgressStep('');
    }
  };

  // Bloc client : mêmes libellés que la facture, lignes non vides uniquement
  const clientRows = [
    { label: 'Nom du client :',   val: clean(devisData.clientNom) },
    { label: 'Adresse :',         val: clean(devisData.clientAdresse) },
    { label: 'Ville/Code postal :', val: clean(devisData.clientVilleCodePostal) },
    
    { label: 'Immatriculation :', val: clean(devisData.immatriculation) },
    { label: 'Kilométrage :',     val: clean(devisData.kilometrage) },
  ].filter(r => r.val);

  return (
    <div className="preview-container">
      <ProgressOverlay
        open={saving}
        progress={progress}
        title="Enregistrement du devis"
        subtitle={progressStep}
      />

      <button
        onClick={() => navigate('/app/devis/nouvelle')}
        className="btn-retour-haut no-print"
        disabled={saving}
      >
        ⬅ Retour
      </button>

      {/* ======= APERÇU DEVIS (copie du layout facture) ======= */}
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
                DEVIS N°{' '}
                <span
                  data-role="numero-devis"
                  style={!devisData.numero ? { marginLeft: 6, fontStyle: 'italic', color: '#888' } : undefined}
                >
                  {devisData.numero || "À attribuer à l’enregistrement"}
                </span>
              </div>
              <div className="facture-date">Date : {devisData.dateDevis || '-'}</div>
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
            <p><strong>Conditions de paiement : {devisData.conditionsReglement || '-'}</strong></p>
            <p><strong>Méthodes de paiement : {devisData.modePaiement || '-'}</strong></p>
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
        <button className="btn btn-primary" onClick={saveDevis} disabled={saving}>
          {saving ? '⏳ Enregistrement…' : '✅ Enregistrer'}
        </button>
        <button className="btn btn-light" onClick={handlePrintOnly} disabled={saving}>
          🖨️ Imprimer
        </button>
      </div>
    </div>
  );
}
