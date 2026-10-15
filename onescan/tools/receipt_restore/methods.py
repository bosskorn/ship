"""
Receipt Restore R&D — methods under test. Every method maps a camera capture (BGR) to a
receipt image; none of them generates content (geometric resampling + per-pixel tone only).

  persp        detect receipt -> perspective correction (what OneScan does today)        [R1 base]
  classical    persp + illumination / shadow normalisation + tone + mild sharpening       [R1]
  dewarpnet    DewarpNet (DocUNet family; Doc3D) geometry on a loose crop, + classical tone [R2]
  uvdoc        UVDoc grid unwarping on a loose crop, + classical tone                       [R3]
  uvdoc_rect   UVDoc on the perspective-corrected receipt (residual curvature only)        [R3b]

DocTr / DocTr++ (R4) are not run: their licence forbids any use directed toward commercial
advantage without the author's written permission (see LICENSE_REVIEW.md).
"""
import os
import sys

import cv2
import numpy as np

OUT_W = 1152  # same width as the flat reference (80 mm at ~2x 203 dpi)


# ---------------------------------------------------------------- receipt detection + perspective

def order_quad(pts):
    pts = np.asarray(pts, np.float32).reshape(4, 2)
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.float32([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]])


def detect_receipt(img):
    """Receipt = the largest bright, low-saturation region. Returns 4 corners (tl, tr, br, bl)."""
    h, w = img.shape[:2]
    k = 1000 / max(h, w)
    small = cv2.resize(img, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    v = cv2.GaussianBlur(hsv[:, :, 2], (0, 0), 3)
    s = hsv[:, :, 1]
    # Paper: brighter than most of the frame and not saturated; text holes closed after.
    _, bright = cv2.threshold(v, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.bitwise_and(bright, (s < 70).astype(np.uint8) * 255)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
    if n <= 1:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    # Largest component that is not the whole frame.
    order = np.argsort(-stats[1:, cv2.CC_STAT_AREA]) + 1
    comp = (lab == order[0]).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cnts, key=cv2.contourArea)
    hull = cv2.convexHull(c)
    quad = None
    peri = cv2.arcLength(hull, True)
    for eps in (0.01, 0.02, 0.03, 0.05, 0.08):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) == 4:
            quad = ap.reshape(4, 2)
            break
    if quad is None:
        quad = cv2.boxPoints(cv2.minAreaRect(hull))
    return order_quad(np.float32(quad) / k)


def quad_size(q):
    wt = np.linalg.norm(q[1] - q[0])
    wb = np.linalg.norm(q[2] - q[3])
    hl = np.linalg.norm(q[3] - q[0])
    hr = np.linalg.norm(q[2] - q[1])
    return (wt + wb) / 2, (hl + hr) / 2


