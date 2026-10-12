"""QA scenes for the v1.0.6 acceptance run (spec §1–§5).

Builds two synthetic, fully made-up references — an A4 page and a Thai-style ID card
(no real person, emblem or card design) — and renders each under the five required
lighting conditions, the way a phone document scanner would hand them back:

  A normal room light   B warm (tungsten)   C next to a window (cool, strong side light)
  D uneven light        E partial hand shadow

Writes <out>/<doc>_ref.png, <doc>_<A..E>.jpg and regions.json.

    python3 qa_scenes.py OUT_DIR
"""
import io, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import qrcode
import barcode
from barcode.writer import ImageWriter
from make_testset import page as a4_page

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

LIGHTS = {
    'A': dict(tint=(1.0, 0.98, 0.95), falloff=0.10, shadow=0.0),
    'B': dict(tint=(1.0, 0.88, 0.65), falloff=0.15, shadow=0.0),
    'C': dict(tint=(0.85, 0.94, 1.06), falloff=0.35, shadow=0.0),
    'D': dict(tint=(1.0, 0.97, 0.93), falloff=0.45, shadow=0.0, diagonal=True),
    'E': dict(tint=(1.0, 0.97, 0.92), falloff=0.10, shadow=0.5),
}


def a4_with_extras():
    im, regions, truth = a4_page()
    d = ImageDraw.Draw(im)
    y = regions['signature'][3] + 120
    d.text((150, y), 'Bold heading 12 pt — TOTAL DUE THB 12,345.67', font=ImageFont.truetype(BOLD, 50), fill='black')
    regions['bold'] = [150, y, 2300, y + 70]
    y += 140
    # Colour logo: blue square, orange circle, green bar.
    d.rectangle([150, y, 450, y + 300], fill=(30, 90, 200))
    d.ellipse([500, y, 800, y + 300], fill=(240, 140, 30))
    d.rectangle([850, y + 100, 1450, y + 200], fill=(40, 160, 80))
    regions['logo_blue'] = [180, y + 30, 420, y + 270]
    regions['logo_orange'] = [580, y + 80, 720, y + 220]
    regions['logo_green'] = [880, y + 120, 1420, y + 180]
    regions['paper'] = [150, 3200, 2300, 3400]
    return im, regions, truth


