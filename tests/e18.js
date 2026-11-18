// Pages scannées : OCR (reconnaissance du texte) en mode Modifier, puis modification d'une ligne
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const W = path.join(__dirname, '..', 'windows');
const PDF = process.argv[2] || '/tmp/sc/scan.pdf';
const EXE = process.argv[3];   // appli empaquetée (facultatif)
(async () => {
  const app = await electron.launch(EXE ? { executablePath: EXE, args: ['--no-sandbox'], env: { ...process.env, PYR_DEBUG: '1' } } : { executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W, env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); await win.waitForSelector('#fOpen', { state: 'attached' }); await win.waitForTimeout(800);
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  await win.setInputFiles('#fOpen', PDF); await win.waitForTimeout(2500);
  const t0 = Date.now();
  await win.click('#editBtn');
  await win.waitForFunction(() => /ligne|Aucun|impossible/.test(document.querySelector('#toast').textContent) && document.querySelector('#busy').classList.contains('hidden'), null, { timeout: 120000 });
  console.log('OCR', ((Date.now() - t0) / 1000).toFixed(1) + ' s', '|', await win.textContent('#toast'));
  await win.waitForTimeout(800);
  await win.screenshot({ path: '/tmp/sc/ocr-lignes.png' });
  // clic sur la ligne « Ligne 3 » puis modification du montant
  const L = await win.evaluate(() => { const p = window.__pyr.cur(); return window.__pyr.S.lines.map(l => ({ s: l.str, x: l.x, y: l.y, fs: l.fs, w: l.w })); });
  console.log('exemples', JSON.stringify(L.slice(0, 5).map(l => l.s)));
  const t = L.find(l => /Ligne 3/.test(l.s)) || L[2];
  const r = await win.evaluate(() => { const b = document.querySelector('#pc').getBoundingClientRect(); return { x: b.left, y: b.top, k: window.__pyr.S.scale }; });
  await win.mouse.click(r.x + (t.x + t.w * 0.3) * r.k, r.y + (t.y - t.fs * 0.3) * r.k);
  await win.waitForTimeout(2500);
  const ed = await win.evaluate(() => { const a = window.__pyr.S.editing; return a ? { txt: a.txt, font: a.eqName, fs: Math.round(a.fs * 10) / 10, c: a.c, bg: a.bg } : null; });
  console.log('édition', JSON.stringify(ed));
  if (ed){ await win.keyboard.press('End'); await win.keyboard.type(' (modifié)'); await win.keyboard.press('Escape'); await win.waitForTimeout(600); }
  await win.screenshot({ path: '/tmp/sc/ocr-edit.png' });
  console.log('erreurs', JSON.stringify(errs));
  app.process().kill('SIGKILL');
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
