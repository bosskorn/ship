"""Fit and evaluate the post-capture crop scorer (src/core/document-engine/capture/crop).

Input: JSONL from the benchmark dump (one line per photo: every crop candidate with its
feature vector and corner error vs. ground truth). Photos are split: `tune` fits the
logistic weights, `test` is held out and only reported. Writes cropModel.ts.

    python3 fit.py --train real.jsonl syn.jsonl --test real.jsonl syn.jsonl \
        --cases real/cases.json syn/cases.json --old old_real.json old_syn.json \
        --out ../../src/core/document-engine/capture/crop/cropModel.ts

A candidate counts as right when its worst corner is within OK of the true corner
(fraction of the image diagonal). No images are stored in the repository.
"""
import json, sys
import numpy as np

OK = 0.03
GROUPS = {'card': ('idcard', 'id', 'card', 'ktp', 'midv500', 'midv2019', 'business'),
          'receipt': ('receipt', 'receipts', 'bill', 'segrec')}


def group(cat):
    for g, cats in GROUPS.items():
        if cat in cats:
            return g
    return 'negative' if cat == 'negative' else 'document'


def load(path):
    return [json.loads(l) for l in open(path)]


def rows(cases):
    X, y, w = [], [], []
    for c in cases:
        for r in c['rows']:
            X.append(r['v'])
            if c['neg']:
                y.append(1.0 if r['s'] == 'frame' else 0.0)
            else:
                y.append(1.0 if r['e'] <= OK else 0.0)
            w.append(1.0 / len(c['rows']))
    return np.array(X), np.array(y), np.array(w)


def fit_listwise(cases, l2=3e-3, iters=3000, lr=0.3):
    """Softmax over each photo's candidates: learn to rank the right outline first."""
    groups = []
    for c in cases:
        if c['neg']:
            ok = [r['s'] == 'frame' for r in c['rows']]
        else:
            ok = [r['e'] <= OK for r in c['rows']]
        if any(ok):
            groups.append((np.array([r['v'] for r in c['rows']]), np.array(ok, float)))
    allX = np.vstack([g[0] for g in groups])
    mu = allX[:, 1:].mean(0); sd = allX[:, 1:].std(0) + 1e-6
    Gs = [(np.hstack([X[:, :1] * 0, (X[:, 1:] - mu) / sd]), y) for X, y in groups]
    b = np.zeros(allX.shape[1])
    for it in range(iters):
        g = np.zeros_like(b)
        for Z, y in Gs:
            z = Z @ b; z -= z.max(); p = np.exp(z); p /= p.sum()
            q = y * p; q /= q.sum()
            g += Z.T @ (p - q)
        g = g / len(Gs) + l2 * np.r_[0, b[1:]]
        b -= lr * g
    return np.r_[-(b[1:] * mu / sd).sum(), b[1:] / sd]


def calibrate(cases, wts):
    """P(selected crop is right) from the top logit and its margin over the runner-up."""
    F, y = [], []
    for c in cases:
        V = np.array([r['v'] for r in c['rows']]); z = V @ wts; o = np.argsort(-z)
        top = c['rows'][o[0]]
        if top['s'] == 'frame':
            continue
        F.append([1, z[o[0]], z[o[0]] - (z[o[1]] if len(o) > 1 else z[o[0]] - 5)])
        y.append(0.0 if c['neg'] else float(top['e'] <= OK))
    F, y = np.array(F), np.array(y)
    a = np.zeros(3)
    for _ in range(5000):
        p = 1 / (1 + np.exp(-F @ a)); a -= 0.05 * (F.T @ (p - y) / len(y) + 1e-4 * np.r_[0, a[1:]])
    return a


def confidence(V, wts, cal):
    z = V @ wts; o = np.argsort(-z)
    m = z[o[0]] - (z[o[1]] if len(o) > 1 else z[o[0]] - 5)
    return o[0], float(1 / (1 + np.exp(-(cal[0] + cal[1] * z[o[0]] + cal[2] * m))))


