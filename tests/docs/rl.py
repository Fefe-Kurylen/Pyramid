from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('DejaVu','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuB','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
c=canvas.Canvas('rl.pdf',pagesize=(595,842))
c.setFillColorRGB(.12,.16,.3); c.rect(0,742,595,100,fill=1,stroke=0)
c.setFillColorRGB(1,1,1); c.setFont('DejaVuB',22); c.drawString(40,785,'Rapport annuel 2026')
c.setFillColorRGB(0,0,0); c.setFont('DejaVu',12)
t=c.beginText(40,700); t.setFont('DejaVu',12); t.textOut('Nom : '); t.setFont('DejaVuB',12); t.textOut('Félix Bois'); t.setFont('DejaVu',12); t.textOut(' — technicien'); c.drawText(t)
t=c.beginText(40,670); t.setCharSpace(2); t.setFont('DejaVu',10); t.textOut('Texte espacé lettre par lettre'); c.drawText(t)
c.setFont('Helvetica',8); c.drawString(40,640,'Petit texte de 8 points en Helvetica non intégrée')
c.saveState(); c.translate(300,400); c.rotate(30); c.setFont('DejaVu',16); c.drawString(0,0,'Texte incliné à 30 degrés'); c.restoreState()
c.showPage()
c.setPageRotation(90); c.setFont('Times-Bold',18); c.drawString(40,780,'Page pivotée : titre en Times gras'); c.setFont('DejaVu',12); c.drawString(40,750,'Deuxième ligne sur page pivotée'); c.showPage()
c.save()
