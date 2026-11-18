// Lancé avec ELECTRON_RUN_AS_NODE=1 et l'exe de Pyramid PDF installé : OCR comme dans main.js (asar + asarUnpack)
const path = require('path'), fs = require('fs');
const res = process.argv[2], img = process.argv[3];
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
(async () => {
  const T = require(path.join(res, 'app.asar', 'node_modules', 'tesseract.js'));
  const wp = unpacked(path.join(res, 'app.asar', 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'));
  const t0 = Date.now();
  const w = await T.createWorker('fra', T.OEM.LSTM_ONLY, { langPath: unpacked(path.join(res, 'app.asar', 'ocr')), cachePath: path.join(require('os').tmpdir(), 'ocr-cache'), gzip: true, workerPath: wp });
  const { data } = await w.recognize(fs.readFileSync(img), {}, { blocks: true, text: true });
  console.log(((Date.now() - t0) / 1000).toFixed(1) + ' s');
  console.log(data.text.split('\n').slice(0, 4).join(' | '));
  await w.terminate();
  if (!/Facture/.test(data.text)) { console.error('OCR : texte non reconnu'); process.exit(1); }
  console.log('✅ OCR OK sur Windows');
})().catch(e => { console.error(e); process.exit(1); });
