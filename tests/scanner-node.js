// Test du module windows/scanner.js sans interface (Linux et Windows) : faux scanner eSCL, ajout par IP, vitre + chargeur,
// puis sous Windows : liste WIA et erreur propre pour un scanner inexistant.
const path = require('path');
const os = require('os');
const fakeEscl = require('./fake-escl');
const sc = require(path.join(__dirname, '..', 'windows', 'scanner.js'));
(async () => {
  let ok = true; const check = (name, cond, extra = '') => { console.log((cond ? '✅ ' : '❌ ') + name + (extra ? ' — ' + extra : '')); if (!cond) ok = false; };
  sc.initManual(os.tmpdir());
  const A = await fakeEscl({ name: 'Scanner Node Test', mdns: false });
  const d = await sc.probe('127.0.0.1:' + A.port);
  check('ajout par adresse IP', d && d.name === 'Scanner Node Test', d && d.name);
  const inf = await sc.info(d.id);
  check('capacités lues', inf.ok !== false && inf.sources.join() === 'platen,adf' && inf.colors.join() === 'color,gray', JSON.stringify(inf));
  let n = 0;
  const p1 = await sc.scan(d.id, { source: 'platen', dpi: 300 }, () => n++);
  check('vitre : 1 page JPEG', p1.length === 1 && p1[0].type === 'jpeg' && p1[0].data[0] === 0xFF && n === 1);
  const p2 = await sc.scan(d.id, { source: 'adf', color: 'gray', dpi: 600 }, () => {});
  check('chargeur : 3 pages', p2.length === 3, 'dpi ' + p2[0].dpi);
  check('réglages envoyés', /Feeder/.test(A.log.settings[1]) && /Grayscale8/.test(A.log.settings[1]) && /<scan:XResolution>300/.test(A.log.settings[1]));
  let err = ''; try { await sc.probe('127.0.0.1:1'); } catch (e) { err = e.message; }
  check('adresse sans scanner refusée', /Aucun scanner/.test(err), err);
  A.close();
  if (process.platform === 'win32') {
    const t0 = Date.now();
    const list = await sc.list();
    check('liste (mDNS + WIA) sans erreur', Array.isArray(list), `${list.length} appareil(s) en ${Date.now() - t0} ms : ` + JSON.stringify(list.map(x => x.kind + ':' + x.name)));
    // scanner WIA inexistant : message clair (et le script PowerShell s'analyse sans erreur)
    const fake = 'wia:{00000000-0000-0000-0000-000000000000}\\9999';
    require(path.join(__dirname, '..', 'windows', 'scanner.js'));
    const DEV = sc._dev; if (DEV) DEV.set(fake, { id: fake, kind: 'wia', name: 'X', wiaId: fake.slice(4) });
    let e2 = ''; try { await sc.scan(fake, { source: 'platen' }, () => {}); } catch (e) { e2 = e.message; }
    check('WIA : erreur propre pour un scanner absent', /^Scanner introuvable|classe|class/i.test(e2), e2);
  }
  console.log(ok ? 'RÉSULTAT OK' : 'RÉSULTAT ÉCHEC');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('ÉCHEC', e); process.exit(1); });
