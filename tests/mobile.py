# Tests de l'appli mobile (www) en écran de téléphone : Chromium (Android) et WebKit (iPhone), avec un faux Capacitor
import base64, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright
WWW = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/pdfmobile/www'
DOCS = '/tmp/t/docs'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', WWW], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
pdf64 = base64.b64encode(open(f'{DOCS}/paie.pdf', 'rb').read()).decode()
MOCK = """
window.__calls = []; window.__pdfB64 = '%s';
window.Capacitor = { isNativePlatform: () => true, getPlatform: () => '%s', Plugins: {
  Filesystem: { writeFile: async o => { __calls.push(['writeFile', o.path, o.data.length, o.directory]); return { uri: 'file:///cache/' + o.path }; } },
  Share: { share: async o => { __calls.push(['share', o.files]); } },
  App: { addListener: (e, cb) => { window.__appCb = cb; return { remove(){} }; }, getLaunchUrl: async () => null, getInfo: async () => ({ version: '1.3.0' }) },
  PyramidNative: { addListener: (e, cb) => { if (e === 'subChange') window.__subCb = cb; else window.__openCb = cb; return { remove(){} }; },
    printPdf: async o => { __calls.push(['printPdf', o.data.length, o.name]); },
    tsa: async o => { __calls.push(['tsa', o.url]); throw new Error('hors ligne'); },
    readUri: async o => { __calls.push(['readUri', o.url]); return { name: 'ouvert.pdf', data: window.__pdfB64 }; },
    subStatus: async () => window.__sub,
    subBuy: async () => { __calls.push(['subBuy']); window.__sub = { ...window.__sub, active: true, trial: true, expires: Date.now() + 14*864e5 }; return window.__sub; },
    subRestore: async () => window.__sub,
    subManage: async () => window.__sub } } };
window.__sub = { active: true, trial: true, loaded: true, price: '0,99 €', eligibleTrial: false, trialDays: 14, expires: Date.now() + 10*864e5 };
"""
res = {}
def check(name, ok, info=''):
    res.setdefault(cur, []).append((name, bool(ok), info)); print(('✅' if ok else '❌'), cur, name, info)
