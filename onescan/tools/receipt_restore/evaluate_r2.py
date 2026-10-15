"""
Receipt Restore R2 — evaluation: boundary benchmark (R1 detector vs app DocSeg vs truth),
oracle-boundary geometry, new geometry metrics, OCR / numeric / code integrity, and the
OCR-instability vs content-damage split. R1 code and results are not modified.

usage: python3 evaluate_r2.py BENCH GT_EXTRA DOCSEG.jsonl OUT [--workers 4] + model paths
"""
import argparse
import json
import os
import time
from multiprocessing import Pool

import cv2
import numpy as np

os.environ.setdefault('OMP_THREAD_LIMIT', '1')
CFG = {}


def auto_line_boxes(ref):
    """Text lines of a real flat reference (no generator boxes): rows of ink, merged."""
    ink = (ref < 140).astype(np.uint8)
    rows = cv2.dilate(ink, np.ones((3, 40), np.uint8)).sum(1) > ref.shape[1] * 0.02
    boxes, y = [], 0
    while y < len(rows):
        if rows[y]:
            y0 = y
            while y < len(rows) and rows[y]:
                y += 1
            if y - y0 >= 12:
                cols = np.where(ink[y0:y].any(0))[0]
                boxes.append([int(cols.min()), y0, int(cols.max()) + 1, y])
        y += 1
    return boxes


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
    omp = os.path.join(CFG['extra'], case, 'oracle_map.npz')
    oracle = None
    if os.path.exists(omp):
        om = np.load(omp)
        oracle = {k: om[k] for k in om.files}
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'), cv2.IMREAD_GRAYSCALE)
    if 'line_boxes' not in ex:  # real receipt: lines found in the flat reference
        ex['line_boxes'] = auto_line_boxes(ref)
    ds = CFG['docseg'][case]
    quads = {'det': methods.detect_receipt(cap).tolist(), 'ds': ds['suggestion'] or ds['quad'], 'oq': ex['true_corners']}
    base = {'case': case, 'class': gt['class']}
    rows = []
    # boundary benchmark
    for name, quad in (('det', quads['det']), ('ds_suggestion', quads['ds']), ('ds_shipped', ds['quad'])):
        if oracle is not None:
            fx, fy, mask, q = oracle['flat_x'].astype(np.float32), oracle['flat_y'].astype(np.float32), oracle['mask'], int(oracle['q'])
            boxes = ex['line_boxes'] + [ex['qr_box'], ex['barcode_box']]
            bm = geom2.boundary_metrics(methods.order_quad(quad), ex['true_corners'], mask, q, boxes, fx, fy, ex['frame'])
        else:  # real receipt: annotated outline only (no per-line clipping truth)
            q = 4
            fw, fh = ex['frame']
            mask = np.zeros((fh // q, fw // q), np.uint8)
            outline = ex['boundary'] if ex.get('boundary') else ex['true_corners']
            cv2.fillPoly(mask, [np.int32(np.float32(outline) / q)], 1)
            bm = geom2.boundary_metrics(methods.order_quad(quad), ex['true_corners'], mask.astype(bool), q, [], None, None, ex['frame'])
            bm['clipped'] = None
        rows.append({**base, 'kind': 'boundary', 'source': name, **bm, 'ds_decision': ds['decision'], 'ds_confidence': ds['confidence']})
    # flat reference OCR (ceiling for OCR, and the "Flat Reference OCR" of the instability split)
    rr = evaluate.score('reference', gt, ref, ref, 0.0)
    rows.append({**base, 'kind': 'method', 'geometry': 'reference', 'boundary': '-', **{k: rr[k] for k in ('cer', 'wer', 'nums', 'qr', 'barcode', 'num_found', 'num_altered', 'num_missing', 'num_total', 'text')}})
    for g, b, tone in methods_r2.PLAN:
        if (g == 'dense' and oracle is None) or (g == 'coons' and not ex.get('boundary')):
            continue
        t = time.time()
        try:
            out = methods_r2.run(g, b, cap, CFG, quads, ex, oracle, tone or 'natural')
        except Exception as e:
            rows.append({**base, 'kind': 'method', 'geometry': g, 'boundary': b, 'tone': tone, 'error': str(e)[:200]})
            continue
        el = time.time() - t
        s = evaluate.score(g, gt, ref, out, el)
        gm = geom2.measure(ref, out, ex['line_boxes'])
        rows.append({**base, 'kind': 'method', 'geometry': g, 'boundary': b, 'tone': tone, 'sec': el,
                     **{k: s[k] for k in ('cer', 'wer', 'nums', 'qr', 'barcode', 'num_found', 'num_altered', 'num_missing', 'num_total', 'text', 'ssim_geo')},
                     **gm})
        if CFG['samples'] and int(case[:3]) % CFG['samples'] == 0:
            sd = os.path.join(CFG['out'], 'samples', case)
            os.makedirs(sd, exist_ok=True)
            cv2.imwrite(os.path.join(sd, f'{g}_{b}_{tone}.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('extra')
    ap.add_argument('docseg')
    ap.add_argument('out')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--samples', type=int, default=15)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    docseg = {}
    for line in open(a.docseg):
        r = json.loads(line)
        docseg[r['case']] = r
    CFG.update(bench=a.bench, extra=a.extra, docseg=docseg, out=a.out, samples=a.samples,
               uvdoc_repo=a.uvdoc_repo, dewarpnet_repo=a.dewarpnet_repo, dewarpnet_w=a.dewarpnet_w)
    os.makedirs(a.out, exist_ok=True)
    cases = json.load(open(os.path.join(a.bench, 'index.json')))
    if a.limit:
        cases = cases[:a.limit]
    path = os.path.join(a.out, 'results.jsonl')
    done = set()
    if os.path.exists(path):
        done = {json.loads(line)['case'] for line in open(path, encoding='utf-8')}
    todo = [c for c in cases if c not in done and c in docseg]
    with Pool(a.workers) as pool, open(path, 'a', encoding='utf-8') as f:
        for rows in pool.imap_unordered(work, todo):
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
            f.flush()
            print(rows[0]['case'], flush=True)


if __name__ == '__main__':
    main()
