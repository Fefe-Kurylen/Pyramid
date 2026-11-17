from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('Lora','/usr/share/fonts/truetype/google-fonts/Lora-Variable.ttf'))
c=canvas.Canvas('paie.pdf',pagesize=(595,842))
c.setFont('Helvetica-Bold',16); c.drawString(40,790,'BULLETIN DE PAIE - Octobre 2026')
c.setFont('Helvetica',9); c.drawString(40,770,'Employeur : SARL Exemple - SIRET 123 456 789 00012')
c.drawString(40,758,'Salarié : Félix Martin   Emploi : Technicien CND   Coefficient : 250')
c.setFont('Helvetica-Bold',9); c.drawString(40,730,'Rubrique'); c.drawString(300,730,'Base'); c.drawString(400,730,'Taux'); c.drawString(500,730,'Montant')
c.setFont('Helvetica',9)
rows=[('Salaire de base','151,67','16,4900','2 501,04'),('Prime de déplacement','','','320,00'),('CSG déductible','2 760,12','6,8000','-187,69')]
for i,r in enumerate(rows):
  y=714-i*14; c.drawString(40,y,r[0]); c.drawString(300,y,r[1]); c.drawString(400,y,r[2]); c.drawRightString(545,y,r[3])
c.setFont('Times-Roman',11); c.drawString(40,640,'Net à payer avant impôt sur le revenu : 2 633,35 EUR')
c.setFont('Courier',9); c.drawString(40,620,'Réf. paiement : VIR-2026-10-0042')
c.setFont('Lora',12); c.drawString(40,590,'Mention légale en police inconnue : conservez ce bulletin sans limitation de durée.')
c.save()
