// Extrait les scripts PowerShell WIA de windows/scanner.js et vérifie leur syntaxe avec Windows PowerShell
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const s = fs.readFileSync(path.join(__dirname, '..', 'windows', 'scanner.js'), 'utf8');
let ok = true;
for (const k of ['WIA_LIST', 'WIA_SCAN']) {
  const m = s.match(new RegExp('const ' + k + ' = `([\\s\\S]*?)`;'));
  const f = path.join(require('os').tmpdir(), k + '.ps1');
  fs.writeFileSync(f, '﻿' + m[1]);
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f}', [ref]$null, [ref]$e); if($e){ $e | % { $_.ToString() } } else { 'OK' }`], { encoding: 'utf8' }).trim();
  console.log(k, out); if (out !== 'OK') ok = false;
}
console.log(ok ? 'SYNTAXE OK' : 'SYNTAXE ERREUR'); process.exit(ok ? 0 : 1);
