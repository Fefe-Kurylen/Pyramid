# Téléphone : numériser depuis une imprimante du Wi-Fi (AirScan / eSCL) — faux scanner tests/fake-escl.js,
# module natif simulé (scanBrowse = Bonjour, httpReq = vraie requête HTTP vers le faux scanner). iPhone (WebKit) + Android (Chromium)
import base64, subprocess, sys, time, json, urllib.request, urllib.error, os
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WWW=ROOT+'/mobile/www'
src=open(ROOT+'/tests/mobile.py').read()
MOCK=src[src.index('MOCK = """')+10:src.index('"""\nres = {}')]
srv=subprocess.Popen([sys.executable,'-m','http.server','8771','-d',WWW],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
fake=subprocess.Popen(['node','-e',"require('%s/tests/fake-escl.js')({port:18085,mdns:false}).then(()=>console.log('ok'))"%ROOT],stdout=subprocess.PIPE)
fake.stdout.readline(); time.sleep(.5)
pdf64=base64.b64encode(open(ROOT+'/tests/docs/paie.pdf','rb').read()).decode()
EXTRA="""
window.Capacitor.Plugins.PyramidNative.scanBrowse = async o => ({ services: [{ name: 'MFP', host: '127.0.0.1', port: 18085, secure: false, txt: { rs: 'eSCL', ty: 'Imprimante Test MFP', uuid: 'u1' } }] });
window.Capacitor.Plugins.PyramidNative.httpReq = async o => JSON.parse(await window.__http(JSON.stringify(o)));
"""
def http(s):
    o=json.loads(s); body=base64.b64decode(o['body']) if o.get('body') else None
    r=urllib.request.Request(o['url'],data=body,method=o['method'],headers={'Content-Type':'text/xml'} if body else {})
    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**k): return None
    op=urllib.request.build_opener(NR)
    try: resp=op.open(r,timeout=o['timeout']/1000); st=resp.status; h=resp.headers; d=resp.read()
    except urllib.error.HTTPError as e: st=e.code; h=e.headers; d=e.read()
    return json.dumps({'status':st,'location':h.get('Location') or '','type':h.get('Content-Type') or '','data':base64.b64encode(d).decode()})
def waitjs(pg,expr,timeout=20000):
    t=time.time()
    while time.time()-t<timeout/1000:
        if pg.evaluate(expr): return True
        pg.wait_for_timeout(200)
    raise TimeoutError(expr)
ok=True
with sync_playwright() as p:
  for eng,plat,dev in [('webkit','ios','iPhone 15'),('chromium','android','Pixel 7')]:
    br=getattr(p,eng).launch(); ctx=br.new_context(**p.devices[dev]); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.expose_function('__http',http)
    pg.add_init_script(MOCK % (pdf64,plat)); pg.add_init_script(EXTRA)
    pg.goto('http://127.0.0.1:8771/index.html'); pg.wait_for_timeout(1500)
    # accueil : ⋯ 🖨️ 📷 ➕ alignés à droite, plus de boutons de scan au centre
    hd=pg.evaluate("""(()=>{const ids=['mMore','dscanBtn','camBtn','openBtn'];const r=ids.map(i=>document.getElementById(i).getBoundingClientRect());
      return {vis:r.map(x=>x.width>0),order:r.every((x,i)=>!i||x.left>r[i-1].left),right:Math.round(innerWidth-r[3].right),
              centre:document.querySelectorAll('#empty .drop button').length}})()""")
    t1=all(hd['vis']) and hd['order'] and hd['right']<16 and hd['centre']==1
    pg.click('#dscanBtn'); pg.wait_for_selector('[data-dev] option[value^="escl:"]',state='attached',timeout=15000); pg.wait_for_timeout(800)
    name=pg.eval_on_selector('[data-dev]','s=>s.selectedOptions[0].textContent')
    pg.click('[data-scan]'); waitjs(pg,"!document.querySelector('[data-ok]').disabled")
    pg.click('[data-ok]'); waitjs(pg,"document.documentElement.classList.contains('has-tabs')"); pg.wait_for_timeout(1500)
    tab=pg.evaluate("document.querySelector('.tab.on, .tab.active, .tab')?.textContent.trim()")
    t2='Imprimante Test MFP' in name and tab.startswith('Numérisation')
    # document ouvert : 🖨️ caché dans l'en-tête, proposé dans le menu 📷
    pg.click('#camBtn'); pg.wait_for_timeout(400)
    menu=pg.evaluate("[...document.querySelectorAll('.menu button')].map(b=>b.textContent.trim())")
    t3=any('imprimante' in m for m in menu) and pg.evaluate("document.getElementById('dscanBtn').getBoundingClientRect().width")==0
    print(plat,'accueil',('✅' if t1 else '❌ '+str(hd)),'| numérisation',('✅ '+name.strip()+' → '+tab if t2 else '❌ '+name+' '+str(tab)),'| menu 📷',('✅' if t3 else '❌ '+str(menu)),'| erreurs',errs or 'aucune')
    ok&=t1 and t2 and t3 and not errs
    br.close()
srv.kill(); fake.kill()
print('RÉSULTAT', '✅' if ok else '❌')
