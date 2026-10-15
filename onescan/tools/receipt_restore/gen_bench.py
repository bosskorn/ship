"""
OneScan Receipt Restore — R0 benchmark generator (synthetic, with exact ground truth).

Renders Thai / Thai+English thermal receipts with known content (prices, VAT, dates, times,
receipt numbers, tax IDs, phone numbers, a QR code and a Code 128 barcode), then turns each
into a "camera capture" with a controlled distortion class. For every case we keep:

  ref.png       flat reference (the same receipt, rendered flat)  -> SSIM / geometry
  cap.jpg       distorted capture                                 -> input to every method
  gt.json       text lines, numeric tokens, fields, QR/barcode payloads, distortion class

This is NOT a substitute for real captures (see CAPTURE_PROTOCOL.md): synthetic crumples and
shading are approximations. It gives exact ground truth for content-preservation checks.

usage: python3 gen_bench.py OUT_DIR [--n 300] [--seed 7] [--bg BG_TEXTURE_DIR]
"""
import argparse
import json
import math
import os
import random

import cv2
import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFont
import barcode
from barcode.writer import ImageWriter

FONT_DIRS = ['/usr/share/fonts/truetype/tlwg', '/usr/share/fonts/opentype/tlwg']
RECEIPT_FONTS = ['TlwgMono', 'TlwgTypo', 'TlwgTypist', 'TlwgTypewriter', 'Loma', 'Garuda', 'Norasi', 'Waree']

CLASSES = [
    'wrinkle_light', 'wrinkle_heavy', 'fold_half', 'fold_multi', 'curl', 'curved_edges',
    'long', 'thermal_faded', 'crease_shadow', 'uneven_light', 'tilted', 'busy_background',
    'small_text', 'thai', 'thai_english', 'numeric_dense',
]

STORES = [
    ('ร้านกาแฟบ้านสวน', 'Baan Suan Coffee'), ('ซุปเปอร์มาร์เก็ตสุขใจ', 'Sukjai Supermarket'),
    ('ร้านยาเภสัชกรรมดี', 'Good Pharmacy'), ('ร้านอาหารครัวไทย', 'Krua Thai Restaurant'),
    ('บริษัท สยามมาร์ท จำกัด', 'Siam Mart Co., Ltd.'), ('ร้านเครื่องเขียนนำโชค', 'Namchok Stationery'),
    ('ปั๊มน้ำมันรุ่งเรือง', 'Rungruang Fuel'), ('ร้านวัสดุก่อสร้างมั่นคง', 'Mankong Hardware'),
]
PROVINCES = [('กรุงเทพมหานคร', '10110'), ('เชียงใหม่', '50000'), ('ขอนแก่น', '40000'), ('ภูเก็ต', '83000'),
             ('ชลบุรี', '20000'), ('นครราชสีมา', '30000'), ('สงขลา', '90110'), ('นนทบุรี', '11000')]
ITEMS_TH = ['กาแฟเย็น', 'ชาไทย', 'ข้าวผัดกะเพรา', 'น้ำดื่ม 600 มล.', 'ขนมปังโฮลวีต', 'นมสด 1 ลิตร', 'ไข่ไก่ เบอร์ 2',
            'ปากกาลูกลื่น', 'กระดาษ A4', 'ยาพาราเซตามอล', 'สบู่เหลว', 'แชมพู', 'ข้าวหอมมะลิ 5 กก.', 'น้ำมันพืช',
            'ผงซักฟอก', 'ทิชชู่ 6 ม้วน', 'ปูนซีเมนต์', 'ตะปู 2 นิ้ว', 'ส้มตำไทย', 'ต้มยำกุ้ง']
ITEMS_EN = ['Iced Latte', 'Croissant', 'Mineral Water', 'Green Tea', 'Sandwich', 'Notebook', 'USB Cable',
            'Vitamin C', 'Shampoo 400ml', 'Orange Juice']


