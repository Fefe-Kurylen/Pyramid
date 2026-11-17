'use strict';
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu, shell, net } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Garde les réglages de l’ancienne version « Pyramid »
app.setPath('userData', path.join(app.getPath('appData'), 'Pyramid'));
const isMac = process.platform === 'darwin';
if (isMac){
  // Menu Mac standard (Pyramid PDF, Édition pour Cmd+C/V/Z, Fenêtre) : indispensable aux raccourcis clavier
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu', label: 'Pyramid PDF' },
    { role: 'fileMenu', label: 'Fichier' },
    { role: 'editMenu', label: 'Édition' },
    { role: 'viewMenu', label: 'Affichage' },
    { role: 'windowMenu', label: 'Fenêtre' }
  ]));
} else Menu.setApplicationMenu(null);
nativeTheme.themeSource = 'dark';

let win = null, ready = false, lastDir = null;
const pending = [];
const fileArgs = argv => argv.slice(1).filter(a => /\.(pdf|png|jpe?g|webp|gif|bmp|tiff?|svg|docx|xlsx?|ods|txt|md|csv|html?)$/i.test(a) && fs.existsSync(a));

function sendFiles(files){
  if (!win || !ready){ pending.push(...files); return; }
  for (const f of files){
    try {
      lastDir = path.dirname(f);
      win.webContents.send('open-file', { name: path.basename(f), data: fs.readFileSync(f) });
    } catch (e) { dialog.showErrorBox('Pyramid PDF', `Impossible d’ouvrir ${path.basename(f)}`); }
  }
}

