const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
const fs = require('fs');
(async () => {
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp'], cwd: '/home/claude/pdfapp', env: { ...process.env, PYR_DEBUG: '1' } });
  const win = await app.firstWindow(); await win.waitForTimeout(1000);
  await win.evaluate(() => localStorage.removeItem('pyramid-print')); await win.reload(); await win.waitForTimeout(600);
  await app.evaluate(({ BrowserWindow }) => {
    const proto = Object.getPrototypeOf(BrowserWindow.getAllWindows()[0].webContents);
    proto.print = function(opts, cb){ global.__popts = opts; this.printToPDF({ landscape: opts.landscape, pageSize: opts.pageSize, printBackground: true, margins: { marginType: 'none' } }).then(b => { (global.__pdfs = global.__pdfs || []).push(Buffer.from(b).toString('base64')); cb(true, ''); }).catch(e => cb(false, String(e))); };
  });
  await win.setInputFiles('#fOpen', '/tmp/demo/facture-demo.pdf'); await win.waitForTimeout(2000);
  for (const fit of ['fit', 'actual']){
    await win.click('#rPrint'); await win.waitForTimeout(1500);
    await win.click(`.seg[data-pk=fit] button[data-v=${fit}]`); await win.waitForTimeout(400);
    await win.click('[data-ok]'); await win.waitForTimeout(3500);
  }
  console.log(JSON.stringify(await app.evaluate(() => global.__popts)));
  const pdfs = await app.evaluate(() => global.__pdfs || []); pdfs.forEach((b, i) => fs.writeFileSync('/tmp/t/pr15-' + i + '.pdf', Buffer.from(b, 'base64')));
  app.process().kill('SIGKILL');
})();
