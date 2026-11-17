const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs'); const log = (...a) => fs.appendFileSync('/tmp/t/e6.log', a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp', '/tmp/t/docs/paie.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); const logs = [];
  win.on('console', m => logs.push(m.type() + ' ' + m.text().slice(0,200))); win.on('pageerror', e => logs.push('PE ' + e));
  await win.waitForTimeout(2500);
  const E = (f, a) => win.evaluate(f, a);
  const linePos = sub => E(async sub => { const P = window.__pyr; const L = (await P.getLines(P.cur())).find(l => l.str.includes(sub)); if (!L) return null; const s = P.S.scale, r = document.querySelector('#ov').getBoundingClientRect(); const u = Math.min(L.w/2, 25), v = -L.fs*0.3, co = Math.cos(L.ang), si = Math.sin(L.ang); return [r.left + (L.x + u*co - v*si)*s, r.top + (L.y + u*si + v*co)*s]; }, sub);
  const st = () => E(() => { const P = window.__pyr, S = P.S; return { ed: S.editing && (S.editing.orig||'').slice(0,15), tool: S.tool, key: S.linesFor, want: P.cur().id + '|' + ((P.cur().base + P.cur().rot) % 360), n: S.lines && S.lines.length, sel: S.sel && S.sel.t }; });
  async function tryEdit(label, sub){
    const xy = await linePos(sub); const t0 = Date.now(); await win.mouse.click(xy[0], xy[1]);
    let e = null; for (let i = 0; i < 40 && !e; i++){ await win.waitForTimeout(80); e = (await st()).ed; }
    log(label, e ? 'OK' : 'FAIL', Date.now() - t0, await st());
    await win.keyboard.press('Escape'); await win.waitForTimeout(250);
  }
  await win.click('#editBtn'); await win.waitForTimeout(1200);
  await tryEdit('ligne', 'Salaire de base');
  await tryEdit('lora', 'Mention légale');
  await win.click('#rotR'); await win.waitForTimeout(900); log('after rotR', await st());
  await tryEdit('rot', 'Prime de');
  await win.click('#rotL'); await win.waitForTimeout(900); log('after rotL', await st());
  await tryEdit('rotL', 'Coefficient');
  await win.click('#undo'); await win.waitForTimeout(900); log('after undo', await st());
  await tryEdit('undo', 'Rubrique');
  await win.click('#zIn'); await win.waitForTimeout(700); await tryEdit('zoom', 'Employeur');
  log(logs.slice(-6).join('\n'));
  app.process().kill('SIGKILL');
})().catch(e => { log('FAIL', String(e)); process.exit(1); });
