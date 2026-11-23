// Numériser sans avoir ouvert de PDF (bouton de l'accueil et de la barre du haut) + aperçu des pages numérisées
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const fakeEscl = require('./fake-escl');
const W = path.join(__dirname, '..', 'windows');
const OUT = process.env.OUT || '/tmp/sc21';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const A = await fakeEscl({ name: 'HP OfficeJet Test' });
  const app = await electron.launch({ executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W,
    env: { ...process.env, APPDATA: '/tmp/sc21-appdata', XDG_CONFIG_HOME: '/tmp/sc21-appdata' } });
  const win = await app.firstWindow(); await win.waitForSelector('#dscanBtn', { state: 'attached' });
  await win.setViewportSize({ width: 1280, height: 860 }).catch(() => {});
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  await win.waitForTimeout(800);
  const home = await win.evaluate(() => ({ accueil: !document.querySelector('#empty').classList.contains('hidden'),
    haut: document.querySelector('#dscanBtn').offsetWidth > 0, centre: document.querySelectorAll('#empty .drop button').length,
    aDroite: document.querySelector('#dscanBtn').getBoundingClientRect().left > innerWidth / 2 }));
  console.log('accueil sans PDF', JSON.stringify(home));
  await win.screenshot({ path: OUT + '/accueil.png' });
  await win.click('#dscanBtn');
  await win.waitForFunction(() => { const s = document.querySelector('.dscard [data-dev]'); return s && [...s.options].some(o => /HP OfficeJet Test/.test(o.textContent)); }, null, { timeout: 15000 });
  await win.selectOption('.dscard [data-dev]', { label: (await win.$$eval('.dscard [data-dev] option', o => o.map(x => x.textContent))).find(o => /HP OfficeJet/.test(o)) });
  await win.waitForTimeout(500);
  console.log('aperçu caché avant numérisation', await win.evaluate(() => document.querySelector('.dscard [data-prev]').classList.contains('hidden')));
  await win.click('.dscard [data-dk="source"] [data-v="platen"]');
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 1, null, { timeout: 20000 });
  await win.waitForFunction(() => { const i = document.querySelector('.dscard [data-big] img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const p1 = await win.evaluate(() => { const i = document.querySelector('.dscard [data-big] img'), r = i.getBoundingClientRect(); return { cap: document.querySelector('.dscard [data-cap]').textContent, w: Math.round(r.width), h: Math.round(r.height) }; });
  console.log('aperçu après 1 page', JSON.stringify(p1));
  await win.click('.dscard [data-dk="source"] [data-v="adf"]');
  await win.click('.dscard [data-scan]');
  await win.waitForFunction(() => document.querySelectorAll('.dspg').length === 4, null, { timeout: 20000 });
  await win.waitForTimeout(500);
  console.log('après le chargeur', await win.textContent('.dscard [data-cap]'), '| vignette active', await win.evaluate(() => [...document.querySelectorAll('.dspg')].findIndex(e => e.classList.contains('on')) + 1));
  await win.screenshot({ path: OUT + '/apercu.png' });
  await win.click('.dscard [data-pv="1"]'); await win.waitForTimeout(200);
  console.log('flèche suivante', await win.textContent('.dscard [data-cap]'));
  await win.click('.dspg:nth-child(1)'); await win.waitForTimeout(300);
  console.log('clic vignette 1', await win.textContent('.dscard [data-cap]'), '| précédente désactivée', await win.$eval('.dscard [data-pv="-1"]', b => b.disabled));
  await win.click('.dscard [data-big]');
  await win.waitForSelector('.dslight img', { timeout: 5000 });
  await win.waitForTimeout(300);
  await win.screenshot({ path: OUT + '/grand.png' });
  await win.keyboard.press('ArrowRight'); await win.waitForTimeout(200);
  await win.keyboard.press('Escape'); await win.waitForTimeout(200);
  console.log('grand aperçu fermé', await win.locator('.dslight').count() === 0, '| fenêtre toujours ouverte', await win.locator('.dscard').count() === 1);
  await win.click('.dscard [data-del]'); await win.waitForTimeout(200);
  console.log('retirer depuis l’aperçu → pages', await win.locator('.dspg').count(), '|', await win.textContent('.dscard [data-cap]'));
  await win.click('.dscard [data-ok]');
  await win.waitForFunction(() => document.querySelectorAll('#tabs .tab').length >= 1 && !document.querySelector('#editor').classList.contains('hidden'), null, { timeout: 20000 });
  await win.waitForTimeout(1500);
  console.log('PDF ouvert', (await win.locator('#tabs .tab').last().textContent()).trim());
  console.log('erreurs', JSON.stringify(errs));
  A.close(); app.process().kill('SIGKILL'); process.exit(0);
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
