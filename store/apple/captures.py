# Captures App Store : iPhone 6,9" (1320×2868) et iPad 13" (2064×2752), appli mobile (www) dans WebKit avec un faux Capacitor
import base64, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
H = os.path.dirname(os.path.abspath(__file__))
WWW = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/pdfmobile/www'
DOCS = os.path.join(H, '..', '..', 'tests', 'docs')
OUT = os.path.join(H, 'captures')
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', WWW], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
MOCK = """
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
  Filesystem: { writeFile: async o => ({ uri: 'file:///cache/' + o.path }) }, Share: { share: async () => {} },
  App: { addListener: () => ({ remove(){} }), getLaunchUrl: async () => null, getInfo: async () => ({ version: '1.4.0' }) },
  PyramidNative: { addListener: () => ({ remove(){} }), printPdf: async () => {}, tsa: async () => { throw new Error('x'); }, readUri: async () => ({}),
    subStatus: async () => ({ active: true, trial: true, loaded: true, price: '0,99 €', expires: Date.now() + 12*864e5 }), subBuy: async () => ({}), subRestore: async () => ({}), subManage: async () => ({}) } } };
localStorage.setItem('pyramid-settings', JSON.stringify(%s));
"""
APPAREILS = [('iphone', dict(viewport={'width': 440, 'height': 956}, device_scale_factor=3, is_mobile=True, has_touch=True,
                user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')),
             ('ipad', dict(viewport={'width': 1032, 'height': 1376}, device_scale_factor=2, is_mobile=True, has_touch=True,
                user_agent='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'))]
def session(p, dev, opts, settings='{}'):
    br = p.webkit.launch(); ctx = br.new_context(**opts); pg = ctx.new_page()
    pg.add_init_script(MOCK % settings)
    pg.goto('http://127.0.0.1:8766/index.html'); pg.wait_for_timeout(1500)
    return br, pg
def shot(pg, dev, n, nom):
    pg.wait_for_timeout(600); pg.screenshot(path=f'{OUT}/{dev}-{n}-{nom}.png')
with sync_playwright() as p:
    for dev, opts in APPAREILS:
        br, pg = session(p, dev, opts)
        pg.set_input_files('#fOpen', f'{DOCS}/lettre.pdf'); pg.wait_for_timeout(3000)
        shot(pg, dev, 1, 'lecture')
        pg.tap('#editBtn'); pg.wait_for_timeout(3500)
        shot(pg, dev, 2, 'modifier')
        pg.tap('#rSign') if pg.evaluate("!!document.querySelector('#rSign') && document.querySelector('#rSign').offsetWidth") else None
        br.close()
        # Signature dessinée (mode lecture)
        br, pg = session(p, dev, opts)
        pg.set_input_files('#fOpen', f'{DOCS}/lettre.pdf'); pg.wait_for_timeout(3000)
        pg.tap('#rSign'); pg.wait_for_timeout(800)
        b = pg.evaluate("(() => { const r = document.querySelector('#sigPad').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        x0, y0, w, h = b
        pts = [(0.08, 0.62), (0.18, 0.30), (0.26, 0.70), (0.34, 0.35), (0.42, 0.65), (0.52, 0.40), (0.60, 0.62), (0.70, 0.30), (0.80, 0.58), (0.92, 0.45)]
        pg.mouse.move(x0 + w * pts[0][0], y0 + h * pts[0][1]); pg.mouse.down()
        for px, py in pts[1:]: pg.mouse.move(x0 + w * px, y0 + h * py, steps=6)
        pg.mouse.up()
        shot(pg, dev, 3, 'signature')
        br.close()
        # Réglages
        br, pg = session(p, dev, opts)
        pg.set_input_files('#fOpen', f'{DOCS}/multi.pdf'); pg.wait_for_timeout(2500)
        pg.tap('#setBtn'); pg.wait_for_timeout(800)
        shot(pg, dev, 4, 'reglages')
        br.close()
        # Thème clair
        br, pg = session(p, dev, opts, '{"theme":"clair","accent":"#3b82f6"}')
        pg.set_input_files('#fOpen', f'{DOCS}/paie.pdf'); pg.wait_for_timeout(3000)
        shot(pg, dev, 5, 'clair')
        br.close()
srv.terminate()
print('captures ok')
