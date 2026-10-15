"""
Receipt Restore R2 — long-receipt track: isolate why long receipts fail.

Per case (all 'long' cases + an equal number of normal-length controls), with the ORACLE
boundary so detection is not a factor unless stated:

  res_px_per_mm   effective resolution of the receipt in the photo (true width / 80 mm)
  ocr_ref_full    OCR of the flat reference (ceiling)
  ocr_ref_atres   OCR of the flat reference degraded to the photo's effective resolution (down,
                  then back up) — resolution loss alone, no geometry, no lighting
  ocr_ref_camera  as ocr_ref_atres plus camera blur, sensor noise and JPEG at that resolution
  ocr_dense       OCR of the oracle-dense dewarp (perfect geometry from the real photo)
  dense_natural   the same perfect geometry with the natural (classical) tone instead of crisp
  persp_oq        perspective with the true corners (+ persp_oq_natural: natural tone)
  uvdoc_squash    UVDoc as used so far: the loose crop squashed to 488x712
  uvdoc_padded    UVDoc with the crop padded (photo background colour) to the model's aspect first
  uvdoc_tiled     UVDoc on overlapping tiles of the perspective-corrected receipt (each tile padded
                  to the model's aspect), blended back; seam = mean |flow jump| across tile joins
  grid_rows_per_line  UVDoc grid rows (45) per printed text line for this receipt

All outputs get the frozen classical_crisp tone. Measurement only — no training.
usage: python3 long_track.py BENCH GT_EXTRA OUT.jsonl + model paths [--workers 4]
"""
import argparse
import json
import os
from multiprocessing import Pool

import cv2
import numpy as np

os.environ.setdefault('OMP_THREAD_LIMIT', '1')
CFG = {}
UV_W, UV_H = 488, 712


def pad_to_aspect(img, aspect=UV_W / UV_H):
    h, w = img.shape[:2]
    if w / h >= aspect:
        return img, (0, 0)
    tw = int(round(h * aspect))
    pad = (tw - w) // 2
    # pad with the photo's own border colour (what UVDoc saw as "table" in training)
    border = np.median(np.concatenate([img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)]), axis=0)
    out = cv2.copyMakeBorder(img, 0, 0, pad, tw - w - pad, cv2.BORDER_CONSTANT, value=[float(v) for v in border])
    return out, (pad, tw - w - pad)


