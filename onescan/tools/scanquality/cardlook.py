"""Prototype of the "card" filter (ID cards / passports) — reference for CardLook.kt.
Use: card(PIL.Image) -> PIL.Image."""
import numpy as np
from PIL import Image

LW = np.array([0.299, 0.587, 0.114], np.float32)

def box(a, r):
    """Mean filter with radius r (integral image), edges clamped."""
    p = np.pad(a, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (a.ndim - 2), mode='edge')
    c = p.cumsum(0).cumsum(1)
    h, w = a.shape[:2]
    s = c[2*r+1:2*r+1+h, 2*r+1:2*r+1+w] - c[:h, 2*r+1:2*r+1+w] - c[2*r+1:2*r+1+h, :w] + c[:h, :w]
    return s / (2*r+1)**2

def grid_upsample(g, h, w, block):
    gh, gw = g.shape
    ys = np.clip((np.arange(h) + 0.5) / block - 0.5, 0, gh - 1); xs = np.clip((np.arange(w) + 0.5) / block - 0.5, 0, gw - 1)
    y0 = ys.astype(int); x0 = xs.astype(int); y1 = np.minimum(y0 + 1, gh - 1); x1 = np.minimum(x0 + 1, gw - 1)
    ty = (ys - y0)[:, None]; tx = (xs - x0)[None, :]
    return (g[y0][:, x0] * (1 - tx) + g[y0][:, x1] * tx) * (1 - ty) + (g[y1][:, x0] * (1 - tx) + g[y1][:, x1] * tx) * ty

def card(img, wb_lo=0.75, wb_hi=1.4, wb_mix=0.85, gain_hi=1.8, local=0.35, sat=1.12, sharp=0.5):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    L = a @ LW
    # 1. White balance from the light, low-chroma part of the card (its "paper").
    chroma = a.max(2) - a.min(2)
    bright = L >= np.percentile(L, 80)
    sel = bright & (chroma <= np.percentile(chroma[bright], 60))
    ref = a[sel].mean(0) if sel.sum() > 100 else np.percentile(a.reshape(-1, 3), 95, axis=0)
    g = np.clip(ref @ LW / np.maximum(ref, 1), wb_lo, wb_hi)
    g = 1 + (g - 1) * wb_mix  # partial: a genuinely tinted card keeps some of its colour
    a = a * g
    L = a @ LW
    # 2–3. Illumination map: bright percentile per block, dilated (so photos/print don't
    # count as shadow), smoothed; even the brightness out with a capped gain.
    block = max(8, max(w, h) // 12)
    gh, gw = -(-h // block), -(-w // block)
    m = np.zeros((gh, gw), np.float32)
    for y in range(gh):
        for x in range(gw):
            m[y, x] = np.percentile(L[y*block:(y+1)*block:2, x*block:(x+1)*block:2], 90)
    p = np.pad(m, 1, mode='edge')
    m = np.max([p[dy:dy+gh, dx:dx+gw] for dy in range(3) for dx in range(3)], axis=0)  # dilate
    for _ in range(2):
        p = np.pad(m, 1, mode='edge'); m = sum(p[dy:dy+gh, dx:dx+gw] for dy in range(3) for dx in range(3)) / 9
    illum = grid_upsample(m, h, w, block)
    target = np.percentile(m, 90)
    gain = np.clip(target / np.maximum(illum, 1), 0.85, gain_hi)
    a = a * gain[..., None]
    # 4. Local contrast on luminance (large-radius unsharp), added equally to RGB.
    L = a @ LW
    # Blur at quarter resolution (memory), upsample bilinearly.
    q = 4
    hq, wq = -(-h // q), -(-w // q)
    Lp = np.pad(L, ((0, hq * q - h), (0, wq * q - w)), mode='edge').reshape(hq, q, wq, q).mean((1, 3))
    rq = max(1, max(w, h) // 60 // q)
    Lb = grid_upsample(box(box(Lp, rq), rq), h, w, q)
    a = a + (local * (L - Lb))[..., None]
    # 5. Levels (luminance-based, same for all channels) + a touch of saturation.
    L = a @ LW
    lo = min(np.percentile(L, 0.5), 60); hi = max(np.percentile(L, 99.5), 180)
    a = (a - lo) * (248 / (hi - lo))
    L = (a @ LW)[..., None]
    a = L + (a - L) * sat
    # 6. Mild sharpen (3×3).
    a = a + sharp * (a - box(a, 1))
    return Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8))
