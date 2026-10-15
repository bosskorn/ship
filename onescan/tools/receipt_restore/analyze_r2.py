"""
Receipt Restore R2 — tables for ONESCAN-RECEIPT-RESTORE-R2.md. Rules fixed before the full
results were read:

Boundary (vs the true paper):
  failure        corner error > 3% of the image diagonal (the app's own crop criterion)
  false boundary IoU with the true paper < 0.5
  header clip    > 5% of any of the first 3 printed lines outside the quad
  footer clip    > 5% of any of the last 3 printed lines, the QR or the barcode outside the quad
  side clip      > 5% of any other printed line outside the quad
Geometry:
  gap closed     per case (persp_line_curv - method_line_curv) / (persp_line_curv - dense_line_curv),
                 same boundary family; 1 = as flat as the perfect inverse warp, 0 = no better
                 than perspective, < 0 = worse. Reported as median.
OCR split (every number, Original = det+perspective no tone, Flat ref = reference OCR):
  ocr_limitation   the flat reference itself does not read it exactly
  lost_instability Original reads it, processed does not, but the line's pixels in the processed
                   image are at least as faithful (line similarity >= Original's - 0.02)
  lost_damage      Original reads it, processed does not, and the line's pixels are less faithful
  recovered        Original does not read it, processed does
  altered_*        processed reads a different number (one digit): split the same way

usage: python3 analyze_r2.py R2_EVAL [R2_EVAL_FLAT] [LONG_TRACK.jsonl] > tables.md
"""
import json
import math
import re
import sys
from collections import Counter, defaultdict

import numpy as np

FOCUS = ['crease_shadow', 'busy_background', 'curl', 'long']
METHODS = [('original', 'det', None), ('persp', 'det', 'crisp')] + [(g, b, 'natural') for b in ('det', 'ds', 'oq') for g in ('persp', 'uvdoc', 'dewarpnet')] + [('coons', 'oq', 'natural'), ('dense', 'oq', 'natural')]


def load(path):
    rows = [json.loads(line) for line in open(path + '/results.jsonl', encoding='utf-8')]
    bnd = defaultdict(dict)
    met = defaultdict(dict)
    for r in rows:
        if r['kind'] == 'boundary':
            bnd[r['case']][r['source']] = r
        else:
            met[r['case']][(r['geometry'], r['boundary'], r.get('tone'))] = r
    return bnd, met


def f(x, n=2):
    return '–' if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else f'{x:.{n}f}'


def pct(x):
    return '–' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{100 * x:.1f}%'


