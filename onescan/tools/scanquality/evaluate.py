"""Scores scan outputs against the ideal page from make_testset.py: QR / Code 128 decode
(zxing-cpp) and fine-detail correlation of 6/8 pt text, grey text and the table at
600 dpi (≈ a 300 % zoom).

    pip install zxing-cpp opencv-python-headless pillow numpy
    python3 evaluate.py DIR reference.png source.jpg <outputs…>
"""
import json, os, sys, numpy as np, cv2, zxingcpp
from PIL import Image
S = sys.argv[1]
t = json.load(open(f'{S}/truth.json'))
RW, RH = t['ref_size']
ref = cv2.imread(f'{S}/reference.png', cv2.IMREAD_GRAYSCALE).astype(np.float32)

def at_600dpi(g, key):
    """Region resampled to 600 dpi (≈ a 300 % zoom on a phone), like a zoomable viewer would."""
    r = t['regions_ref'][key]
    sx, sy = g.shape[1] / RW, g.shape[0] / RH
    c = g[int(r[1] * sy):int(r[3] * sy), int(r[0] * sx):int(r[2] * sx)]
    return cv2.resize(c, ((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), interpolation=cv2.INTER_CUBIC)

def detail(g, key):
    """Correlation of fine detail (difference-of-Gaussians band) with the ideal page, 0..1."""
    a = at_600dpi(g, key); b = at_600dpi(ref, key)
    band = lambda x: cv2.GaussianBlur(x, (0, 0), 1.0) - cv2.GaussianBlur(x, (0, 0), 3.0)
    a, b = band(a), band(b)
    return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))

def decode(g):
    found = {r.text for r in zxingcpp.read_barcodes(g.astype(np.uint8))}
    return t['qr'] in found, t['barcode'] in found

rows = []
for name in sys.argv[2:]:
    g = cv2.imread(f'{S}/{name}', cv2.IMREAD_GRAYSCALE)
    h, w = g.shape
    qr, bc = decode(g)
    print(f'{name:18s} {w}x{h} {w*h/1e6:4.1f} MP {w/8.27:4.0f} dpi {os.path.getsize(f"{S}/{name}")//1024:5d} KB | QR {"OK " if qr else "FAIL"} | barcode {"OK " if bc else "FAIL"} | '
          f'detail 6pt {detail(g.astype(np.float32), "text6"):.3f} | 8pt {detail(g.astype(np.float32), "text8"):.3f} | grey 8pt {detail(g.astype(np.float32), "grey8"):.3f} | table {detail(g.astype(np.float32), "table"):.3f}')
