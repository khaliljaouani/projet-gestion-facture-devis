// src/App.jsx
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/overrides.css'; // 👈 importer EN DERNIER

import { useEffect, useState } from 'react';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import InvoiceListPage from './pages/InvoiceListPage';
import CreateInvoicePage from './pages/CreateInvoicePage';
import CreateDevisPage from './pages/CreateDevisPage';
import FacturePreviewPage from './pages/FacturePreviewPage';
import ListeFactures from './pages/ListeFactures';
import ListeDevis from './pages/ListeDevis';
import AjoutClient from './pages/AjoutClient';
import ClientList from './pages/ClientList';
import VoituresClient from './pages/VoituresClient';
import DocumentsVoiture from './pages/DocumentsVoiture';
import ViewDevisPage from './pages/DevisPreviewPage';
import LignesDocument from './pages/LignesDocument';
import CountersPage from './pages/CountersPage';

import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

/* ===========================
   Bandeau d’auto-update (renderer)
   =========================== */
function UpdateNotifier() {
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null); // { version, ... } ou null
  const [progress, setProgress] = useState(null);   // { percent, ... } ou null
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!window?.updates) return;

    const onChecking = () => {
      setChecking(true);
      setError('');
      toast.info('Recherche de mise à jour…', { toastId: 'upd-check' });
    };
    const onAvailable = (info) => {
      setChecking(false);
      setAvailable(info || {});
      setProgress(null);
      setDownloaded(false);
      toast.info(`Mise à jour disponible (${info?.version || ''}) — téléchargement…`, { toastId: 'upd-av' });
    };
    const onNone = () => {
      setChecking(false);
      setAvailable(null);
      setProgress(null);
      setDownloaded(false);
      toast.dismiss('upd-av');
      toast.success('Aucune mise à jour disponible.', { toastId: 'upd-none' });
    };
    const onProgress = (p) => setProgress(p);
    const onDownloaded = (info) => {
      setDownloaded(true);
      setProgress({ percent: 100 });
      toast.dismiss('upd-av');
      toast.success(`Mise à jour ${info?.version || ''} téléchargée. L’installeur va se lancer.`, { autoClose: 4000 });
    };
    const onError = (msg) => {
      setChecking(false);
      setError(String(msg || 'Erreur de mise à jour'));
      toast.error(`Erreur mise à jour : ${msg}`);
    };

    window.updates.onChecking(onChecking);
    window.updates.onAvailable(onAvailable);
    window.updates.onNone(onNone);
    window.updates.onProgress(onProgress);
    window.updates.onDownloaded(onDownloaded);
    window.updates.onError(onError);

    window.updates.check().catch(() => {});
  }, []);

  if (!window?.updates) return null;

  const percent = progress?.percent ?? (downloaded ? 100 : 0);
  const showBanner = checking || available || progress || downloaded || error;
  if (!showBanner) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        minWidth: 320,
        background: '#0d6efd',
        color: 'white',
        padding: '8px 12px',
        borderRadius: 10,
        boxShadow: '0 6px 18px rgba(0,0,0,.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ fontWeight: 700 }}>
        {checking && 'Recherche de mise à jour…'}
        {!checking && available && !downloaded && `Mise à jour disponible ${available?.version ? `(${available.version})` : ''}`}
        {downloaded && 'Mise à jour téléchargée — installation imminente…'}
        {error && `Erreur : ${error}`}
      </div>

      {(progress && !downloaded) && (
        <div
          style={{
            width: 280,
            height: 8,
            background: 'rgba(255,255,255,.25)',
            borderRadius: 20,
            overflow: 'hidden',
          }}
          aria-label={`Téléchargement ${Math.round(percent)}%`}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, percent))}%`,
              height: '100%',
              background: 'white',
              transition: 'width .3s ease',
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.updates.check().catch(() => {})}
          className="btn btn-sm btn-light"
          style={{ color: '#0d6efd', fontWeight: 600 }}
        >
          Rechercher
        </button>
      </div>
    </div>
  );
}

/* ===========================
   App
   =========================== */
const App = () => {
  const [user, setUser] = useState(null);

  // Hydrate l'état user depuis le token si présent (pour Layout / PrivateRoute)
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !user) setUser({ token });
  }, [user]);

  return (
    <HashRouter basename="/">
      <ToastContainer position="top-center" autoClose={3000} />
      <UpdateNotifier />

      <Routes>
        {/* Auth publiques */}
        <Route path="/login" element={<LoginPage setUser={setUser} />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* ⚠️ Toujours commencer par /login au démarrage */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Espace protégé */}
        <Route
          path="/app"
          element={
            <PrivateRoute user={user}>
              <Layout user={user} />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="factures/nouvelle" element={<CreateInvoicePage />} />
          <Route path="factures/preview" element={<FacturePreviewPage />} />
          <Route path="factures/liste" element={<ListeFactures />} />
          <Route path="factures" element={<InvoiceListPage />} />

          <Route path="devis/nouvelle" element={<CreateDevisPage />} />
          <Route path="devis/preview" element={<ViewDevisPage />} />
          <Route path="devis/liste" element={<ListeDevis />} />

          <Route path="clients/liste" element={<ClientList />} />
          <Route path="clients/ajouter" element={<AjoutClient />} />
          <Route path="clients/:id/voitures" element={<VoituresClient />} />
          <Route path="voitures/:id/documents" element={<DocumentsVoiture />} />

          <Route path="documents/:type/:id/lignes" element={<LignesDocument />} />
          <Route path="parametres/compteurs" element={<CountersPage />} />
        </Route>

        {/* Toute autre route → login (on force le passage par l’auth) */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
