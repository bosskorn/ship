"""
Receipt Restore R&D — report tables (markdown) from:
  EVAL/results.jsonl, FLAT/results.jsonl, GEO.jsonl, GEO_FLAT.jsonl, PERF.jsonl

Verdict rules (fixed before the full results were read):
  ERROR            the method raised
  FAIL-integrity   a number becomes ALTERED that perspective-only did not misread, or a QR /
                   Code 128 that perspective-only decodes no longer decodes
  FAIL-readability >= 2 numbers that perspective-only read are no longer found, or CER worse by > 5 pts
  PASS             otherwise
Perspective-only is the "before" (what OneScan ships today); the same OCR reads both, so OCR
noise is shared and the difference is what the restore step did.
"""
import json
import math
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from analyze import gate, numbers  # noqa: E402

METHODS = ['persp', 'classical', 'classical_crisp', 'uvdoc', 'dewarpnet', 'uvdoc_rect']
KINDS = {'Amount (total, pre-VAT, cash, change, items, unit prices)': ['total', 'pre_vat', 'cash', 'change', 'item', 'unit'],
         'VAT': ['vat'], 'Date': ['date'], 'Time': ['time'], 'Receipt No.': ['receipt_no'], 'Tax ID': ['tax_id'], 'Phone': ['phone']}


def load(p):
    rows = [json.loads(line) for line in open(p, encoding='utf-8')]
    by = defaultdict(dict)
    for r in rows:
        by[r['case']][r['method']] = r
    return rows, by


def verdict(base, r):
    if 'error' in r:
        return 'ERROR'
    lost = altered = 0
    for kind in base['nums']:
        for x, y in zip(base['nums'][kind], r['nums'][kind]):
            lost += x == 'found' and y != 'found'
            altered += y == 'altered' and x != 'altered'
    if altered or (base['qr'] and not r['qr']) or (base['barcode'] and not r['barcode']):
        return 'FAIL-integrity'
    if lost >= 2 or r['cer'] > base['cer'] + 0.05:
        return 'FAIL-readability'
    return 'PASS'


