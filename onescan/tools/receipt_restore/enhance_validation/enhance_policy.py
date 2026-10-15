"""
Receipt Enhance (ปรับใบเสร็จให้อ่านง่าย) — the candidate under real-receipt validation.

Owner decision on R2 (219d858): Receipt Flatten is parked; Receipt Enhance is
perspective -> classical enhancement, with the tone chosen by a deterministic rule:

  normal receipt  -> crisp    (R1 frozen classical_crisp)
  long receipt    -> natural  (R2: crisp erases thin strokes on long, low-resolution receipts)
  not sure        -> natural  (the safe fallback)

No AI classifier: the rule reads only the receipt quad (from the app's boundary / crop editor) and
the size of the image it is applied to. The thresholds were FIXED BEFORE ANY REAL RECEIPT WAS
SEEN. They come from the frozen synthetic set (R2 §6), and must not be tuned on validation
results:
  - synthetic long receipts:  aspect h/w 3.87-6.12, ~7 px per mm of paper width
  - normal-length receipts:   aspect h/w 1.52-3.67 (numeric dense 2.76-3.67), ~10.6 px/mm
Paper width is unknown (57 or 80 mm), so px/mm assumes 80 mm. That under-estimates px/mm on narrow
paper, which only moves receipts towards the safe 'natural' side.

The original capture is never modified: enhance() returns new arrays.
"""
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import methods  # noqa: E402

POLICY_VERSION = 'enhance-policy-1'
LONG_ASPECT = 3.0          # rectified long side / short side at or above: long receipt
UNSURE_ASPECT = 2.6        # [2.6, 3.0): not sure -> natural
LOW_PX_PER_MM = 8.5        # source px per mm of paper width (short side) below: thin strokes -> natural
UNSURE_PX_PER_MM = 9.5     # [8.5, 9.5): not sure -> natural
ASSUMED_PAPER_MM = 80.0


def quad_metrics(quad):
    """Rectified short side / long side (source pixels) of a 4-point quad, or None if unusable.
    Orientation-free: a receipt photographed sideways is measured the same way."""
    if quad is None:
        return None
    q = np.float32(quad).reshape(-1, 2)
    if q.shape != (4, 2) or not np.all(np.isfinite(q)):
        return None
    q = methods.order_quad(q)
    w, h = methods.quad_size(q)
    if min(w, h) < 50 or cv2.contourArea(q) < 0.5 * w * h:
        return None
    return float(min(w, h)), float(max(w, h))


def choose_tone(quad):
    """-> dict(tone, reason, aspect, px_per_mm). Pure and deterministic."""
    m = quad_metrics(quad)
    if m is None:
        return {'tone': 'natural', 'reason': 'no_usable_quad', 'aspect': None, 'px_per_mm': None, 'policy': POLICY_VERSION}
    w, h = m
    aspect = h / w
    ppm = w / ASSUMED_PAPER_MM
    d = {'aspect': round(aspect, 3), 'px_per_mm': round(ppm, 2), 'policy': POLICY_VERSION}
    if aspect >= LONG_ASPECT:
        return dict(d, tone='natural', reason='long_aspect')
    if ppm < LOW_PX_PER_MM:
        return dict(d, tone='natural', reason='low_resolution')
    if aspect >= UNSURE_ASPECT:
        return dict(d, tone='natural', reason='unsure_aspect')
    if ppm < UNSURE_PX_PER_MM:
        return dict(d, tone='natural', reason='unsure_resolution')
    return dict(d, tone='crisp', reason='normal')


def enhance(cap_bgr, quad):
    """-> (original_rectified, enhanced, decision). cap_bgr is not modified."""
    decision = choose_tone(quad)
    if decision['reason'] == 'no_usable_quad':
        h, w = cap_bgr.shape[:2]
        quad = [[0, 0], [w, 0], [w, h], [0, h]]
    rect = methods.perspective(cap_bgr, methods.order_quad(np.float32(quad)))
    return rect, methods.tone(rect, decision['tone']), decision