def font(name, size):
    for d in FONT_DIRS:
        for ext in ('.ttf', '.otf'):
            p = os.path.join(d, name + ext)
            if os.path.exists(p):
                return ImageFont.truetype(p, size, layout_engine=ImageFont.Layout.RAQM)
    raise FileNotFoundError(name)


def money(v):
    return f'{v:,.2f}'


def make_content(rng, cls):
    store_th, store_en = rng.choice(STORES)
    prov, zipc = rng.choice(PROVINCES)
    english = cls in ('thai_english',) or (cls not in ('thai',) and rng.random() < 0.5)
    n_items = rng.randint(22, 38) if cls == 'long' else rng.randint(10, 16) if cls == 'numeric_dense' else rng.randint(3, 8)
    items = []
    for _ in range(n_items):
        name = rng.choice(ITEMS_EN) if english and rng.random() < 0.4 else rng.choice(ITEMS_TH)
        qty = rng.randint(1, 4)
        unit = round(rng.choice([rng.uniform(5, 99), rng.uniform(100, 990), rng.uniform(1000, 4990)]), 2)
        items.append((name, qty, unit, round(qty * unit, 2)))
    total = round(sum(i[3] for i in items), 2)
    # VAT-inclusive prices (Thai retail): VAT = total * 7/107
    vat = round(total * 7 / 107, 2)
    pre = round(total - vat, 2)
    cash = math.ceil(total / 100) * 100 + rng.choice([0, 0, 100, 500])
    change = round(cash - total, 2)
    year_be = rng.choice([2568, 2569])
    d, m = rng.randint(1, 28), rng.randint(1, 12)
    date = f'{d:02d}/{m:02d}/{year_be}' if rng.random() < 0.7 else f'{d:02d}/{m:02d}/{year_be - 543}'
    time = f'{rng.randint(7, 22):02d}:{rng.randint(0, 59):02d}'
    rno = f'R{rng.randint(1, 99):02d}-{rng.randint(100000, 999999)}'
    tax = ''.join(str(rng.randint(0, 9)) for _ in range(13))
    phone = f'0{rng.randint(2, 9)}{rng.randint(0, 9)}-{rng.randint(100, 999)}-{rng.randint(1000, 9999)}'
    branch = f'{rng.randint(0, 99999):05d}'
    lines = [
        ('C', store_th, 'title'),
        *([('C', store_en, 'sub')] if english else []),
        ('C', f'{rng.randint(1, 999)}/{rng.randint(1, 99)} ถ.สุขุมวิท {prov} {zipc}', 'small'),
        ('C', f'โทร {phone}', 'small'),
        ('C', f'เลขประจำตัวผู้เสียภาษี {tax}', 'small'),
        ('C', f'สาขา {branch}', 'small'),
        ('C', 'ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ' if not english else 'ใบเสร็จรับเงิน / RECEIPT', 'body'),
        ('L', f'เลขที่ {rno}', 'body'),
        ('LR', (f'วันที่ {date}', f'เวลา {time}'), 'body'),
        ('RULE', '', ''),
    ]
    for name, qty, unit, amt in items:
        lines.append(('L', name, 'body'))
        lines.append(('LR', (f'  {qty} x {money(unit)}', money(amt)), 'body'))
    lines += [
        ('RULE', '', ''),
        ('LR', ('มูลค่าก่อนภาษี', money(pre)), 'body'),
        ('LR', ('ภาษีมูลค่าเพิ่ม 7%', money(vat)), 'body'),
        ('LR', ('รวมทั้งสิ้น' + (' TOTAL' if english else ''), money(total)), 'bold'),
        ('LR', ('เงินสด', money(cash)), 'body'),
        ('LR', ('เงินทอน', money(change)), 'body'),
        ('RULE', '', ''),
        ('C', 'ขอบคุณที่ใช้บริการ' + (' / Thank you' if english else ''), 'body'),
    ]
    qr_payload = f'00020101021229370016A00000067701011101130066{rng.randint(10**8, 10**9 - 1)}5802TH5303764540{len(money(total).replace(",", ""))}{money(total).replace(",", "")}6304{rng.randint(1000, 9999)}'
    fields = {
        'date': date, 'time': time, 'receipt_no': rno, 'tax_id': tax, 'phone': phone, 'branch': branch,
        'total': money(total), 'vat': money(vat), 'pre_vat': money(pre), 'cash': money(cash), 'change': money(change),
        'items': [money(i[3]) for i in items], 'unit_prices': [money(i[2]) for i in items],
    }
    return lines, fields, qr_payload, rno, english