with sync_playwright() as p:
    for cur, btype, dev, plat in [('Android', p.chromium, 'Pixel 7', 'android'), ('iPhone', p.webkit, 'iPhone 15', 'ios')]:
        br = btype.launch(); ctx = br.new_context(**p.devices[dev]); pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.add_init_script(MOCK % (pdf64, plat))
        pg.goto('http://127.0.0.1:8765/index.html'); pg.wait_for_timeout(1500)
        E = pg.evaluate
        check('pont natif chargé', E("!!window.native && window.native.platform") == plat)
        if True:   # abonnement sur les deux téléphones (App Store / Google Play)
            check('abonnement actif : appli accessible', E("!document.querySelector('#paywall').classList.contains('on') && !!window.native.sub"))
            E("window.__sub = { active: false, loaded: true, price: '0,99 €', eligibleTrial: true, trialDays: 14 }; window.__subCb(window.__sub)"); pg.wait_for_timeout(400)
            check('sans abonnement : écran d’abonnement', E("document.querySelector('#paywall').classList.contains('on')"), E("document.querySelector('[data-pw-head]').textContent + ' / ' + document.querySelector('[data-pw-buy]').textContent"))
            vis_pw = E("(() => { const r = document.querySelector('[data-pw-restore]').getBoundingClientRect(); return r.bottom <= innerHeight + 1 || document.querySelector('#paywall').scrollHeight > innerHeight; })()")
            check('écran d’abonnement lisible', vis_pw)
            store = 'Google Play' if plat == 'android' else 'Apple'
            check('textes légaux adaptés au magasin', E(f"document.querySelector('[data-pw-legal]').textContent.includes('compte {store}')"), E("document.querySelector('[data-pw-legal]').textContent.slice(0, 160)"))
            check('prix 0,99 € et 14 jours', E("/0,99 €/.test(document.querySelector('[data-pw-price]').textContent) && /14 jours gratuits/.test(document.querySelector('[data-pw-head]').textContent)"))
            pg.screenshot(path=f'/tmp/mt/{plat}-abonnement.png')
            pg.tap('[data-pw-buy]'); pg.wait_for_timeout(500)
            check('essai démarré → appli accessible', E("!document.querySelector('#paywall').classList.contains('on') && __calls.some(c => c[0] === 'subBuy')"))
            check('cœur « Soutenir » masqué sur téléphone', E("getComputedStyle(document.querySelector('#heartBtn')).display === 'none'"))
        check('classe mobile', E("document.documentElement.classList.contains('mobile') && !document.documentElement.classList.contains('desk')"))
        pg.screenshot(path=f'/tmp/mt/{plat}-0-accueil.png')
        pg.set_input_files('#fOpen', f'{DOCS}/multi.pdf'); pg.wait_for_timeout(2500)
        check('PDF ouvert en lecture', E("document.documentElement.classList.contains('reading') && document.querySelectorAll('.rpage').length") == 5)
        check('pas de débordement horizontal', E("document.documentElement.scrollWidth <= innerWidth + 1"), E("[document.documentElement.scrollWidth, innerWidth]"))
        vis = E("""(() => { const ids = ['rPrev','rNext','rzIn','rFind','rPrint','rSign','editBtn']; return ids.filter(i => { const b = document.getElementById(i).getBoundingClientRect(); return !(b.width > 0 && b.right <= innerWidth + 1 && b.left >= -1 && b.bottom <= innerHeight + 1); }); })()""")
        check('barre de lecture visible en entier', not vis, vis)
        pg.screenshot(path=f'/tmp/mt/{plat}-1-lecture.png')
        # impression
        pg.tap('#rPrint'); pg.wait_for_timeout(2500)
        c = E("__calls.filter(x => x[0] === 'printPdf')")
        check('impression → fenêtre du système', c and c[0][1] > 1000, c[:1])
        # signature en lecture
        pg.tap('#rSign'); pg.wait_for_timeout(800)
        b = E("(() => { const r = document.querySelector('#sigPad').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        pg.mouse.move(b[0]+20, b[1]+b[3]/2); pg.mouse.down(); pg.mouse.move(b[0]+b[2]/2, b[1]+15, steps=5); pg.mouse.move(b[0]+b[2]-20, b[1]+b[3]-15, steps=5); pg.mouse.up()
        pg.click('[data-ok]'); pg.wait_for_timeout(500)
        r = E("(() => { const r = document.querySelectorAll('.rpage')[0].getBoundingClientRect(); return [r.left + r.width*0.6, Math.max(r.top + 120, 150)]; })()")
        pg.mouse.click(r[0], r[1]); pg.wait_for_timeout(1000)
        check('signature posée en lecture', E("!document.documentElement.classList.contains('placing') && document.documentElement.classList.contains('reading')"))
        # mode Modifier + modification d'un texte
        pg.tap('#editBtn'); pg.wait_for_timeout(2500)
        check('mode Modifier', E("!document.documentElement.classList.contains('reading')"))
        vis2 = E("""(() => { const t = document.getElementById('tools').getBoundingClientRect(); return [Math.round(t.left), Math.round(t.right), innerWidth]; })()""")
        check('outils visibles', vis2[0] >= -1 and vis2[1] <= vis2[2] + 1, vis2)
        pg.screenshot(path=f'/tmp/mt/{plat}-2-modifier.png')
        hdr = E("(() => { const bs = [...document.querySelectorAll('header > button, header > .logo')].filter(b => b.offsetWidth); const cs = bs.map(b => { const r = b.getBoundingClientRect(); return r.top + r.height/2; }); const tops = new Set(cs.map(c => Math.abs(c - cs[0]) < 4 ? 0 : Math.round(c))); return [tops.size, bs.filter(b => b.getBoundingClientRect().right > innerWidth + 1).map(b => b.id)]; })()")
        check('boutons de l’en-tête sur une ligne', hdr[0] == 1 and not hdr[1], hdr)
        # toucher une ligne de texte → modification
        xy = E("(async () => { await new Promise(r => setTimeout(r, 300)); const P = window; return null; })()")
        line = E("""(() => { const ov = document.querySelector('#ov').getBoundingClientRect(); return [ov.left + ov.width*0.2, ov.top + ov.height*0.06]; })()""")
        pg.mouse.click(line[0], line[1]); pg.wait_for_timeout(2500)
        check('toucher un texte ouvre la modification', E("(() => { const t = document.querySelector('#ta'); return t && t.style.display !== 'none'; })()"))
        pg.keyboard.press('End'); pg.keyboard.type(' OK'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'/tmp/mt/{plat}-2b-texte.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.evaluate("document.querySelector('#rail') && 0")
        # export → partage
        pg.tap('#exportBtn'); pg.wait_for_timeout(700)
        pg.screenshot(path=f'/tmp/mt/{plat}-3-export.png')
        pg.click('.modal [data-ok]'); pg.wait_for_timeout(4000)
        c = E("__calls.filter(x => x[0] === 'writeFile' || x[0] === 'share')")
        check('export → fichier + feuille de partage', len(c) >= 2 and c[0][2] > 1000, c)
        # ouverture d'un fichier « Ouvrir avec »
        if plat == 'android': E("window.__openCb({ url: 'content://com.android.providers/documents/42' })")
        else: E("window.__appCb({ url: 'file:///private/var/mobile/Inbox/facture.pdf' })")
        pg.wait_for_timeout(2500)
        check('« Ouvrir avec » ouvre un nouvel onglet', E("document.querySelectorAll('.tab').length") == 2, E("[...document.querySelectorAll('.tab .t')].map(t => t.textContent)"))
        # réglages
        pg.tap('#setBtn'); pg.wait_for_timeout(600)
        check('réglages : version affichée', 'version 1.3.0' in (E("document.querySelector('[data-uver]')?.textContent || ''")))
        check('réglages tiennent à l’écran', E("(() => { const c = document.querySelector('.modal .card').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth + 1; })()"))
        pg.screenshot(path=f'/tmp/mt/{plat}-4-reglages.png')
        check('aucune erreur JavaScript', not errs, errs[:3])
        br.close()
srv.terminate()
tot = sum(len(v) for v in res.values()); ok = sum(1 for v in res.values() for x in v if x[1])
print(f'\nTOTAL {tot} OK {ok}')
