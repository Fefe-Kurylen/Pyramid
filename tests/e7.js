const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs'); const L = '/tmp/t/e7.log'; fs.writeFileSync(L, ''); const log = (...a) => fs.appendFileSync(L, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
(async () => {
  const t0 = Date.now();
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp', '/tmp/t/docs/multi.pdf'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); log('firstWindow ms', Date.now() - t0);
  const logs = []; win.on('console', m => logs.push(m.type() + ' ' + m.text().slice(0, 200))); win.on('pageerror', e => logs.push('PE ' + e));
  await app.evaluate(({ BrowserWindow }) => {
    const proto = Object.getPrototypeOf(BrowserWindow.getAllWindows()[0].webContents);
    proto.print = function(opts, cb){ global.__popts = opts; this.printToPDF({ landscape: opts.landscape, pageSize: opts.pageSize, printBackground: true, margins: { marginType: 'none' }, preferCSSPageSize: true }).then(b => { (global.__pdfs = global.__pdfs || []).push(Buffer.from(b).toString('base64')); cb(true, ''); }).catch(e => { global.__perr = String(e); cb(false, String(e)); }); };
  });
  await win.waitForTimeout(1500);
  await win.evaluate(() => localStorage.removeItem('pyramid-print'));
  await win.reload(); await win.waitForTimeout(500);
  await win.setInputFiles('#fOpen', '/tmp/t/docs/multi.pdf');
  await win.waitForTimeout(2000);
  const E = (f, a) => win.evaluate(f, a);
  log('visible', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()));
  log('accent', await E(() => getComputedStyle(document.documentElement).getPropertyValue('--accent')));
  log('header ib', await E(() => { const b = document.querySelector('#exportBtn').getBoundingClientRect(); const s = document.querySelector('#undo svg').getBoundingClientRect(); return [document.querySelector('header').offsetHeight, Math.round(b.height), Math.round(s.width)]; }));
  log('pdflib', await E(() => typeof PDFLib + ' ' + typeof forge));
  // ---- molette en lecture
  const rd = await E(() => { const r = document.querySelector('#reader').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; });
  await win.mouse.move(rd[0], rd[1]);
  const st0 = await E(() => [document.querySelector('#reader').scrollTop, document.querySelector('#rzLbl').textContent]);
  await win.mouse.wheel(0, 300); await win.waitForTimeout(400);
  const st1 = await E(() => [document.querySelector('#reader').scrollTop, document.querySelector('#rzLbl').textContent]);
  log('read wheel', st0, '->', st1);
  await win.keyboard.down('Control'); await win.mouse.wheel(0, -200); await win.keyboard.up('Control'); await win.waitForTimeout(400);
  log('read ctrl+wheel', await E(() => document.querySelector('#rzLbl').textContent));
  // ---- molette en modifier
  await win.click('#editBtn'); await win.waitForTimeout(1200);
  const z0 = await E(() => document.querySelector('#zLbl').textContent);
  const sg = await E(() => { const r = document.querySelector('#stage').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; });
  await win.mouse.move(sg[0], sg[1]); await win.mouse.wheel(0, -200); await win.waitForTimeout(400);
  log('edit wheel', z0, '->', await E(() => document.querySelector('#zLbl').textContent));
  await win.click('#doneBtn'); await win.waitForTimeout(800);
  // ---- impression
  await win.click('#rPrint'); await win.waitForTimeout(1500);
  const pinfo = () => E(() => ({ info: document.querySelector('[data-pinfo]')?.textContent, sheets: document.querySelectorAll('.prt .sheet').length, cells: document.querySelectorAll('.prt .cell').length, imgs: [...document.querySelectorAll('.prt .cell img')].filter(i => i.complete && i.naturalWidth).length, printers: [...document.querySelectorAll('[data-printer] option')].map(o => o.textContent) }));
  log('print dlg', await pinfo());
  await win.screenshot({ path: '/tmp/t/print1.png' });
  await win.click('.seg[data-pk=per] button[data-v="2"]'); await win.waitForTimeout(600); log('per2', await pinfo());
  await win.click('.seg[data-pk=per] button[data-v="4"]'); await win.waitForTimeout(600); log('per4', await pinfo());
  await win.click('.seg[data-pk=color] button[data-v=gray]'); await win.click('.seg[data-pk=range] button[data-v=custom]');
  await win.fill('[data-custom]', '1-9'); await win.waitForTimeout(400); log('bad range', await pinfo());
  await win.fill('[data-custom]', '1'); await win.waitForTimeout(400); log('range 1', await pinfo());
  await win.click('[data-cp="1"]'); await win.click('[data-cp="1"]'); await win.waitForTimeout(300); log('copies', await E(() => document.querySelector('[data-copies]').value));
  await win.screenshot({ path: '/tmp/t/print2.png' });
  await win.click('[data-ok]'); await win.waitForTimeout(3000);
  log('popts1', await app.evaluate(() => [global.__popts, global.__perr]), logs.filter(l => /Document|Impression/.test(l)));
  log('toast', await E(() => document.querySelector('.toast')?.textContent));
  // second: all pages, per 1, landscape, A5, fit actual
  await win.click('#rPrint'); await win.waitForTimeout(1200);
  log('remembered', await E(() => ({ per: document.querySelector('.seg[data-pk=per] .on')?.dataset.v, color: document.querySelector('.seg[data-pk=color] .on')?.dataset.v, range: document.querySelector('.seg[data-pk=range] .on')?.dataset.v, copies: document.querySelector('[data-copies]').value })));
  await win.click('.seg[data-pk=per] button[data-v="1"]'); await win.click('.seg[data-pk=color] button[data-v=color]');
  await win.click('.seg[data-pk=orient] button[data-v=landscape]'); await win.click('.seg[data-pk=paper] button[data-v=A5]'); await win.click('.seg[data-pk=fit] button[data-v=actual]');
  await win.click('.seg[data-pk=duplex] button[data-v=longEdge]'); await win.click('.seg[data-pk=quality] button[data-v="300"]');
  await win.waitForTimeout(600); log('dlg2', await pinfo()); await win.screenshot({ path: '/tmp/t/print3.png' });
  await win.click('[data-ok]'); await win.waitForTimeout(4000);
  log('popts2', await app.evaluate(() => global.__popts));
  // cancel path + Escape
  await win.keyboard.press('Control+p'); await win.waitForTimeout(1000); log('ctrlP open', await E(() => !!document.querySelector('.prt')));
  await win.click('[data-x]'); await win.waitForTimeout(300); log('closed', await E(() => !document.querySelector('.prt')));
  log(logs.filter(l => /^(error|PE)/.test(l)).slice(-8).join('\n'));
  const pdfs = await app.evaluate(() => global.__pdfs || []); pdfs.forEach((b, i) => fs.writeFileSync('/tmp/t/print-' + (i+1) + '.pdf', Buffer.from(b, 'base64')));
  app.process().kill('SIGKILL');
})().catch(e => { log('FAIL', String(e)); process.exit(1); });
