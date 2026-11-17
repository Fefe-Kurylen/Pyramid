const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  save: (name, data) => ipcRenderer.invoke('save', { name, data }),
  onOpenFile: cb => ipcRenderer.on('open-file', (e, f) => cb(f)),
  setTitleBar: o => ipcRenderer.send('titlebar', o),
  ready: () => ipcRenderer.send('ready'),
  html2pdf: html => ipcRenderer.invoke('html2pdf', html),
  print: (pages, opts) => ipcRenderer.invoke('print', pages, opts),
  printers: () => ipcRenderer.invoke('printers'),
  tsa: (url, body) => ipcRenderer.invoke('tsa', url, body),
  version: () => ipcRenderer.invoke('app-version'),
  onUpdate: cb => ipcRenderer.on('update', (e, o) => cb(o)),
  updateState: () => ipcRenderer.invoke('update-state'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  platform: process.platform
});
