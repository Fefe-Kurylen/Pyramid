const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs'); const L = '/tmp/t/e10.log'; fs.writeFileSync(L, ''); const log = (...a) => fs.appendFileSync(L, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1.25', '/home/claude/pdfapp', '/tmp/t/docs/multi.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); const logs = []; win.on('console', m => logs.push(m.type() + ' ' + m.text().slice(0, 200))); win.on('pageerror', e => logs.push('PE ' + e));
  await win.waitForTimeout(1200);
  await win.evaluate(() => { localStorage.removeItem('pyramid-sidew'); const s = JSON.parse(localStorage.getItem('pyramid-settings') || '{}'); s.layout = 'pro'; localStorage.setItem('pyramid-settings', JSON.stringify(s)); });
  await win.reload(); await win.waitForTimeout(600); await win.setInputFiles('#fOpen', '/tmp/t/docs/multi.pdf'); await win.waitForTimeout(2000);
  const E = (f, a) => win.evaluate(f, a);
  log('dpr', await E(() => devicePixelRatio));
  log('rail read', await E(() => ({ kids: [...document.querySelector('#rail').children].map(c => c.id), w: document.querySelector('#rail').offsetWidth, vis: getComputedStyle(document.querySelector('#rail')).display })));
  await win.screenshot({ path: '/tmp/t/pro-read.png' });
  await win.click('#editBtn'); await win.waitForTimeout(1200);
  log('rail edit', await E(() => { const r = document.querySelector('#rail'); return { sh: r.scrollHeight, h: r.clientHeight }; }));
  await win.screenshot({ path: '/tmp/t/pro-edit.png' });
  // edit still works in pro
  await win.click('#doneBtn'); await win.waitForTimeout(600);
  // grip drag
  const g = await E(() => { const r = document.querySelector('#sideGrip').getBoundingClientRect(); return [r.left + r.width/2, r.top + 200]; });
  const w0 = await E(() => document.querySelector('#side').offsetWidth);
  await win.mouse.move(g[0], g[1]); await win.mouse.down(); await win.mouse.move(g[0] + 120, g[1], { steps: 8 }); await win.mouse.up(); await win.waitForTimeout(1500);
  log('side width', w0, '->', await E(() => [document.querySelector('#side').offsetWidth, document.querySelector('.thumb canvas').width, localStorage.getItem('pyramid-sidew')]));
  await win.screenshot({ path: '/tmp/t/pro-wide.png' });
  // classic again → elements back
  await E(() => { const s = JSON.parse(localStorage.getItem('pyramid-settings')); s.layout = 'classique'; localStorage.setItem('pyramid-settings', JSON.stringify(s)); });
  await win.reload(); await win.waitForTimeout(600); await win.setInputFiles('#fOpen', '/tmp/t/docs/multi.pdf'); await win.waitForTimeout(1800);
  log('classic', await E(() => ({ rbarParent: document.querySelector('#rbar').parentNode.id, rail: getComputedStyle(document.querySelector('#rail')).display, side: document.querySelector('#side').offsetWidth })));
  // print preview sharpness
  await win.click('#rPrint'); await win.waitForTimeout(2000);
  log('pv canvas', await E(() => [...document.querySelectorAll('.prt .pimg canvas')].slice(0,2).map(c => [c.width, Math.round(c.getBoundingClientRect().width)])));
  await win.screenshot({ path: '/tmp/t/pv-sharp.png' });
  // dblclick reset
  await win.keyboard.press('Escape'); await E(() => document.querySelector('.modal')?.remove());
  await win.dblclick('#sideGrip'); await win.waitForTimeout(500);
  log('reset', await E(() => [document.querySelector('#side').offsetWidth, localStorage.getItem('pyramid-sidew')]));
  log(logs.filter(l => /^(error|PE)/.test(l)).slice(-8).join('\n'));
  app.process().kill('SIGKILL');
})().catch(e => { log('FAIL', String(e)); process.exit(1); });
