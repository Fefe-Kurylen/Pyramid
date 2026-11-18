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

/* ---------- Scanner avec le téléphone ----------
   Petit serveur sur le réseau local (même Wi-Fi) : le téléphone ouvre la page du QR code (scan.html), photographie
   les pages, les redresse, puis les envoie ; elles arrivent ici et s'ouvrent en un PDF dans un nouvel onglet.
   Adresse protégée par un code secret aléatoire ; arrêt automatique après 30 min sans activité. */
const SCAN = { server: null, token: '', port: 0, url: '', urls: [], idle: null, phones: 0 };
function lanAddresses(){
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) for (const a of list || []) {
    if (a.family !== 'IPv4' && a.family !== 4) continue;
    if (a.internal || a.address.startsWith('169.254.')) continue;
    const virt = /vmware|virtualbox|vethernet|hyper-v|docker|wsl|loopback|tailscale|zerotier|vpn/i.test(name);
    const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
    out.push({ ip: a.address, score: (priv ? 2 : 0) + (virt ? -3 : 0) + (/^192\.168\./.test(a.address) ? 1 : 0) + (/wi-?fi|wlan|sans fil/i.test(name) ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).map(a => a.ip);
}
const scanSend = (ch, d) => { try { if (win) win.webContents.send(ch, d); } catch {} };
function scanTouch(){ clearTimeout(SCAN.idle); SCAN.idle = setTimeout(scanStop, 30 * 60 * 1000); }
function scanStop(){
  clearTimeout(SCAN.idle);
  if (SCAN.server) { try { SCAN.server.close(); SCAN.server.closeAllConnections && SCAN.server.closeAllConnections(); } catch {} }
  SCAN.server = null; SCAN.token = ''; SCAN.url = '';
  scanSend('scan-event', { type: 'stopped' });
}
function scanStart(){
  if (SCAN.server) { scanTouch(); return Promise.resolve(); }
  const http = require('http'), crypto = require('crypto');
  SCAN.token = crypto.randomBytes(12).toString('hex');
  const page = fs.readFileSync(path.join(__dirname, 'scan.html'));
  const batches = new Map();
  const server = http.createServer((req, res) => {
    const base = '/s/' + SCAN.token;
    const u = (req.url || '').split('?')[0];
    const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(body); };
    if (!SCAN.token || (u !== base && !u.startsWith(base + '/'))) return send(404, 'Introuvable', 'text/plain; charset=utf-8');
    scanTouch();
    if (req.method === 'GET' && (u === base || u === base + '/')) return send(200, page, 'text/html; charset=utf-8');
    if (req.method === 'POST' && u === base + '/hello') {
      SCAN.phones++; scanSend('scan-event', { type: 'phone' });
      return send(200, JSON.stringify({ name: os.hostname() }));
    }
    if (req.method === 'POST' && u === base + '/page') {
      const batch = String(req.headers['x-batch'] || '').slice(0, 40), idx = parseInt(req.headers['x-index']), total = parseInt(req.headers['x-total']);
      if (!batch || !(idx >= 0) || !(total > 0) || total > 300 || idx >= total) return send(400, '{"ok":false}');
      const chunks = []; let size = 0, tooBig = false;
      req.on('data', c => { size += c.length; if (size > 30 * 1024 * 1024) { tooBig = true; req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (tooBig) return;
        const buf = Buffer.concat(chunks);
        if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return send(415, '{"ok":false}');   // JPEG uniquement
        let b = batches.get(batch); if (!b) { b = { pages: [], total, at: Date.now() }; batches.set(batch, b); }
        b.pages[idx] = buf;
        const got = b.pages.filter(Boolean).length;
        scanSend('scan-event', { type: 'progress', got, total });
        if (got === total) { batches.delete(batch); scanSend('scan-pages', { pages: b.pages.map(x => new Uint8Array(x)) }); }
        send(200, '{"ok":true}');
      });
      return;
    }
    send(404, 'Introuvable', 'text/plain; charset=utf-8');
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      SCAN.server = server; SCAN.port = server.address().port;
      SCAN.urls = lanAddresses().map(ip => `http://${ip}:${SCAN.port}/s/${SCAN.token}`);
      SCAN.url = SCAN.urls[0] || ''; scanTouch(); resolve();
    });
  });
}
ipcMain.handle('scan-start', async e => {
  if (!fromApp(e)) return null;
  try { await scanStart(); } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  if (!SCAN.url) { scanStop(); return { ok: false, error: 'Aucun réseau Wi-Fi ou local trouvé sur cet ordinateur.' }; }
  let qr = '';
  try { qr = await require('qrcode').toDataURL(SCAN.url, { margin: 1, width: 520, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } }); } catch {}
  return { ok: true, url: SCAN.url, urls: SCAN.urls, qr };
});
ipcMain.handle('scan-stop', e => { if (fromApp(e)) scanStop(); return true; });
app.on('before-quit', () => { if (SCAN.server) scanStop(); });