function createWindow(){
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 820, minHeight: 560,
    backgroundColor: '#1e2026', title: 'Pyramid PDF', show: true,
    icon: path.join(__dirname, 'app', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 19 } } : { titleBarOverlay: { color: '#262930', symbolColor: '#e8eaf0', height: 52 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false, v8CacheOptions: 'bypassHeatCheck', backgroundThrottling: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'), process.env.PYR_DEBUG ? { query: { debug: '1' } } : undefined);
  win.webContents.on('will-prevent-unload', e => {
    const c = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'Pyramid PDF', buttons: ['Quitter sans exporter', 'Annuler'], defaultId: 1, cancelId: 1,
      message: 'Certaines modifications n’ont pas été exportées.', detail: 'Si tu quittes maintenant, elles seront perdues.'
    });
    if (c === 0) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  const home = require('url').pathToFileURL(path.join(__dirname, 'app', 'index.html')).href;
  win.webContents.on('will-navigate', (e, url) => { if (url.split('#')[0] !== home) e.preventDefault(); });
  win.on('closed', () => { win = null; ready = false; });
}

const fromApp = e => { try { return !!win && e.sender === win.webContents && String(e.senderFrame && e.senderFrame.url || '').startsWith('file:'); } catch { return false; } };
ipcMain.handle('save', async (e, { name, data }) => {
  if (!fromApp(e)) return null;
  name = String(name || 'document.pdf').replace(/[\\/:*?"<>|]/g, '_');
  const r = await dialog.showSaveDialog(win, {
    title: 'Exporter le PDF',
    defaultPath: path.join(lastDir || app.getPath('documents'), name),
    filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, Buffer.from(data));
  lastDir = path.dirname(r.filePath);
  return r.filePath;
});
ipcMain.on('titlebar', (e, o) => {
  if (!win || !fromApp(e) || !o) return;
  try {
    const light = /^#?([0-9a-f]{6})$/i.test(o.color) && parseInt(o.color.replace('#','').slice(0,2), 16) > 200;
    nativeTheme.themeSource = light ? 'light' : 'dark';
    if (!isMac && win.setTitleBarOverlay) win.setTitleBarOverlay({ color: o.color, symbolColor: o.symbolColor, height: Math.max(28, Math.min(80, o.height|0)) });
  } catch {}
});
const tmpHtml = html => { const f = path.join(os.tmpdir(), `pyramid-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`); fs.writeFileSync(f, html, 'utf8'); return f; };
ipcMain.handle('html2pdf', async (e, html) => {
  if (!fromApp(e)) return null;
  const f = tmpHtml(String(html || ''));
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await w.loadFile(f);
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
    return new Uint8Array(pdf);
  } finally { w.destroy(); fs.promises.unlink(f).catch(() => {}); }
});
ipcMain.handle('printers', async e => {
  if (!fromApp(e)) return [];
  try { return (await win.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })); } catch { return []; }
});
const PAPER_MM = { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
ipcMain.handle('print', async (e, pages, o) => {
  if (!fromApp(e) || !Array.isArray(pages)) return { ok: false };
  o = o || {};
  const paper = PAPER_MM[o.paper] ? o.paper : 'A4', land = !!o.landscape;
  const [pw, ph] = PAPER_MM[paper], W = land ? ph : pw, H = land ? pw : ph;
  const per = [1, 2, 4].includes(o.per) ? o.per : 1, actual = o.fit === 'actual' && per === 1;
  const cols = per === 4 ? 2 : (per === 2 ? (land ? 2 : 1) : 1), rows = per / cols;
  // 1 page par feuille : taille exacte (ou mise à l'échelle de la feuille), sans marge ajoutée
  const pad = per === 1 ? 0 : 5, gap = per === 1 ? 0 : 4;
  const ok = pages.filter(p => p && /^data:image\/(jpeg|png);base64,/.test(p.src));
  if (!ok.length) return { ok: false, err: 'aucune page' };
  let body = '';
  for (let i = 0; i < ok.length; i += per){
    body += '<div class="s">' + ok.slice(i, i + per).map(p => {
      const st = actual ? ` class="a" style="width:${(+p.w * 25.4 / 72).toFixed(2)}mm;height:${(+p.h * 25.4 / 72).toFixed(2)}mm"` : '';
      return `<div class="c"><img src="${p.src}"${st}></div>`;
    }).join('') + '</div>';
  }
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:${paper} ${land ? 'landscape' : 'portrait'};margin:0}
html,body{margin:0;padding:0;background:#fff}
.s{width:${W}mm;height:${(H - 0.6).toFixed(2)}mm;box-sizing:border-box;padding:${pad}mm;display:grid;gap:${gap}mm;grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));overflow:hidden;page-break-after:always;break-after:page}
.s:last-child{page-break-after:auto;break-after:auto}
.c{position:relative;min-width:0;min-height:0;overflow:hidden}
.c img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain${o.color === false ? ';filter:grayscale(1)' : ''}}
.c img.a{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);object-fit:fill}</style></head><body>${body}</body></html>`;
  const f = tmpHtml(html);
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await w.loadFile(f);
    const opts = {
      silent: true, printBackground: true, color: o.color !== false, landscape: land, pageSize: paper,
      margins: { marginType: 'none' }, copies: Math.max(1, Math.min(99, o.copies | 0 || 1)), collate: o.collate !== false,
      duplexMode: ['simplex', 'shortEdge', 'longEdge'].includes(o.duplexMode) ? o.duplexMode : 'simplex',
      scaleFactor: 100
    };
    if (o.deviceName) opts.deviceName = String(o.deviceName);
    return await new Promise(res => w.webContents.print(opts, (success, err) => res({ ok: !!success, err: success ? '' : String(err || '') })));
  } finally { w.destroy(); fs.promises.unlink(f).catch(() => {}); }
});
const TSA_OK = ['http://timestamp.digicert.com', 'http://timestamp.sectigo.com', 'https://freetsa.org/tsr'];
ipcMain.handle('tsa', async (e, url, body) => {
  if (!fromApp(e) || !TSA_OK.includes(url)) throw new Error('Autorité non autorisée');
  const r = await net.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/timestamp-query' }, body: Buffer.from(body) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
});
ipcMain.handle('app-version', e => fromApp(e) ? app.getVersion() : '');
ipcMain.on('ready', e => {
  if (!fromApp(e)) return; ready = true; const f = pending.splice(0); sendFiles(f); });

// Mac : fichiers ouverts depuis le Finder (double-clic, glisser sur l’icône)
app.on('open-file', (e, f) => { e.preventDefault(); if (fs.existsSync(f)) sendFiles([f]); });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv, cwd) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    sendFiles(fileArgs(argv.map((a, i) => i === 0 ? a : path.resolve(cwd || process.cwd(), a))));
  });
  app.whenReady().then(() => { createWindow(); sendFiles(fileArgs(process.argv)); });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win) createWindow(); });
}