def fit(X, y, w, l2=1e-3, iters=4000, lr=0.5):
    # Weighted logistic regression (each photo weighs the same), plain gradient descent
    # on standardised features, then folded back.
    mu = X[:, 1:].mean(0); sd = X[:, 1:].std(0) + 1e-6
    Z = np.hstack([X[:, :1], (X[:, 1:] - mu) / sd])
    pos = (w * y).sum(); neg = (w * (1 - y)).sum()
    cw = np.where(y > 0, 0.5 / pos, 0.5 / neg) * w
    b = np.zeros(Z.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Z @ b))
        g = Z.T @ (cw * (p - y)) + l2 * np.r_[0, b[1:]]
        b -= lr * g
    wts = np.r_[b[0] - (b[1:] * mu / sd).sum(), b[1:] / sd]
    return wts


def poly_iou(a, b):
    from shapely.geometry import Polygon
    pa, pb = Polygon(a).buffer(0), Polygon(b).buffer(0)
    u = pa.union(pb).area
    return pa.intersection(pb).area / u if u > 0 else 0.0


TRUTH = {}


def evaluate(cases, wts, label, calib):
    stats = {}
    cal = []
    for c in cases:
        V = np.array([r['v'] for r in c['rows']])
        i, conf = confidence(V, wts, calib); r = c['rows'][i]
        g = group(c['cat'])
        st = stats.setdefault(g, dict(n=0, ok2=0, ok3=0, ok4=0, oracle=0, auto=0, auto_ok=0, review=0, manual=0, frame=0))
        st['n'] += 1
        conf = 0.0 if r['s'] == 'frame' else conf
        dec = 'auto' if conf >= 0.85 else 'review' if conf >= 0.65 else 'manual'
        st[dec] += 1
        if c['neg']:
            st['ok3'] += r['s'] == 'frame' or dec == 'manual'
            continue
        e = r['e']
        st['ok2'] += e <= 0.02; st['ok3'] += e <= OK; st['ok4'] += e <= 0.04
        if c['k'] in TRUTH and r['s'] != 'frame':
            t, W, H = TRUTH[c['k']]
            st['iou90'] = st.get('iou90', 0) + (poly_iou([(x * W, y * H) for x, y in r['q']], t) >= 0.9)
        st['oracle'] += min(x['e'] for x in c['rows']) <= OK
        if dec == 'auto':
            st['auto_ok'] += e <= OK
        if r['s'] != 'frame':
            cal.append((conf, e <= OK))
    print(f'\n== {label}')
    for g, st in sorted(stats.items()):
        n = st['n']
        if g == 'negative':
            print(f'  {g:9s} n={n:4d}  no crop applied {100*st["ok3"]/n:5.1f}%   auto {100*st["auto"]/n:5.1f}%')
            continue
        pa = 100 * st['auto_ok'] / max(1, st['auto'])
        print(f'  {g:9s} n={n:4d}  ≤2% {100*st["ok2"]/n:5.1f}%  ≤3% {100*st["ok3"]/n:5.1f}%  ≤4% {100*st["ok4"]/n:5.1f}%  '
              f'(best candidate ≤3%: {100*st["oracle"]/n:5.1f}%) | auto {100*st["auto"]/n:5.1f}% (right {pa:5.1f}%) '
              f'review {100*st["review"]/n:5.1f}% manual {100*st["manual"]/n:5.1f}%  IoU≥0.9 {100*st.get("iou90",0)/n:5.1f}%')
    cal = np.array(cal, dtype=float)
    if len(cal):
        for lo, hi in ((0, .65), (.65, .85), (.85, 1.01)):
            sel = (cal[:, 0] >= lo) & (cal[:, 0] < hi)
            if sel.any():
                print(f'  confidence {lo:.2f}–{min(hi,1):.2f}: n={sel.sum():4d} actually right {100*cal[sel,1].mean():5.1f}%')


