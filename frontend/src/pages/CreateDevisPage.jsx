import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FactureForm.css';
import InvoiceTable from './InvoiceTable';
import ModalNouveauClient from '../components/ModalNouveauClient';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const CreateDevis = () => {
  const navigate = useNavigate();
  const clientDropdownRef = useRef(null);

  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);

  const [formData, setFormData] = useState({
    kilometrage: '',
    dateDevis: new Date().toISOString().split('T')[0],
    objet: '',
    modePaiement: '',
    conditionsReglement: '',
    immatriculation: '',
    remise: 0
  });

  const [invoiceLines, setInvoiceLines] = useState([
    { ref: '', designation: '', qty: 1, unitPrice: 0, vat: 20 }
  ]);

  const setRemise = useCallback((val) => {
    setFormData(prev => ({ ...prev, remise: val }));
  }, []);

  // utilitaires
  const clean = (v) =>
    String(v ?? '')
      .replace(/\bnull\b/ig, '')
      .replace(/\bundefined\b/ig, '')
      .trim();

  const joinNonEmpty = (...xs) => xs.map(clean).filter(Boolean).join(' ');

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('http://localhost:4001/api/clients', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setClients(res.data))
    .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) {
        setShowClientSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const n = (x) => Number((x ?? 0).toString().replace(',', '.')) || 0;
  const calcHT = (l) => n(l.qty) * n(l.unitPrice);
  const totalHT = invoiceLines.reduce((sum, l) => sum + calcHT(l), 0);
  const remise = n(formData.remise);
  const totalHTRemise = totalHT - remise;

  const totalTVA = invoiceLines.reduce((sum, l) => {
    const part = totalHT === 0 ? 0 : calcHT(l) / totalHT;
    const lineRemise = remise * part;
    const lineHTAfter = calcHT(l) - lineRemise;
    return sum + (lineHTAfter * n(l.vat)) / 100;
  }, 0);

  const totalTTC = totalHTRemise + totalTVA;

  // ➜ on ne génère PAS de numéro ici : le serveur l’attribue
  const handleRedirectToPreview = () => {
    if (!clientSelectionne) {
      alert('❌ Veuillez sélectionner un client');
      return;
    }

    // valeurs client nettoyées
    const nomComplet = joinNonEmpty(clientSelectionne.nom, clientSelectionne.prenom);
    const adresse = clean(clientSelectionne.adresse);
    const villeCp = joinNonEmpty(clientSelectionne.codePostal, clientSelectionne.ville);
    const tel = clean(clientSelectionne.telephone);

    const previewData = {
      dateDevis: formData.dateDevis,
      kilometrage: clean(formData.kilometrage),
      objet: clean(formData.objet),
      modePaiement: clean(formData.modePaiement),
      conditionsReglement: clean(formData.conditionsReglement),
      immatriculation: clean(formData.immatriculation),
      remise: remise,
      lignes: invoiceLines,
      clientNom: nomComplet,
      clientId: clientSelectionne.id,
      clientAdresse: adresse || '',                // vide si non fourni
      clientVilleCodePostal: villeCp || '',        // vide si non fourni
      clientTelephone: tel || '',                  // vide si non fourni
      montant_ttc: totalTTC
    };

    localStorage.setItem('devis-preview', JSON.stringify(previewData));
    navigate('/app/devis/preview');
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClientSearchChange = (e) => {
    const val = e.target.value;
    setClientSearch(val);

    if (val.length > 0) {
      const q = val.toLowerCase();
      const filtered = clients.filter(c =>
        joinNonEmpty(c.nom, c.prenom).toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
      setFilteredClients(filtered);
      setShowClientSuggestions(true);
    } else {
      setShowClientSuggestions(false);
      setFilteredClients([]);
    }
  };

  const handleClientSelect = (client) => {
    setClientSelectionne(client);
    setClientSearch(joinNonEmpty(client.nom, client.prenom));
    setShowClientSuggestions(false);
  };

  const handleDropdownToggle = () => {
    setShowClientSuggestions(open => !open);
    if (!showClientSuggestions) setFilteredClients(clients);
  };

  return (
    <div>
      <div className="facture-title-container">
        <span className="facture-title">Devis</span>
      </div>

      <div className="facture-form-container">
        <div className="form-group" ref={clientDropdownRef}>
          <label className="form-label">Client</label>
          <div className="client-row-inline">
            <div className="client-search-container">
              <input
                type="text"
                className="form-input client-search-input"
                placeholder="Taper et sélectionner votre client"
                value={clientSearch}
                onChange={handleClientSearchChange}
                onFocus={() => {
                  if (filteredClients.length > 0) setShowClientSuggestions(true);
                }}
              />
              <button
                className="client-dropdown-btn"
                type="button"
                tabIndex={-1}
                onClick={handleDropdownToggle}
              >▼</button>
              {showClientSuggestions && filteredClients.length > 0 && (
                <div className="client-suggestions">
                  {filteredClients.map(client => (
                    <div
                      key={client.id}
                      className="client-suggestion-item"
                      onClick={() => handleClientSelect(client)}
                    >
                      <div className="client-name">{joinNonEmpty(client.nom, client.prenom)}</div>
                      {!!client.email && <div className="client-email">{client.email}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="nouveau-btn-inline"
              type="button"
              onClick={() => setShowClientModal(true)}
            >+ Nouveau</button>
          </div>
        </div>

        <div className="form-groups-row">
          <div className="form-group-block">
            <div className="form-group">
              <label className="form-label">Kilométrage</label>
              <input
                type="number"
                className="form-input"
                placeholder="Ex : 120000"
                value={formData.kilometrage}
                onChange={e => handleInputChange('kilometrage', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date devis</label>
              <input
                type="date"
                className="form-input"
                value={formData.dateDevis}
                onChange={e => handleInputChange('dateDevis', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Objet</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex : Changement de pare-brise"
                value={formData.objet}
                onChange={e => handleInputChange('objet', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group-block">
            <div className="form-group">
              <label className="form-label">Immatriculation</label>
              <input
                type="text"
                className="form-input"
                placeholder="Ex : AB-123-CD"
                value={formData.immatriculation}
                onChange={e => handleInputChange('immatriculation', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mode de paiement</label>
              <select
                className="form-select"
                value={formData.modePaiement}
                onChange={e => handleInputChange('modePaiement', e.target.value)}
              >
                <option value="">Sélectionner</option>
                <option value="virement">Virement bancaire</option>
                <option value="cheque">Chèque</option>
                <option value="especes">Espèces</option>
                <option value="carte">Carte bancaire</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conditions de règlement</label>
              <select
                className="form-select"
                value={formData.conditionsReglement}
                onChange={e => handleInputChange('conditionsReglement', e.target.value)}
              >
                <option value="">Sélectionner</option>
                <option value="comptant">Comptant</option>
                <option value="30j">30 jours</option>
                <option value="45j">45 jours</option>
                <option value="60j">60 jours</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="facture-second-card">
        <InvoiceTable
          invoiceLines={invoiceLines}
          setInvoiceLines={setInvoiceLines}
          setRemise={setRemise}
        />
      </div>

      {showClientModal && (
        <ModalNouveauClient
          onClose={() => setShowClientModal(false)}
          onSave={(client) => {
            setClients(prev => [...prev, client]);
            setClientSelectionne(client);
            setClientSearch(joinNonEmpty(client.nom, client.prenom));
            setShowClientModal(false);
          }}
        />
      )}

      <div style={{ textAlign: 'right', marginTop: '24px' }}>
        <div style={{ marginTop: '24px' }}>
          <button
            className="btn btn-primary w-100 btn-lg d-flex justify-content-center align-items-center"
            onClick={handleRedirectToPreview}
          >
            Prévisualiser
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateDevis;
