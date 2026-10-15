"""
Receipt Restore R&D — Before / After evidence sheets for the Owner.

Case choice is rule-based (no hand-picking):
  each category -> the case whose classical_crisp CER is the MEDIAN of that category
                   (representative, not best);
  failures      -> the cases with the most numbers newly misread vs perspective-only for each
                   candidate (classical_crisp, uvdoc, dewarpnet), and the worst QR loss.
Outputs are recomputed with the unchanged methods (deterministic) and laid out as
capture | flat reference | persp | classical | classical_crisp | uvdoc | dewarpnet,
plus a 1:1 detail crop of the totals block.

usage: python3 evidence.py BENCH FLAT_BENCH EVAL FLAT_EVAL OUT + model paths
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
from samples import label  # noqa: E402

CATS = [
    ('Easy', 'flat', 'flat'), ('Medium', 'main', 'wrinkle_light'), ('Hard', 'main', 'crease_shadow'),
    ('Very crumpled', 'main', 'wrinkle_heavy'), ('Folded', 'main', 'fold_multi'), ('Curled', 'main', 'curl'),
    ('Long receipt', 'main', 'long'), ('Faded thermal', 'main', 'thermal_faded'), ('Uneven lighting', 'main', 'uneven_light'),
    ('Thai-heavy', 'main', 'thai'), ('Thai + English', 'main', 'thai_english'), ('Numeric dense', 'main', 'numeric_dense'),
]
SHOW = ['persp', 'classical', 'classical_crisp', 'uvdoc', 'dewarpnet']


def load(p):
    by = defaultdict(dict)
    for line in open(p, encoding='utf-8'):
        r = json.loads(line)
        by[r['case']][r['method']] = r
    return by


def newly_altered(base, r):
    return sum(y == 'altered' and x != 'altered' for k in base['nums'] for x, y in zip(base['nums'][k], r['nums'][k]))


def sheet(bench, case, cfg, out, title):
    d = os.path.join(bench, case)
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'))
    quad = methods.detect_receipt(cap)
    tiles = [('flat reference', ref)] + [(m, methods.run(m, cap, cfg, quad=quad)[0]) for m in SHOW]
    W = 360
    capv = cap.copy()
    cv2.polylines(capv, [np.int32(quad)], True, (0, 0, 255), 6)
    cols = [label(cv2.resize(capv, (W * 2, int(capv.shape[0] * W * 2 / capv.shape[1]))), 'capture (red = detected boundary)')]
    full = [label(cv2.resize(t, (W, int(t.shape[0] * W / t.shape[1]))), n) for n, t in tiles]
    H = max(x.shape[0] for x in cols + full)
    pad = lambda x: cv2.copyMakeBorder(x, 0, H - x.shape[0], 0, 6, cv2.BORDER_CONSTANT, value=(235, 235, 235))  # noqa: E731
    row = np.hstack([pad(x) for x in cols + full])
    head = np.full((48, row.shape[1], 3), 255, np.uint8)
    cv2.putText(head, f'{title} - {case}', (10, 34), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    det = []
    for n, t in tiles:
        t = cv2.resize(t, (1152, int(t.shape[0] * 1152 / t.shape[1])))
        y0 = int(t.shape[0] * 0.58)
        det.append(label(t[y0:y0 + 460, 520:1152], n))
    dh = max(x.shape[0] for x in det)
    detail = np.hstack([cv2.copyMakeBorder(x, 0, dh - x.shape[0], 0, 6, cv2.BORDER_CONSTANT, value=(235, 235, 235)) for x in det])
    name = f"{title.lower().replace(' ', '_').replace('+', 'plus').replace('/', '_')}__{case}"
    cv2.imwrite(os.path.join(out, name + '_full.jpg'), np.vstack([head, row]), [cv2.IMWRITE_JPEG_QUALITY, 85])
    cv2.imwrite(os.path.join(out, name + '_detail.jpg'), detail, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('flat_bench')
    ap.add_argument('eval')
    ap.add_argument('flat_eval')
    ap.add_argument('out')
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    cfg = {'uvdoc_repo': a.uvdoc_repo, 'dewarpnet_repo': a.dewarpnet_repo, 'dewarpnet_w': a.dewarpnet_w}
    os.makedirs(a.out, exist_ok=True)
    main_by, flat_by = load(os.path.join(a.eval, 'results.jsonl')), load(os.path.join(a.flat_eval, 'results.jsonl'))
    picks = []
    for title, src, cls in CATS:
        by = flat_by if src == 'flat' else main_by
        cs = sorted([c for c, ms in by.items() if ms['persp']['class'] == cls], key=lambda c: by[c]['classical_crisp']['cer'])
        picks.append((title, a.flat_bench if src == 'flat' else a.bench, cs[len(cs) // 2], 'median classical_crisp CER of class'))
    # QR / barcode: median case among those where perspective-only decodes the QR
    qr = sorted([c for c, ms in main_by.items() if ms['persp']['qr']], key=lambda c: main_by[c]['classical_crisp']['cer'])
    picks.append(('QR and barcode', a.bench, qr[len(qr) // 2], 'median CER among cases whose QR decodes before restore'))
    for m in ['classical_crisp', 'uvdoc', 'dewarpnet']:
        worst = max(main_by, key=lambda c: (newly_altered(main_by[c]['persp'], main_by[c][m]), main_by[c][m]['cer']))
        picks.append((f'Failure {m} numbers', a.bench, worst, f'most numbers newly misread by {m}'))
    lost = [c for c, ms in main_by.items() if ms['persp']['qr'] and not ms['uvdoc']['qr']]
    if lost:
        picks.append(('Failure QR lost by uvdoc', a.bench, sorted(lost)[0], 'first case where uvdoc loses a QR that decodes before'))
    worst_ld = max(main_by, key=lambda c: main_by[c]['uvdoc']['ld'])
    picks.append(('Failure uvdoc geometry', a.bench, worst_ld, 'largest uvdoc local distortion'))
    index = []
    for title, bench, case, why in picks:
        name = sheet(bench, case, cfg, a.out, title)
        index.append({'category': title, 'case': case, 'rule': why, 'files': [name + '_full.jpg', name + '_detail.jpg']})
        print(title, case, flush=True)
    json.dump(index, open(os.path.join(a.out, 'index.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
