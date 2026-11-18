// Barre d'outils Pro élargissable + petite fenêtre d'avancement (impression, numérisation) qui survit à la fermeture des fenêtres
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const fakeEscl = require('./fake-escl');
const W = path.join(__dirname, '..', 'windows');
const PDF = path.join(__dirname, 'docs', 'multi.pdf');
const OUT = process.env.OUT || '/tmp/sc';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const A = await fakeEscl({ name: 'HP Lent', mdns: false, delay: 2500 });
  const app = await electron.launch({ executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W,
    env: { ...process.env, APPDATA: '/tmp/e20-appdata', XDG_CONFIG_HOME: '/tmp/e20-appdata' } });
  const win = await app.firstWindow(); await win.waitForSelector('#rPrint', { state: 'attached' });
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  await app.evaluate(({ BrowserWindow }) => {
    const proto = Object.getPrototypeOf(BrowserWindow.getAllWindows()[0].webContents);
    proto.print = function (opts, cb) { setTimeout(() => cb(true, ''), 2500); };
  });
  await win.evaluate(() => { const s = JSON.parse(localStorage.getItem('pyramid-settings') || '{}'); s.layout = 'pro'; localStorage.setItem('pyramid-settings', JSON.stringify(s)); localStorage.removeItem('pyramid-railc'); });
  await win.reload(); await win.waitForSelector('#rPrint', { state: 'attached' });
  await win.setInputFiles('#fOpen', PDF); await win.waitForTimeout(2000);
  await win.click('#editBtn'); await win.waitForTimeout(1500);
  const before = await win.evaluate(() => { const r = document.querySelector('#rail'); return { w: r.offsetWidth, scroll: r.scrollHeight > r.clientHeight }; });
  const g = await win.locator('#railGrip').boundingBox();
  await win.mouse.move(g.x + 3, g.y + 200); await win.mouse.down(); await win.mouse.move(g.x + 60, g.y + 200, { steps: 5 }); await win.mouse.up();
  const after = await win.evaluate(() => { const r = document.querySelector('#rail'); const t = document.querySelector('#rail #tools'); return { w: r.offsetWidth, cols: getComputedStyle(t).gridTemplateColumns.split(' ').length, saved: localStorage.getItem('pyramid-railc'), h: t.offsetHeight }; });
  console.log('barre avant', JSON.stringify(before), '→ après', JSON.stringify(after));
  await win.screenshot({ path: OUT + '/rail-2col.png' });
  await win.click('#doneBtn'); await win.waitForTimeout(800);
  // impression : petite fenêtre d'avancement
  await win.click('#rPrint'); await win.waitForTimeout(1200);
  await win.click('.card [data-ok]');
  await win.waitForSelector('#jobs.on .job.run', { timeout: 5000 });
  const pr1 = await win.textContent('#jobs');
  await win.waitForSelector('#jobs .job.ok', { timeout: 20000 });
  console.log('impression :', pr1.replace(/\s+/g, ' ').trim(), '→', (await win.textContent('#jobs')).replace(/\s+/g, ' ').trim());
  await win.screenshot({ path: OUT + '/job-print.png' });
  // numérisation lente : on ferme la fenêtre en cliquant à côté pendant la numérisation
  await win.click('#rScan');
  await win.fill('.dscard [data-ip]', '127.0.0.1:' + A.port); await win.click('.dscard [data-add]');
  await win.waitForFunction(() => /HP Lent/.test(document.querySelector('.dscard [data-dev]').selectedOptions[0]?.textContent || ''), null, { timeout: 15000 });
  await win.click('.dscard [data-dk="source"] [data-v="adf"]');
  await win.click('.dscard [data-scan]'); await win.waitForTimeout(1200);
  await win.mouse.click(5, 300);   // clic à côté de la fenêtre
  await win.waitForTimeout(400);
  const closed = await win.evaluate(() => !document.querySelector('.dscard'));
  const j1 = (await win.textContent('#jobs')).replace(/\s+/g, ' ').trim();
  console.log('fenêtre fermée par erreur :', closed, '| avancement :', j1);
  await win.waitForTimeout(3000);
  await win.click('#jobs .job:has-text("Numérisation")');   // rouvrir depuis la petite fenêtre
  await win.waitForSelector('.dscard');
  const reopen = await win.evaluate(() => ({ busy: document.querySelector('.dscard [data-scan] span').textContent, st: document.querySelector('.dscard [data-st] span').textContent, pages: document.querySelectorAll('.dspg').length }));
  console.log('rouverte pendant le travail :', JSON.stringify(reopen));
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 3, null, { timeout: 30000 });
  console.log('fin :', await win.textContent('.dscard [data-st] span'), '| bouton', await win.textContent('.dscard [data-ok]'));
  await win.mouse.click(5, 300); await win.waitForTimeout(300);
  console.log('après fermeture :', (await win.textContent('#jobs')).replace(/\s+/g, ' ').trim());
  await win.screenshot({ path: OUT + '/job-scan.png' });
  await win.click('#jobs .job.wait'); await win.waitForSelector('.dscard');
  console.log('pages gardées :', await win.locator('.dspg').count());
  console.log('erreurs', JSON.stringify(errs));
  A.close(); app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
