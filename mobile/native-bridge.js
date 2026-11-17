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
    onOpenFile: function (cb) { openCb = cb; queue.splice(0).forEach(function (f) { cb(f); }); },
    ready: function () {},
    version: async function () { var i = await P.App.getInfo(); return i.version; }
  };
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
