// frontend/src/apiBase.js
const isElectron = !!(window && window.process && window.process.versions?.electron);

// En dev (Vite) => http://localhost:4001
// En prod (Electron) => backend écoute sur http://localhost:4001
const API_URL =
  isElectron
    ? 'http://localhost:4001'
    : (import.meta.env?.VITE_API_URL ?? (import.meta.env?.DEV ? 'http://localhost:4001' : window.location.origin));

export default API_URL;