def surfaces(cases, wts, old, label, calib):
    """Synthetic documents-on-surfaces: success per surface, new vs. old crop path."""
    by = {}
    for c in cases:
        if c['neg']:
            continue
        surf = c['k'].split('_')[1]
        V = np.array([r['v'] for r in c['rows']]); i, conf = confidence(V, wts, calib); r = c['rows'][i]
        conf = 0.0 if r['s'] == 'frame' else conf
        st = by.setdefault(surf, dict(n=0, new=0, auto=0, autook=0, old=0, oldfull=0))
        st['n'] += 1; st['new'] += r['e'] <= OK
        if conf >= 0.85:
            st['auto'] += 1; st['autook'] += r['e'] <= OK
        if old and c['k'] in old:
            st['old'] += old[c['k']]['e'] <= OK; st['oldfull'] += old[c['k']]['full']
    print(f'\n== {label}')
    for k, st in sorted(by.items()):
        n = st['n']
        print(f'  {k:7s} n={n:3d}  new ≤3% {100*st["new"]/n:5.1f}%  auto-applied {100*st["auto"]/n:5.1f}% (right {100*st["autook"]/max(1,st["auto"]):5.1f}%)'
              + (f' | old ≤3% {100*st["old"]/n:5.1f}%, whole frame kept {100*st["oldfull"]/n:5.1f}%' if old else ''))


if __name__ == '__main__':
    import argparse, os
    ap = argparse.ArgumentParser()
    ap.add_argument('--train', nargs='+', required=True, help='feature JSONL files; their tune split fits the model')
    ap.add_argument('--test', nargs='*', default=[], help='feature JSONL files reported on their test split')
    ap.add_argument('--cases', nargs='*', default=[], help='cases.json files (ground truth for IoU)')
    ap.add_argument('--old', nargs='*', default=[], help='old-path results JSON (per photo)')
    ap.add_argument('--out', help='write cropModel.ts here')
    a = ap.parse_args()
    for cp in a.cases:
        for k, v in json.load(open(cp)).items():
            if v.get('truth'):
                TRUTH[k] = ([(x + 0.5, y + 0.5) for x, y in v['truth']], v['w'], v['h'])
    old = {}
    for op in a.old:
        old.update(json.load(open(op)))
    tune = [c for f in a.train for c in load(f) if c['split'] == 'tune']
    wts = fit_listwise(tune)
    calib = calibrate(tune, wts)
    for f in a.test:
        cs = load(f)
        test = [c for c in cs if c['split'] == 'test']
        if test and test[0]['k'].startswith('syn_'):
            surfaces(test, wts, old, f'held-out synthetic documents on surfaces ({os.path.basename(f)})', calib)
        else:
            if old:
                print(f'\n== old crop path (exact), held-out photos')
                for g in ('card', 'document', 'receipt'):
                    sel = [c for c in test if not c['neg'] and group(c['cat']) == g and c['k'] in old]
                    if sel:
                        print(f'  {g:9s} n={len(sel):4d}  ≤3% {100*sum(old[c["k"]]["e"] <= OK for c in sel)/len(sel):5.1f}%  whole frame kept {100*sum(old[c["k"]]["full"] for c in sel)/len(sel):5.1f}%')
            evaluate(test, wts, f'held-out photos ({os.path.basename(f)}, {len(test)})', calib)
    if a.out:
        open(a.out, 'w').write(
            '/** Logistic weights over `featureVector` (generated by tools/crop/fit.py; do not edit by hand). */\n'
            'export interface CropModel {\n  version: string;\n  /** Ranking weights over `featureVector` (softmax per photo). */\n  weights: number[];\n'
            '  /** Confidence = sigmoid(c0 + c1 · top score + c2 · (top − runner-up)). */\n  calibration: [number, number, number];\n}\n\n'
            f"export const CROP_MODEL: CropModel = {{\n  version: 'v1-{len(tune)}',\n  weights: [{', '.join(f'{v:.6g}' for v in wts)}],\n"
            f"  calibration: [{', '.join(f'{v:.6g}' for v in calib)}],\n}};\n")
