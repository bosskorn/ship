"""Prototype of the default "Scan" filter — reference for PageProcessor.scanLook (Kotlin)."""
import sys, numpy as np
from PIL import Image, ImageDraw

from robustgrid import robust_fill
ROBUST = True

def background(a, block):
    h, w, _ = a.shape
    gh, gw = -(-h // block), -(-w // block)
    bg = np.zeros((gh, gw, 3), np.float32)
    for gy in range(gh):
        for gx in range(gw):
            blk = a[gy*block:(gy+1)*block:2, gx*block:(gx+1)*block:2]
            bg[gy, gx] = np.percentile(blk.reshape(-1, 3), 90, axis=0)
    bg = np.maximum(bg, 24)
    if ROBUST:
        bg = robust_fill(bg)
    for _ in range(2):
        p = np.pad(bg, ((1, 1), (1, 1), (0, 0)), mode='edge')
        bg = sum(p[dy:dy+gh, dx:dx+gw] for dy in range(3) for dx in range(3)) / 9
    # bilinear upsample to full size (pixel-centre aligned, as in Kotlin)
    ys = np.clip((np.arange(h) + 0.5) / block - 0.5, 0, gh - 1); xs = np.clip((np.arange(w) + 0.5) / block - 0.5, 0, gw - 1)
    y0 = ys.astype(int); x0 = xs.astype(int); y1 = np.minimum(y0 + 1, gh - 1); x1 = np.minimum(x0 + 1, gw - 1)
    ty = (ys - y0)[:, None, None]; tx = (xs - x0)[None, :, None]
    top = bg[y0][:, x0] * (1 - tx) + bg[y0][:, x1] * tx
    bot = bg[y1][:, x0] * (1 - tx) + bg[y1][:, x1] * tx
    return top * (1 - ty) + bot * ty

def scan(img, max_gain=2.0, white=238.0, gamma=1.25, sat=1.2, sharp=0.4, wb_lo=0.7, wb_hi=1.5, lum_tone=True):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    bg = background(a, max(16, max(w, h) // 40))
    bl = (bg @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    gain = np.clip(250.0 / bl, 1.0, max_gain) * np.clip(bl / bg, wb_lo, wb_hi)
    n = np.minimum(a * gain, 255)
    lum = n @ np.array([0.299, 0.587, 0.114], np.float32)
    black = min(np.percentile(lum, 0.5), 80.0)
    if lum_tone:
        # Tone curve on luminance, applied as a ratio: hue and saturation of colour print kept.
        Ln = (n @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
        Lt = np.clip((Ln - black) / (white - black), 0, 1) ** gamma * 255
        k = Lt / np.maximum(Ln, 1)
        # Neutral pixels (text, paper) get the full curve; coloured ink keeps its paper-corrected
        # level (mirrors PageProcessor.neutralWeight, chroma 24 → 72).
        C = (n.max(2) - n.min(2))[..., None]
        u = np.clip((C - 24) / 48, 0, 1)
        wgt = 1 - u * u * (3 - 2 * u)
        k = 1 + (k - 1) * wgt
        t = n * k
        # Near-white neutral (paper) goes fully white.
        t = np.where((Lt >= 254.5) & (wgt > 0.5), 255.0, t)
        sat_px = 1 + (sat - 1) * wgt
    else:
        sat_px = sat
    if not lum_tone:
        t = np.clip((n - black) / (white - black), 0, 1) ** gamma * 255
    l2 = (t @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    t = l2 + (t - l2) * sat_px
    p = np.pad(t, ((1, 1), (1, 1), (0, 0)), mode='edge')
    blur = sum(p[dy:dy+h, dx:dx+w] for dy in range(3) for dx in range(3)) / 9
    t = t + sharp * (t - blur)
    return Image.fromarray(np.clip(t, 0, 255).round().astype(np.uint8))

def old_auto(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32); h, w, _ = a.shape
    bg = background(a, max(16, max(w, h) // 40))
    norm = np.minimum(255, a * 245 / bg); a = a + (norm - a) * 0.7
    l = (a @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    a = l + (a - l) * 1.05; a = (a - 128) * 1.08 + 128
    return Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8))

if __name__ == '__main__':
    names = sys.argv[2:]; tiles = []
    for nme in names:
        im = Image.open(nme).convert('RGB'); im.thumbnail((900, 900))
        row = [im, old_auto(im), scan(im)]
        H = 420
        row = [r.resize((int(r.width * H / r.height), H)) for r in row]
        tiles.append(row)
    W = max(sum(r.width for r in row) for row in tiles)
    sheet = Image.new('RGB', (W, 420 * len(tiles)), 'gray')
    for i, row in enumerate(tiles):
        x = 0
        for r in row: sheet.paste(r, (x, i * 420)); x += r.width
    sheet.save(sys.argv[1], quality=85)