def uvdoc_grid_unwarp(img, out_w, out_h, crop_lr=(0, 0)):
    """Run UVDoc on img (any aspect), sample the full-res img with the predicted grid."""
    import torch
    import torch.nn.functional as F
    import methods
    m = methods._uvdoc(CFG['uvdoc_repo'])
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    inp = torch.from_numpy(cv2.resize(rgb, (UV_W, UV_H)).transpose(2, 0, 1)).unsqueeze(0)
    with torch.no_grad():
        grid2d, _ = m(inp)
        up = F.interpolate(grid2d, size=(out_h, out_w), mode='bilinear', align_corners=True)
        out = F.grid_sample(torch.from_numpy(rgb.transpose(2, 0, 1)).unsqueeze(0), up.permute(0, 2, 3, 1), align_corners=True)
    o = (out[0].numpy().transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(o, cv2.COLOR_RGB2BGR)


def tiled_uvdoc(rect, overlap=0.15):
    """rect: perspective-corrected receipt (1152 wide). Tiles of model aspect height, padded."""
    h, w = rect.shape[:2]
    th = int(w / (UV_W / UV_H) * 0.9)  # a bit shorter than the model aspect so padding gives an edge
    step = int(th * (1 - overlap))
    out = np.zeros((h, w, 3), np.float32)
    wsum = np.zeros((h, 1, 1), np.float32)
    joins = []
    y = 0
    while True:
        y0 = min(y, max(0, h - th))
        tile = rect[y0:y0 + th]
        m = int(0.06 * w)
        padded = cv2.copyMakeBorder(tile, m, m, m, m, cv2.BORDER_REPLICATE)
        res = uvdoc_grid_unwarp(padded, padded.shape[1], padded.shape[0])
        res = cv2.resize(res[m:-m, m:-m], (w, tile.shape[0]))
        ramp = np.ones((tile.shape[0], 1, 1), np.float32)
        k = int(th * overlap)
        if y0 > 0:
            ramp[:k, 0, 0] = np.linspace(0, 1, k)
            joins.append(y0 + k // 2)
        if y0 + th < h:
            ramp[-k:, 0, 0] = np.linspace(1, 0, k)
        out[y0:y0 + tile.shape[0]] += res.astype(np.float32) * ramp
        wsum[y0:y0 + tile.shape[0]] += ramp
        if y0 + th >= h:
            break
        y += step
    return (out / np.maximum(wsum, 1e-3)).clip(0, 255).astype(np.uint8), joins


def seam_jump(ref_gray, out_bgr, joins):
    """Mean |vertical-flow jump| (px @576) across tile joins: 0 = seamless."""
    import geom2
    if not joins:
        return 0.0
    rh, rw = ref_gray.shape
    k = geom2.W / rw
    r = cv2.resize(ref_gray, (geom2.W, int(round(rh * k))), interpolation=cv2.INTER_AREA)
    o = cv2.resize(geom2._norm(out_bgr), (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(r, o, None)
    oh = out_bgr.shape[0]
    jumps = []
    for j in joins:
        yj = int(j / oh * r.shape[0])
        if 6 <= yj < r.shape[0] - 6:
            jumps.append(float(np.abs(flow[yj + 5, :, 1] - flow[yj - 5, :, 1]).mean()))
    return float(np.mean(jumps)) if jumps else 0.0


def work(case):
    import torch
    torch.set_num_threads(1)
    import evaluate
    import geom2
    import methods
    import methods_r2
    d = os.path.join(CFG['bench'], case)
    gt = json.load(open(os.path.join(d, 'gt.json'), encoding='utf-8'))
    ex = json.load(open(os.path.join(CFG['extra'], case, 'extras.json')))
    om = np.load(os.path.join(CFG['extra'], case, 'oracle_map.npz'))
    oracle = {k: om[k] for k in om.files}
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'), cv2.IMREAD_GRAYSCALE)
    tc = methods.order_quad(ex['true_corners'])
    qw, qh = methods.quad_size(tc)
    rows = {'case': case, 'class': gt['class'], 'aspect_hw': float(qh / qw), 'res_px_per_mm': float(qw / 80.0),
            'lines': len(ex['line_boxes']), 'grid_rows_per_line': 45 / max(1, len(ex['line_boxes']))}

    def score(name, img, extra=None):
        s = evaluate.score(name, gt, ref, img, 0.0)
        g = geom2.measure(ref, img, ex['line_boxes'])
        rows[name] = {'cer': s['cer'], 'num_found': s['num_found'], 'num_total': s['num_total'], 'num_altered': s['num_altered'], 'qr': s['qr'],
                      'barcode': s['barcode'], **{k: g[k] for k in ('line_curv', 'line_tilt', 'col_align', 'scale_dev', 'char_deform', 'aspect_err', 'unmatched_ink', 'ld')}, **(extra or {})}

    # resolution alone: reference at the photo's effective resolution, then back up
    f = min(1.0, qw / ref.shape[1])
    low = cv2.resize(ref, (max(8, int(ref.shape[1] * f)), max(8, int(ref.shape[0] * f))), interpolation=cv2.INTER_AREA)
    atres = cv2.resize(low, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_CUBIC)
    s = evaluate.score('ref_full', gt, ref, ref, 0.0)
    rows['ocr_ref_full'] = {'cer': s['cer'], 'num_found': s['num_found'], 'num_total': s['num_total']}
    s = evaluate.score('ref_atres', gt, ref, cv2.cvtColor(atres, cv2.COLOR_GRAY2BGR), 0.0)
    rows['ocr_ref_atres'] = {'cer': s['cer'], 'num_found': s['num_found'], 'num_total': s['num_total'], 'downscale': f}
    # + camera at that resolution: the generator's optics/sensor ranges (blur 0.5-1.1 px, noise
    # 1.5-4, JPEG 90) taken at their middle — still no geometry and no lighting
    cam = cv2.GaussianBlur(low.astype(np.float32), (0, 0), 0.8) + np.random.default_rng(0).normal(0, 2.75, low.shape)
    ok, jpg = cv2.imencode('.jpg', np.clip(cam, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 90])
    cam = cv2.resize(cv2.imdecode(jpg, cv2.IMREAD_GRAYSCALE), (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_CUBIC)
    s = evaluate.score('ref_camera', gt, ref, cv2.cvtColor(cam, cv2.COLOR_GRAY2BGR), 0.0)
    rows['ocr_ref_camera'] = {'cer': s['cer'], 'num_found': s['num_found'], 'num_total': s['num_total']}
    quads = {'det': tc.tolist(), 'ds': tc.tolist(), 'oq': tc.tolist()}
    dense_crisp = methods_r2.run('dense', 'oq', cap, CFG, quads, ex, oracle)
    score('dense', dense_crisp)
    # same perfect geometry, natural tone (separates tone loss from geometry loss)
    import geom2 as _g
    rw, rh = ex['ref_size']
    mx, my = _g.inverse_map(oracle['flat_x'], oracle['flat_y'], oracle['mask'], int(oracle['q']), methods.OUT_W, int(round(methods.OUT_W * rh / rw)), rw, rh)
    score('dense_natural', methods.tone(cv2.remap(cap, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), 'natural'))
    rect = methods.perspective(cap, tc)
    score('persp_oq', methods.tone(rect, 'crisp'))
    score('persp_oq_natural', methods.tone(rect, 'natural'))
    crop = methods.loose_crop(cap, tc)
    size = (methods.OUT_W, int(round(methods.OUT_W * qh / qw)))
    score('uvdoc_squash', methods.tone(uvdoc_grid_unwarp(crop, *size), 'crisp'))
    padded, (pl, pr) = pad_to_aspect(crop)
    full = uvdoc_grid_unwarp(padded, padded.shape[1], padded.shape[0])
    k = full.shape[1] / padded.shape[1]
    inner = full[:, int(pl * k): full.shape[1] - int(pr * k)]
    score('uvdoc_padded', methods.tone(cv2.resize(inner, size), 'crisp'))
    tiled, joins = tiled_uvdoc(rect)
    tiled_t = methods.tone(tiled, 'crisp')
    score('uvdoc_tiled', tiled_t, {'tiles': len(joins) + 1, 'seam_jump': seam_jump(ref, tiled_t, joins)})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('extra')
    ap.add_argument('out')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    CFG.update(bench=a.bench, extra=a.extra, uvdoc_repo=a.uvdoc_repo, dewarpnet_repo=a.dewarpnet_repo, dewarpnet_w=a.dewarpnet_w)
    cases = json.load(open(os.path.join(a.bench, 'index.json')))
    longs = [c for c in cases if c.endswith('_long')]
    # controls: the case right after each long one (a different class, same generator stream)
    ctrl = [cases[cases.index(c) + 1] for c in longs if cases.index(c) + 1 < len(cases)]
    with Pool(a.workers) as pool, open(a.out, 'w') as f:
        for r in pool.imap_unordered(work, longs + ctrl):
            f.write(json.dumps(r, default=float) + '\n')
            f.flush()
            print(r['case'], flush=True)


if __name__ == '__main__':
    main()
