// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveHTMLAsPDF: (opts) => ipcRenderer.invoke('save-html-as-pdf', opts),
  openPath: (p) => ipcRenderer.invoke('open-path', p), // ouverture via IPC (robuste)
});

contextBridge.exposeInMainWorld('updates', {
  check: () => ipcRenderer.invoke('update:check'),
  onChecking: (cb) => ipcRenderer.on('update:checking', (_e) => cb()),
  onAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb(info)),
  onNone: (cb) => ipcRenderer.on('update:none', (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on('update:progress', (_e, p) => cb(p)),
  onDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb(info)),
  onError: (cb) => ipcRenderer.on('update:error', (_e, msg) => cb(msg)),
});