def md(title, header, rows):
    out = [f'#### {title}', '', '| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out) + '\n'


def clips(r, n_lines):
    c = r['clipped']
    if c is None:
        return None
    lines = c[:n_lines]
    codes = c[n_lines:]
    head = any(x > 0.05 for x in lines[:3])
    foot = any(x > 0.05 for x in lines[-3:] + codes)
    side = any(x > 0.05 for x in lines[3:-3])
    return head, foot, side


def boundary_tables(bnd, met, label):
    out = []
    groups = [('all', None)] + [(c, c) for c in FOCUS]
    rows = []
    for src in ('det', 'ds_suggestion', 'ds_shipped'):
        for gname, cls in groups:
            rs = [(case, v[src]) for case, v in bnd.items() if src in v and (cls is None or v[src]['class'] == cls)]
            if not rs:
                continue
            err = np.array([r['corner_err_px'] for _, r in rs])
            ed = np.array([r['corner_err_diag'] for _, r in rs])
            iou = np.array([r['iou'] for _, r in rs])
            cl = [clips(r, len(r['clipped']) - 2) for _, r in rs]
            cl = [c for c in cl if c is not None]
            manual = np.mean([r['ds_decision'] == 'manual' for _, r in rs]) if src.startswith('ds') else None
            rows.append([src, gname, len(rs), f(float(np.median(err)), 0), f(float(np.percentile(err, 90)), 0), f(float(iou.mean()), 3),
                         pct(float((ed > 0.03).mean())), pct(float((iou < 0.5).mean())),
                         pct(np.mean([c[0] for c in cl])) if cl else '–', pct(np.mean([c[1] for c in cl])) if cl else '–', pct(np.mean([c[2] for c in cl])) if cl else '–',
                         pct(manual) if manual is not None else '–'])
    out.append(md(f'{label}: boundary — R1 detector vs app DocSeg (vs true paper)',
                  ['source', 'class', 'n', 'corner err median px', 'p90 px', 'IoU', 'failure (>3% diag)', 'false boundary (IoU<0.5)', 'header clip', 'footer/QR clip', 'side clip', 'app opens crop editor'], rows))
    return '\n'.join(out)


def method_table(met, label, classes=None):
    rows = []
    for key in METHODS:
        rs = [v[key] for v in met.values() if key in v and 'error' not in v[key] and (classes is None or v[key]['class'] in classes)]
        if not rs:
            continue
        tot = sum(r['num_total'] for r in rs)
        g, b, t = key
        rows.append([f'{g} / {b}' + (f' / {t}' if t and t != 'natural' else ''), len(rs),
                     f(np.nanmean([r['line_curv'] for r in rs]), 3), f(np.nanmean([r['line_tilt'] for r in rs]), 2), f(np.nanmean([r['col_align'] for r in rs]), 2),
                     f(np.nanmean([r['scale_dev'] for r in rs]), 3), f(np.nanmean([r['char_deform'] for r in rs]), 3), f(np.nanmean([r['aspect_err'] for r in rs]), 3),
                     pct(np.nanmean([r['unmatched_ink'] for r in rs])), f(np.nanmean([r['ld'] for r in rs]), 2),
                     f(np.mean([r['cer'] for r in rs]), 3), pct(sum(r['num_found'] for r in rs) / tot), str(sum(r['num_altered'] for r in rs)),
                     pct(np.mean([r['qr'] for r in rs])), pct(np.mean([r['barcode'] for r in rs]))])
    errs = sum(1 for v in met.values() for k, r in v.items() if 'error' in r)
    return md(f'{label}: geometry x boundary (errors: {errs})',
              ['geometry / boundary', 'n', 'line curvature px', 'line tilt spread °', 'amount column misalign px', 'local scale dev', 'char deformation',
               'aspect err', 'unmatched ink', 'LD px', 'CER', 'numbers exact', 'ALTERED', 'QR', 'Code128'], rows)


def gap_closed(met, label):
    rows = []
    for b in ('det', 'ds', 'oq'):
        for g in ('uvdoc', 'dewarpnet') + (('coons',) if b == 'oq' else ()):
            vals, worse = [], 0
            for v in met.values():
                p, m, d = v.get(('persp', b, 'natural')), v.get((g, b, 'natural')), v.get(('dense', 'oq', 'natural'))
                if not (p and m and d) or any('error' in x for x in (p, m, d)):
                    continue
                den = p['line_curv'] - d['line_curv']
                if den <= 0.02:
                    continue
                gc = (p['line_curv'] - m['line_curv']) / den
                vals.append(gc)
                worse += gc < 0
            if vals:
                rows.append([g, b, len(vals), f(float(np.median(vals)), 2), f(float(np.percentile(vals, 75)), 2), pct(float(np.mean(np.array(vals) >= 0.5))), pct(worse / len(vals))])
    return md(f'{label}: share of the curvature gap closed (persp = 0, perfect inverse warp = 1)', ['geometry', 'boundary', 'cases', 'median', 'p75', 'cases closing ≥ half', 'cases worse than persp'], rows)


def token_lines(gt_lines, fields):
    comp = [re.sub(r'\s+', '', l) for l in gt_lines]
    out = {}
    import evaluate
    for kind, tok in evaluate.numeric_tokens(fields):
        t = re.sub(r'\s+', '', tok)
        out.setdefault(kind, []).append(next((i for i, l in enumerate(comp) if t in l), None))
    return out


def ocr_split(met, bench, label):
    import json as _j
    agg = defaultdict(Counter)
    for case, v in met.items():
        ref = v.get(('reference', '-', None))
        orig = v.get(('original', 'det', None))
        if not ref or not orig or 'error' in orig:
            continue
        gt = _j.load(open(f'{bench}/{case}/gt.json', encoding='utf-8'))
        tl = token_lines(gt['lines'], gt['fields'])
        for key in METHODS[1:]:
            r = v.get(key)
            if not r or 'error' in r:
                continue
            c = agg['/'.join(x for x in key if x)]
            for kind, states in r['nums'].items():
                for i, y in enumerate(states):
                    x = orig['nums'][kind][i]
                    rf = ref['nums'][kind][i]
                    li = tl[kind][i] if i < len(tl.get(kind, [])) else None
                    s_o = orig['line_sim'][li] if li is not None and li < len(orig['line_sim']) else None
                    s_p = r['line_sim'][li] if li is not None and li < len(r['line_sim']) else None
                    faithful = s_o is not None and s_p is not None and s_p >= s_o - 0.02
                    if rf != 'found':
                        c['ocr_limitation'] += 1
                    elif x == 'found' and y != 'found':
                        kindtag = 'altered' if y == 'altered' else 'lost'
                        c[f'{kindtag}_instability' if faithful else f'{kindtag}_damage'] += 1
                    elif x != 'found' and y == 'found':
                        c['recovered'] += 1
                    elif x == 'found' and y == 'found':
                        c['kept'] += 1
                    else:
                        c['both_miss'] += 1
    rows = [[k, c['kept'], c['recovered'], c['lost_instability'], c['altered_instability'], c['lost_damage'], c['altered_damage'], c['both_miss'], c['ocr_limitation']] for k, c in agg.items()]
    return md(f'{label}: what happened to each number vs the Original (det + perspective, no tone)',
              ['method', 'kept', 'recovered', 'lost — OCR instability', 'misread — OCR instability', 'lost — content damage', 'misread — content damage', 'missed by both', 'OCR limitation (flat ref also misses)'], rows)


def long_table(path):
    rows = [json.loads(line) for line in open(path)]
    out = []
    for grp, sel in (('long receipts', lambda r: r['class'] == 'long'), ('normal-length controls', lambda r: r['class'] != 'long')):
        rs = [r for r in rows if sel(r)]
        if not rs:
            continue
        line = [grp, len(rs), f(np.mean([r['aspect_hw'] for r in rs]), 1), f(np.mean([r['res_px_per_mm'] for r in rs]), 1), f(np.mean([r['grid_rows_per_line'] for r in rs]), 2)]
        for k in ('ocr_ref_full', 'ocr_ref_atres', 'ocr_ref_camera', 'dense_natural', 'dense', 'persp_oq_natural', 'persp_oq', 'uvdoc_squash', 'uvdoc_padded', 'uvdoc_tiled'):
            tot = sum(r[k]['num_total'] for r in rs)
            line.append(f"{pct(sum(r[k]['num_found'] for r in rs) / tot)} · {f(np.mean([r[k]['cer'] for r in rs]), 3)}")
        out.append(line)
    t1 = md('Long-receipt track — numbers exact · CER (oracle boundary everywhere)',
            ['group', 'n', 'aspect h/w', 'px per mm', 'UVDoc grid rows per printed line', 'flat ref', 'flat ref at photo resolution', '+ camera blur/noise/JPEG',
             'perfect geometry, natural tone', 'perfect geometry, crisp tone', 'persp, natural', 'persp, crisp', 'UVDoc squashed', 'UVDoc padded', 'UVDoc tiled'], out)
    geo = []
    for grp, sel in (('long', lambda r: r['class'] == 'long'), ('controls', lambda r: r['class'] != 'long')):
        rs = [r for r in rows if sel(r)]
        for k in ('dense_natural', 'persp_oq_natural', 'uvdoc_squash', 'uvdoc_padded', 'uvdoc_tiled'):
            geo.append([grp, k, f(np.nanmean([r[k]['line_curv'] for r in rs]), 3), f(np.nanmean([r[k]['scale_dev'] for r in rs]), 3), pct(np.nanmean([r[k]['unmatched_ink'] for r in rs])),
                        f(np.nanmean([r[k]['ld'] for r in rs]), 2), f(np.mean([r[k].get('seam_jump', float('nan')) for r in rs]), 2) if k == 'uvdoc_tiled' else '–'])
    t2 = md('Long-receipt track — geometry', ['group', 'variant', 'line curvature px', 'local scale dev', 'unmatched ink', 'LD px', 'seam jump px'], geo)
    return t1 + '\n' + t2


if __name__ == '__main__':
    ev = sys.argv[1]
    flat = sys.argv[2] if len(sys.argv) > 2 else None
    lt = sys.argv[3] if len(sys.argv) > 3 else None
    bench = ev.replace('r2_eval', 'bench').rstrip('/')
    sys.path.insert(0, __file__.rsplit('/', 1)[0])
    bnd, met = load(ev)
    print(boundary_tables(bnd, met, 'Distorted 300'))
    print(method_table(met, 'Distorted 300 — all'))
    for c in FOCUS:
        print(method_table(met, f'Distorted — {c}', {c}))
    print(gap_closed(met, 'Distorted 300'))
    print(ocr_split(met, bench, 'Distorted 300'))
    if flat:
        fb, fm = load(flat)
        print(boundary_tables(fb, fm, 'Flat control 32'))
        print(method_table(fm, 'Flat control 32'))
        print(ocr_split(fm, flat.replace('r2_eval_flat', 'bench_flat').rstrip('/'), 'Flat control 32'))
    if lt:
        print(long_table(lt))
