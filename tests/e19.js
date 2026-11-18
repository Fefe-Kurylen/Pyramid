// Numériser depuis une imprimante : bouton à côté d'Imprimer, imprimante réseau trouvée en mDNS (faux scanner eSCL),
// vitre (2 passages) + chargeur (3 feuilles), ajout par adresse IP, PDF ouvert dans un nouvel onglet
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const fakeEscl = require('./fake-escl');
const W = path.join(__dirname, '..', 'windows');
const PDF = process.argv[2] || path.join(__dirname, 'docs', 'multi.pdf');
const OUT = process.env.OUT || '/tmp/sc';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const A = await fakeEscl({ name: 'HP OfficeJet Test' });
  const B = await fakeEscl({ name: 'Canon Bureau', mdns: false });
  const app = await electron.launch({ executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W,
    env: { ...process.env, APPDATA: '/tmp/sc-appdata', XDG_CONFIG_HOME: '/tmp/sc-appdata' } });
  const win = await app.firstWindow(); await win.waitForSelector('#rPrint', { state: 'attached' });
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  await win.setInputFiles('#fOpen', PDF); await win.waitForTimeout(2000);
  const pos = await win.evaluate(() => { const a = document.querySelector('#rPrint'), b = document.querySelector('#rScan'); return { next: a.nextElementSibling === b, visible: b.offsetWidth > 0, title: b.title }; });
  console.log('bouton à côté d’Imprimer', JSON.stringify(pos));
  await win.click('#rScan');
  await win.waitForFunction(() => { const s = document.querySelector('.dscard [data-dev]'); return s && [...s.options].some(o => /HP OfficeJet Test/.test(o.textContent)); }, null, { timeout: 15000 });
  const opts = await win.$$eval('.dscard [data-dev] option', o => o.map(x => x.textContent));
  console.log('imprimantes trouvées', JSON.stringify(opts));
  await win.selectOption('.dscard [data-dev]', { label: opts.find(o => /HP OfficeJet Test/.test(o)) });
  await win.waitForTimeout(600);
  const shown = await win.$$eval('.dscard [data-dk="source"] button', b => b.filter(x => x.style.display !== 'none').map(x => x.textContent));
  console.log('sources proposées', JSON.stringify(shown));
  await win.click('.dscard [data-dk="dpi"] [data-v="300"]');
  await win.click('.dscard [data-dk="source"] [data-v="platen"]');
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 1, null, { timeout: 20000 });
  console.log('vitre 1 :', await win.textContent('.dscard [data-st] span'));
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 2, null, { timeout: 20000 });
  await win.click('.dscard [data-dk="source"] [data-v="adf"]');
  await win.click('.dscard [data-dk="color"] [data-v="gray"]');
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 5, null, { timeout: 20000 });
  console.log('chargeur :', await win.textContent('.dscard [data-st] span'), '| bouton :', await win.textContent('.dscard [data-ok]'));
  const s = A.log.settings;
  console.log('réglages envoyés', JSON.stringify(s.map(x => ({ src: (x.match(/<scan:InputSource>(\w+)/) || [])[1], color: (x.match(/<scan:ColorMode>(\w+)/) || [])[1], dpi: (x.match(/<scan:XResolution>(\d+)/) || [])[1], fmt: (x.match(/<pwg:DocumentFormat>([^<]+)/) || [])[1] }))));
  // retirer une page
  await win.click('.dspg:nth-child(2) button');
  console.log('pages après retrait', await win.locator('.dspg').count());
  // ajout par adresse IP
  await win.fill('.dscard [data-ip]', '127.0.0.1:' + B.port);
  await win.click('.dscard [data-add]');
  await win.waitForFunction(() => /Canon Bureau/.test(document.querySelector('.dscard [data-dev]').selectedOptions[0].textContent), null, { timeout: 15000 });
  await win.click('.dscard [data-dk="source"] [data-v="platen"]');
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 5, null, { timeout: 20000 });
  console.log('Canon ajouté par IP + 1 page :', await win.textContent('.dscard [data-st] span'));
  await win.screenshot({ path: OUT + '/devscan-modal.png' });
  const tabs0 = await win.locator('#tabs .tab').count();
  await win.click('.dscard [data-ok]');
  await win.waitForFunction(n => document.querySelectorAll('#tabs .tab').length > n, tabs0, { timeout: 20000 });
  await win.waitForTimeout(1500);
  console.log('onglet', (await win.locator('#tabs .tab').last().textContent()).trim(), '| pages', await win.locator('#thumbs .thumb, #side .th').count());
  await win.screenshot({ path: OUT + '/devscan-pdf.png' });
  // mémorisation de l'adresse IP
  const saved = require('fs').readFileSync('/tmp/sc-appdata/Pyramid/scanners.json', 'utf8');
  console.log('adresse mémorisée', saved);
  console.log('erreurs', JSON.stringify(errs));
  A.close(); B.close();
  app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
