#!/usr/bin/env python3
"""Draws the six store logos and the demo customers' avatars (monogram on a colour, no third-party artwork), then rebuilds manifest.json and credits.json
from the JPEG files in this folder. Run from this folder:  python3 build-assets.py

Each picture gets a fixed UUID (uuid5 of its file name), so the seed always copies it to the same
`<UPLOAD_DIR>/<uuid>.jpg` and the removal script knows which files are the demo's.
"""
import glob, hashlib, json, os, uuid
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
NS = uuid.UUID('6f1d5c2e-5b0a-4d36-9a0e-0d3e57a1b001')  # fixed namespace for the demo pictures
LOGOS = {'A': ('MK', (178, 58, 38)), 'B': ('LG', (36, 96, 74)), 'C': ('NE', (33, 82, 140)), 'F': ('GG', (96, 64, 140)), 'G': ('KA', (150, 98, 24)), 'H': ('NF', (60, 70, 82))}


# Avatars of the demo customers (file `avatar-<account key>.jpg`): initials on a colour, so no real person's face is used.
AVATARS = {
    'customer.full': ('GM', (150, 54, 84)), 'customer.new': ('PK', (46, 104, 120)), 'customer.unverified': ('CI', (110, 98, 60)),
    'customer.fr': ('JM', (52, 82, 130)), 'customer.suspended': ('AT', (96, 96, 96)), 'customer.fraud': ('RB', (130, 60, 60)),
    'reviewer.1': ('EK', (170, 84, 40)), 'reviewer.2': ('SK', (40, 110, 84)), 'reviewer.3': ('NM', (120, 70, 150)), 'reviewer.4': ('DN', (60, 90, 60)),
    'customer.vip': ('MT', (128, 84, 18)), 'customer.regular.fr': ('JK', (36, 90, 150)), 'customer.regular.en': ('PN', (150, 50, 110)),
    'customer.business': ('OK', (56, 64, 78)), 'customer.cancelled': ('FL', (120, 80, 70)), 'customer.expat': ('SW', (40, 120, 130)),
    'customer.newfr': ('AM', (170, 100, 120)), 'customer.cart': ('AD', (90, 120, 40)),
}


def font(size):
    for p in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


for key, (letters, rgb) in LOGOS.items():
    if os.path.exists(os.path.join(HERE, f'logo-{key}.jpg')):
        continue  # a logo already drawn is kept as it is (its checksum is in the manifest)
    img = Image.new('RGB', (800, 800), rgb)
    d = ImageDraw.Draw(img)
    d.ellipse((120, 120, 680, 680), outline=(255, 255, 255), width=14)
    f = font(280)
    w = d.textlength(letters, font=f)
    d.text(((800 - w) / 2, 270), letters, font=f, fill=(255, 255, 255))
    img.save(os.path.join(HERE, f'logo-{key}.jpg'), 'JPEG', quality=82)

for key, (letters, rgb) in AVATARS.items():
    if os.path.exists(os.path.join(HERE, f'avatar-{key}.jpg')):
        continue
    img = Image.new('RGB', (480, 480), rgb)
    d = ImageDraw.Draw(img)
    f = font(190)
    w = d.textlength(letters, font=f)
    d.text(((480 - w) / 2, 128), letters, font=f, fill=(255, 255, 255))
    img.save(os.path.join(HERE, f'avatar-{key}.jpg'), 'JPEG', quality=84)

credits = {}
for p in sorted(glob.glob(os.path.join(HERE, '_credits', '*.json'))):
    for row in json.load(open(p)):
        credits[row['file']] = {k: v for k, v in row.items() if k not in ('file', 'crop')}
if credits:
    json.dump(credits, open(os.path.join(HERE, 'credits.json'), 'w'), indent=1, ensure_ascii=False)
else:
    credits = json.load(open(os.path.join(HERE, 'credits.json')))
files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(HERE, '*.jpg')))
items = []
for f in files:
    data = open(os.path.join(HERE, f), 'rb').read()
    kind = 'logo' if f.startswith('logo-') else f.split('-')[0] if f.split('-')[0] in ('banner', 'review', 'chat', 'issue', 'support', 'cms', 'avatar') else 'product'
    items.append({'file': f, 'uuid': str(uuid.uuid5(NS, f)), 'kind': kind, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                  'credit': credits.get(f, {'source': 'drawn for this demo', 'license': 'CC0'} if kind in ('logo', 'avatar') else None)})
missing = [i['file'] for i in items if i['credit'] is None]
assert not missing, missing
json.dump({'note': 'Target name on the server is <UPLOAD_DIR>/<uuid>.jpg', 'images': items}, open(os.path.join(HERE, 'manifest.json'), 'w'), indent=1)

lines = ['# Demo picture credits', '',
         'Every picture is a JPEG copied to the uploads folder under the fixed name in `manifest.json`.',
         'Photos come from Unsplash (Unsplash License: free to use, attribution appreciated). The six store logos and the customer avatars (initials on a colour, no real face) were drawn for this demo (CC0).',
         'No photo carries a readable brand. No file comes from a paid or restricted source.', '',
         '| File | Photographer | Unsplash page | Licence |', '|---|---|---|---|']
for i in items:
    c = i['credit']
    if c.get('source') == 'unsplash':
        lines.append(f"| {i['file']} | [{c['photographer']}]({c['photographerUrl']}) | [{c['photoId']}]({c['pageUrl']}) | {c['license']} |")
    else:
        lines.append(f"| {i['file']} | drawn for this demo | n/a | CC0 |")
total = sum(i['bytes'] for i in items)
lines += ['', f'{len(items)} pictures, {total/1e6:.1f} MB in total.']
open(os.path.join(HERE, 'CREDITS.md'), 'w').write('\n'.join(lines) + '\n')
print(len(items), 'pictures', round(total / 1e6, 2), 'MB')
