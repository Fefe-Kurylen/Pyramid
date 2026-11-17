const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp', '/tmp/t/docs/paie.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); const errs = []; win.on('pageerror', e => errs.push(String(e)));
  await win.waitForTimeout(2500); await win.click('#editBtn'); await win.waitForTimeout(1500);
  const xy = await win.evaluate(async () => { const P = window.__pyr; const L = (await P.getLines(P.cur())).find(l => l.str.includes('Prime de')); const s = P.S.scale, r = document.querySelector('#ov').getBoundingClientRect(); return [r.left + (L.x + 20)*s, r.top + (L.y - L.fs*0.3)*s, s]; });
  await win.mouse.move(xy[0], xy[1]); await win.mouse.down();
  for (let i = 1; i <= 10; i++){ await win.mouse.move(xy[0] + i*1.2*xy[2], xy[1] + i*3, { steps: 1 }); await win.waitForTimeout(80); }
  await win.waitForTimeout(800);
  console.log('guides', JSON.stringify(await win.evaluate(() => window.__pyr.S.guides)));
  await win.mouse.up(); await win.waitForTimeout(300);
  console.log('sel', await win.evaluate(() => { const a = window.__pyr.S.sel; return a && a.t + ' ox=' + (a.ox||0).toFixed(2) + ' oy=' + (a.oy||0).toFixed(2); }), errs.join('|'));
  app.process().kill('SIGKILL');
})();
