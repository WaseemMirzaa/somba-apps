#!/usr/bin/env python3
"""Draws three SPECIMEN documents for trying the seller sign-up form (ID card, trade register, tax certificate).
They carry made-up data and the word SPECIMEN, so none can pass for a real document. Run: python3 make-kyc-samples.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))


def font(size, bold=False):
    for p in ('/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def doc(name, title, lines, size=(1200, 800), tint=(244, 247, 250)):
    img = Image.new('RGB', size, tint)
    d = ImageDraw.Draw(img)
    d.rectangle((20, 20, size[0] - 20, size[1] - 20), outline=(40, 70, 110), width=6)
    d.text((60, 50), title, font=font(54, True), fill=(30, 60, 100))
    y = 170
    for k, v in lines:
        d.text((60, y), k, font=font(34), fill=(90, 100, 110))
        d.text((420, y), v, font=font(38, True), fill=(20, 20, 20))
        y += 78
    # diagonal SPECIMEN stamp
    stamp = Image.new('RGBA', size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(stamp)
    sd.text((180, 330), 'SPECIMEN', font=font(200, True), fill=(200, 30, 30, 70))
    stamp = stamp.rotate(25, resample=Image.BICUBIC)
    img.paste(stamp, (0, 0), stamp)
    d = ImageDraw.Draw(img)
    d.text((60, size[1] - 80), 'Made up for testing the Somba&Teka sign-up form. Not a real document.', font=font(26), fill=(120, 30, 30))
    img.save(os.path.join(HERE, name), 'JPEG', quality=85)


doc('sample-id-card.jpg', 'SPECIMEN IDENTITY CARD', [('Surname', 'MBALA'), ('Given names', 'FISTON'), ('Card number', 'DEMO-ID-000204'), ('Date of birth', '01/01/1990'), ('Issued', 'Kinshasa'), ('Valid until', '31/12/2030')])
doc('sample-rccm.jpg', 'SPECIMEN TRADE REGISTER (RCCM)', [('Business', 'BANDAL TEXTILES'), ('RCCM no.', 'CD/KIN/RCCM/DEMO-0204'), ('Owner', 'Fiston Mbala'), ('Activity', 'Retail of textiles'), ('Registered', 'Kinshasa, 2024'), ('Status', 'Active')], tint=(250, 247, 240))
doc('sample-tax-certificate.jpg', 'SPECIMEN TAX CERTIFICATE', [('Taxpayer', 'BANDAL TEXTILES'), ('Tax no.', 'A0000204D'), ('Office', 'DGI Kinshasa'), ('Regime', 'Small business'), ('Valid for', '2027'), ('Reference', 'DEMO-TAX-0204')], tint=(240, 248, 242))
print('done')
