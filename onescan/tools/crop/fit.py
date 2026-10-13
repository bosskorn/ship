"""Fit and evaluate the post-capture crop scorer (src/core/document-engine/capture/crop).

Input: JSONL from the benchmark dump (one line per photo: every crop candidate with its
feature vector and corner error vs. ground truth). Photos are split: `tune` fits the
logistic weights, `test` is held out and only reported. Writes cropModel.ts.

    python3 fit.py --train real.jsonl syn.jsonl --test real.jsonl syn.jsonl \
        --cases real/cases.json syn/cases.json --old old_real.json old_syn.json \
        --out ../../src/core/document-engine/capture/crop/cropModel.ts

A crop is right when every corner is within OK (3%) of the image diagonal from the true corner
and >= 98% of the true page lies inside it (nothing cut off). No images are stored in the repository.
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
            ok = [correct(c, r) for r in c['rows']]
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
        y.append(0.0 if c['neg'] else float(correct(c, top)))
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


CUT = 0.015


def correct(c, r):
    """Right crop: every corner within OK (3%) of the diagonal from the true corner AND
    nothing cut: no true page corner lies more than CUT (1.5%) of the diagonal outside it."""
    if c['neg'] or r['e'] is None or r['e'] > OK or r['s'] == 'frame':
        return False
    t = TRUTH.get(c['k'])
    if not t:
        return True
    from shapely.geometry import Point as SP, Polygon
    pts, W, H = t
    cp = Polygon([(x * W, y * H) for x, y in r['q']]).buffer(0)
    diag = (W * W + H * H) ** 0.5
    return all(cp.distance(SP(p)) <= CUT * diag for p in pts)


def surface_of(c):
    return c['k'].split('_')[1] if c['k'].startswith('syn_') else group(c['cat'])


PRESENCE = {}       # photo -> presence probability (tools/presence)
PRESENCE_THR = None  # {'present': p, 'none': p}


def presence_class(k):
    if PRESENCE_THR is None or k not in PRESENCE:
        return 'present'
    p = PRESENCE[k]
    return 'present' if p >= PRESENCE_THR['present'] else 'none' if p <= PRESENCE_THR['none'] else 'uncertain'


def page_frac(k):
    """Share of the photo the true page covers (1.0 when unknown)."""
    if k not in TRUTH:
        return 1.0
    pts, w, h = TRUTH[k]
    a = 0.5 * abs(sum(pts[i][0] * pts[(i + 1) % 4][1] - pts[(i + 1) % 4][0] * pts[i][1] for i in range(4)))
    return a / (w * h)


def results(cases, wts, calib):
    """Per photo: candidate recall, selected-right, confidence, presence gate."""
    out = []
    for c in cases:
        V = np.array([r['v'] for r in c['rows']])
        i, conf = confidence(V, wts, calib); r = c['rows'][i]
        sel_frame = r['s'] == 'frame'
        out.append(dict(k=c['k'], g='negative' if c['neg'] else surface_of(c), neg=c['neg'],
                        recall=any(correct(c, x) for x in c['rows']), right=correct(c, r),
                        conf=0.0 if sel_frame else conf, pres=presence_class(c['k']), small=page_frac(c['k']) < 0.25))
    return out


def auto_threshold(res, target=0.98):
    """Lowest confidence threshold whose auto-applied crops are >= target precise (tune photos)."""
    # Only photos the presence gate lets through to auto-apply count.
    pos = sorted([x for x in res if x['pres'] == 'present'], key=lambda x: -x['conf'])
    best = 1.01; ok = 0
    for n, x in enumerate(pos, 1):
        ok += x['right']
        if x['conf'] <= 0:
            break
        if n >= 20 and ok / n >= target:
            best = x['conf']
    return best


def report(res, thr, label, review=0.65):
    print(f'\n== {label}   (auto-apply threshold {thr:.3f})')
    print(f'  {"group":9s} {"n":>5s} | {"cand.recall@3%":>14s} {"ranker":>7s} {"detection":>10s} | {"auto cov":>8s} {"auto prec":>9s} | {"suggest":>7s} {"original":>8s}')
    by = {}
    for x in res:
        by.setdefault(x['g'], []).append(x)
    if 'card' in by:
        by['card <25%'] = [x for x in by['card'] if x['small']]
    for g, xs in sorted(by.items()):
        n = len(xs)
        # Presence gate: 'none' -> original, nothing proposed; 'uncertain' -> at most a suggestion.
        auto = [x for x in xs if x['conf'] >= thr and x['pres'] == 'present']
        sug = [x for x in xs if x['conf'] >= review and x['pres'] != 'none' and x not in auto]
        if g == 'negative':
            print(f'  {g:9s} {n:5d} | {"—":>14s} {"—":>7s} {"—":>10s} | false crop (auto) {100*len(auto)/n:5.1f}%  suggested {100*len(sug)/n:5.1f}%')
            continue
        prec = 100 * sum(x['right'] for x in auto) / len(auto) if auto else float('nan')
        rec = [x for x in xs if x['recall']]
        rank = 100 * sum(x['right'] for x in rec) / len(rec) if rec else float('nan')
        print(f'  {g:9s} {n:5d} | {100*len(rec)/n:13.1f}% {rank:6.1f}% {100*sum(x["right"] for x in xs)/n:9.1f}% | '
              f'{100*len(auto)/n:7.1f}% {prec:8.1f}% | {100*len(sug)/n:6.1f}% {100*(n-len(auto)-len(sug))/n:7.1f}%')


if __name__ == '__main__':
    import argparse, os
    ap = argparse.ArgumentParser()
    ap.add_argument('--train', nargs='+', required=True, help='feature JSONL files; their tune split fits the model')
    ap.add_argument('--test', nargs='*', default=[], help='feature JSONL files reported on their test split')
    ap.add_argument('--cases', nargs='*', default=[], help='cases.json files (ground truth for IoU)')
    ap.add_argument('--old', nargs='*', default=[], help='old-path results JSON (per photo)')
    ap.add_argument('--out', help='write cropModel.ts here')
    ap.add_argument('--presence', nargs='*', default=[], help='presence probability JSON per photo')
    ap.add_argument('--presence-thr', help='presence thresholds JSON (presence.py eval --json)')
    a = ap.parse_args()
    for pp in a.presence:
        PRESENCE.update(json.load(open(pp)))
    if a.presence_thr:
        PRESENCE_THR = json.load(open(a.presence_thr))
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
    tune_res = results(tune, wts, calib)
    thr = auto_threshold([x for x in tune_res if not x['neg']] + [x for x in tune_res if x['neg']])
    for f in a.test:
        cs = [c for c in load(f) if c['split'] == 'test']
        if old and not cs[0]['k'].startswith('syn_'):
            print('\n== old crop path (exact), same held-out photos: corners ≤3%')
            for g in ('card', 'document', 'receipt'):
                sel = [c for c in cs if not c['neg'] and group(c['cat']) == g and c['k'] in old]
                if sel:
                    print(f'  {g:9s} n={len(sel):4d}  {100*sum(old[c["k"]]["e"] <= OK for c in sel)/len(sel):5.1f}%  (whole frame kept {100*sum(old[c["k"]]["full"] for c in sel)/len(sel):4.1f}%)')
        report(results(cs, wts, calib), thr, f'held-out {os.path.basename(f)} ({len(cs)})')
    if a.out:
        open(a.out, 'w').write(
            '/** Logistic weights over `featureVector` (generated by tools/crop/fit.py; do not edit by hand). */\n'
            'export interface CropModel {\n  version: string;\n  /** Ranking weights over `featureVector` (softmax per photo). */\n  weights: number[];\n'
            '  /** Confidence = sigmoid(c0 + c1 · top score + c2 · (top − runner-up)). */\n  calibration: [number, number, number];\n'
            '  /** Auto-apply at or above this confidence (chosen for >= 98% precision on tune photos). */\n  autoThreshold: number;\n}\n\n'
            f"export const CROP_MODEL: CropModel = {{\n  version: 'v1-{len(tune)}',\n  weights: [{', '.join(f'{v:.6g}' for v in wts)}],\n"
            f"  calibration: [{', '.join(f'{v:.6g}' for v in calib)}],\n  autoThreshold: {thr:.4f},\n}};\n")
