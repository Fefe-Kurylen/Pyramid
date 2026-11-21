# Gestes tactiles sur téléphone (iPhone WebKit + Android Chromium) : toucher une ligne, glisser = défiler, deux doigts = zoom
import base64, subprocess, sys, time
from playwright.sync_api import sync_playwright
WWW = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/pyramid/mobile/www'
import os
DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'docs'); OUT = '/tmp/mt'
import os; os.makedirs(OUT, exist_ok=True)
src = open(os.path.join(os.path.dirname(__file__), 'mobile.py')).read()
MOCK = src[src.index('MOCK = """') + 10:src.index('"""\nres = {}')]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '-d', WWW], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
pdf64 = base64.b64encode(open(f'{DOCS}/paie.pdf', 'rb').read()).decode()
PTR = """([type, id, x, y]) => { const ov = document.querySelector('#ov');
  const el = type === 'pointerdown' ? (document.elementFromPoint(x, y) || ov) : ov;
  el.dispatchEvent(new PointerEvent(type, { pointerId:id, pointerType:'touch', isPrimary:id===1, clientX:x, clientY:y, bubbles:true, cancelable:true, button:0, buttons:type==='pointerup'?0:1 })); }"""
fails = 0
def check(name, ok, info=''):
    global fails
    fails += not ok; print(('✅' if ok else '❌'), cur, name, info)
