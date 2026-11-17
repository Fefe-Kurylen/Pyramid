// Bouton « Mise à jour » : états envoyés par le processus principal (téléchargement, prête, disponible)
const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const path = require('path');
const W = path.join(__dirname, '..', 'windows');
(async () => {
  const app = await electron.launch({ executablePath: require(path.join(W, 'node_modules', 'electron')), args: ['--no-sandbox', W], cwd: W, env: { ...process.env, PYR_UPDATE_TEST: '1' } });
  const win = await app.firstWindow(); await win.waitForSelector('#updBtn', { state: 'attached' }); await win.waitForTimeout(800);
  const errs = []; win.on('pageerror', e => errs.push(e.message));
  const send = o => app.evaluate(({ BrowserWindow }, o) => BrowserWindow.getAllWindows()[0].webContents.send('update', o), o);
  const vis = () => win.evaluate(() => { const b = document.querySelector('#updBtn'); return { on: b.classList.contains('on'), text: b.textContent.trim(), w: b.getBoundingClientRect().width }; });
  console.log('début', JSON.stringify(await vis()));
  await send({ mode: 'auto', status: 'downloading', version: '1.4.1', progress: 42 }); await win.waitForTimeout(200);
  console.log('téléchargement', JSON.stringify(await vis()));
  await win.screenshot({ path: '/tmp/t/upd-dl.png', clip: { x: 0, y: 0, width: 1400, height: 70 } });
  await send({ mode: 'auto', status: 'ready', version: '1.4.1', progress: 100 }); await win.waitForTimeout(300);
  console.log('prête', JSON.stringify(await vis()), await win.textContent('#toast'));
  await win.screenshot({ path: '/tmp/t/upd-ready.png', clip: { x: 0, y: 0, width: 1400, height: 70 } });
  await win.click('#setBtn'); await win.waitForTimeout(400);
  console.log('réglages', await win.textContent('[data-upd]'), '|', await win.textContent('[data-uver]'), '|', await win.textContent('[data-unote]'));
  await win.screenshot({ path: '/tmp/t/upd-settings.png' });
  await win.keyboard.press('Escape'); await win.waitForTimeout(200);
  await send({ mode: 'manual', status: 'available', version: '1.4.1', url: 'https://github.com/Fefe-Kurylen/Pyramid/releases/latest' }); await win.waitForTimeout(200);
  console.log('disponible', JSON.stringify(await vis()));
  await send({ mode: 'auto', status: 'latest' }); await win.waitForTimeout(200);
  console.log('à jour', JSON.stringify(await vis()));
  console.log('état main', JSON.stringify(await win.evaluate(() => window.native.updateState())));
  console.log('erreurs', JSON.stringify(errs));
  app.process().kill('SIGKILL');
})();
