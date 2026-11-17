const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp', '/tmp/t/docs/multi.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); const errs = []; win.on('pageerror', e => errs.push(String(e)));
  await win.waitForTimeout(2500);
  await win.evaluate(() => document.querySelector('#reader').scrollTop = 2000); await win.waitForTimeout(500);
  const cur0 = await win.evaluate(() => window.__pyr.S.cur);
  await win.screenshot({ path: '/tmp/t/rbar-sign.png', clip: { x: 250, y: 55, width: 1000, height: 70 } });
  await win.click('#rSign'); await win.waitForTimeout(1200);
  const st = await win.evaluate(() => ({ reading2: document.documentElement.classList.contains('reading'), modal: !!document.querySelector('#sigPad'), cur: window.__pyr.S.cur }));
  console.log('cur before', cur0, JSON.stringify(st));
  // dessiner et insérer
  const r = await win.evaluate(() => { const b = document.querySelector('#sigPad').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; });
  await win.mouse.move(r[0] + 30, r[1] + r[3]/2); await win.mouse.down(); await win.mouse.move(r[0] + 150, r[1] + 30, { steps: 6 }); await win.mouse.move(r[0] + 260, r[1] + r[3] - 20, { steps: 6 }); await win.mouse.up();
  await win.click('[data-ok]'); await win.waitForTimeout(600);
  console.log('placing', await win.evaluate(() => [document.documentElement.classList.contains('placing'), document.documentElement.classList.contains('reading')]));
  const pg = await win.evaluate(() => { const el = document.querySelectorAll('.rpage')[1].getBoundingClientRect(); return [el.left + el.width*0.7, Math.max(el.top + 80, 200)]; });
  await win.mouse.move(pg[0] - 20, pg[1]); await win.mouse.move(pg[0], pg[1], { steps: 3 }); await win.waitForTimeout(300);
  await win.screenshot({ path: '/tmp/t/sign-ghost.png' });
  await win.mouse.click(pg[0], pg[1]); await win.waitForTimeout(1200);
  await win.screenshot({ path: '/tmp/t/sign-placed.png' });
  console.log('after', await win.evaluate(() => [document.documentElement.classList.contains('placing'), document.documentElement.classList.contains('reading'), document.querySelector('#signBtn') ? 'signBtn still' : 'no signBtn in tools']));
  console.log(await win.evaluate(() => { const S = window.__pyr.S; return JSON.stringify({ sel: S.sel && S.sel.t, annots: Object.values(S.annots || {}).flat().length }); }), errs.join('|'));
  app.process().kill('SIGKILL');
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
