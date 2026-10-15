"""
Receipt Restore R2 — geometry x boundary, all with the same tone so only geometry and boundary
differ. The tone is R1's 'natural' classical normalisation: R2's long-receipt track showed the
frozen classical_crisp levels erase thin low-resolution strokes (long receipt 006: 73/84 numbers
natural vs 31/84 crisp, same geometry), which would let tone, not geometry, drive the OCR. The
frozen classical_crisp is kept as its own baseline row ('persp', 'det', tone 'crisp').
R1's methods.py is reused, not changed.

Boundary sources:
  det   R1 shared detector (methods.detect_receipt)
  ds    the app's CaptureEngine.detect (DocSeg + ranker), prior 'receipt'; when the app would
        open the crop editor ('manual'), the editor's suggested corners are used
  oq    oracle: the true paper corners / true boundary from the generator

Geometry:
  persp     perspective only
  uvdoc     UVDoc on a loose crop around the boundary (pretrained, MIT)
  dewarpnet DewarpNet on a loose crop (pretrained, MIT)
  coons     (oq only, diagnostic) flattens using the exact boundary curves, no content
  dense     (oq only, ceiling) the true inverse warp: what "perfectly flat" looks like from this photo
Plus 'original' = det + perspective, no tone: the "before" image for OCR comparisons.
"""
import cv2
import numpy as np

import geom2
import methods

OUT_W = methods.OUT_W


def quad_out_size(q):
    qw, qh = methods.quad_size(np.float32(q))
    return (OUT_W, int(round(OUT_W * qh / max(qw, 1))))


def run(geometry, boundary, cap, cfg, quads, extras=None, oracle=None, tone='natural'):
    """quads: {'det': q, 'ds': q, 'oq': q}. Returns BGR output (no tone for 'original')."""
    if geometry == 'original':
        return methods.perspective(cap, methods.order_quad(quads['det']))
    q = methods.order_quad(quads[boundary])
    size = quad_out_size(q)
    if geometry == 'persp':
        geo = methods.perspective(cap, q)
    elif geometry == 'uvdoc':
        geo, _ = methods.uvdoc_unwarp(methods.loose_crop(cap, q), cfg['uvdoc_repo'], size)
    elif geometry == 'dewarpnet':
        geo, _ = methods.dewarpnet_unwarp(methods.loose_crop(cap, q), cfg['dewarpnet_repo'], cfg['dewarpnet_w'], size)
    elif geometry == 'coons':
        assert boundary == 'oq'
        b = np.float32(extras['boundary'])
        tc = extras['true_corners']
        side = lambda i, j: np.linalg.norm(np.float32(tc[i]) - np.float32(tc[j]))  # noqa: E731
        h = int(round(OUT_W * (side(0, 3) + side(1, 2)) / max(1.0, side(0, 1) + side(2, 3))))
        mx, my = geom2.coons_map(b, tc, OUT_W, h)
        geo = cv2.remap(cap, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    elif geometry == 'dense':
        assert boundary == 'oq'
        rw, rh = extras['ref_size']
        h = int(round(OUT_W * rh / rw))
        mx, my = geom2.inverse_map(oracle['flat_x'].astype(np.float32), oracle['flat_y'].astype(np.float32), oracle['mask'], int(oracle['q']), OUT_W, h, rw, rh)
        geo = cv2.remap(cap, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    else:
        raise ValueError(geometry)
    return methods.tone(geo, tone)


PLAN = ([('original', 'det', None), ('persp', 'det', 'crisp')]
        + [(g, b, 'natural') for b in ('det', 'ds', 'oq') for g in ('persp', 'uvdoc', 'dewarpnet')]
        + [('coons', 'oq', 'natural'), ('dense', 'oq', 'natural')])
