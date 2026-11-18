'use strict';
/* ---------- Numériser depuis une imprimante / un scanner ----------
   1) Réseau (AirScan / eSCL, Windows + Mac, sans pilote) : imprimantes multifonctions trouvées par mDNS
      (_uscan._tcp / _uscans._tcp) ou ajoutées par adresse IP ; protocole HTTP eSCL (ScanJobs → NextDocument).
   2) Windows (WIA) : tous les scanners installés dans Windows (USB, réseau WSD…), via PowerShell + WIA.DeviceManager.
   Chaque numérisation renvoie les pages en JPEG (ou PDF si l'appareil ne sait faire que du PDF). */
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAPER = { A4: [8.27, 11.69], A5: [5.83, 8.27], Letter: [8.5, 11], Legal: [8.5, 14] };   // pouces

/* ===== Requêtes HTTP vers l'appareil (réseau local uniquement) ===== */
function req(url, { method = 'GET', body = null, headers = {}, timeout = 30000 } = {}){
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const r = mod.request(u, { method, headers: { 'User-Agent': 'PyramidPDF', ...(body ? { 'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(body) } : {}), ...headers },
      // les imprimantes utilisent des certificats auto-signés (adresses trouvées sur le réseau local ou saisies par l'utilisateur)
      rejectUnauthorized: false, timeout }, res => {
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > 200 * 1024 * 1024) r.destroy(new Error('Réponse trop grande')); else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    r.on('timeout', () => r.destroy(new Error('L’appareil ne répond pas')));
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
const tag = (xml, name) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${name}(?=[\\s>])[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`)); return m ? m[1] : ''; };
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}(?=[\\s>])[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g'))].map(m => m[1].trim());

function parseCaps(xml){
  const src = name => {
    const block = tag(xml, name); if (!block) return null;
    const res = [...new Set(tags(block, 'XResolution').map(Number).filter(n => n > 0))].sort((a, b) => a - b);
    return {
      colors: [...new Set(tags(block, 'ColorMode'))],
      res: res.length ? res : [150, 300],
      formats: [...new Set([...tags(block, 'DocumentFormatExt'), ...tags(block, 'DocumentFormat')])],
      maxW: +tags(block, 'MaxWidth')[0] || 2550, maxH: +tags(block, 'MaxHeight')[0] || 3508
    };
  };
  const adf = src('Adf');
  return {
    version: tag(xml, 'Version') || '2.0',
    model: tag(xml, 'MakeAndModel'),
    platen: src('Platen'),
    adf, duplex: !!(adf && /AdfDuplexInputCaps|<(\w+:)?Duplex/.test(tag(xml, 'Adf')))
  };
}

/* ===== Découverte ===== */
const DEV = new Map();        // id → appareil
let manual = [];              // adresses ajoutées à la main (mémorisées)
let manualFile = '';
function initManual(dir){
  manualFile = path.join(dir, 'scanners.json');
  try { manual = JSON.parse(fs.readFileSync(manualFile, 'utf8')).filter(x => typeof x === 'string'); } catch { manual = []; }
}
const saveManual = () => { try { fs.writeFileSync(manualFile, JSON.stringify(manual)); } catch {} };

function esclDev(base, name, extra = {}){
  const id = 'escl:' + base;
  const d = { id, kind: 'escl', name: name || 'Scanner réseau', base, ...extra };
  DEV.set(id, d);
  return d;
}

function mdnsBrowse(ms){
  return new Promise(resolve => {
    let bj;
    try { const { Bonjour } = require('bonjour-service'); bj = new Bonjour(undefined, () => {}); }
    catch { return resolve([]); }
    const found = [];
    const onUp = (secure) => s => {
      const txt = s.txt || {};
      const addrs = (s.addresses || []).filter(a => /^\d+\.\d+\.\d+\.\d+$/.test(a));
      const host = addrs[0] || (s.host || '').replace(/\.$/, '') || s.referer && s.referer.address;
      if (!host) return;
      const rs = String(txt.rs == null ? 'eSCL' : txt.rs).replace(/^\/+|\/+$/g, '');
      const base = `${secure ? 'https' : 'http'}://${host}:${s.port}/${rs ? rs + '/' : ''}`;
      found.push({ base, name: txt.ty || s.name, secure, uuid: txt.uuid || '', host });
    };
    const b1 = bj.find({ type: 'uscan' }, onUp(false)), b2 = bj.find({ type: 'uscans' }, onUp(true));
    setTimeout(() => { try { b1.stop(); b2.stop(); bj.destroy(); } catch {} resolve(found); }, ms);
  });
}

function runPs(script, args = [], timeout = 60000){
  return new Promise((resolve, reject) => {
    const f = path.join(os.tmpdir(), `pyramid-wia-${process.pid}-${Date.now()}.ps1`);
    fs.writeFileSync(f, '﻿' + script, 'utf8');
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f, ...args], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeout);
    p.on('error', e => { clearTimeout(t); fs.unlink(f, () => {}); reject(e); });
    p.on('close', code => { clearTimeout(t); fs.unlink(f, () => {}); code === 0 ? resolve(out) : reject(new Error((err || out).trim().split('\n').pop() || 'Erreur ' + code)); });
  });
}

