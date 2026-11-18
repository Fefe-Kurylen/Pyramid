// Faux scanner réseau AirScan (eSCL) pour les tests : annoncé en mDNS (_uscan._tcp), vitre = 1 page, chargeur = 3 pages
const http = require('http');
const fs = require('fs');
const path = require('path');
module.exports = function fakeEscl({ port = 0, name = 'Imprimante Test MFP', jpeg, mdns = true, pdfOnly = false } = {}){
  const img = jpeg || fs.readFileSync(path.join(__dirname, 'docs', 'scan-ocr.jpg'));
  const log = { jobs: [], settings: [] };
  let n = 0;
  const jobs = new Map();
  const caps = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
<pwg:Version>2.63</pwg:Version><pwg:MakeAndModel>${name}</pwg:MakeAndModel>
<scan:Platen><scan:PlatenInputCaps><scan:MinWidth>16</scan:MinWidth><scan:MaxWidth>2550</scan:MaxWidth><scan:MinHeight>16</scan:MinHeight><scan:MaxHeight>3508</scan:MaxHeight>
<scan:SettingProfiles><scan:SettingProfile><scan:ColorModes><scan:ColorMode>RGB24</scan:ColorMode><scan:ColorMode>Grayscale8</scan:ColorMode></scan:ColorModes>
<scan:DocumentFormats>${pdfOnly ? '' : '<pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>'}<pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>${pdfOnly ? '' : '<scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>'}</scan:DocumentFormats>
<scan:SupportedResolutions><scan:DiscreteResolutions><scan:DiscreteResolution><scan:XResolution>100</scan:XResolution><scan:YResolution>100</scan:YResolution></scan:DiscreteResolution>
<scan:DiscreteResolution><scan:XResolution>200</scan:XResolution><scan:YResolution>200</scan:YResolution></scan:DiscreteResolution>
<scan:DiscreteResolution><scan:XResolution>300</scan:XResolution><scan:YResolution>300</scan:YResolution></scan:DiscreteResolution></scan:DiscreteResolutions></scan:SupportedResolutions>
</scan:SettingProfile></scan:SettingProfiles></scan:PlatenInputCaps></scan:Platen>
<scan:Adf><scan:AdfSimplexInputCaps><scan:MaxWidth>2550</scan:MaxWidth><scan:MaxHeight>4200</scan:MaxHeight>
<scan:SettingProfiles><scan:SettingProfile><scan:ColorModes><scan:ColorMode>RGB24</scan:ColorMode><scan:ColorMode>Grayscale8</scan:ColorMode></scan:ColorModes>
<scan:DocumentFormats><pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat></scan:DocumentFormats>
<scan:SupportedResolutions><scan:DiscreteResolutions><scan:DiscreteResolution><scan:XResolution>300</scan:XResolution><scan:YResolution>300</scan:YResolution></scan:DiscreteResolution></scan:DiscreteResolutions></scan:SupportedResolutions>
</scan:SettingProfile></scan:SettingProfiles></scan:AdfSimplexInputCaps><scan:FeederCapacity>35</scan:FeederCapacity></scan:Adf>
</scan:ScannerCapabilities>`;
  const server = http.createServer((req, res) => {
    const u = req.url;
    if (req.method === 'GET' && u === '/eSCL/ScannerCapabilities') { res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(caps); }
    if (req.method === 'POST' && u === '/eSCL/ScanJobs') {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        log.settings.push(b);
        const id = 'job' + (++n);
        const feeder = /<scan:InputSource>Feeder/.test(b);
        jobs.set(id, { left: feeder ? 3 : 1, busy: 1 });
        log.jobs.push(id);
        res.writeHead(201, { Location: `http://127.0.0.1:${server.address().port}/eSCL/ScanJobs/${id}` }); res.end();
      });
      return;
    }
    const m = u.match(/^\/eSCL\/ScanJobs\/(job\d+)(\/NextDocument)?$/);
    if (m && req.method === 'DELETE') { jobs.delete(m[1]); res.writeHead(200); return res.end(); }
    if (m && m[2] && req.method === 'GET') {
      const j = jobs.get(m[1]); if (!j || j.left <= 0) { res.writeHead(404); return res.end(); }
      if (j.busy-- > 0) { res.writeHead(503); return res.end(); }        // simule « scanner en train de lire la page »
      j.left--;
      if (pdfOnly) { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(module.exports.pdf); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(img);
    }
    res.writeHead(404); res.end();
  });
  return new Promise(resolve => server.listen(port, '0.0.0.0', () => {
    let bj = null;
    if (mdns) {
      const { Bonjour } = require(path.join(__dirname, '..', 'windows', 'node_modules', 'bonjour-service'));
      bj = new Bonjour();
      bj.publish({ name, type: 'uscan', port: server.address().port, txt: { rs: 'eSCL', ty: name, uuid: 'test-' + server.address().port } });
    }
    resolve({ port: server.address().port, log, close: () => { try { bj && bj.unpublishAll(() => bj.destroy()); } catch {} server.close(); } });
  }));
};