def thai_style_card():
    """85.6 × 54 mm card at ~508 dpi with security-print lines, emblem, portrait, text."""
    W, H = 1712, 1080
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    t = xx / W
    base = np.stack([245 - 30 * t, 226 + 4 * t, 232 + 13 * t], -1)              # pink → light blue
    # Fine guilloche security pattern: thin interference lines, low contrast.
    g = np.sin(xx / 7.0 + 6 * np.sin(yy / 53.0)) * np.sin(yy / 9.0 + 4 * np.sin(xx / 71.0))
    pattern = (g > 0.82).astype(np.float32)
    base = base - pattern[..., None] * np.array([28, 36, 22], np.float32)
    im = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    regions = {}
    # Emblem (generic gold seal, not an official mark).
    cx, cy, r = 150, 150, 95
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(196, 150, 60))
    d.ellipse([cx - 60, cy - 60, cx + 60, cy + 60], fill=(150, 100, 30))
    d.polygon([(cx, cy - 45), (cx + 40, cy + 30), (cx - 40, cy + 30)], fill=(220, 180, 90))
    regions['emblem'] = [cx - 80, cy - 80, cx + 80, cy + 80]
    d.text((290, 70), 'IDENTIFICATION CARD', font=ImageFont.truetype(BOLD, 64), fill=(20, 30, 90))
    d.text((290, 160), 'Identification Number', font=ImageFont.truetype(FONT, 30), fill=(30, 30, 30))
    d.text((290, 205), '1 2345 67890 12 3', font=ImageFont.truetype(BOLD, 72), fill=(10, 10, 10))
    regions['idnumber'] = [290, 205, 1050, 290]
    small = ImageFont.truetype(FONT, 30)
    for i, line in enumerate(['Name  Mr. Somchai Example', 'Last name  Testcard', 'Date of Birth  12 Jan. 1990',
                              'Address  99/9 Moo 9, Sample Rd., Bangkok 10100', 'Date of Issue 01 Feb. 2024   Expiry 11 Jan. 2032']):
        d.text((290, 330 + i * 62), line, font=small, fill=(20, 20, 20))
    regions['text'] = [290, 330, 1150, 640]
    # Portrait (procedural): light-blue backdrop, hair, skin, shirt.
    px0, py0, px1, py1 = 1250, 300, 1640, 820
    d.rectangle([px0, py0, px1, py1], fill=(205, 222, 238))
    d.ellipse([1330, 360, 1560, 640], fill=(45, 32, 26))                    # hair
    d.ellipse([1355, 400, 1535, 640], fill=(222, 172, 140))                 # face (skin)
    d.rectangle([1300, 680, 1600, 820], fill=(240, 240, 240))               # shirt
    d.ellipse([1395, 640, 1495, 720], fill=(222, 172, 140))                 # neck
    regions['skin'] = [1400, 470, 1490, 600]
    regions['portrait'] = [px0, py0, px1, py1]
    # Barcode + QR (back-side style data).
    buf = io.BytesIO()
    barcode.get('code128', '1234567890123', writer=ImageWriter()).write(buf, {'module_width': 0.2, 'module_height': 7, 'quiet_zone': 2, 'write_text': False, 'dpi': 508})
    bc = Image.open(buf).convert('RGB')
    im.paste(bc, (290, 720))
    regions['barcode'] = [290, 720, 290 + bc.width, 720 + bc.height]
    qr = qrcode.QRCode(box_size=5, border=2)
    qr.add_data('ONESCAN-QA-CARD-0001')
    q = qr.make_image(fill_color='black', back_color='white').convert('RGB')
    im.paste(q, (1050, 700))
    regions['qr'] = [1050, 700, 1050 + q.width, 700 + q.height]
    regions['base'] = [600, 960, 1150, 1050]          # plain card base (pattern only)
    regions['pattern'] = [40, 330, 280, 1040]         # security print, no text
    return im, regions, {'qr': 'ONESCAN-QA-CARD-0001', 'barcode': '1234567890123'}


def light(ref: Image.Image, cond: str, seed: int, contrast=1.0, out_scale=1.0):
    p = LIGHTS[cond]
    w, h = ref.size
    a = np.asarray(ref.resize((int(w * out_scale), int(h * out_scale)), Image.LANCZOS)).astype(np.float32)
    h, w = a.shape[:2]
    a = np.asarray(Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ramp = (xx / w + yy / h) / 2 if p.get('diagonal') else xx / w
    L = 1.0 - p['falloff'] * ramp
    if p['shadow']:
        blob = np.exp(-(((xx - 0.78 * w) / (0.22 * w)) ** 2 + ((yy - 0.75 * h) / (0.30 * h)) ** 2) ** 1.5)
        L = L * (1 - p['shadow'] * blob)
    a = a * L[..., None] * np.array(p['tint'], np.float32)
    a = (a - 128) * contrast + 128
    a = a + np.random.default_rng(seed).normal(0, 2.5, a.shape)
    out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=92)
    return buf.getvalue()


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    meta = {}
    for doc, (im, regions, truth), kw in (
        ('a4', a4_with_extras(), dict(out_scale=3024 / 2480)),
        ('card', thai_style_card(), dict(contrast=0.85)),
    ):
        im.save(os.path.join(out, f'{doc}_ref.png'))
        meta[doc] = {'size': list(im.size), 'regions': regions, **truth}
        for i, cond in enumerate(LIGHTS):
            open(os.path.join(out, f'{doc}_{cond}.jpg'), 'wb').write(light(im, cond, seed=i, **kw))
    json.dump(meta, open(os.path.join(out, 'regions.json'), 'w'), indent=1)
    print('ok', {k: v['size'] for k, v in meta.items()})