const WIA_LIST = `$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$m = New-Object -ComObject WIA.DeviceManager
$o = @()
foreach($d in $m.DeviceInfos){ if($d.Type -eq 1){
  $n = ''; try { $n = $d.Properties.Item('Name').Value } catch {}
  $o += [pscustomobject]@{ id = $d.DeviceID; name = $n }
} }
ConvertTo-Json -InputObject @($o) -Compress`;

async function wiaList(){
  if (process.platform !== 'win32') return [];
  try {
    const out = await runPs(WIA_LIST, [], 20000);
    const arr = JSON.parse(out.trim() || '[]');
    return (Array.isArray(arr) ? arr : [arr]).filter(x => x && x.id).map(x => {
      const id = 'wia:' + x.id;
      const d = { id, kind: 'wia', name: x.name || 'Scanner', wiaId: x.id };
      DEV.set(id, d); return d;
    });
  } catch { return []; }
}

async function capsFor(d){
  if (d.kind !== 'escl') return null;
  if (d.caps) return d.caps;
  const r = await req(d.base + 'ScannerCapabilities', { timeout: 8000 });
  if (r.status !== 200) throw new Error('Capacités illisibles (' + r.status + ')');
  d.caps = parseCaps(r.body.toString('utf8'));
  if (d.caps.model && (!d.name || d.name === 'Scanner réseau')) d.name = d.caps.model;
  return d.caps;
}

