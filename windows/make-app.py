import os
H=os.path.dirname(os.path.abspath(__file__))
s=open(os.path.join(H,'..','web','index.html'), encoding='utf-8').read()
def R(o,n):
    global s
    assert s.count(o)==1,o[:60]; s=s.replace(o,n)
import re
s=re.sub(r'<link rel="preconnect"[^>]*>\n','',s)
first=s.index('<link href="https://fonts.googleapis.com')
s=re.sub(r'<link href="https://fonts.googleapis.com[^>]*>\n?','',s)
s=s[:first]+'@@FONTS@@\n'+s[first:]
s=s.replace('@@FONTS@@','<meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; font-src \'self\' data: blob:; worker-src \'self\' blob:">\n<link rel="stylesheet" href="fonts.css">')
for f in ['pdf.js/3.11.174/pdf.min.js','pdf-lib/1.17.1/pdf-lib.min.js','forge/1.3.1/forge.min.js']:
    R('src="https://cdnjs.cloudflare.com/ajax/libs/'+f+'"','src="lib/'+f.split('/')[-1]+'"')
R("pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';","pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';")
assert 'fonts.googleapis' not in s and 'src="https://cdnjs' not in s
open(os.path.join(H,'app','index.html'),'w', encoding='utf-8').write(s); print('app html ok')
