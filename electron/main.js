// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');

let win;

function createWindow(urlToLoad) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: true }
  });
  win.loadURL(urlToLoad);
}

function waitFor(url, done, timeoutMs = 15000) {
  const start = Date.now();
  (function ping() {
    http.get(url + '/health', res => {
      if (res.statusCode === 200) return done(null);
      setTimeout(ping, 300);
    }).on('error', () => {
      if (Date.now() - start > timeoutMs) return done(new Error('timeout'));
      setTimeout(ping, 300);
    });
  }());
}

app.whenReady().then(() => {
  const isProd = app.isPackaged || process.env.NODE_ENV === 'production';

  if (!isProd) {
    // DEV: Vite
    createWindow('http://localhost:5173');
    return;
  }

  // PROD: démarrer le backend dans le même process
  try {
    require(path.join(__dirname, '..', 'backend', 'server.js'));
  } catch (e) {
    console.error('Erreur backend (PROD):', e);
  }

  // puis charger 4001
  waitFor('http://localhost:4001', () => {
    createWindow('http://localhost:4001');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
