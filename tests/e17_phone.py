# Partie « téléphone » du test e17 : ouvre la page du QR code, photographie (galerie), ajuste, envoie
import sys, json
from playwright.sync_api import sync_playwright
url, eng, photo = sys.argv[1], sys.argv[2], sys.argv[3]
out = {}
with sync_playwright() as p:
    if eng == 'webkit':
        br = p.webkit.launch(); ctx = br.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=3, is_mobile=True, has_touch=True)
    else:
        br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 412, 'height': 860}, device_scale_factor=2.6, is_mobile=True, has_touch=True)
    ph = ctx.new_page(); errs = []; ph.on('pageerror', lambda e: errs.append(str(e)))
    ph.goto(url); ph.wait_for_timeout(700)
    out['pc'] = ph.text_content('#pcname')
    ph.set_input_files('#fGal', [photo, photo]); ph.wait_for_selector('#edit.on'); ph.wait_for_timeout(500)
    out['coins'] = ph.evaluate("[...document.querySelectorAll('.h')].map(h => [Math.round(parseFloat(h.style.left)), Math.round(parseFloat(h.style.top))])")
    ph.screenshot(path=f'/tmp/sc/{eng}-edition.png')
    ph.tap('#keep'); ph.wait_for_timeout(2500); ph.wait_for_selector('#edit.on')
    ph.tap('[data-f="color"]'); ph.tap('#rot'); ph.wait_for_timeout(300); ph.tap('#keep')
    ph.wait_for_function("document.querySelectorAll('.pg').length === 2", timeout=30000)
    ph.screenshot(path=f'/tmp/sc/{eng}-pages.png')
    ph.tap('#send')
    ph.wait_for_function("/reçue/.test(document.querySelector('#state').textContent)", timeout=30000)
    out['etat'] = ph.text_content('#state'); out['erreurs'] = errs
    br.close()
print(json.dumps(out, ensure_ascii=False))
