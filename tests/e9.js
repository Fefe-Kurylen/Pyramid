const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs'); const L = '/tmp/t/e9.log'; fs.writeFileSync(L, ''); const log = (...a) => fs.appendFileSync(L, a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
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
  for (const [per, ori] of [['2','auto'], ['4','auto'], ['1','auto']]){
    await win.click('#rPrint'); await win.waitForTimeout(1200);
    await win.click(`.seg[data-pk=per] button[data-v="${per}"]`); await win.click(`.seg[data-pk=orient] button[data-v=${ori}]`);
    if (per === '1') await win.click('.seg[data-pk=fit] button[data-v=actual]');
    await win.waitForTimeout(900); await win.screenshot({ path: `/tmp/t/pv-${per}.png`, clip: { x: 200, y: 90, width: 650, height: 720 } });
    await win.click('[data-ok]'); await win.waitForTimeout(4000);
  }
  log(logs.filter(l => /^(error|PE)/.test(l)).slice(-8).join('\n'));
  const pdfs = await app.evaluate(() => global.__pdfs || []); pdfs.forEach((b, i) => fs.writeFileSync('/tmp/t/pr9-' + (i+1) + '.pdf', Buffer.from(b, 'base64')));
  app.process().kill('SIGKILL');
})().catch(e => { log('FAIL', String(e)); process.exit(1); });
