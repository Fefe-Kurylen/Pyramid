const { _electron: electron } = require('/home/claude/pdfapp/node_modules/playwright-core');
(async () => {
  for (let k = 0; k < 3; k++){
  const t0 = Date.now();
  const app = await electron.launch({ args: ['--no-sandbox', '/home/claude/pdfapp'], cwd: '/home/claude/pdfapp' });
  const win = await app.firstWindow(); const t1 = Date.now();
  await win.waitForFunction(() => document.readyState === 'complete');
  const t2 = Date.now();
  const vis = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; for (let i=0;i<200 && !w.isVisible();i++) await new Promise(r=>setTimeout(r,10)); return w.isVisible(); });
  const t3 = Date.now();
  const nav = await win.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const p = performance.getEntriesByType('paint').map(e => e.name + ':' + Math.round(e.startTime)); const r = performance.getEntriesByType('resource').map(e => e.name.split('/').pop() + ':' + Math.round(e.duration)).slice(0,8); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), p, r }; });
  console.log({ firstWindow: t1 - t0, complete: t2 - t0, visible: t3 - t0, vis, ...nav });
  app.process().kill('SIGKILL'); await new Promise(r => setTimeout(r, 500));
  }
})();
