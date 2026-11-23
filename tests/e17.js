// Scanner avec le téléphone : QR code sur l'ordinateur, page du téléphone (photo → redressement → envoi), PDF ouvert dans un onglet
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const W = path.join(__dirname, '..', 'windows');
const PHOTO = process.argv[2] || '/tmp/sc/photo.jpg';
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W });
  const win = await app.firstWindow(); await win.waitForSelector('#scanBtn', { state: 'attached' }); await win.waitForTimeout(800);
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  console.log('bouton visible', await win.isVisible('#scanBtn'), '| à droite', await win.evaluate(() => document.querySelector('#scanBtn').getBoundingClientRect().left > innerWidth / 2));
  await win.click('#scanBtn'); await win.waitForSelector('.scanqr img');
  const url = (await win.textContent('.scanurl')).trim();
  console.log('adresse', url.replace(/[0-9a-f]{24}$/, '<code>'));
  await win.screenshot({ path: '/tmp/sc/pc-qr.png' });
  const bad = await (await fetch(url.replace(/[0-9a-f]{24}$/, '0'.repeat(24)))).status;
  console.log('mauvais code refusé', bad === 404);
  const { execFileSync } = require('child_process');
  for (const eng of ['chromium', 'webkit']) {
    const tabs0 = await win.locator('#tabs .tab').count();
    const res = JSON.parse(execFileSync('python3', [path.join(__dirname, 'e17_phone.py'), url, eng, PHOTO], { encoding: 'utf8', timeout: 120000 }).trim().split('\n').pop());
    await win.waitForFunction(n => document.querySelectorAll('#tabs .tab').length > n, tabs0, { timeout: 20000 });
    await win.waitForTimeout(1500);
    console.log(eng === 'webkit' ? 'iPhone' : 'Android', JSON.stringify(res), '| ordinateur :', (await win.textContent('.scanst span')).trim(), '| onglets', await win.locator('#tabs .tab').count(), '| nom', (await win.locator('#tabs .tab').last().textContent()).trim());
  }
  await win.keyboard.press('Escape');
  await win.screenshot({ path: '/tmp/sc/pc-scan.png' });
  console.log('erreurs', JSON.stringify(errs));
  app.process().kill('SIGKILL');
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
