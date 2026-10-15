"""
Receipt Restore R&D — geometry quality (measurement only; methods unchanged, deterministic).

Per case x method (outputs recomputed exactly as evaluate.py does):
  line_curv     text-line straightness: mean |residual| (px @1152 wide) of each long text line's
                baseline from its straight-line fit. Lower = straighter. Reference ~ 0.
  edge_wave     receipt boundary straightness: std (px) of the paper's left/right edge column
                along the height (0 = straight edges).
  bg_intrusion  fraction of output border band that is background (not paper) — content
                framed badly / slivers of table.
  stretch_frac  fraction of ink pixels whose local scale vs the flat reference changes > 15%
                (Jacobian of dense flow): new stretching / local distortion.
  ld            mean dense-flow magnitude on ink vs reference (as in evaluate.py).

classical / classical_crisp share persp's geometry exactly (tone only); they are included for the
residual-shading measure (shade = coefficient of variation of the paper brightness in the output).

usage: python3 geometry.py BENCH OUT.jsonl --methods persp,uvdoc,dewarpnet,uvdoc_rect [--workers 4] + model paths
"""
import argparse
import json
import os
from multiprocessing import Pool

import cv2
import numpy as np

os.environ.setdefault('OMP_THREAD_LIMIT', '1')
CFG = {}


def norm_gray(img_bgr):
    import methods
    return cv2.cvtColor(methods.tone(img_bgr, 'crisp'), cv2.COLOR_BGR2GRAY)


def line_curvature(gray):
    g = cv2.resize(gray, (1152, int(gray.shape[0] * 1152 / gray.shape[1])))
    ink = (g < 128).astype(np.uint8)
    blobs = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_RECT, (41, 3)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(blobs)
    res = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if w < 250 or h > 120 or h < 12:
            continue
        sub = (lab[y:y + h, x:x + w] == i) & (ink[y:y + h, x:x + w] > 0)
        cols = np.where(sub.any(0))[0]
        if len(cols) < 40:
            continue
        bottoms = np.array([np.where(sub[:, c])[0].max() for c in cols], np.float32)
        # baseline = robust lower envelope in 24-px windows (descenders ignored)
        xs, ys = [], []
        for c0 in range(0, len(cols), 24):
            seg = bottoms[c0:c0 + 24]
            if len(seg) >= 6:
                xs.append(cols[c0:c0 + 24].mean())
                ys.append(np.percentile(seg, 70))
        if len(xs) < 4:
            continue
        p = np.polyfit(xs, ys, 1)
        res.append(float(np.mean(np.abs(np.polyval(p, xs) - ys))))
    return float(np.mean(res)) if res else float('nan'), len(res)


def edges(gray):
    g = cv2.resize(gray, (1152, int(gray.shape[0] * 1152 / gray.shape[1])))
    paper = (cv2.GaussianBlur(g, (0, 0), 3) > 150).astype(np.uint8)
    rows = range(0, g.shape[0], 8)
    L, R = [], []
    for r in rows:
        c = np.where(paper[r])[0]
        if len(c) > g.shape[1] * 0.5:
            L.append(c.min())
            R.append(c.max())
    wave = float((np.std(L) + np.std(R)) / 2) if len(L) > 10 else float('nan')
    band = 24
    border = np.concatenate([paper[:band].ravel(), paper[-band:].ravel(), paper[:, :band].ravel(), paper[:, -band:].ravel()])
    return wave, float(1 - border.mean())


def stretch(ref_gray, out_gray):
    W = 576
    r = cv2.resize(ref_gray, (W, int(ref_gray.shape[0] * W / ref_gray.shape[1])), interpolation=cv2.INTER_AREA)
    o = cv2.resize(out_gray, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM).calc(r, o, None)
    f = cv2.GaussianBlur(flow, (0, 0), 4)
    dux, duy = np.gradient(f[:, :, 0], axis=1), np.gradient(f[:, :, 0], axis=0)
    dvx, dvy = np.gradient(f[:, :, 1], axis=1), np.gradient(f[:, :, 1], axis=0)
    det = (1 + dux) * (1 + dvy) - duy * dvx
    ink = r < 160
    mag = np.linalg.norm(flow, axis=2)
    return float((np.abs(det[ink] - 1) > 0.15).mean()), float(mag[ink].mean())


def work(case):
    import torch
    torch.set_num_threads(1)
    import methods
    d = os.path.join(CFG['bench'], case)
    gt = json.load(open(os.path.join(d, 'gt.json'), encoding='utf-8'))
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'), cv2.IMREAD_GRAYSCALE)
    quad = methods.detect_receipt(cap)
    rows = []
    rc, rn = line_curvature(ref)
    rows.append({'case': case, 'class': gt['class'], 'method': 'reference', 'line_curv': rc, 'lines': rn})
    for m in CFG['methods']:
        try:
            out, info = methods.run(m, cap, CFG, quad=quad)
        except Exception as e:
            rows.append({'case': case, 'class': gt['class'], 'method': m, 'error': str(e)[:200]})
            continue
        g = norm_gray(out)
        # residual shading the user sees: unevenness of the paper in the output as delivered
        og = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
        bgp = methods.paper_background(og)
        paper = bgp > 60
        shade = float(bgp[paper].std() / max(1.0, bgp[paper].mean())) if paper.any() else float('nan')
        lc, ln = line_curvature(g)
        wave, bgi = edges(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY))
        sf, ld = stretch(ref, g)
        rows.append({'case': case, 'class': gt['class'], 'method': m, 'line_curv': lc, 'lines': ln, 'edge_wave': wave,
                     'bg_intrusion': bgi, 'stretch_frac': sf, 'ld': ld, 'shade': shade, 'grid_dev': None if 'grid' not in info else float(
                         np.abs(info['grid'] - info['grid'].mean()).mean())})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('out')
    ap.add_argument('--methods', default='persp,classical,classical_crisp,uvdoc,dewarpnet,uvdoc_rect')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    CFG.update(bench=a.bench, methods=a.methods.split(','), uvdoc_repo=a.uvdoc_repo, dewarpnet_repo=a.dewarpnet_repo, dewarpnet_w=a.dewarpnet_w)
    cases = json.load(open(os.path.join(a.bench, 'index.json')))
    done = set()
    if os.path.exists(a.out):
        done = {json.loads(line)['case'] for line in open(a.out)}
    with Pool(a.workers) as pool, open(a.out, 'a') as f:
        for rows in pool.imap_unordered(work, [c for c in cases if c not in done]):
            for r in rows:
                f.write(json.dumps(r) + '\n')
            f.flush()
            print(rows[0]['case'], flush=True)


if __name__ == '__main__':
    main()
