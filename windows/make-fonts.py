import os
H=os.path.dirname(os.path.abspath(__file__))
import os,re,shutil
base=os.path.join(H,'node_modules','@fontsource')+os.sep
special={'inter':['400','500','600','700'],'caveat':['500','700'],'dancing-script':['600']}
fams=['inter','caveat','jetbrains-mono','merriweather','arimo','tinos','cousine','lato','roboto','open-sans','montserrat','eb-garamond','dancing-script','great-vibes','allura',
'carlito','caladea','gelasio','poppins','raleway','nunito','nunito-sans','source-sans-3','pt-sans','ubuntu','noto-sans','work-sans','fira-sans','barlow','quicksand','mulish','jost','libre-franklin','dm-sans','ibm-plex-sans',
'libre-baskerville','crimson-text','pt-serif','source-serif-4','noto-serif','playfair-display','bodoni-moda','roboto-slab','ibm-plex-serif','inconsolata','ibm-plex-mono','courier-prime','oswald','anton','comic-neue','kalam','satisfy','pacifico',
'spectral','archivo-narrow','questrial','pt-sans-narrow','roboto-condensed']
out=os.path.join(H,'app','fonts'); shutil.rmtree(out,ignore_errors=True); os.makedirs(out)
css=[];n=0;missing=[]
for f in fams:
  ws=special.get(f,['400','400-italic','700','700-italic']); got=0
  for w in ws:
    fp=base+f+'/'+w+'.css'
    if not os.path.exists(fp): continue
    got+=1; txt=open(fp).read()
    for name,blk in re.findall(r'/\*\s*([^*]+?)\s*\*/\s*(@font-face\s*\{[^}]*\})',txt):
      if not re.search(r'-(latin|latin-ext)-\d',name): continue
      blk=re.sub(r",\s*url\(\./files/[^)]+\.woff\) format\('woff'\)","",blk)
      for m in re.findall(r"\./files/([^)]+\.woff2)",blk): shutil.copy(base+f+'/files/'+m,out+'/'+m); n+=1
      css.append(blk.replace('./files/','fonts/'))
  if not got: missing.append(f)
open(os.path.join(H,'app','fonts.css'),'w', encoding='utf-8').write('\n'.join(css))
print('woff2',n,'missing',missing)