with sync_playwright() as p:
    for cur, bt, dev, plat in [('iPhone', p.webkit, 'iPhone 15', 'ios'), ('Android', p.chromium, 'Pixel 7', 'android')]:
        br = bt.launch(); d = p.devices[dev]; ctx = br.new_context(**{**d, 'viewport': {'width': d['viewport']['width'], 'height': 852 if plat == 'ios' else 915}}); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(MOCK % (pdf64, plat)); pg.goto('http://127.0.0.1:8767/index.html'); pg.wait_for_timeout(1500)
        E = pg.evaluate
        sz = E("(() => { const b = document.querySelector('#openBig').getBoundingClientRect(), h = document.querySelector('#openBtn').getBoundingClientRect(); return [Math.round(b.height), Math.round(h.width), parseFloat(getComputedStyle(document.querySelector('.drop h1')).fontSize)]; })()")
        check('interface agrandie (bouton Ouvrir ≥ 50 px, icônes ≥ 42 px, titre ≥ 28 px)', sz[0] >= 50 and sz[1] >= 42 and sz[2] >= 28, sz)
        pg.set_input_files('#fOpen', f'{DOCS}/lettre.pdf'); pg.wait_for_timeout(2500)
        # lecteur : pincer pour zoomer (événements tactiles)
        z0 = E("document.querySelector('#rzLbl').textContent")
        ok = E("""(() => { const r = document.querySelector('#reader'), b = r.getBoundingClientRect(), cx = b.left + b.width/2, cy = b.top + 200;
          const mk = (x1, x2, type) => { const T = [new Touch({ identifier:1, target:r, clientX:x1, clientY:cy }), new Touch({ identifier:2, target:r, clientX:x2, clientY:cy })];
            r.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : T, targetTouches: T, changedTouches: T, bubbles:true, cancelable:true })); };
          try { mk(cx-40, cx+40, 'touchstart'); mk(cx-70, cx+70, 'touchmove'); mk(cx-80, cx+80, 'touchmove'); mk(cx-80, cx+80, 'touchend'); return true; } catch (e) { return String(e); } })()""")
        pg.wait_for_timeout(600)
        z1 = E("document.querySelector('#rzLbl').textContent")
        if ok is True: check('lecteur : deux doigts = zoom', int(z1.split()[0]) > int(z0.split()[0]) * 1.5, f'{z0} → {z1}')
        else: print('ℹ️', cur, 'événements tactiles indisponibles dans ce navigateur de test :', ok)
        pg.screenshot(path=f'{OUT}/{plat}-pincer-lecture.png')
        pg.tap('#editBtn'); pg.wait_for_timeout(4500)
        wr = E("(() => { const b = document.querySelector('#pageWrap').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        # deux doigts = zoom de la page
        E("document.querySelector('#stage').scrollTop = 0"); pg.wait_for_timeout(200)
        wr = E("(() => { const b = document.querySelector('#pageWrap').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        cx, cy = wr[0] + wr[2]/2, wr[1] + 200
        z0e = E("document.querySelector('#zLbl').textContent")
        E(PTR, ['pointerdown', 1, cx - 40, cy]); E(PTR, ['pointerdown', 2, cx + 40, cy])
        for k in range(1, 5): E(PTR, ['pointermove', 1, cx - 40 - k*15, cy]); E(PTR, ['pointermove', 2, cx + 40 + k*15, cy])
        E(PTR, ['pointerup', 2, cx + 100, cy]); E(PTR, ['pointerup', 1, cx - 100, cy]); pg.wait_for_timeout(800)
        z2 = E("document.querySelector('#zLbl').textContent")
        check('mode Modifier : deux doigts = zoom', int(z2.split()[0]) > int(z0e.split()[0]) * 1.8, f'{z0e} → {z2}')
        check('pas de trait ni d’annotation créés par le zoom', E("!document.querySelector('#ta') || document.querySelector('#ta').style.display !== 'block'"))
        st0 = E("[document.querySelector('#stage').scrollTop, document.querySelector('#zLbl').textContent]")
        # glisser un doigt sur le texte = défiler, rien ne bouge ni ne s'ouvre
        wr = E("(() => { const b = document.querySelector('#pageWrap').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        x, y = 160, 300
        E(PTR, ['pointerdown', 1, x, y + 150]); 
        for k in range(1, 6): E(PTR, ['pointermove', 1, x, y + 150 - k*30])
        E(PTR, ['pointerup', 1, x, y]); pg.wait_for_timeout(400)
        st1 = E("[document.querySelector('#stage').scrollTop, document.querySelector('#ta').style.display, (window.__pyrAnn = 0)]")
        check('mode Modifier : glisser le doigt fait défiler', st1[0] > st0[0] + 30 and st1[1] in ('', 'none'), f'scroll {st0[0]} → {st1[0]}, zone de texte : {st1[1] or "fermée"}')
        E("setTimeout(()=>{},0)"); pg.tap('#pMore'); pg.wait_for_timeout(300); pg.locator('.menu button', has_text='Ajuster').tap(); pg.wait_for_timeout(1200)
        # toucher une ligne = la modifier
        wr = E("(() => { const b = document.querySelector('#pageWrap').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
        hit = None
        for fy in [0.08, 0.1, 0.12, 0.15, 0.18, 0.2, 0.25, 0.3]:
            x, y = wr[0] + wr[2]*0.3, wr[1] + wr[3]*fy
            E(PTR, ['pointerdown', 1, x, y]); E(PTR, ['pointerup', 1, x, y]); pg.wait_for_timeout(700)
            if E("document.querySelector('#ta').style.display === 'block' || getComputedStyle(document.querySelector('#ta')).display === 'block'"): hit = fy; break
        check('toucher une ligne ouvre la modification', hit is not None, f'à {hit}')
        pg.screenshot(path=f'{OUT}/{plat}-toucher-ligne.png')
        # scanner avec l'appareil photo : la photo devient un nouveau document « Scan … »
        n0 = E("document.querySelectorAll('#tabs .tab').length")
        pg.set_input_files('#fCam', f'{DOCS}/scan-ocr.jpg'); pg.wait_for_timeout(2500)
        tabs = E("[...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim())")
        check('Scanner (appareil photo) ouvre un document « Scan … »', len(tabs) == n0 + 1 and tabs[-1].startswith('Scan '), tabs[-1:])
        check('bouton Scanner visible en haut', E("document.querySelector('#camBtn').getBoundingClientRect().width > 30"))
        # ce qui sert le plus reste visible : après 4 recherches, « Rechercher » prend la place de « Signer »
        v0 = E("['#rPrint','#rSign','#rFind'].filter(k => document.querySelector(k).classList.contains('m-vis'))")
        E("for (let i = 0; i < 4; i++){ document.querySelector('#rFind').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); }")
        v1 = E("['#rPrint','#rSign','#rFind'].filter(k => document.querySelector(k).classList.contains('m-vis'))")
        check('boutons visibles selon l’usage', v0 == ['#rPrint', '#rSign'] and '#rFind' in v1 and len(v1) == 2, f'{v0} → {v1}')
        check('aucune erreur', not errs, errs[:2])
        br.close()
srv.kill()
print('ÉCHECS :', fails); sys.exit(1 if fails else 0)
