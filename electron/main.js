// electron/main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ===== auto-update =====
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.initialize();
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let win;

/* =========================
   IPC: génération & ouverture PDF
   ========================= */
function registerIpcHandlers() {
  if (ipcMain._saveHtmlAsPdfRegistered) return;
  ipcMain._saveHtmlAsPdfRegistered = true;

  ipcMain.handle('save-html-as-pdf', async (_event, opts = {}) => {
    let pdfWin;
    try {
      const {
        html = '<!doctype html><html><body></body></html>',
        fileName = 'document.pdf',             // ex: devis_3.pdf  (PAS paddé)
        // 'facture' | 'facture_cachee' | 'devis'
        type = 'facture',
      } = opts;

      pdfWin = new BrowserWindow({
        show: false,
        width: 900,
        height: 1273,
        webPreferences: { sandbox: false, nodeIntegration: false, contextIsolation: true },
      });

      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      await pdfWin.loadURL(dataUrl);

      try {
        await pdfWin.webContents.executeJavaScript(
          'document.fonts && document.fonts.ready || Promise.resolve()'
        );
      } catch {}

      const pdfBuffer = await pdfWin.webContents.printToPDF({
        marginsType: 1,
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
      });

      // Dossiers de sortie
      const base = path.join(require('os').homedir(), 'Desktop', 'gestion');
      let outDir;
      if (type === 'devis') outDir = path.join(base, 'devis');
      else if (type === 'facture_cachee') outDir = path.join(base, 'facture', 'facture_cacher');
      else outDir = path.join(base, 'facture');
      fs.mkdirSync(outDir, { recursive: true });

      // Nom sécurisé
      const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_');
      const outPath = path.join(outDir, safeName);

      // === Nettoyage de l’ancienne version paddée (ex: devis_0003.pdf)
      // On cherche un motif "<prefix>_<num>.pdf"
      const m = safeName.match(/^((?:devis|facture)(?:_[^_]+)?)_(\d+)\.pdf$/i);
      if (m) {
        const prefix = m[1];               // "devis" ou "facture", ou "facture_cachee" selon ton usage
        const num = String(parseInt(m[2], 10)); // "3"
        const padded = num.padStart(4, '0');    // "0003"
        const paddedName = `${prefix}_${padded}.pdf`;
        const paddedPath = path.join(outDir, paddedName);
        if (paddedPath !== outPath && fs.existsSync(paddedPath)) {
          try { fs.unlinkSync(paddedPath); } catch {}
        }
      }

      // Écriture (remplace si déjà présent)
      fs.writeFileSync(outPath, pdfBuffer);

      return { success: true, path: outPath };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    } finally {
      if (pdfWin && !pdfWin.isDestroyed()) pdfWin.destroy();
    }
  });

  // Ouverture via l’appli par défaut
  ipcMain.handle('open-path', async (_event, filePath) => {
    try {
      if (!filePath) throw new Error('Path manquant');
      const res = await shell.openPath(filePath); // chaîne vide si OK
      if (res) throw new Error(res);
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e?.message || String(e) };
    }
  });

  // (Auto-update: inchangé – tu peux le laisser si tu l’utilises)
}

function registerAutoUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => {
    log.info('checking-for-update');
    win?.webContents.send('update:checking');
  });
  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
    win?.webContents.send('update:available', info);
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('update-not-available', info?.version);
    win?.webContents.send('update:none', info);
  });
  autoUpdater.on('download-progress', (p) => {
    win?.webContents.send('update:progress', {
      percent: Math.round(p.percent || 0),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log.info('update-downloaded', info?.version);
    win?.webContents.send('update:downloaded', info);
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Redémarrer et installer', 'Plus tard'],
      defaultId: 0,
      title: 'Mise à jour prête',
      message: `La version ${info?.version || ''} est prête à être installée.`,
      detail: 'L’application va se fermer puis redémarrer.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error:', err);
    win?.webContents.send('update:error', err?.message || String(err));
  });
}

function createWindow(urlToLoad) {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(urlToLoad);
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.gestion.app');
  registerIpcHandlers();
  registerAutoUpdaterEvents();

  const isProd = app.isPackaged || process.env.NODE_ENV === 'production';
  if (!isProd) { createWindow('http://localhost:5173'); return; }

  try { require(path.join(__dirname, '..', 'backend', 'server.js')); } catch (e) {
    console.error('Erreur backend (PROD):', e);
  }

  const http = require('http');
  const start = Date.now();
  (function ping() {
    http
      .get('http://localhost:4001/health', (res) => {
        if (res.statusCode === 200) {
          createWindow('http://localhost:4001');
          if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
            setInterval(() => autoUpdater.checkForUpdates(), 2 * 60 * 60 * 1000);
          }
          return;
        }
        setTimeout(ping, 300);
      })
      .on('error', () => {
        if (Date.now() - start > 15000) {
          createWindow('http://localhost:4001');
          if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
            setInterval(() => autoUpdater.checkForUpdates(), 2 * 60 * 60 * 1000);
          }
          return;
        }
        setTimeout(ping, 300);
      });
  })();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