def render_receipt(rng, cls, lines, qr_payload, rno):
    """Flat receipt: 80 mm thermal paper at ~2x 203 dpi (1152 px wide)."""
    W = 1152
    base = 30 if cls == 'small_text' else rng.choice([36, 38, 40])
    fname = rng.choice(RECEIPT_FONTS)
    fonts = {
        'title': font(fname if 'Mono' not in fname else 'Garuda', int(base * 1.35)),
        'sub': font(fname, int(base * 1.05)), 'small': font(fname, int(base * 0.9)),
        'body': font(fname, base), 'bold': font('Loma-Bold' if fname == 'Loma' else fname, int(base * 1.15)),
    }
    margin = 48
    pad = int(base * 0.55)
    # measure
    heights = []
    for kind, text, style in lines:
        if kind == 'RULE':
            heights.append(base)
        else:
            f = fonts[style]
            heights.append(int(f.size * 1.55) + pad // 3)
    qr_size = 300
    bc_h = 150
    H = margin * 2 + sum(heights) + qr_size + bc_h + 120
    img = Image.new('L', (W, H), 255)
    dr = ImageDraw.Draw(img)
    y = margin
    text_lines = []
    boxes = []
    for (kind, text, style), h in zip(lines, heights):
        if kind == 'RULE':
            for x in range(margin, W - margin, 18):
                dr.line([(x, y + h // 2), (x + 9, y + h // 2)], fill=0, width=3)
        else:
            f = fonts[style]
            if kind == 'C':
                w = dr.textlength(text, font=f)
                dr.text(((W - w) / 2, y), text, font=f, fill=0)
                text_lines.append(text)
            elif kind == 'L':
                dr.text((margin, y), text, font=f, fill=0)
                text_lines.append(text)
            else:
                a, b = text
                dr.text((margin, y), a, font=f, fill=0)
                w = dr.textlength(b, font=f)
                dr.text((W - margin - w, y), b, font=f, fill=0)
                text_lines.append(f'{a.strip()} {b}')
            boxes.append([margin, y, W - margin, y + h])
        y += h
    qr = qrcode.QRCode(border=2, box_size=10, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(qr_payload)
    qr.make(fit=True)
    q = qr.make_image(fill_color='black', back_color='white').convert('L').resize((qr_size, qr_size), Image.NEAREST)
    img.paste(q, ((W - qr_size) // 2, y + 20))
    y += qr_size + 40
    code = barcode.get('code128', rno, writer=ImageWriter())
    b = code.render(writer_options={'module_height': 12.0, 'module_width': 0.35, 'quiet_zone': 4, 'write_text': False, 'dpi': 300}).convert('L')
    bw = min(W - 2 * margin, b.width)
    b = b.resize((bw, bc_h), Image.NEAREST)
    img.paste(b, ((W - bw) // 2, y))
    return np.array(img), text_lines


# ---------------------------------------------------------------- distortions

def smooth_noise(rng, h, w, scale, amp):
    g = rng.standard_normal((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC) * amp


def height_field(rng, h, w, cls):
    """Paper surface height z(x, y) in pixels (relative), for geometry and shading."""
    z = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    strength = {'wrinkle_light': 0.5, 'wrinkle_heavy': 1.6, 'crease_shadow': 1.2}.get(cls, 0.7)
    if cls in ('wrinkle_light', 'wrinkle_heavy', 'crease_shadow', 'thai', 'thai_english', 'numeric_dense', 'small_text', 'thermal_faded', 'busy_background', 'long'):
        z += smooth_noise(rng, h, w, 120, 14 * strength) + smooth_noise(rng, h, w, 60, 3 * strength)
        n_creases = {'wrinkle_heavy': 9, 'crease_shadow': 6}.get(cls, 2)
        for _ in range(n_creases):
            ang = rng.uniform(0, math.pi)
            c = (rng.uniform(0, w), rng.uniform(0, h))
            d = (xx - c[0]) * math.cos(ang) + (yy - c[1]) * math.sin(ang)
            z += rng.choice([-1, 1]) * (10 * strength) * np.exp(-np.abs(d) / rng.uniform(6, 18))
    if cls in ('fold_half', 'fold_multi'):
        folds = 1 if cls == 'fold_half' else rng.randint(2, 4)
        for k in range(folds):
            if k == 0 and cls == 'fold_half':
                pos, horiz = h / 2 + rng.uniform(-h * 0.05, h * 0.05), True
            else:
                horiz = rng.random() < 0.7
                pos = rng.uniform(0.2, 0.8) * (h if horiz else w)
            d = (yy - pos) if horiz else (xx - pos)
            z += rng.uniform(25, 45) * np.exp(-np.abs(d) / rng.uniform(70, 140))  # tent-shaped ridge
        z += smooth_noise(rng, h, w, 150, 6)
    if cls == 'curl':
        # rolled receipt: cylinder along the length
        r = rng.uniform(0.8, 1.6) * w
        z += np.sqrt(np.maximum(0, r * r - (xx - w / 2) ** 2)) - r
        z += (yy / h) ** 2 * rng.uniform(30, 80)
    if cls == 'curved_edges':
        z += ((xx - w / 2) / w) ** 2 * rng.uniform(60, 120) + smooth_noise(rng, h, w, 200, 6)
    if cls in ('tilted', 'uneven_light'):
        z += smooth_noise(rng, h, w, 200, 8)
    return z


def warp_maps(rng, h, w, z, cls):
    """Backward map paper->image displacement from the height field (foreshortening + lateral push)."""
    # Geometry from a smoothed surface: paper bends, it does not tear or fold over in view.
    gy, gx = np.gradient(cv2.GaussianBlur(z, (0, 0), 14))
    k = rng.uniform(1.2, 2.2)
    if cls == 'flat':  # control: lying flat, only the camera perspective
        return np.zeros((h, w), np.float32), np.zeros((h, w), np.float32)
    dx = -gx * k * 6 + smooth_noise(rng, h, w, 160, 2.5)
    dy = -gy * k * 6 + smooth_noise(rng, h, w, 160, 2.5)
    if cls in ('fold_half', 'fold_multi'):
        dx *= 1.6
        dy *= 1.6
    if cls == 'curl':
        # horizontal compression towards the edges of a cylinder (projected width)
        xx = np.arange(w, dtype=np.float32)[None, :].repeat(h, 0)
        t = (xx - w / 2) / (w / 2)
        dx += t * np.abs(t) * w * rng.uniform(0.04, 0.09)
    # Keep the map one-to-one (local stretch within 0.55..1.45): no duplicated or lost text.
    j = max(np.abs(np.gradient(dx, axis=1)).max(), np.abs(np.gradient(dy, axis=0)).max(),
            np.abs(np.gradient(dx, axis=0)).max(), np.abs(np.gradient(dy, axis=1)).max())
    if j > 0.45:
        dx *= 0.45 / j
        dy *= 0.45 / j
    return dx.astype(np.float32), dy.astype(np.float32)


def shading(rng, z, cls):
    gy, gx = np.gradient(cv2.GaussianBlur(z, (0, 0), 2.5))
    n = np.dstack([-gx, -gy, np.ones_like(z) * 1.0])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array([rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.2), 1.0], np.float32)
    L /= np.linalg.norm(L)
    lam = np.clip((n * L).sum(2), 0, 1)
    depth = 0.45 if cls in ('crease_shadow', 'wrinkle_heavy', 'fold_multi') else 0.28
    return (1 - depth) + depth * lam ** 1.5


def degrade_thermal(rng, img, cls):
    if cls != 'thermal_faded':
        return img
    f = img.astype(np.float32) / 255
    fade = np.clip(0.35 + smooth_noise(rng, *img.shape, 300, 0.15) + np.linspace(0, 0.25, img.shape[0])[:, None], 0.15, 0.75)
    return ((1 - (1 - f) * (1 - fade)) * 255).astype(np.uint8)


def capture(rng, ref, cls, bgs):
    h, w = ref.shape
    paper = degrade_thermal(rng, ref, cls).astype(np.float32)
    # thermal paper tint
    paper = paper * rng.uniform(0.93, 1.0) + rng.uniform(0, 8)
    z = height_field(rng, h, w, cls)
    dx, dy = warp_maps(rng, h, w, z, cls)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    warped = cv2.remap(paper, xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    mask = cv2.remap(np.ones_like(paper), xx + dx, yy + dy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    warped *= shading(rng, z, cls)
    # camera frame (portrait 3:4); long receipts get a taller frame share
    long = h > 2.6 * w
    FH = 3000 if long else 2400
    FW = 2250 if long else 1800
    fill = rng.uniform(0.80, 0.92) if long else rng.uniform(0.62, 0.82)
    s = min(FH * fill / h, FW * 0.85 / w)
    pw, ph = w * s, h * s
    cx, cy = FW / 2 + rng.uniform(-0.05, 0.05) * FW, FH / 2 + rng.uniform(-0.04, 0.04) * FH
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    tilt = 0.10 if cls == 'tilted' else 0.035
    jit = lambda: rng.uniform(-tilt, tilt)  # noqa: E731
    rot = math.radians(rng.uniform(-25, 25) if cls == 'tilted' else rng.uniform(-6, 6))
    corners = []
    for (u, v) in [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]:
        x = u * pw * (1 + jit() * 2)
        y = v * ph * (1 + jit())
        if cls == 'tilted':
            y *= 1 + (0.18 if v > 0 else -0.05) * (1 if u > 0 else 0.6)
            x *= 1 + (0.12 if v > 0 else -0.08)
        corners.append([cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)])
    H = cv2.getPerspectiveTransform(src, np.float32(corners))
    page = cv2.warpPerspective(warped, H, (FW, FH), flags=cv2.INTER_LINEAR, borderValue=0)
    m = cv2.warpPerspective(mask, H, (FW, FH), flags=cv2.INTER_LINEAR, borderValue=0)
    # background
    if bgs:
        bg = cv2.imread(rng.choice(bgs), cv2.IMREAD_GRAYSCALE)
        if bg is None or bg.shape[0] < 64:
            bg = np.full((FH, FW), 90, np.uint8)
        bg = cv2.resize(bg, (FW, FH))
        if cls == 'busy_background':
            for _ in range(rng.randint(4, 9)):
                p1 = (rng.randint(0, FW), rng.randint(0, FH))
                cv2.rectangle(bg, p1, (p1[0] + rng.randint(60, 500), p1[1] + rng.randint(30, 300)), rng.randint(0, 255), -1)
                cv2.putText(bg, rng.choice(['SALE', '50%', 'TOTAL 199.00', '2569']), (rng.randint(0, FW), rng.randint(0, FH)), cv2.FONT_HERSHEY_SIMPLEX, rng.uniform(1, 4), rng.randint(0, 255), rng.randint(2, 8))
            bg = bg.astype(np.float32)
        else:
            bg = bg.astype(np.float32) * rng.uniform(0.5, 0.85)
    else:
        bg = np.full((FH, FW), rng.uniform(40, 120), np.float32)
    out = page * m + bg * (1 - m)
    # illumination: gradient + optional cast shadow
    gx = np.linspace(-1, 1, FW)[None, :]
    gy = np.linspace(-1, 1, FH)[:, None]
    a, b = rng.uniform(-1, 1), rng.uniform(-1, 1)
    amp = 0.38 if cls == 'uneven_light' else 0.15
    illum = 1 - amp * (0.5 + 0.5 * (a * gx + b * gy) / max(1e-3, abs(a) + abs(b)))
    if cls in ('uneven_light', 'crease_shadow') or rng.random() < 0.25:
        sh = np.zeros((FH, FW), np.float32)
        poly = np.int32([[rng.randint(-200, FW), rng.randint(-200, 0)], [rng.randint(0, FW + 200), rng.randint(-200, FH // 2)],
                         [rng.randint(0, FW + 200), rng.randint(FH // 3, FH + 200)], [rng.randint(-200, FW // 2), rng.randint(FH // 2, FH + 200)]])
        cv2.fillPoly(sh, [poly], 1.0)
        sh = cv2.GaussianBlur(sh, (0, 0), rng.uniform(25, 70))
        illum *= 1 - sh * rng.uniform(0.25, 0.5)
    out = out * illum
    # optics + sensor
    out = cv2.GaussianBlur(out, (0, 0), rng.uniform(0.5, 1.1))
    out += np.random.default_rng(rng.randint(0, 1 << 30)).normal(0, rng.uniform(1.5, 4), out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    # slight colour cast (phones save colour)
    col = cv2.merge([np.clip(out * c, 0, 255).astype(np.uint8) for c in (rng.uniform(0.9, 1.0), rng.uniform(0.95, 1.0), rng.uniform(0.98, 1.05))])
    return col, np.float32(corners).tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--n', type=int, default=300)
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--bg', default=None)
    ap.add_argument('--classes', default=None, help='comma list (default: all 16); "flat" = control set, no warp')
    a = ap.parse_args()
    bgs = [os.path.join(a.bg, f) for f in sorted(os.listdir(a.bg))] if a.bg else []
    os.makedirs(a.out, exist_ok=True)
    index = []
    classes = a.classes.split(',') if a.classes else CLASSES
    for i in range(a.n):
        cls = classes[i % len(classes)]
        rng = random.Random(a.seed * 100003 + i)
        lines, fields, qr_payload, rno, english = make_content(rng, cls)
        ref, text_lines = render_receipt(rng, cls, lines, qr_payload, rno)
        cap, corners = capture(_RngAdapter(rng), ref, cls, bgs)
        d = os.path.join(a.out, f'{i:03d}_{cls}')
        os.makedirs(d, exist_ok=True)
        cv2.imwrite(os.path.join(d, 'ref.png'), ref)
        cv2.imwrite(os.path.join(d, 'cap.jpg'), cap, [cv2.IMWRITE_JPEG_QUALITY, 90])
        gt = {'class': cls, 'english': english, 'lines': text_lines, 'fields': fields, 'qr': qr_payload, 'barcode': rno,
              'corners': corners, 'ref_size': [int(ref.shape[1]), int(ref.shape[0])]}
        with open(os.path.join(d, 'gt.json'), 'w', encoding='utf-8') as f:
            json.dump(gt, f, ensure_ascii=False, indent=1)
        index.append(os.path.basename(d))
        print(index[-1], flush=True)
    with open(os.path.join(a.out, 'index.json'), 'w') as f:
        json.dump(index, f, indent=1)


class _RngAdapter:
    """numpy-like API over random.Random so every case is reproducible from its seed."""

    def __init__(self, r):
        self.r = r
        self.np = np.random.default_rng(r.randint(0, 1 << 30))

    def uniform(self, a, b):
        return self.r.uniform(a, b)

    def randint(self, a, b):
        return self.r.randint(a, b)

    def random(self):
        return self.r.random()

    def choice(self, seq):
        return self.r.choice(seq)

    def standard_normal(self, shape):
        return self.np.standard_normal(shape)


if __name__ == '__main__':
    main()
