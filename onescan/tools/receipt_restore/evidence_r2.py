"""
Receipt Restore R2 — Before / After sheets. Case choice is rule-based: for each class the case
whose persp/oq line curvature is the MEDIAN of that class; failures are the worst cases of DocSeg
corner error and of UVDoc/oq line curvature. Outputs are recomputed (deterministic).

Sheet: capture with boundaries (red = R1 detector, yellow = app DocSeg, green = truth) |
flat reference | persp/det | persp/ds | persp/oq | uvdoc/oq | coons/oq | dense/oq (ceiling),
plus a 1:1 detail crop of the lower middle.

usage: python3 evidence_r2.py BENCH GT_EXTRA DOCSEG.jsonl R2_EVAL OUT + model paths
"""
import argparse
import json
import os
import sys
from collections import defaultdict

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import methods  # noqa: E402
import methods_r2  # noqa: E402
from samples import label  # noqa: E402

SHOW = [('persp', 'det'), ('persp', 'ds'), ('persp', 'oq'), ('uvdoc', 'oq'), ('coons', 'oq'), ('dense', 'oq')]
CLASSES = [('Flat-ish: light wrinkle', 'wrinkle_light'), ('Heavy wrinkle', 'wrinkle_heavy'), ('Folded', 'fold_multi'), ('Curled', 'curl'),
           ('Curved edges', 'curved_edges'), ('Long receipt', 'long'), ('Crease shadow', 'crease_shadow'), ('Busy background', 'busy_background'),
           ('Faded thermal', 'thermal_faded'), ('Uneven light', 'uneven_light'), ('Thai', 'thai'), ('Thai + English', 'thai_english'), ('Numeric dense', 'numeric_dense')]


def sheet(a, cfg, case, title, docseg):
    d = os.path.join(a.bench, case)
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'))
    ex = json.load(open(os.path.join(a.extra, case, 'extras.json')))
    om = np.load(os.path.join(a.extra, case, 'oracle_map.npz'))
    oracle = {k: om[k] for k in om.files}
    ds = docseg[case]
    quads = {'det': methods.detect_receipt(cap).tolist(), 'ds': ds['suggestion'] or ds['quad'], 'oq': ex['true_corners']}
    capv = cap.copy()
    for k, col in (('oq', (0, 200, 0)), ('ds', (0, 210, 255)), ('det', (0, 0, 255))):
        cv2.polylines(capv, [np.int32(methods.order_quad(quads[k]))], True, col, 7)
    tiles = [('flat reference', ref)] + [(f'{g}/{b}', methods_r2.run(g, b, cap, cfg, quads, ex, oracle, 'natural')) for g, b in SHOW]
    W = 330
    cols = [label(cv2.resize(capv, (W * 2, int(capv.shape[0] * W * 2 / capv.shape[1]))), 'red R1 · yellow DocSeg · green truth')]
    full = [label(cv2.resize(t, (W, int(t.shape[0] * W / t.shape[1]))), n) for n, t in tiles]
    H = max(x.shape[0] for x in cols + full)
    pad = lambda x: cv2.copyMakeBorder(x, 0, H - x.shape[0], 0, 6, cv2.BORDER_CONSTANT, value=(235, 235, 235))  # noqa: E731
    row = np.hstack([pad(x) for x in cols + full])
    head = np.full((48, row.shape[1], 3), 255, np.uint8)
    cv2.putText(head, f'{title} - {case} - DocSeg decision: {ds["decision"]}', (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    det = []
    for n, t in tiles:
        t = cv2.resize(t, (1152, int(t.shape[0] * 1152 / t.shape[1])))
        y0 = int(t.shape[0] * 0.55)
        det.append(label(t[y0:y0 + 420, 560:1152], n))
    dh = max(x.shape[0] for x in det)
    detail = np.hstack([cv2.copyMakeBorder(x, 0, dh - x.shape[0], 0, 6, cv2.BORDER_CONSTANT, value=(235, 235, 235)) for x in det])
    name = title.lower().replace(' ', '_').replace('+', 'plus').replace(':', '').replace('-', '') + '__' + case
    cv2.imwrite(os.path.join(a.out, name + '_full.jpg'), np.vstack([head, row]), [cv2.IMWRITE_JPEG_QUALITY, 85])
    cv2.imwrite(os.path.join(a.out, name + '_detail.jpg'), detail, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return name


def main():
    ap = argparse.ArgumentParser()
    for x in ('bench', 'extra', 'docseg', 'eval', 'out'):
        ap.add_argument(x)
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    cfg = {'uvdoc_repo': a.uvdoc_repo, 'dewarpnet_repo': a.dewarpnet_repo, 'dewarpnet_w': a.dewarpnet_w}
    os.makedirs(a.out, exist_ok=True)
    docseg = {json.loads(line)['case']: json.loads(line) for line in open(a.docseg)}
    met = defaultdict(dict)
    bnd = defaultdict(dict)
    for line in open(os.path.join(a.eval, 'results.jsonl'), encoding='utf-8'):
        r = json.loads(line)
        if r['kind'] == 'method' and 'error' not in r:
            met[r['case']][(r['geometry'], r['boundary'])] = r
        elif r['kind'] == 'boundary':
            bnd[r['case']][r['source']] = r
    picks = []
    for title, cls in CLASSES:
        cs = sorted([c for c, v in met.items() if v[('persp', 'oq')]['class'] == cls], key=lambda c: met[c][('persp', 'oq')]['line_curv'])
        if cs:
            picks.append((title, cs[len(cs) // 2], 'median persp/oq line curvature of class'))
    worst_ds = max(bnd, key=lambda c: bnd[c]['ds_suggestion']['corner_err_px'])
    picks.append(('Failure DocSeg boundary', worst_ds, 'largest DocSeg corner error'))
    worst_uv = max(met, key=lambda c: met[c][('uvdoc', 'oq')]['line_curv'])
    picks.append(('Failure UVDoc with true boundary', worst_uv, 'largest uvdoc/oq line curvature'))
    index = []
    for title, case, rule in picks:
        index.append({'category': title, 'case': case, 'rule': rule, 'files': [n + s for n in [sheet(a, cfg, case, title, docseg)] for s in ('_full.jpg', '_detail.jpg')]})
        print(title, case, flush=True)
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
