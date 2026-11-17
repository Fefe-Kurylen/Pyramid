# Construit www/ (appli iPhone / Android) à partir de l'appli Windows (libs et polices locales)
import os, shutil
H = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('PYRAMID_APP', os.path.join(H, '..', 'windows', 'app'))
WWW = os.path.join(H, 'www')
shutil.rmtree(WWW, ignore_errors=True)
shutil.copytree(SRC, WWW)
p = os.path.join(WWW, 'index.html'); s = open(p, encoding='utf-8').read()
def R(o, n):
    global s
    assert s.count(o) == 1, o[:60]
    s = s.replace(o, n)
R('--sat:env(safe-area-inset-top); --sab:env(safe-area-inset-bottom);',
  '--sat:max(env(safe-area-inset-top), var(--safe-area-inset-top, 0px)); --sab:max(env(safe-area-inset-bottom), var(--safe-area-inset-bottom, 0px));')
R('<script src="lib/pdf.min.js"></script>', '<script src="native-bridge.js"></script>\n<script src="lib/pdf.min.js"></script>')
open(p, 'w', encoding='utf-8').write(s)
shutil.copy(os.path.join(H, 'native-bridge.js'), os.path.join(WWW, 'native-bridge.js'))
print('www ok')
