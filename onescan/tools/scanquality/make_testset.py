"""Sharpness test set for the scan pipeline (v1.0.5, spec §28).

Draws an A4 page at 300 dpi with 6/8/10 pt text, light-grey small text, a Code 128
barcode, a QR code, a printed table, a signature and a red stamp, then simulates what
a phone document scanner hands back (≈12 MP, mild optical blur, uneven light, warm tint,
sensor noise, JPEG 92). Writes:
  reference.png  — the ideal page (2480 × 3508)
  source.jpg     — the simulated scanner output (3024 × 4277)
  truth.json     — QR/barcode payloads and regions for the checks

    python3 make_testset.py OUT_DIR
"""
import io, json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import qrcode
import barcode
from barcode.writer import ImageWriter

DPI = 300
W, H = 2480, 3508
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def pt(p):
    return int(round(p * DPI / 72))


def page():
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    regions = {}
    y = 150
    d.text((150, y), 'OneScan sharpness test — Invoice No. INV-2026-000184', font=ImageFont.truetype(FONT, pt(16)), fill='black')
    y += pt(30)
    lorem = ('Payment is due within thirty (30) days of the invoice date. Serial 7F3K-92QX-55LM. '
             'Account 123-4-56789-0, tax ID 0105556123456. Total THB 12,345.67 incl. VAT 7%.')
    for size, color, key in ((10, 'black', 'text10'), (8, 'black', 'text8'), (6, 'black', 'text6'), (8, (150, 150, 150), 'grey8')):
        f = ImageFont.truetype(FONT, pt(size))
        top = y
        for line in (lorem[:95], lorem[95:]):
            d.text((150, y), line, font=f, fill=color)
            y += int(pt(size) * 1.5)
        regions[key] = [150, top, W - 150, y]
        y += pt(10)
    # Table
    top = y
    cols = [150, 700, 1300, 1800, W - 150]
    for r in range(7):
        d.line([(cols[0], y + r * pt(16)), (cols[-1], y + r * pt(16))], fill='black', width=2)
    for c in cols:
        d.line([(c, top), (c, top + 6 * pt(16))], fill='black', width=2)
    f8 = ImageFont.truetype(MONO, pt(8))
    for r in range(6):
        for ci in range(4):
            d.text((cols[ci] + 15, top + r * pt(16) + 12), f'{(r * 4 + ci) * 137 % 9973:>6}.{r}{ci}', font=f8, fill='black')
    regions['table'] = [cols[0], top, cols[-1], top + 6 * pt(16)]
    y = top + 6 * pt(16) + pt(20)
    # Barcode (Code 128) and QR
    code = 'OS-2026-0001847'
    buf = io.BytesIO()
    barcode.get('code128', code, writer=ImageWriter()).write(buf, {'module_width': 0.25, 'module_height': 10, 'quiet_zone': 3, 'write_text': False, 'dpi': DPI})
    bc = Image.open(buf).convert('RGB')
    im.paste(bc, (150, y))
    regions['barcode'] = [150, y, 150 + bc.width, y + bc.height]
    qr_text = 'https://example.com/r/7F3K92QX55LM?amt=12345.67'
    qr = qrcode.QRCode(box_size=6, border=4, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(qr_text)
    qimg = qr.make_image(fill_color='black', back_color='white').convert('RGB')
    qx = W - 150 - qimg.width
    im.paste(qimg, (qx, y))
    regions['qr'] = [qx, y, qx + qimg.width, y + qimg.height]
    y += max(bc.height, qimg.height) + pt(30)
    # Signature (blue ink) and stamp (red)
    pts = [(300 + t * 6, y + 120 + 60 * math.sin(t / 9) * math.cos(t / 23)) for t in range(160)]
    d.line(pts, fill=(20, 40, 160), width=5)
    regions['signature'] = [280, y, 1300, y + 260]
    cx, cy, r = 1900, y + 130, 120
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(200, 30, 30), width=8)
    d.text((cx - 95, cy - 25), 'APPROVED', font=ImageFont.truetype(FONT, pt(9)), fill=(200, 30, 30))
    regions['stamp'] = [cx - r, cy - r, cx + r, cy + r]
    return im, regions, {'qr': qr_text, 'barcode': code}


def scanner_output(ref):
    """What a phone document scanner returns: ≈12 MP crop, mild blur, light falloff, tint, noise, JPEG 92."""
    target_w = 3024
    target_h = int(round(H * target_w / W))
    a = np.asarray(ref.resize((target_w, target_h), Image.LANCZOS)).astype(np.float32)
    a = np.asarray(Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.9))).astype(np.float32)
    yy, xx = np.mgrid[0:target_h, 0:target_w].astype(np.float32)
    light = 0.97 - 0.22 * (xx / target_w) * (yy / target_h)            # shadow towards the bottom right
    tint = np.array([1.0, 0.96, 0.86], np.float32)                     # warm room light
    a = a * light[..., None] * tint
    rng = np.random.default_rng(7)
    a = a + rng.normal(0, 3.0, a.shape)
    out = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    buf = io.BytesIO()
    out.save(buf, 'JPEG', quality=92)
    return buf.getvalue(), (target_w, target_h)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    ref, regions, truth = page()
    ref.save(os.path.join(out, 'reference.png'))
    data, size = scanner_output(ref)
    open(os.path.join(out, 'source.jpg'), 'wb').write(data)
    json.dump({'regions_ref': regions, 'ref_size': [W, H], 'source_size': list(size), **truth}, open(os.path.join(out, 'truth.json'), 'w'), indent=1)
    print('source', size, len(data) // 1024, 'KB')