def md(title, header, rows):
    out = [f'#### {title}', '', '| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return '\n'.join(out) + '\n'


def pct(x):
    return '–' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{100 * x:.1f}%'


def f2(x, n=3):
    return '–' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{x:.{n}f}'


def integrity(by, ms, label):
    out = []
    rows = []
    for m in ['reference'] + ms:
        rs = [c[m] for c in by.values() if m in c and 'error' not in c[m]]
        if not rs:
            continue
        line = [m, len(rs), f2(np.mean([r['cer'] for r in rs])), f2(np.mean([r['wer'] for r in rs]))]
        for kinds in KINDS.values():
            vals = [v for r in rs for k in kinds for v in r['nums'].get(k, [])]
            c = Counter(vals)
            n = max(1, len(vals))
            line.append(f"{pct(c['found'] / n)} / {c['altered']}")
        line += [pct(np.mean([r['qr'] for r in rs])), pct(np.mean([r['barcode'] for r in rs]))]
        rows.append(line)
    out.append(md(f'{label}: content integrity (numbers: exact % / ALTERED count)', ['method', 'n', 'CER', 'WER'] + list(KINDS) + ['QR', 'Code128'], rows))
    return '\n'.join(out)


def verdicts(by, ms, label):
    rows = []
    for m in ms[1:]:
        c = Counter()
        for case in by.values():
            if m not in case:
                c['missing'] += 1
            elif 'persp' not in case or 'error' in case['persp']:
                c['ERROR'] += 1
            else:
                c[verdict(case['persp'], case[m])] += 1
        rows.append([m, c['PASS'], c['FAIL-integrity'], c['FAIL-readability'], c['ERROR'], c['missing']])
    return md(f'{label}: verdict vs perspective-only (per case)', ['method', 'PASS', 'FAIL-integrity', 'FAIL-readability', 'ERROR', 'missing/skipped'], rows)


def geometry_table(geo, label):
    by = defaultdict(list)
    ref = {r['case']: r for r in geo if r['method'] == 'reference'}
    for r in geo:
        if r['method'] != 'reference' and 'error' not in r:
            by[r['method']].append(r)
    rows = []
    for m in METHODS:
        rs = by.get(m)
        if not rs:
            continue
        excess = [r['line_curv'] - ref[r['case']]['line_curv'] for r in rs if not math.isnan(r['line_curv']) and not math.isnan(ref[r['case']]['line_curv'])]
        rows.append([m, len(rs), f2(float(np.mean(excess)), 2), f2(float(np.nanmean([r['edge_wave'] for r in rs])), 1),
                     pct(float(np.mean([r['bg_intrusion'] for r in rs]))), pct(float(np.mean([r['stretch_frac'] for r in rs]))),
                     f2(float(np.mean([r['ld'] for r in rs])), 2), f2(float(np.nanmean([r['shade'] for r in rs])), 3)])
    return md(f'{label}: geometry and shading', ['method', 'n', 'text-line curvature above flat ref (px)', 'edge waviness (px)',
                                                 'background in border', 'ink with >15% stretch', 'local distortion LD (px)', 'residual shading (CoV)'], rows)


def failures(by, geo, label):
    g = {(r['case'], r['method']): r for r in geo}
    cnt = defaultdict(Counter)
    examples = defaultdict(lambda: defaultdict(list))
    for case, ms in by.items():
        base = ms.get('persp')
        for m in METHODS[1:]:
            r = ms.get(m)
            if not r or not base:
                continue
            gg = g.get((case, m), {})
            tags = []
            if 'error' in r:
                tags.append('crash / error')
            else:
                if r.get('det_err_px', 0) > 40:
                    tags.append('bad boundary (shared detector)')
                if gg.get('ld', 0) > 20:
                    tags.append('incorrect dewarp / content displaced')
                if gg.get('stretch_frac', 0) > 0.30:
                    tags.append('text stretching')
                if gg.get('bg_intrusion', 0) > 0.10:
                    tags.append('background left in output')
                if gg.get('shade', 0) > 0.06:
                    tags.append('shadow remains')
                v = verdict(base, r)
                if r['num_missing'] > base['num_missing'] + 2 and gg.get('ld', 0) > 20:
                    tags.append('text removed / cropped')
                if any(y == 'altered' and x != 'altered' for k in base['nums'] for x, y in zip(base['nums'][k], r['nums'][k])):
                    tags.append('numeric corruption (misread vs before)')
                if (base['qr'] and not r['qr']) or (base['barcode'] and not r['barcode']):
                    tags.append('QR / barcode damaged')
                if r['class'] == 'long' and v != 'PASS':
                    tags.append('long-receipt failure')
                if r['sec'] > 10:
                    tags.append('performance (>10 s on host, 1 thread)')
            for t in tags:
                cnt[m][t] += 1
                if len(examples[m][t]) < 3:
                    examples[m][t].append(case)
    tags = sorted({t for c in cnt.values() for t in c})
    rows = [[t] + [cnt[m][t] for m in METHODS[1:]] for t in tags]
    out = md(f'{label}: failure types (cases; a case can have several)', ['failure type'] + METHODS[1:], rows)
    ex = ['', f'Examples ({label}):', '']
    for m in METHODS[1:]:
        for t in tags:
            if examples[m][t]:
                ex.append(f'- {m} — {t}: ' + ', '.join(examples[m][t]))
    return out + '\n'.join(ex) + '\n'


def flat_control(by_flat, geo_flat, geo_main):
    out = [integrity(by_flat, METHODS, 'Flat control (32 receipts already flat)'), verdicts(by_flat, METHODS, 'Flat control'), geometry_table(geo_flat, 'Flat control')]
    # Does the model know the receipt is flat? UVDoc's own warp estimate, flat vs distorted.
    gd_flat = [c['uvdoc'].get('grid_dev') for c in by_flat.values() if 'uvdoc' in c and c['uvdoc'].get('grid_dev') is not None]
    out.append(f"UVDoc warp estimate (grid deviation from flat, normalised units): flat receipts median {np.median(gd_flat):.4f} "
               f"(p90 {np.percentile(gd_flat, 90):.4f}); gate threshold fixed at 0.008 before results.\n")
    chosen, used = gate(by_flat, 'uvdoc', 'classical', 0.008)
    out.append(f'Gate (uvdoc only if warped and nothing read worse): dewarp applied to **{used} / {len(by_flat)}** flat receipts.\n')
    return '\n'.join(out)


def warp_separation(by_main, by_flat):
    gm = [c['uvdoc'].get('grid_dev') for c in by_main.values() if 'uvdoc' in c and c['uvdoc'].get('grid_dev') is not None]
    gf = [c['uvdoc'].get('grid_dev') for c in by_flat.values() if 'uvdoc' in c and c['uvdoc'].get('grid_dev') is not None]
    thr = sorted(set(np.round(np.percentile(gm + gf, np.arange(5, 100, 5)), 4)))
    best = max(thr, key=lambda t: (np.mean([g >= t for g in gm]) + np.mean([g < t for g in gf])) / 2)
    return (f'Flat-vs-warped separability by UVDoc grid deviation: distorted median {np.median(gm):.4f}, flat median {np.median(gf):.4f}; '
            f'best possible balanced accuracy at {best:.4f}: {(np.mean([g >= best for g in gm]) + np.mean([g < best for g in gf])) / 2:.2f} '
            f'(diagnostic only — the gate threshold was not changed).\n')


def perf_table(perf):
    rows = []
    for p in perf:
        if 'method' not in p:
            continue
        if 'error' in p:
            rows.append([p['method'], 'ERROR'] + ['–'] * 8)
            continue
        rows.append([p['method'], f2(p['init_sec'], 2), f2(p['sec_median'], 2), f2(p['sec_p95'], 2), f2(p['sec_long_median'], 2),
                     f"{p['peak_rss_mb']:.0f}", f"{p['tmp_peak_mb']:.1f}", f"{p['out_jpeg_kb_median']:.0f}", p['failures']])
    return md('Performance (this host, 1 CPU thread per process, same 300 + 32 workload)', ['method', 'init / model load (s)', 'median s/receipt', 'P95 s/receipt',
                                                                                           'long receipts median (s)', 'peak RAM (MB)', 'temp storage peak (MB)',
                                                                                           'output JPEG median (KB)', 'failures / OOM / crash'], rows)


if __name__ == '__main__':
    ev, flat, geo, geo_flat, perf = sys.argv[1:6]
    _, by = load(ev + '/results.jsonl')
    _, byf = load(flat + '/results.jsonl')
    g = [json.loads(x) for x in open(geo)]
    gf = [json.loads(x) for x in open(geo_flat)]
    p = [json.loads(x) for x in open(perf)]
    print(integrity(by, METHODS, 'Distorted set (300)'))
    print(verdicts(by, METHODS, 'Distorted set (300)'))
    print(geometry_table(g, 'Distorted set (300)'))
    print(failures(by, g, 'Distorted set (300)'))
    print(flat_control(byf, gf, g))
    print(warp_separation(by, byf))
    print(perf_table(p))
