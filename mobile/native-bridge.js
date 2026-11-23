/* Pyramid PDF — pont entre l'interface et iPhone / Android (Capacitor) */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins, plat = C.getPlatform();
  var b64 = function (u8) { var s = ''; for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  var unb64 = function (s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  var safeName = function (n) { return String(n || 'document.pdf').replace(/[\\/:*?"<>|]/g, '_'); };
  var openCb = null, queue = [];
  window.native = {
    platform: plat,
    // Enregistrer : le fichier est préparé puis la feuille de partage du système s'ouvre
    // (« Enregistrer dans Fichiers », Drive, Mail, WhatsApp…)
    save: async function (name, data) {
      name = safeName(name);
      var r = await P.Filesystem.writeFile({ path: name, data: b64(data), directory: 'CACHE' });
      try { await P.Share.share({ title: name, files: [r.uri], dialogTitle: 'Enregistrer ou partager le PDF' }); }
      catch (e) { if (/cancel|annul/i.test(String((e && e.message) || e))) return null; throw e; }
      return name;
    },
    printPdf: function (data, name) { return P.PyramidNative.printPdf({ data: b64(data), name: safeName(name) }); },
    tsa: async function (url, body) { var r = await P.PyramidNative.tsa({ url: url, body: b64(body) }); return unb64(r.data); },
    // Scanner de documents du système (iPhone : Apple ; Android : Google) → tableau de JPEG (Uint8Array)
    scanDoc: P.PyramidNative && P.PyramidNative.scanDoc ? async function () { var r = await P.PyramidNative.scanDoc(); return (r.pages || []).map(unb64); } : undefined,
    onOpenFile: function (cb) { openCb = cb; queue.splice(0).forEach(function (f) { cb(f); }); },
    ready: function () {},
    version: async function () { var i = await P.App.getInfo(); return i.version; }
  };
  // Numériser depuis une imprimante / un scanner du Wi-Fi (AirScan / eSCL, sans pilote ni appli du fabricant)
  // découverte : Bonjour (_uscan._tcp / _uscans._tcp) par le module natif ; requêtes HTTP par le module natif (réseau local)
  if (P.PyramidNative && P.PyramidNative.httpReq && P.PyramidNative.scanBrowse) (function () {
    var N = P.PyramidNative, DEV = new Map(), CUR = null, pageCb = [];
    var PAPER = { A4: [8.27, 11.69], A5: [5.83, 8.27], Letter: [8.5, 11], Legal: [8.5, 14] };
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var KEY = 'pyramid-scanners-ip';
    var manual = (function () { try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter(function (x) { return typeof x === 'string'; }); } catch (e) { return []; } })();
    var saveManual = function () { try { localStorage.setItem(KEY, JSON.stringify(manual)); } catch (e) {} };
    async function req(url, o) {
      o = o || {};
      var r = await N.httpReq({ url: url, method: o.method || 'GET', body: o.body ? b64(new TextEncoder().encode(o.body)) : '', timeout: o.timeout || 30000 });
      return { status: r.status, location: r.location || '', type: r.type || '', body: r.data ? unb64(r.data) : new Uint8Array(0) };
    }
    var txt = function (u8, n) { return new TextDecoder().decode(n ? u8.subarray(0, n) : u8); };
    var tag = function (xml, name) { var m = xml.match(new RegExp('<(?:\\w+:)?' + name + '(?=[\\s>])[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + name + '>')); return m ? m[1] : ''; };
    var tags = function (xml, name) { return Array.from(xml.matchAll(new RegExp('<(?:\\w+:)?' + name + '(?=[\\s>])[^>]*>([\\s\\S]*?)</(?:\\w+:)?' + name + '>', 'g'))).map(function (m) { return m[1].trim(); }); };
    var uniq = function (a) { return Array.from(new Set(a)); };
    function parseCaps(xml) {
      var src = function (name) {
        var block = tag(xml, name); if (!block) return null;
        var res = uniq(tags(block, 'XResolution').map(Number).filter(function (n) { return n > 0; })).sort(function (a, b) { return a - b; });
        return { colors: uniq(tags(block, 'ColorMode')), res: res.length ? res : [150, 300],
          formats: uniq(tags(block, 'DocumentFormatExt').concat(tags(block, 'DocumentFormat'))),
          maxW: +tags(block, 'MaxWidth')[0] || 2550, maxH: +tags(block, 'MaxHeight')[0] || 3508 };
      };
      var adf = src('Adf');
      return { version: tag(xml, 'Version') || '2.0', model: tag(xml, 'MakeAndModel'), platen: src('Platen'), adf: adf,
        duplex: !!(adf && /AdfDuplexInputCaps|<(\w+:)?Duplex/.test(tag(xml, 'Adf'))) };
    }
    function esclDev(base, name, extra) { var d = Object.assign({ id: 'escl:' + base, kind: 'escl', name: name || 'Scanner réseau', base: base }, extra || {}); DEV.set(d.id, d); return d; }
    async function capsFor(d) {
      if (d.caps) return d.caps;
      var r = await req(d.base + 'ScannerCapabilities', { timeout: 8000 });
      if (r.status !== 200) throw new Error('Capacités illisibles (' + r.status + ')');
      d.caps = parseCaps(txt(r.body));
      if (d.caps.model && (!d.name || d.name === 'Scanner réseau')) d.name = d.caps.model;
      return d.caps;
    }
    async function probe(addr) {
      addr = String(addr || '').trim().replace(/\/+$/, '');
      if (!addr) throw new Error('Adresse vide');
      var tries = [];
      if (/^https?:\/\//i.test(addr)) tries.push((/escl$/i.test(addr) ? addr + '/' : addr + '/eSCL/').replace(/^https:/i, 'http:'));
      else if (/:\d+$/.test(addr)) ['eSCL', 'escl'].forEach(function (rs) { tries.push('http://' + addr + '/' + rs + '/'); });
      else [['http', ''], ['http', ':8080'], ['http', ':9095'], ['http', ':631']].forEach(function (t) { ['eSCL', 'escl'].forEach(function (rs) { tries.push(t[0] + '://' + addr + t[1] + '/' + rs + '/'); }); });
      for (var i = 0; i < tries.length; i++) {
        try {
          var r = await req(tries[i] + 'ScannerCapabilities', { timeout: 4000 });
          if (r.status === 200 && /ScannerCapabilities/.test(txt(r.body, 4000))) {
            var d = esclDev(tries[i], '', { manual: true, host: addr });
            d.caps = parseCaps(txt(r.body)); d.name = d.caps.model || addr;
            if (manual.indexOf(addr) < 0) { manual.push(addr); saveManual(); }
            return d;
          }
        } catch (e) {}
      }
      throw new Error('Aucun scanner AirScan (eSCL) trouvé à cette adresse');
    }
    var pub = function (d) { return { id: d.id, kind: d.kind, name: d.name, host: d.host || '', manual: !!d.manual }; };
    window.native.scanners = async function () {
      var found = [];
      try { found = ((await N.scanBrowse({ ms: 3500 })).services) || []; } catch (e) {}
      var out = [], seen = {};
      found = found.filter(function (m) { return !m.secure; });   // téléphone : HTTP local seulement (https des imprimantes = certificat auto-signé)
      found.forEach(function (m) {
        var t = m.txt || {}, key = String(t.uuid || m.host).toLowerCase();
        if (!m.host || seen[key]) return; seen[key] = 1;
        var rs = String(t.rs == null ? 'eSCL' : t.rs).replace(/^\/+|\/+$/g, '');
        var host = /:/.test(m.host) ? '[' + m.host + ']' : m.host;
        out.push(esclDev((m.secure ? 'https' : 'http') + '://' + host + ':' + m.port + '/' + (rs ? rs + '/' : ''), t.ty || m.name, { host: m.host }));
      });
      for (var i = 0; i < manual.length; i++) {
        var a = manual[i], old = Array.from(DEV.values()).find(function (d) { return d.manual && d.host === a; });
        if (old) { out.push(old); continue; }
        try { out.push(await probe(a)); } catch (e) {}
      }
      return out.map(pub);
    };
    window.native.scannerAdd = async function (addr) {
      try { var d = await probe(String(addr || '').slice(0, 200)); return Object.assign({ ok: true }, pub(d)); }
      catch (e) { return { ok: false, error: e.message || String(e) }; }
    };
    window.native.scannerForget = async function (addr) { manual = manual.filter(function (a) { return a !== addr; }); saveManual(); return true; };
    window.native.scannerInfo = async function (id) {
      try {
        var d = DEV.get(id); if (!d) throw new Error('Appareil introuvable');
        var c = await capsFor(d), s = c.platen || c.adf, colors = [];
        if (s.colors.some(function (x) { return /RGB/.test(x); })) colors.push('color');
        if (s.colors.some(function (x) { return /Grayscale/.test(x); })) colors.push('gray');
        if (s.colors.some(function (x) { return /BlackAndWhite/.test(x); })) colors.push('bw');
        return { ok: true, kind: 'escl', model: c.model, sources: [c.platen && 'platen', c.adf && 'adf', c.duplex && 'duplex'].filter(Boolean), res: s.res, colors: colors.length ? colors : ['color'] };
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
    };
    window.native.onScanner = function (cb) { pageCb.push(cb); };
    window.native.scannerCancel = async function () {
      if (!CUR) return false;
      CUR.cancelled = true;
      if (CUR.job) req(CUR.job, { method: 'DELETE', timeout: 5000 }).catch(function () {});
      return true;
    };
    window.native.scannerScan = async function (id, o) {
      var d = DEV.get(id);
      if (!d) return { ok: false, error: 'Appareil introuvable : actualise la liste' };
      if (CUR) return { ok: false, error: 'Une numérisation est déjà en cours' };
      o = Object.assign({ dpi: 300, color: 'color', source: 'platen', paper: 'A4' }, o || {});
      o.dpi = Math.max(75, Math.min(1200, parseInt(o.dpi) || 300));
      CUR = { cancelled: false };
      var check = function () { if (CUR.cancelled) throw new Error('annulé'); };
      try {
        var c = await capsFor(d);
        var platen = (o.source === 'platen' || !c.adf) && c.platen;
        var src = platen ? c.platen : (c.adf || c.platen), inputSource = platen ? 'Platen' : 'Feeder';
        var want = o.color === 'gray' ? /Grayscale8/ : o.color === 'bw' ? /BlackAndWhite1/ : /RGB24/;
        var mode = src.colors.find(function (x) { return want.test(x); }) || (o.color === 'bw' && src.colors.find(function (x) { return /Grayscale8/.test(x); })) || src.colors.find(function (x) { return /RGB24/.test(x); }) || src.colors[0] || 'RGB24';
        var res = src.res.reduce(function (b, r) { return Math.abs(r - o.dpi) < Math.abs(b - o.dpi) ? r : b; }, src.res[0]);
        var fmt = src.formats.indexOf('image/jpeg') >= 0 || !src.formats.length ? 'image/jpeg' : src.formats.indexOf('application/pdf') >= 0 ? 'application/pdf' : src.formats[0];
        var pp = PAPER[o.paper] || PAPER.A4, W = Math.min(Math.round(pp[0] * 300), src.maxW), H = Math.min(Math.round(pp[1] * 300), src.maxH);
        var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">'
          + '<pwg:Version>' + c.version + '</pwg:Version><scan:Intent>' + (o.color === 'color' ? 'Photo' : 'TextAndGraphic') + '</scan:Intent>'
          + '<pwg:ScanRegions pwg:MustHonor="false"><pwg:ScanRegion><pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>'
          + '<pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset><pwg:Width>' + W + '</pwg:Width><pwg:Height>' + H + '</pwg:Height></pwg:ScanRegion></pwg:ScanRegions>'
          + '<pwg:InputSource>' + inputSource + '</pwg:InputSource><scan:InputSource>' + inputSource + '</scan:InputSource>'
          + '<scan:ColorMode>' + mode + '</scan:ColorMode><scan:XResolution>' + res + '</scan:XResolution><scan:YResolution>' + res + '</scan:YResolution>'
          + '<pwg:DocumentFormat>' + fmt + '</pwg:DocumentFormat>' + (parseFloat(c.version) >= 2 ? '<scan:DocumentFormatExt>' + fmt + '</scan:DocumentFormatExt>' : '')
          + (inputSource === 'Feeder' ? '<scan:Duplex>' + (o.source === 'duplex' && c.duplex ? 'true' : 'false') + '</scan:Duplex>' : '') + '</scan:ScanSettings>';
        var job = null;
        for (var i = 0; i < 20 && !job; i++) {
          check();
          var r = await req(d.base + 'ScanJobs', { method: 'POST', body: xml, timeout: 20000 });
          if (r.status === 201 && r.location) job = new URL(r.location, d.base).href.replace(/\/+$/, '');
          else if (r.status === 503) await sleep(1500);
          else if (r.status === 409) throw new Error(inputSource === 'Feeder' ? 'Chargeur vide : place les feuilles dans le chargeur' : 'Scanner occupé');
          else throw new Error('Le scanner a refusé la demande (' + r.status + ')');
        }
        if (!job) throw new Error('Scanner occupé, réessaie dans un instant');
        CUR.job = job;
        var pages = [];
        for (var n = 0; n < 500; n++) {
          var rr;
          for (var t = 0; ; t++) {
            check();
            rr = await req(job + '/NextDocument', { timeout: 180000 });
            if (rr.status === 503 && t < 60) { await sleep(1000); continue; }
            break;
          }
          check();
          if (rr.status === 404 || rr.status === 410) break;
          if (rr.status === 409 && !pages.length) throw new Error('Chargeur vide : place les feuilles dans le chargeur');
          if (rr.status !== 200) { if (pages.length) break; throw new Error('Numérisation interrompue (' + rr.status + ')'); }
          var b = rr.body, type = /pdf/i.test(rr.type) || txt(b, 5) === '%PDF-' ? 'pdf' : b[0] === 0x89 ? 'png' : 'jpeg';
          pages.push({ type: type, data: b, dpi: res });
          pageCb.forEach(function (cb) { try { cb({ type: 'page', n: pages.length }); } catch (e) {} });
          if (inputSource === 'Platen' && type !== 'pdf') break;   // vitre : une seule page
        }
        req(job, { method: 'DELETE', timeout: 5000 }).catch(function () {});
        return { ok: true, pages: pages };
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
      finally { CUR = null; }
    };
  })();
  // Abonnement : iPhone / iPad (App Store) et Android (Google Play) — essai gratuit de 14 jours puis 0,99 € par mois
  if ((plat === 'ios' || plat === 'android') && P.PyramidNative.subStatus) {
    window.native.sub = {
      status: function () { return P.PyramidNative.subStatus(); },
      buy: function () { return P.PyramidNative.subBuy(); },
      restore: function () { return P.PyramidNative.subRestore(); },
      manage: function () { return P.PyramidNative.subManage(); },
      onChange: function (cb) { P.PyramidNative.addListener('subChange', cb); }
    };
  }
  // Fichiers ouverts avec « Ouvrir avec Pyramid PDF » / « Partager vers Pyramid PDF »
  var openUrl = async function (url) {
    if (!url || /^(https?|capacitor):/i.test(url)) return;
    try {
      var r = await P.PyramidNative.readUri({ url: url });
      var f = { name: r.name || 'document.pdf', data: unb64(r.data) };
      if (openCb) openCb(f); else queue.push(f);
    } catch (e) { console.warn('ouverture impossible', e); }
  };
  if (plat === 'android') {
    // Android : « Ouvrir avec » et « Partager vers » passent par le module natif (événement conservé jusqu'à lecture)
    P.PyramidNative.addListener('openUrl', function (e) { openUrl(e && e.url); });
  } else {
    P.App.addListener('appUrlOpen', function (e) { openUrl(e && e.url); });
    P.App.getLaunchUrl().then(function (r) { if (r && r.url) openUrl(r.url); }).catch(function () {});
  }
})();
