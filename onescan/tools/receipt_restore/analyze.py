"""
Receipt Restore R&D — aggregate results.jsonl into the report tables, and simulate the runtime
quality gate (uses only what the phone has: its own OCR of both images, barcode decoding, and
the model's own warp estimate — never the ground truth).

usage: python3 analyze.py EVAL_DIR [--json OUT.json]
"""
import argparse
import json
import re
from collections import defaultdict

import numpy as np

MONEY = re.compile(r'\d{1,3}(?:,\d{3})*\.\d{2}')
STRICT = re.compile(r'\d{1,3}(?:,\d{3})*\.\d{2}|\d{2}/\d{2}/\d{4}|\d{2}:\d{2}|\d{13}|\d{3}-\d{3}-\d{4}|R\d{2}-\d{6}')


def load(path):
    rows = [json.loads(line) for line in open(path, encoding='utf-8')]
    by = defaultdict(dict)
    for r in rows:
        by[r['case']][r['method']] = r
    return rows, by


def numbers(text):
    return STRICT.findall(re.sub(r'\s+', '', text))


def conflicts(a_text, b_text):
    """Numbers that read differently by one digit between the two OCR passes (same shape)."""
    a, b = set(numbers(a_text)), set(numbers(b_text))
    out = 0
    for x in b - a:
        for y in a - b:
            if len(x) == len(y) and sum(1 for i in range(len(x)) if x[i] != y[i]) == 1:
                out += 1
                break
    return out


def summary(rs):
    ok = [r for r in rs if 'error' not in r]
    if not ok:
        return {}
    tot = sum(r['num_total'] for r in ok)
    secs = [r['sec'] for r in ok]
    return {
        'n': len(ok), 'errors': len(rs) - len(ok),
        'cer': float(np.mean([r['cer'] for r in ok])), 'wer': float(np.mean([r['wer'] for r in ok])),
        'num_found': sum(r['num_found'] for r in ok) / tot, 'num_altered': sum(r['num_altered'] for r in ok) / tot,
        'num_missing': sum(r['num_missing'] for r in ok) / tot,
        'cases_any_altered': float(np.mean([r['num_altered'] > 0 for r in ok])),
        'qr': float(np.mean([r['qr'] for r in ok])), 'barcode': float(np.mean([r['barcode'] for r in ok])),
        'ssim': float(np.mean([r['ssim'] for r in ok])), 'ssim_geo': float(np.mean([r['ssim_geo'] for r in ok])),
        'ld': float(np.mean([r['ld'] for r in ok])), 'ld_median': float(np.median([r['ld'] for r in ok])),
        'sec_mean': float(np.mean(secs)), 'sec_p95': float(np.percentile(secs, 95)),
    }


def vs_baseline(by, method, base='persp'):
    """Per case, against perspective-only: numbers newly altered / lost, codes lost, OCR regression."""
    lost_num = altered_new = code_lost = cer_worse = n = 0
    for case, ms in by.items():
        if method not in ms or base not in ms or 'error' in ms[method]:
            continue
        a, b = ms[base], ms[method]
        n += 1
        for kind in a['nums']:
            for x, y in zip(a['nums'][kind], b['nums'][kind]):
                if x == 'found' and y != 'found':
                    lost_num += 1
                if y == 'altered' and x != 'altered':
                    altered_new += 1
        if (a['qr'] and not b['qr']) or (a['barcode'] and not b['barcode']):
            code_lost += 1
        if b['cer'] > a['cer'] + 0.02:
            cer_worse += 1
    return {'cases': n, 'numbers_lost': lost_num, 'numbers_newly_altered': altered_new, 'cases_code_lost': code_lost, 'cases_cer_worse_2pt': cer_worse}


