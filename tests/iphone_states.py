import base64, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
WWW='/home/claude/pyramid/mobile/www'; OUT='/tmp/ip2'
import os; os.makedirs(OUT,exist_ok=True)
src=open('/home/claude/pyramid/tests/mobile.py').read()
MOCK=src[src.index('MOCK = """')+10:src.index('"""\nres = {}')]
srv=subprocess.Popen([sys.executable,'-m','http.server','8768','-d',WWW],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
pdf64=base64.b64encode(open('/tmp/t/docs/paie.pdf','rb').read()).decode()
sizes=sys.argv[1].split(',') if len(sys.argv)>1 else ['m','l','xl']
doc=sys.argv[2] if len(sys.argv)>2 else 'multi.pdf'
CHK="""(()=>{const out=[];const vw=innerWidth,vh=innerHeight;
 const h=document.querySelector('header').getBoundingClientRect();
 const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 // boutons d'en-tête sur une seule ligne
 const hb=[...document.querySelectorAll('header > button, header > .logo')].filter(vis).map(e=>e.getBoundingClientRect());
 const tops=[...new Set(hb.map(r=>Math.round((r.top+r.bottom)/2/8)))]; if(tops.length>1) out.push('en-tête sur '+tops.length+' lignes');
 hb.forEach(r=>{if(r.right>vw+1) out.push('bouton d’en-tête coupé à droite')});
 const m=document.querySelector(document.documentElement.classList.contains('has-tabs')?'main':'#empty').getBoundingClientRect();
 if(m.top < h.bottom-1) out.push('contenu sous l’en-tête ('+Math.round(m.top)+' < '+Math.round(h.bottom)+')');
 // barres flottantes : rien de coupé
 ['#rbar','#tools','#pagebar','#props'].forEach(sel=>{const e=document.querySelector(sel); if(!e||!vis(e))return; const r=e.getBoundingClientRect();
   if(r.left<-1||r.right>vw+1) out.push(sel+' dépasse de l’écran');
   if(e.scrollWidth>e.clientWidth+2) out.push(sel+' doit défiler ('+e.scrollWidth+'>'+e.clientWidth+')');
   [...e.querySelectorAll('button')].filter(vis).forEach(b=>{const q=b.getBoundingClientRect(); if(q.right>r.right+1||q.left<r.left-1) out.push(sel+' : bouton caché '+(b.id||b.title))});});
 if(document.documentElement.scrollWidth>vw+1) out.push('la page déborde en largeur');
 return out;})()"""
with sync_playwright() as p:
    for sz in sizes:
        br=p.webkit.launch(); ctx=br.new_context(**{**p.devices['iPhone 15'],'viewport':{'width':393,'height':852}}); pg=ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.add_init_script(MOCK % (pdf64,'ios'))
        pg.add_init_script("localStorage.setItem('pyramid-settings', JSON.stringify({icons:'%s'})); document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style'); s.textContent=':root{--sat:59px!important;--sab:34px!important}'; document.head.appendChild(s);});" % sz)
        pg.goto('http://127.0.0.1:8768/index.html'); pg.wait_for_timeout(1500)
        shots=[]
        def snap(name):
            pg.wait_for_timeout(500); f=f'{OUT}/{sz}-{name}.png'; pg.screenshot(path=f); shots.append(f)
            pr=pg.evaluate(CHK); print(sz, name, '✅' if not pr else '❌ '+' | '.join(pr))
        snap('1accueil')
        pg.set_input_files('#fOpen','/tmp/t/docs/'+doc); pg.wait_for_timeout(3000); snap('2lecture')
        close="(()=>{document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); const m=document.querySelector('.menu'); if(m) m.remove();})()"
        pg.tap('#rMore'); snap('3menu-plus'); pg.evaluate(close); pg.wait_for_timeout(300)
        pg.tap('#rNum'); pg.wait_for_timeout(600); snap('3b-miniatures'); pg.tap('#rNum'); pg.wait_for_timeout(400)
        pg.tap('#editBtn'); pg.wait_for_timeout(4500); snap('4modifier')
        pg.tap('#drawBtn'); snap('4b-dessin'); pg.evaluate(close); pg.wait_for_timeout(300)
        pg.tap('#pMore'); snap('4c-page'); pg.evaluate(close); pg.wait_for_timeout(300)
        pg.tap('#mMore'); snap('4d-plus'); pg.evaluate(close); pg.wait_for_timeout(300)
        wr=pg.evaluate("(()=>{const b=document.querySelector('#pageWrap').getBoundingClientRect();return [b.left,b.top,b.width,b.height]})()")
        for fy in [0.06,0.09,0.12,0.15,0.2]:
            pg.touchscreen.tap(wr[0]+wr[2]*0.3, wr[1]+wr[3]*fy); pg.wait_for_timeout(700)
            if pg.evaluate("getComputedStyle(document.querySelector('#ta')).display!=='none'"): break
        snap('5texte')
        pg.tap('#doneBtn'); pg.wait_for_timeout(800)
        pg.tap('#mMore'); pg.wait_for_timeout(300); pg.locator('.menu button', has_text='Personnaliser').tap(); snap('6reglages'); pg.evaluate("(()=>{const r=document.querySelector('#modalRoot').firstElementChild; if(r){r.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); r.dispatchEvent(new MouseEvent('click',{bubbles:true}));}})()"); pg.wait_for_timeout(500); print('modale fermée', pg.evaluate("document.querySelector('#modalRoot').children.length===0"))
        pg.evaluate("document.querySelector('#modalRoot').innerHTML=''"); pg.tap('#exportBtn'); pg.wait_for_timeout(800); snap('8exporter')
        print(sz,'erreurs',errs[:3])
        from PIL import Image
        ims=[Image.open(f).resize((393,852)) for f in shots]
        sh=Image.new('RGB',(403*len(ims),852),'white')
        for k,i in enumerate(ims): sh.paste(i,(k*403,0))
        sh.save(f'{OUT}/sheet-{sz}.png')
        br.close()
srv.kill()