/* ---------- Mises à jour (GitHub : Fefe-Kurylen/Pyramid) ----------

   Version installée (Setup) : téléchargement en arrière-plan, puis bouton « Mettre à jour » (redémarre et installe).
   Version portable et Mac : la nouvelle version est signalée, le bouton ouvre la page de téléchargement.
   Version Microsoft Store : rien ici, c'est le Store qui met à jour. */
const RELEASES = 'https://github.com/Fefe-Kurylen/Pyramid/releases/latest';
const UPD = { mode: 'off', status: 'idle', version: null, progress: 0, url: RELEASES, at: 0 };
let updater = null;
const sendUpd = () => { try { if (win && ready) win.webContents.send('update', { ...UPD }); } catch {} };
const setUpd = o => {
  Object.assign(UPD, o); sendUpd();
  // Essai automatique de la chaîne de mise à jour (workflow GitHub) : état écrit dans un fichier, installation sans clic
  if (process.env.PYR_UPDATE_LOG) { try { fs.writeFileSync(process.env.PYR_UPDATE_LOG, JSON.stringify(UPD)); } catch {} }
  if (process.env.PYR_UPDATE_AUTOINSTALL && UPD.status === 'ready' && updater) setTimeout(() => updater.quitAndInstall(true, true), 1500);
};
const newer = (a, b) => { const x = String(a).split('.').map(n => parseInt(n) || 0), y = String(b).split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function initUpdater(){
  if (!app.isPackaged && !process.env.PYR_UPDATE_TEST) return;
  if (process.windowsStore) return;                                   // Microsoft Store
  if (process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR) {
    try { updater = require('electron-updater').autoUpdater; } catch { updater = null; }
  }
  UPD.mode = updater ? 'auto' : 'manual';
  if (updater) {
    updater.autoDownload = true; updater.autoInstallOnAppQuit = true; updater.allowPrerelease = false; updater.logger = null;
    updater.on('checking-for-update', () => { if (UPD.status !== 'ready' && UPD.status !== 'downloading') setUpd({ status: 'checking' }); });
    updater.on('update-not-available', () => setUpd({ status: 'latest' }));
    updater.on('update-available', i => setUpd({ status: 'downloading', version: i && i.version, progress: 0 }));
    updater.on('download-progress', p => setUpd({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', i => setUpd({ status: 'ready', version: i && i.version, progress: 100 }));
    updater.on('error', () => { if (UPD.status !== 'ready') setUpd({ status: 'error' }); });
  }
  setTimeout(checkUpdate, 8000);
  setInterval(checkUpdate, 30 * 60 * 1000);
}
async function checkUpdate(){
  if (UPD.mode === 'off' || UPD.status === 'ready' || UPD.status === 'downloading') return { ...UPD };
  UPD.at = Date.now();
  if (updater) { try { await updater.checkForUpdates(); } catch { setUpd({ status: 'error' }); } return { ...UPD }; }
  // Portable / Mac : dernière publication GitHub
  try {
    setUpd({ status: 'checking' });
    const r = await net.fetch('https://api.github.com/repos/Fefe-Kurylen/Pyramid/releases/latest', { headers: { 'User-Agent': 'Pyramid-PDF', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); const v = String(j.tag_name || '').replace(/^v/, '');
    if (v && newer(v, app.getVersion())) setUpd({ status: 'available', version: v, url: j.html_url || RELEASES });
    else setUpd({ status: 'latest' });
  } catch { setUpd({ status: 'error' }); }
  return { ...UPD };
}
ipcMain.handle('update-state', e => fromApp(e) ? { ...UPD, current: app.getVersion() } : null);
ipcMain.handle('update-check', async e => fromApp(e) ? { ...(await checkUpdate()), current: app.getVersion() } : null);
ipcMain.handle('update-install', e => {
  if (!fromApp(e)) return false;
  if (UPD.status === 'ready' && updater) { setImmediate(() => updater.quitAndInstall(false, true)); return true; }
  if (UPD.status === 'available') { shell.openExternal(UPD.url || RELEASES); return true; }
  return false;
});
// Retour sur la fenêtre : nouvelle recherche si la dernière date d'au moins 10 minutes
app.on('browser-window-focus', () => { if (UPD.mode !== 'off' && Date.now() - UPD.at > 10 * 60 * 1000) checkUpdate(); });
ipcMain.on('ready', e => {
  if (!fromApp(e)) return; ready = true; const f = pending.splice(0); sendFiles(f); sendUpd(); });

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
  app.whenReady().then(() => { createWindow(); sendFiles(fileArgs(process.argv)); initUpdater(); });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win) createWindow(); });
}