def gate(by, candidate, safe, grid_min=None):
    """Runtime policy: use `candidate` only if (on-device signals) it reads at least as many
    numbers as `safe`, reads no number differently, decodes every code `safe` decodes, and
    (for neural dewarp) the model's own warp estimate says the receipt is not flat."""
    chosen = []
    used = 0
    for case, ms in by.items():
        if candidate not in ms or safe not in ms or 'error' in ms[candidate]:
            if safe in ms:
                chosen.append(ms[safe])
            continue
        c, s = ms[candidate], ms[safe]
        ok = True
        if grid_min is not None and c.get('grid_dev', 1) < grid_min:
            ok = False
        if len(numbers(c['text'])) < len(numbers(s['text'])):
            ok = False
        if conflicts(s['text'], c['text']) > 0:
            ok = False
        # codes: the phone decodes both images itself
        if (s['qr'] and not c['qr']) or (s['barcode'] and not c['barcode']):
            ok = False
        chosen.append(c if ok else s)
        used += ok
    return chosen, used


def table(title, rows, cols):
    out = [f'### {title}', '', '| ' + ' | '.join(cols) + ' |', '|' + '---|' * len(cols)]
    for r in rows:
        out.append('| ' + ' | '.join(r) + ' |')
    return '\n'.join(out) + '\n'


def pct(x):
    return f'{100 * x:.1f}%'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('eval')
    ap.add_argument('--json')
    a = ap.parse_args()
    rows, by = load(f'{a.eval}/results.jsonl')
    methods = [m for m in ['reference', 'persp', 'classical', 'classical_crisp', 'dewarpnet', 'uvdoc', 'uvdoc_rect'] if any(r['method'] == m for r in rows)]
    S = {m: summary([r for r in rows if r['method'] == m]) for m in methods}
    G = {}
    for name, cand, safe, gm in [('gate_crisp', 'classical_crisp', 'classical', None), ('gate_uvdoc', 'uvdoc', 'classical', 0.008),
                                 ('gate_uvdoc_any', 'uvdoc', 'classical', None)]:
        chosen, used = gate(by, cand, safe, gm)
        G[name] = {**summary(chosen), 'used_candidate': used}
    md = []
    md.append(table('All 300 cases', [[m, str(S[m]['n']), f"{S[m]['cer']:.3f}", f"{S[m]['wer']:.3f}", pct(S[m]['num_found']), pct(S[m]['num_altered']),
                                       pct(S[m]['cases_any_altered']), pct(S[m]['qr']), pct(S[m]['barcode']), f"{S[m]['ssim_geo']:.3f}",
                                       f"{S[m]['ld']:.2f}", f"{S[m]['sec_mean']:.2f}"] for m in methods] +
                    [[g, str(G[g]['n']), f"{G[g]['cer']:.3f}", f"{G[g]['wer']:.3f}", pct(G[g]['num_found']), pct(G[g]['num_altered']),
                      pct(G[g]['cases_any_altered']), pct(G[g]['qr']), pct(G[g]['barcode']), f"{G[g]['ssim_geo']:.3f}", f"{G[g]['ld']:.2f}",
                      f"used {G[g]['used_candidate']}"] for g in G],
                    ['method', 'n', 'CER', 'WER', 'numbers exact', 'numbers ALTERED', 'cases w/ altered', 'QR', 'Code128', 'SSIM (geo)', 'LD px', 'sec (host)']))
    V = {m: vs_baseline(by, m) for m in methods if m not in ('persp', 'reference')}
    md.append(table('Content preservation vs perspective-only (per number / per case)', [[m, str(v['cases']), str(v['numbers_lost']), str(v['numbers_newly_altered']),
                                                                                         str(v['cases_code_lost']), str(v['cases_cer_worse_2pt'])] for m, v in V.items()],
                    ['method', 'cases', 'numbers lost', 'numbers newly ALTERED', 'cases QR/barcode lost', 'cases CER worse >2pt']))
    classes = sorted({r['class'] for r in rows}, key=lambda c: min(int(r['case'][:3]) for r in rows if r['class'] == c))
    per = []
    for c in classes:
        cr = [r for r in rows if r['class'] == c]
        line = [c]
        for m in methods:
            s = summary([r for r in cr if r['method'] == m])
            line.append(f"{s['cer']:.3f} / {pct(s['num_found'])} / {s['ld']:.1f}" if s else '-')
        per.append(line)
    md.append(table('Per distortion class — CER / numbers exact / LD', per, ['class'] + methods))
    print('\n'.join(md))
    if a.json:
        json.dump({'summary': S, 'gates': G, 'vs_persp': V}, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