def perspective(img, quad, out_w=OUT_W):
    qw, qh = quad_size(quad)
    out_h = int(round(out_w * qh / max(qw, 1)))
    dst = np.float32([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]])
    H = cv2.getPerspectiveTransform(np.float32(quad), dst)
    return cv2.warpPerspective(img, H, (out_w, out_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def loose_crop(img, quad, margin=0.06):
    h, w = img.shape[:2]
    x0, y0 = quad.min(0)
    x1, y1 = quad.max(0)
    mx, my = (x1 - x0) * margin, (y1 - y0) * margin
    x0, y0 = int(max(0, x0 - mx)), int(max(0, y0 - my))
    x1, y1 = int(min(w, x1 + mx)), int(min(h, y1 + my))
    return img[y0:y1, x0:x1]


# ---------------------------------------------------------------- photometric (classical)

def paper_background(gray):
    """Paper brightness without ink: per-block bright level, ink-sized dark areas (QR, barcode,
    logos, bold text) are not taken as shadow — they are filled from surrounding paper."""
    h, w = gray.shape
    f = 4
    small = cv2.resize(gray, (max(8, w // f), max(8, h // f)), interpolation=cv2.INTER_AREA)
    # ~28 px at full size: wider than any text stroke, narrow enough to follow wrinkle shading.
    k = 7
    bg = cv2.morphologyEx(small, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    med = cv2.medianBlur(bg, 41)
    # Blocks far darker than the paper around them are large ink (QR, logo, barcode): fill.
    dark = (bg.astype(np.float32) < 0.72 * med.astype(np.float32)).astype(np.uint8)
    if dark.any():
        dark = cv2.dilate(dark, np.ones((3, 3), np.uint8))
        bg = cv2.inpaint(bg, dark, 5, cv2.INPAINT_TELEA)
    bg = cv2.GaussianBlur(bg, (0, 0), 1.5)
    return cv2.resize(bg, (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)


def tone(img_bgr, mode='natural'):
    """natural: even paper, keeps paper look and colour; crisp: white paper, dark ink (read/print)."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    bg = np.maximum(paper_background(gray), 20)
    if mode == 'natural':
        out = np.empty_like(img_bgr, dtype=np.float32)
        for c in range(3):
            ch = img_bgr[:, :, c].astype(np.float32)
            out[:, :, c] = ch / bg * 232
        out = np.clip(out, 0, 255)
        blur = cv2.GaussianBlur(out, (0, 0), 1.0)
        out = np.clip(out + 0.35 * (out - blur), 0, 255)
        return out.astype(np.uint8)
    norm = np.clip(gray.astype(np.float32) / bg, 0, 1.2)
    # Levels: paper (>= 0.90) to white; ink keeps its gradation (faded thermal text survives).
    out = np.clip((norm - 0.10) / (0.90 - 0.10), 0, 1)
    out = out ** 1.15
    out = out * 255
    blur = cv2.GaussianBlur(out, (0, 0), 1.0)
    out = np.clip(out + 0.5 * (out - blur), 0, 255)
    return cv2.cvtColor(out.astype(np.uint8), cv2.COLOR_GRAY2BGR)


# ---------------------------------------------------------------- neural geometry (pretrained, no training)

_models = {}


def _uvdoc(repo):
    if 'uvdoc' not in _models:
        import torch
        sys.path.insert(0, repo)
        from model import UVDocnet  # noqa: E402
        m = UVDocnet(num_filter=32, kernel_size=5)
        m.load_state_dict(torch.load(os.path.join(repo, 'model/best_model.pkl'), map_location='cpu', weights_only=True)['model_state'])
        m.eval()
        sys.path.remove(repo)
        _models['uvdoc'] = m
    return _models['uvdoc']


def uvdoc_unwarp(img_bgr, repo, out_size):
    """UVDoc: 488x712 input -> 45x31 2D grid -> bilinear resampling of the full-resolution crop."""
    import torch
    import torch.nn.functional as F
    m = _uvdoc(repo)
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    inp = torch.from_numpy(cv2.resize(rgb, (488, 712)).transpose(2, 0, 1)).unsqueeze(0)
    with torch.no_grad():
        grid2d, _ = m(inp)
        up = F.interpolate(grid2d, size=(out_size[1], out_size[0]), mode='bilinear', align_corners=True)
        src = torch.from_numpy(rgb.transpose(2, 0, 1)).unsqueeze(0)
        out = F.grid_sample(src, up.permute(0, 2, 3, 1), align_corners=True)
    out = (out[0].numpy().transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR), grid2d[0].numpy()


def _dewarpnet(repo, wdir):
    if 'dewarpnet' not in _models:
        import torch
        sys.path.insert(0, repo)
        # DewarpNet's models/__init__ imports torchvision for model types not used here.
        import types
        sys.modules.setdefault('torchvision', types.ModuleType('torchvision'))
        sys.modules.setdefault('torchvision.models', types.ModuleType('torchvision.models'))
        sys.modules['torchvision'].models = sys.modules['torchvision.models']
        from models import get_model  # noqa: E402
        from utils import convert_state_dict  # noqa: E402
        wc = get_model('unetnc', 3, in_channels=3)
        wc.load_state_dict(convert_state_dict(torch.load(os.path.join(wdir, 'unetnc_doc3d_final.pkl'), map_location='cpu', weights_only=True)['model_state']))
        bm = get_model('dnetccnl', 2, in_channels=3)
        bm.load_state_dict(convert_state_dict(torch.load(os.path.join(wdir, 'dnetccnl_doc3d_final.pkl'), map_location='cpu', weights_only=True)['model_state']))
        wc.eval()
        bm.eval()
        sys.path.remove(repo)
        _models['dewarpnet'] = (wc, bm)
    return _models['dewarpnet']


def dewarpnet_unwarp(img_bgr, repo, wdir, out_size):
    """DewarpNet (as in its infer.py): 256x256 -> world coords -> 128x128 -> backward map."""
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    wc, bm = _dewarpnet(repo, wdir)
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    x = cv2.resize(rgb, (256, 256))[:, :, ::-1].astype(np.float32) / 255
    x = torch.from_numpy(x.transpose(2, 0, 1).copy()).unsqueeze(0)
    with torch.no_grad():
        pw = nn.Hardtanh(0, 1.0)(wc(x))
        b = bm(F.interpolate(pw, (128, 128)))
    b = b.permute(0, 2, 3, 1).numpy()[0]
    b0 = cv2.resize(cv2.blur(b[:, :, 0], (3, 3)), out_size)
    b1 = cv2.resize(cv2.blur(b[:, :, 1], (3, 3)), out_size)
    grid = torch.from_numpy(np.stack([b0, b1], -1)[None]).float()
    src = torch.from_numpy(rgb.astype(np.float32).transpose(2, 0, 1) / 255).unsqueeze(0)
    with torch.no_grad():
        out = F.grid_sample(src, grid, align_corners=False)
    out = (out[0].numpy().transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR), b


# ---------------------------------------------------------------- runner

def run(method, cap, cfg, quad=None):
    """Returns (output BGR, info dict)."""
    q = detect_receipt(cap) if quad is None else order_quad(quad)
    qw, qh = quad_size(q)
    out_size = (OUT_W, int(round(OUT_W * qh / max(qw, 1))))
    info = {'quad': q.tolist()}
    if method == 'persp':
        return perspective(cap, q), info
    if method == 'classical':
        return tone(perspective(cap, q), 'natural'), info
    if method == 'classical_crisp':
        return tone(perspective(cap, q), 'crisp'), info
    if method == 'dewarpnet':
        geo, _ = dewarpnet_unwarp(loose_crop(cap, q), cfg['dewarpnet_repo'], cfg['dewarpnet_w'], out_size)
        return tone(geo, 'natural'), info
    if method == 'uvdoc':
        geo, grid = uvdoc_unwarp(loose_crop(cap, q), cfg['uvdoc_repo'], out_size)
        info['grid'] = grid
        return tone(geo, 'natural'), info
    if method == 'uvdoc_rect':
        rect = perspective(cap, q)
        geo, grid = uvdoc_unwarp(rect, cfg['uvdoc_repo'], (rect.shape[1], rect.shape[0]))
        info['grid'] = grid
        return tone(geo, 'natural'), info
    raise ValueError(method)
