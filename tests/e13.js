const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs'); const L = '/tmp/t/e13.log'; fs.writeFileSync(L, ''); const log = (...a) => fs.appendFileSync(L, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp', '/tmp/t/docs/images.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); const errs = []; win.on('pageerror', e => errs.push(String(e)));
  await win.waitForTimeout(1200);
  await win.evaluate(() => { const s = JSON.parse(localStorage.getItem('pyramid-settings') || '{}'); s.layout = 'classique'; s.thumbs = 'left'; localStorage.setItem('pyramid-settings', JSON.stringify(s)); });
  await win.reload(); await win.waitForTimeout(600); await win.setInputFiles('#fOpen', '/tmp/t/docs/images.pdf'); await win.waitForTimeout(1800);
  await win.click('#editBtn'); await win.waitForTimeout(1800);
  const E = (f, a) => win.evaluate(f, a);
  log('imgs', await E(() => window.__pyr.S.imgs));
  const scr = o => E(o => { const S = window.__pyr.S, r = document.querySelector('#ov').getBoundingClientRect(); return [r.left + o.x*S.scale, r.top + o.y*S.scale]; }, o);
  await win.screenshot({ path: '/tmp/t/img-detect.png' });
  const imgs = await E(() => window.__pyr.S.imgs);
  const sq = imgs.find(o => Math.abs(o.w - 120) < 2);
  // hover
  const c0 = await scr({ x: sq.x + sq.w/2, y: sq.y + sq.h/2 });
  await win.mouse.move(c0[0], c0[1]); await win.waitForTimeout(300);
  log('hover', await E(() => !!window.__pyr.S.ihover));
  // drag the square to the left so its left edge aligns with text at 72pt
  await win.mouse.down();
  const target = await scr({ x: 72 + 3 + sq.w/2, y: sq.y + sq.h/2 });
  for (let i = 1; i <= 12; i++) await win.mouse.move(c0[0] + (target[0]-c0[0])*i/12, c0[1], { steps: 1 }) , await win.waitForTimeout(60);
  await win.waitForTimeout(300);
  log('guides mid-drag', await E(() => window.__pyr.S.guides));
  await win.screenshot({ path: '/tmp/t/img-guides.png' });
  await win.mouse.up(); await win.waitForTimeout(500);
  log('after move', await E(() => { const S = window.__pyr.S; const A = S.annots[window.__pyr.cur().id] || []; return A.map(a => ({ t:a.t, x:Math.round(a.x*10)/10, y:Math.round(a.y*10)/10, w:Math.round(a.w), c:a.c, oimg:a.oimg })); }), 'sel', await E(() => window.__pyr.S.sel && window.__pyr.S.sel.t));
  await win.screenshot({ path: '/tmp/t/img-moved.png' });
  // delete the logo: click it then press Delete
  const lg = imgs.find(o => Math.abs(o.w - 150) < 2);
  const c1 = await scr({ x: lg.x + lg.w/2, y: lg.y + lg.h/2 });
  await win.mouse.click(c1[0], c1[1]); await win.waitForTimeout(900);
  log('logo selected', await E(() => window.__pyr.S.sel && window.__pyr.S.sel.t));
  await win.keyboard.press('Delete'); await win.waitForTimeout(500);
  log('after delete', await E(() => (window.__pyr.S.annots[window.__pyr.cur().id] || []).map(a => a.t + (a.oimg ? '*' : ''))));
  await win.screenshot({ path: '/tmp/t/img-deleted.png' });
  // undo
  await win.keyboard.press('Control+z'); await win.waitForTimeout(400);
  log('after undo', await E(() => (window.__pyr.S.annots[window.__pyr.cur().id] || []).map(a => a.t + (a.oimg ? '*' : ''))));
  log('errors', errs);
  app.process().kill('SIGKILL');
})().catch(e => { log('FAIL', String(e)); process.exit(1); });
