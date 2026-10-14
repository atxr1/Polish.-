import sys, json, base64, io
from PIL import Image, ImageDraw
d = json.load(open(sys.argv[1])); out = sys.argv[2]
S = 2
rows = d['rows']
fw, fh = Image.open(io.BytesIO(base64.b64decode(rows[0]['shots'][0]))).size
W = 120 + len(rows[0]['shots']) * (fw * S + 4)
H = 24 + len(rows) * (fh * S + 18)
c = Image.new('RGB', (W, H), (22, 18, 46)); dr = ImageDraw.Draw(c)
dr.text((6, 4), f"{d['name']} - {d['env']}", fill=(255, 210, 90))
y = 24
for r in rows:
    dr.text((6, y + 2), r['name'][:18], fill=(255, 246, 230))
    x = 120
    for b in r['shots']:
        im = Image.open(io.BytesIO(base64.b64decode(b))).convert('RGB')
        im = im.resize((fw * S, fh * S), Image.NEAREST)
        c.paste(im, (x, y + 14)); x += im.size[0] + 4
    y += fh * S + 18
c.save(out)
