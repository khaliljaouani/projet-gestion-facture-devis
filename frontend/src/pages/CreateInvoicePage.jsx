import React, { useState, useRef, useEffect, useCallback } from 'react';
import './FactureForm.css';
import InvoiceTable from './InvoiceTable';
import ModalNouveauClient from '../components/ModalNouveauClient';
import { api } from '../apiBase'; // ✅ instance axios avec baseURL + token
import { useNavigate } from 'react-router-dom';

/* ---------- Badge prochains numéros (sans zéros à gauche) ---------- */
function NextNumbersBadge() {
  const [nexts, setNexts] = useState(null);

  const stripNext = (val) => {
    if (!val) return '---';
    const s = String(val);
    if (/^C/i.test(s)) {
      const num = s.replace(/^C/i, '').replace(/^0+/, '');
      return 'C' + (num === '' ? '0' : num);
    }
    const n = s.replace(/^0+/, '');
    return n === '' ? '0' : n;
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/counters/next');
        // ex: { nextNormal: "005", nextCachee: "C003" }
        setNexts(data);
      } catch {
        /* silencieux */
      }
    })();
  }, []);

  if (!nexts) return null;
  return (
    <div style={{ margin: '8px 0 12px', color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        Prochain <strong>Normal</strong> : <code>{stripNext(nexts.nextNormal)}</code> &nbsp;|&nbsp;
        Prochain <strong>Cachée</strong> : <code>{stripNext(nexts.nextCachee)}</code>
      </div>
    </div>
  );
}

const CreateInvoicePage = () => {
  const navigate = useNavigate();
  const clientDropdownRef = useRef(null);

  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [clientSelectionne, setClientSelectionne] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);

  const [formData, setFormData] = useState({
    numeroFacture: '',
    kilometrage: '',
    dateFacture: new Date().toISOString().split('T')[0],
    conditionsReglement: '',
    objet: '',
    modePaiement: '',
    client: '',
    immatriculation: '',
    remise: 0
  });

  const [invoiceLines, setInvoiceLines] = useState([
    { ref: '', designation: '', qty: 1, unitPrice: 0, vat: 20 }
  ]);

  const setRemise = useCallback((val) => {
    setFormData(prev => ({ ...prev, remise: val }));
  }, []);

  /* --------- helpers de nettoyage ---------- */
  const clean = (v) =>
    String(v ?? '')
      .replace(/\bnull\b/ig, '')
      .replace(/\bundefined\b/ig, '')
      .trim();
  const joinNonEmpty = (...xs) => xs.map(clean).filter(Boolean).join(' ');

  /* --------- reset brouillon si retour ---------- */
  useEffect(() => {
    if (window.location.pathname === '/factures/nouvelle') {
      localStorage.removeItem('facture-preview');
    }
  }, []);

  /* --------- Auth + chargement clients ---------- */
  useEffect(() => {
    api.get('/clients')
      .then(res => setClients(res.data))
      .catch(() => navigate('/login'));
  }, [navigate]);

  /* --------- restaure brouillon éventuel ---------- */
  useEffect(() => {
    const stored = localStorage.getItem('facture-preview');
    if (stored) {
      const parsed = JSON.parse(stored);
      setFormData(prev => ({
        ...prev,
        numeroFacture: parsed.numeroFacture ?? '',
        dateFacture: parsed.dateFacture ?? new Date().toISOString().split('T')[0],
        conditionsReglement: parsed.conditionsReglement ?? '',
        objet: parsed.objet ?? '',
        modePaiement: parsed.modePaiement ?? '',
        client: parsed.clientNom ?? '',
        immatriculation: parsed.immatriculation ?? '',
        remise: parsed.remise ?? 0
      }));
      setClientSearch(parsed.clientNom ?? '');
      setInvoiceLines(parsed.lignes ?? []);
    }
  }, []);

  /* --------- fermer suggestions client si clic extérieur ---------- */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target)) {
        setShowClientSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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

  const handleRedirectToViewInvoice = (isHidden) => {
    if (!clientSelectionne || !clientSelectionne.id) {
      alert("❌ Veuillez sélectionner un client avant de continuer.");
      return;
    }

    // valeurs client nettoyées
    const nomComplet = joinNonEmpty(clientSelectionne.nom, clientSelectionne.prenom);
    const adresse = clean(clientSelectionne.adresse);
    const villeCp = joinNonEmpty(clientSelectionne.codePostal, clientSelectionne.ville);
    const tel = clean(clientSelectionne.telephone);

    const previewData = {
      ...formData,
      clientNom: nomComplet,
      clientId: clientSelectionne.id,
      clientAdresse: adresse || '',
      clientVilleCodePostal: villeCp || '',
      clientTelephone: tel || '',
      kilometrage: clean(formData.kilometrage),
      immatriculation: clean(formData.immatriculation),
      lignes: invoiceLines,
      isHidden,
      remise: remise,
      totalTTC
    };

    localStorage.setItem('facture-preview', JSON.stringify(previewData));
    navigate('/app/factures/preview');
  };

  const handleClientSearchChange = (e) => {
    const val = e.target.value;
    setClientSearch(val);
    handleInputChange('client', val);

    if (val.length > 0) {
      const q = val.toLowerCase();
      const filtered = clients.filter(c =>
        joinNonEmpty(c.nom, c.prenom).toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
      setFilteredClients(filtered);
      setShowClientSuggestions(true);
    } else {
      setFilteredClients([]);
      setShowClientSuggestions(false);
    }
  };

  const handleClientSelect = (client) => {
    setClientSearch(joinNonEmpty(client.nom, client.prenom));
    setClientSelectionne(client);
    setShowClientSuggestions(false);
  };

  const handleDropdownToggle = () => {
    setShowClientSuggestions(prev => !prev);
    if (!showClientSuggestions) setFilteredClients(clients);
  };

  return (
    <div>
      <div className="facture-title-container">
        <span className="facture-title">Facture</span>
      </div>

      <NextNumbersBadge />

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
              <button className="client-dropdown-btn" type="button" tabIndex={-1} onClick={handleDropdownToggle}>▼</button>
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
            <button className="nouveau-btn-inline" type="button" onClick={() => setShowClientModal(true)}>+ Nouveau</button>
          </div>
        </div>

        <div className="form-groups-row">
          <div className="form-group-block">
            <div className="form-group">
              <label className="form-label">Kilométrage</label>
              <input type="number" className="form-input" value={formData.kilometrage} onChange={e => handleInputChange('kilometrage', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date facture</label>
              <input type="date" className="form-input" value={formData.dateFacture} onChange={e => handleInputChange('dateFacture', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Objet</label>
              <input type="text" className="form-input" value={formData.objet} onChange={e => handleInputChange('objet', e.target.value)} />
            </div>
          </div>

          <div className="form-group-block">
            <div className="form-group">
              <label className="form-label">Immatriculation</label>
              <input type="text" className="form-input" value={formData.immatriculation} onChange={e => handleInputChange('immatriculation', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Mode de paiement</label>
              <select className="form-select" value={formData.modePaiement} onChange={e => handleInputChange('modePaiement', e.target.value)}>
                <option value="">Sélectionner</option>
                <option value="virement">Virement bancaire</option>
                <option value="cheque">Chèque</option>
                <option value="especes">Espèces</option>
                <option value="carte">Carte bancaire</option>
                <option value="prelevement">Prélèvement</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Conditions de règlement</label>
              <select className="form-select" value={formData.conditionsReglement} onChange={e => handleInputChange('conditionsReglement', e.target.value)}>
                <option value="">Sélectionner</option>
                <option value="comptant">Comptant</option>
                <option value="30j">30 jours</option>
                <option value="45j">45 jours</option>
                <option value="60j">60 jours</option>
                <option value="30j-fin-mois">30 jours fin de mois</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="facture-second-card">
        <InvoiceTable invoiceLines={invoiceLines} setInvoiceLines={setInvoiceLines} setRemise={setRemise} />
      </div>

      {showClientModal && (
        <ModalNouveauClient
          onClose={() => setShowClientModal(false)}
          onSave={client => {
            if (client?.id) {
              setClients(prev => [...prev, client]);
              setClientSelectionne(client);
              setClientSearch(joinNonEmpty(client.nom, client.prenom));
              setShowClientModal(false);
            } else {
              alert("⚠️ Erreur : le client retourné n’a pas d’ID.");
            }
          }}
        />
      )}

      <div className="save-actions">
  <button className="btn btn-visualiser" onClick={() => handleRedirectToViewInvoice(false)}>
    Enregistrer
  </button>
  <button className="btn btn-secondaire" onClick={() => handleRedirectToViewInvoice(true)}>
    Enregistrer cachée
  </button>
</div>


    </div>
  );
};

export default CreateInvoicePage;