// Essaie une adresse IP / un nom saisi à la main : http(s), ports et chemins usuels
async function probe(addr){
  addr = String(addr || '').trim().replace(/\/+$/, '');
  if (!addr) throw new Error('Adresse vide');
  const tries = [];
  if (/^https?:\/\//i.test(addr)) tries.push(/escl$/i.test(addr) ? addr + '/' : addr + '/eSCL/');
  else if (/:\d+$/.test(addr) && !/^\[?[0-9a-f:]+\]?$/i.test(addr)) for (const proto of ['http', 'https']) for (const rs of ['eSCL', 'escl']) tries.push(`${proto}://${addr}/${rs}/`);
  else for (const [proto, port] of [['http', 80], ['https', 443], ['http', 8080], ['https', 9095], ['http', 9095]]) for (const rs of ['eSCL', 'escl'])
    tries.push(`${proto}://${addr}${(proto === 'http' && port === 80) || (proto === 'https' && port === 443) ? '' : ':' + port}/${rs}/`);
  for (const base of tries){
    try {
      const r = await req(base + 'ScannerCapabilities', { timeout: 4000 });
      if (r.status === 200 && /ScannerCapabilities/.test(r.body.toString('utf8', 0, 4000))){
        const d = esclDev(base, '', { manual: true, host: addr });
        d.caps = parseCaps(r.body.toString('utf8'));
        d.name = d.caps.model || addr;
        if (!manual.includes(addr)) { manual.push(addr); saveManual(); }
        return d;
      }
    } catch {}
  }
  throw new Error('Aucun scanner AirScan (eSCL) trouvé à cette adresse');
}

async function list(){
  const [mdns, wia] = await Promise.all([mdnsBrowse(3500), wiaList()]);
  const out = [], seen = new Set();
  // http et https du même appareil : on garde http (plus rapide), sinon https
  mdns.sort((a, b) => a.secure - b.secure);
  for (const m of mdns){
    const key = (m.uuid || m.host).toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    out.push(esclDev(m.base, m.name, { host: m.host }));
  }
  for (const a of manual){
    if ([...DEV.values()].some(d => d.manual && d.host === a && out.includes(d))) continue;
    const old = [...DEV.values()].find(d => d.manual && d.host === a);
    if (old) { out.push(old); continue; }
    try { out.push(await probe(a)); } catch { /* appareil éteint : on ne l'affiche pas */ }
  }
  out.push(...wia);
  return out.map(d => ({ id: d.id, kind: d.kind, name: d.name, host: d.host || '', manual: !!d.manual }));
}

async function info(id){
  const d = DEV.get(id); if (!d) throw new Error('Appareil introuvable');
  if (d.kind === 'wia') return { kind: 'wia', sources: ['platen', 'adf', 'duplex'], res: [100, 150, 200, 300, 600], colors: ['color', 'gray', 'bw'] };
  const c = await capsFor(d);
  const s = c.platen || c.adf;
  const colors = [];
  if (s.colors.some(x => /RGB/.test(x))) colors.push('color');
  if (s.colors.some(x => /Grayscale/.test(x))) colors.push('gray');
  if (s.colors.some(x => /BlackAndWhite/.test(x))) colors.push('bw');
  return { kind: 'escl', model: c.model, sources: [c.platen && 'platen', c.adf && 'adf', c.duplex && 'duplex'].filter(Boolean),
    res: s.res, colors: colors.length ? colors : ['color'] };
}

/* ===== Numérisation ===== */
let CUR = null;   // { cancel }

async function scanEscl(d, o, onPage){
  const c = await capsFor(d);
  const src = o.source === 'platen' || !c.adf ? (c.platen || c.adf) : c.adf;
  const inputSource = (o.source === 'platen' || !c.adf) && c.platen ? 'Platen' : 'Feeder';
  const want = o.color === 'gray' ? /Grayscale8/ : o.color === 'bw' ? /BlackAndWhite1/ : /RGB24/;
  const mode = src.colors.find(x => want.test(x)) || (o.color === 'bw' && src.colors.find(x => /Grayscale8/.test(x))) || src.colors.find(x => /RGB24/.test(x)) || src.colors[0] || 'RGB24';
  const res = src.res.reduce((b, r) => Math.abs(r - o.dpi) < Math.abs(b - o.dpi) ? r : b, src.res[0]);
  const fmt = src.formats.includes('image/jpeg') || !src.formats.length ? 'image/jpeg' : src.formats.includes('application/pdf') ? 'application/pdf' : src.formats[0];
  const [pw, ph] = PAPER[o.paper] || PAPER.A4;
  const W = Math.min(Math.round(pw * 300), src.maxW), H = Math.min(Math.round(ph * 300), src.maxH);
  const v2 = parseFloat(c.version) >= 2;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>${c.version}</pwg:Version>
  <scan:Intent>${o.color === 'color' ? 'Photo' : 'TextAndGraphic'}</scan:Intent>
  <pwg:ScanRegions pwg:MustHonor="false"><pwg:ScanRegion>
    <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
    <pwg:XOffset>0</pwg:XOffset><pwg:YOffset>0</pwg:YOffset>
    <pwg:Width>${W}</pwg:Width><pwg:Height>${H}</pwg:Height>
  </pwg:ScanRegion></pwg:ScanRegions>
  <pwg:InputSource>${inputSource}</pwg:InputSource>
  <scan:InputSource>${inputSource}</scan:InputSource>
  <scan:ColorMode>${mode}</scan:ColorMode>
  <scan:XResolution>${res}</scan:XResolution><scan:YResolution>${res}</scan:YResolution>
  <pwg:DocumentFormat>${fmt}</pwg:DocumentFormat>${v2 ? `\n  <scan:DocumentFormatExt>${fmt}</scan:DocumentFormatExt>` : ''}${inputSource === 'Feeder' ? `\n  <scan:Duplex>${o.source === 'duplex' && c.duplex ? 'true' : 'false'}</scan:Duplex>` : ''}
</scan:ScanSettings>`;
  let job = null;
  for (let i = 0; i < 20 && !job; i++){
    if (CUR && CUR.cancelled) throw new Error('annulé');
    const r = await req(d.base + 'ScanJobs', { method: 'POST', body: xml, timeout: 20000 });
    if (r.status === 201 && r.headers.location) job = new URL(r.headers.location, d.base).href.replace(/\/+$/, '');
    else if (r.status === 503) await sleep(1500);                        // occupé : on réessaie
    else if (r.status === 409) throw new Error(inputSource === 'Feeder' ? 'Chargeur vide : place les feuilles dans le chargeur' : 'Scanner occupé');
    else throw new Error('Le scanner a refusé la demande (' + r.status + ')');
  }
  if (!job) throw new Error('Scanner occupé, réessaie dans un instant');
  CUR.job = job;
  const pages = [];
  for (let n = 0; n < 500; n++){
    let r;
    for (let tries = 0; ; tries++){
      if (CUR && CUR.cancelled) throw new Error('annulé');
      r = await req(job + '/NextDocument', { timeout: 180000 });
      if (r.status === 503 && tries < 60) { await sleep(1000); continue; }
      break;
    }
    if (r.status === 404 || r.status === 410) break;                         // plus de page
    if (r.status === 409 && pages.length === 0) throw new Error('Chargeur vide : place les feuilles dans le chargeur');
    if (r.status !== 200) { if (pages.length) break; throw new Error('Numérisation interrompue (' + r.status + ')'); }
    const type = /pdf/i.test(r.headers['content-type'] || '') || r.body.slice(0, 5).toString() === '%PDF-' ? 'pdf'
      : r.body[0] === 0x89 ? 'png' : 'jpeg';
    pages.push({ type, data: new Uint8Array(r.body), dpi: res });
    onPage(pages.length);
    if (inputSource === 'Platen' && type !== 'pdf') break;                   // vitre : une seule page
  }
  req(job, { method: 'DELETE', timeout: 5000 }).catch(() => {});
  return pages;
}

const WIA_SCAN = `param([string]$id, [int]$dpi, [int]$intent, [int]$feeder, [int]$duplex, [double]$pw, [double]$ph, [string]$out)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
function SetP($props, [int]$propId, $val){ foreach($p in $props){ if($p.PropertyID -eq $propId){ try { $p.Value = $val } catch {} } } }
function GetP($props, [int]$propId){ foreach($p in $props){ if($p.PropertyID -eq $propId){ return $p.Value } }; return $null }
try {
$m = New-Object -ComObject WIA.DeviceManager
$info = $null; foreach($d in $m.DeviceInfos){ if($d.DeviceID -eq $id){ $info = $d } }
if(-not $info){ throw 'Scanner introuvable ou éteint' }
$dev = $info.Connect()
if($feeder -eq 1){ if($duplex -eq 1){ SetP $dev.Properties 3088 5 } else { SetP $dev.Properties 3088 1 }; SetP $dev.Properties 3096 1 } else { SetP $dev.Properties 3088 2 }
$item = $dev.Items.Item(1)
SetP $item.Properties 6146 $intent
SetP $item.Properties 6147 $dpi
SetP $item.Properties 6148 $dpi
SetP $item.Properties 6149 0
SetP $item.Properties 6150 0
$w = [int]($pw * $dpi); $h = [int]($ph * $dpi)
$mw = GetP $dev.Properties 3074; $mh = GetP $dev.Properties 3075
if($mw){ $w = [Math]::Min($w, [int]($mw * $dpi / 1000)) }
if($mh){ $h = [Math]::Min($h, [int]($mh * $dpi / 1000)) }
SetP $item.Properties 6151 $w
SetP $item.Properties 6152 $h
$n = 0
while($true){
  try { $img = $item.Transfer($JPEG) }
  catch {
    $ex = $_.Exception; while($ex.InnerException){ $ex = $ex.InnerException }; $hr = $ex.HResult
    if($n -gt 0){ break }
    if(($hr -band 0xFFFF) -eq 3 -and $feeder -eq 1){ throw 'Chargeur vide : place les feuilles dans le chargeur' }
    if(($hr -band 0xFFFF) -eq 6){ throw 'Scanner occupé' }
    throw $ex.Message
  }
  if($img.FormatID -ne $JPEG){
    $ip = New-Object -ComObject WIA.ImageProcess
    $ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
    $ip.Filters.Item(1).Properties.Item('FormatID').Value = $JPEG
    $ip.Filters.Item(1).Properties.Item('Quality').Value = 90
    $img = $ip.Apply($img)
  }
  $n++
  $f = Join-Path $out ('p{0:D3}.jpg' -f $n)
  if(Test-Path $f){ Remove-Item $f }
  $img.SaveFile($f)
  Write-Output ('PAGE ' + $n)
  if($feeder -ne 1){ break }
}
Write-Output ('DONE ' + $n)
} catch {
  $ex = $_.Exception; while($ex.InnerException){ $ex = $ex.InnerException }
  Write-Output ('ERR ' + ($ex.Message -replace '\s+', ' '))
  exit 1
}`;

async function scanWia(d, o, onPage){
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pyramid-scan-'));
  const [pw, ph] = PAPER[o.paper] || PAPER.A4;
  const intent = o.color === 'gray' ? 2 : o.color === 'bw' ? 4 : 1;
  const feeder = o.source === 'platen' ? 0 : 1;
  try {
    await new Promise((resolve, reject) => {
      const f = path.join(out, 'scan.ps1');
      fs.writeFileSync(f, '﻿' + WIA_SCAN, 'utf8');
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', f,
        d.wiaId, String(o.dpi), String(intent), String(feeder), o.source === 'duplex' ? '1' : '0', String(pw), String(ph), out], { windowsHide: true });
      CUR.proc = p;
      let err = '', fail = '';
      p.stdout.on('data', b => { for (const l of String(b).split(/\r?\n/)) { const m = l.match(/^PAGE (\d+)/); if (m) onPage(+m[1]); const e = l.match(/^ERR (.+)/); if (e) fail = e[1].trim(); } });
      p.stderr.on('data', b => err += b);
      const t = setTimeout(() => { try { p.kill(); } catch {} }, 15 * 60 * 1000);
      p.on('error', e => { clearTimeout(t); reject(e); });
      p.on('close', code => {
        clearTimeout(t);
        if (CUR && CUR.cancelled) return reject(new Error('annulé'));
        if (code === 0) return resolve();
        const raw = err.split(/\r?\n/).map(s => s.trim()).filter(Boolean).find(s => !/^(At |Au caractère|\+|CategoryInfo|FullyQualifiedErrorId|~)/.test(s));
        reject(new Error((fail || (raw ? raw.replace(/^.*?:\s*(?=[A-ZÉ])/, '') : '') || 'Numérisation impossible').slice(0, 200)));
      });
    });
    return fs.readdirSync(out).filter(f => /\.jpg$/.test(f)).sort().map(f => ({ type: 'jpeg', data: new Uint8Array(fs.readFileSync(path.join(out, f))), dpi: o.dpi }));
  } finally { fs.rm(out, { recursive: true, force: true }, () => {}); }
}

async function scan(id, o, onPage){
  const d = DEV.get(id); if (!d) throw new Error('Appareil introuvable : actualise la liste');
  if (CUR) throw new Error('Une numérisation est déjà en cours');
  o = { dpi: 300, color: 'color', source: 'platen', paper: 'A4', ...(o || {}) };
  o.dpi = Math.max(75, Math.min(1200, parseInt(o.dpi) || 300));
  CUR = { cancelled: false };
  try { return d.kind === 'wia' ? await scanWia(d, o, onPage) : await scanEscl(d, o, onPage); }
  finally { CUR = null; }
}
function cancel(){
  if (!CUR) return false;
  CUR.cancelled = true;
  if (CUR.proc) try { CUR.proc.kill(); } catch {}
  if (CUR.job) req(CUR.job, { method: 'DELETE', timeout: 5000 }).catch(() => {});
  return true;
}

module.exports = { initManual, list, info, probe, scan, cancel, parseCaps, _dev: DEV,
  forget: addr => { manual = manual.filter(a => a !== addr); saveManual(); } };
