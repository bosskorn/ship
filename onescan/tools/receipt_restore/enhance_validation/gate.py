"""
Receipt Enhance — product gate. The criteria below are PROPOSED values, written before any
real receipt was seen. The Owner confirms or changes them BEFORE the real set is run; after that
they are frozen (bump `version` for any change and say why in the report). They must not be
adjusted after results are read.

Items 6-9 cannot be decided on a host: they stay PENDING until the Android run and the Owner's
review on a phone.
"""
GATE = {
    'version': 'enhance-gate-1 (PROPOSED, awaiting Owner confirmation)',
    # minimum real data before any host verdict is given
    'min_receipts': 60,
    'min_captures_per_condition': 10,     # FL, L1, T1, W1+W2, F1+F2, S1, S2, B1, X1
    'min_receipts_thai': 20,
    'min_receipts_thai_english': 20,
    'min_receipts_qr': 10,
    'min_receipts_barcode': 10,
    # 1 readability
    'min_exact_gain_pts': 3.0,            # numbers exact, enhanced - original, all captures
    'max_condition_drop_pts': 2.0,        # no condition may lose more than this
    # 2 numeric integrity
    'max_newly_altered_key': 0,           # total, VAT, pre-VAT, date, time, tax ID
    'max_newly_altered_share': 0.005,     # of all numbers
    # 3 long receipts
    'long_natural_share': 1.0,            # every L1 capture must get the natural tone
    # 4 codes
    'max_qr_regressions': 0,              # captures decoded on Original but not on Enhanced
    'max_barcode_regressions': 0,
}

CONDITIONS = {'FL': ['flat'], 'L1': ['long'], 'T1': ['thermal_faded'], 'W': ['wrinkle_light', 'wrinkle_heavy'], 'F': ['fold_half', 'fold_multi'],
              'S1': ['crease_shadow'], 'S2': ['uneven_light'], 'B1': ['busy_background'], 'X1': ['small_text']}


def _pts(x):
    return 100 * x if x is not None else None


def _f(x, pct=False):
    if x is None:
        return '–'
    return f'{100 * x:.1f}%' if pct else f'{x:.3f}'


def data_sufficient(rows):
    g = GATE
    recs = {r['receipt']: r for r in rows}
    short = []
    if len(recs) < g['min_receipts']:
        short.append(f'receipts {len(recs)}/{g["min_receipts"]}')
    for code, classes in CONDITIONS.items():
        n = sum(r['class'] in classes for r in rows)
        if n < g['min_captures_per_condition']:
            short.append(f'{code} {n}/{g["min_captures_per_condition"]}')
    for label, n, need in (('Thai', sum(not r['english'] for r in recs.values()), g['min_receipts_thai']),
                           ('Thai+EN', sum(r['english'] for r in recs.values()), g['min_receipts_thai_english']),
                           ('QR', sum(r['has_qr'] for r in recs.values()), g['min_receipts_qr']),
                           ('barcode', sum(r['has_barcode'] for r in recs.values()), g['min_receipts_barcode'])):
        if n < need:
            short.append(f'{label} {n}/{need}')
    return short


def code_regressions(rows, kind):
    return sum(1 for r in rows if r['scores']['original'][kind] is True and r['scores']['enhanced'][kind] is False)


def evaluate_gate(rows, transitions, agg):
    g = GATE
    short = data_sufficient(rows)
    verdict = (lambda ok: 'PASS' if ok else 'FAIL') if not short else (lambda ok: 'INSUFFICIENT DATA')
    out = []
    o, e = agg(rows, 'original'), agg(rows, 'enhanced')
    gain = (_pts(e['exact']) or 0) - (_pts(o['exact']) or 0)
    drops = []
    for code, classes in CONDITIONS.items():
        rs = [r for r in rows if r['class'] in classes]
        if rs:
            d = (_pts(agg(rs, 'enhanced')['exact']) or 0) - (_pts(agg(rs, 'original')['exact']) or 0)
            drops.append((d, code))
    worst = min(drops) if drops else (0.0, '–')
    cer_ok = o['cer'] is None or e['cer'] is None or e['cer'] <= o['cer']
    out.append([1, f'readability: numbers exact +{g["min_exact_gain_pts"]} pts; no condition below -{g["max_condition_drop_pts"]} pts; CER not worse',
                f'{gain:+.1f} pts; worst {worst[1]} {worst[0]:+.1f}; CER {_f(o["cer"])} → {_f(e["cer"])}',
                verdict(gain >= g['min_exact_gain_pts'] and worst[0] >= -g['max_condition_drop_pts'] and cer_ok)])
    c, key = transitions(rows)
    total = sum(c.values()) or 1
    out.append([2, f'numeric integrity: newly ALTERED key fields ≤ {g["max_newly_altered_key"]}; all ≤ {100 * g["max_newly_altered_share"]:.1f}%; lost ≤ recovered',
                f'key {sum(key.values())} {dict(key)}; all {c["newly_altered"]} ({100 * c["newly_altered"] / total:.2f}%); lost {c["lost"]} / recovered {c["recovered"]}',
                verdict(sum(key.values()) <= g['max_newly_altered_key'] and c['newly_altered'] / total <= g['max_newly_altered_share'] and c['lost'] <= c['recovered'])])
    lr = [r for r in rows if r['class'] == 'long']
    if lr:
        share = sum(r['decision']['tone'] == 'natural' for r in lr) / len(lr)
        lo, le, lc = agg(lr, 'original'), agg(lr, 'enhanced'), agg(lr, 'crisp')
        lc_, lkey = transitions(lr)
        ok = share >= g['long_natural_share'] and (le['exact'] or 0) >= (lo['exact'] or 0) and sum(lkey.values()) == 0
        out.append([3, 'long receipts: every L1 gets natural; enhanced ≥ original; no newly ALTERED key field',
                    f'natural {100 * share:.0f}%; exact {_pts(lo["exact"]):.1f}% → {_pts(le["exact"]):.1f}% (crisp would be {_pts(lc["exact"]):.1f}%); key ALTERED {sum(lkey.values())}',
                    verdict(ok)])
    else:
        out.append([3, 'long receipts', 'no L1 captures', 'INSUFFICIENT DATA'])
    qr, bc = code_regressions(rows, 'qr'), code_regressions(rows, 'barcode')
    out.append([4, f'QR / barcode: regressions ≤ {g["max_qr_regressions"]} / {g["max_barcode_regressions"]}',
                f'QR {qr} (decoded {_f(o["qr"], True)} → {_f(e["qr"], True)}); barcode {bc} (decoded {_f(o["barcode"], True)} → {_f(e["barcode"], True)})',
                verdict(qr <= g['max_qr_regressions'] and bc <= g['max_barcode_regressions'])])
    changed = sum(not r['input_unchanged'] for r in rows)
    out.append([5, 'original never modified (SHA-256 of every capture before = after)', f'{len(rows) - changed}/{len(rows)} unchanged', 'PASS' if changed == 0 else 'FAIL'])
    out.append([6, 'no persistent plaintext temp files', 'device check (ANDROID_VALIDATION.md)', 'PENDING'])
    out.append([7, 'Android: no OOM / ANR / crash', 'device check', 'PENDING'])
    out.append([8, 'processing time usable on device', 'device check', 'PENDING'])
    out.append([9, 'Owner approves Before/After on a real phone', 'Owner review', 'PENDING'])
    if short:
        out.append(['–', 'data minimums', 'short: ' + ', '.join(short), 'INSUFFICIENT DATA'])
    return out
