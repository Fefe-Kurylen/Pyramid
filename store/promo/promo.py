# Images promotionnelles du Microsoft Store : affiche 9:16, image carrée 1:1, image « héros » 16:9 (sans titre)
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os
H = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(H, '..', '..')
ICON = Image.open(os.path.join(R, 'windows/build/icon.png')).convert('RGBA')
CAP = lambda n: Image.open(os.path.join(R, 'store/captures', n)).convert('RGB')
F = lambda w, s: ImageFont.truetype(f'/usr/share/fonts/opentype/inter/{"InterDisplay-" + w if w != "Regular" else "Inter-Regular"}.otf', s)
BG1, BG2, ACC = (24, 26, 32), (44, 34, 30), (200, 112, 63)

def bg(w, h):
    im = Image.new('RGB', (w, h), BG1); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h; d.line([(0, y), (w, y)], fill=tuple(int(BG1[i] + (BG2[i] - BG1[i]) * t) for i in range(3)))
    glow = Image.new('L', (w, h), 0); ImageDraw.Draw(glow).ellipse([w * .45, -h * .25, w * 1.25, h * .55], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) // 6))
    im.paste(Image.new('RGB', (w, h), ACC), (0, 0), glow)
    return im

def shot(im, cap, box, radius=28):
    x, y, w = box
    c = cap.resize((w, int(w * cap.height / cap.width)), Image.LANCZOS)
    sh = Image.new('L', (c.width + 160, c.height + 160), 0)
    ImageDraw.Draw(sh).rounded_rectangle([80, 100, 80 + c.width, 100 + c.height], radius, fill=170)
    sh = sh.filter(ImageFilter.GaussianBlur(40)); im.paste((0, 0, 0), (x - 80, y - 80), sh)
    m = Image.new('L', c.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, c.width - 1, c.height - 1], radius, fill=255)
    im.paste(c, (x, y), m)
    ImageDraw.Draw(im).rounded_rectangle([x, y, x + c.width - 1, y + c.height - 1], radius, outline=(255, 255, 255, 40), width=2)

def icon(im, x, y, s):
    i = ICON.resize((s, s), Image.LANCZOS); m = Image.new('L', (s, s), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, s - 1, s - 1], s // 5, fill=255)
    a = Image.composite(i, Image.new('RGBA', (s, s)), m); im.paste(a, (x, y), a)

def ctext(d, cx, y, txt, font, fill):
    w = d.textlength(txt, font=font); d.text((cx - w / 2, y), txt, font=font, fill=fill)

# 16:9 héros (sans titre)
im = bg(3840, 2160)
shot(im, CAP('1-lecture.png'), (330, 470, 2050))
shot(im, CAP('3-modification-texte.png'), (1480, 260, 2050))
im.save(os.path.join(H, 'heros-16x9.png'), optimize=True)

# 9:16 affiche
im = bg(1440, 2160); d = ImageDraw.Draw(im)
icon(im, 520, 230, 400)
ctext(d, 720, 700, 'Pyramid PDF', F('Bold', 150), (245, 246, 250))
ctext(d, 720, 900, 'Lire · Modifier · Signer', F('Medium', 76), (225, 200, 185))
ctext(d, 720, 1000, 'Scanner · Imprimer', F('Medium', 76), (225, 200, 185))
shot(im, CAP('3-modification-texte.png'), (110, 1300, 1220), 22)
im.save(os.path.join(H, 'affiche-9x16.png'), optimize=True)

# 1:1 carrée
im = bg(2160, 2160); d = ImageDraw.Draw(im)
icon(im, 730, 420, 700)
ctext(d, 1080, 1260, 'Pyramid PDF', F('Bold', 230), (245, 246, 250))
ctext(d, 1080, 1560, 'Lire · Modifier · Signer · Scanner', F('Medium', 96), (225, 200, 185))
im.save(os.path.join(H, 'carree-1x1.png'), optimize=True)
print('ok')
