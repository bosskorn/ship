"""
Receipt Enhance — check the Owner's raw real-receipt folder, then ingest it.

Checks per receipt (in addition to ../ingest_real.py's own checks):
  - gt.json is reviewed ("reviewed": true) — OCR drafts from draft_gt.py are rejected
  - at least one number is typed in "fields" (total / VAT / date ...)
  - every capture has a <CODE>.corners.json from annotate.html (the crop the user would confirm)
Then prints coverage against the gate minimums (gate.py) and runs ingest_real.py.

The raw folder and the ingested output must stay OUTSIDE the repository (checked).

usage: python3 check_dataset.py RAW_DIR INGESTED_DIR
"""
import json
import os
import subprocess
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from gate import CONDITIONS, GATE  # noqa: E402
from ingest_real import CODES  # noqa: E402


def inside_repo(path):
    try:
        top = subprocess.run(['git', '-C', HERE, 'rev-parse', '--show-toplevel'], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return False
    p = os.path.realpath(path)
    return p == top or p.startswith(top + os.sep)


def main(raw, out):
    for p in (raw, out):
        if inside_repo(p):
            print(f'STOP: {p} is inside the git repository — real receipts must stay outside it')
            return 2
    problems, caps, recs = [], Counter(), {}
    for rec in sorted(os.listdir(raw)):
        d = os.path.join(raw, rec)
        if not os.path.isdir(d):
            continue
        gp = os.path.join(d, 'gt.json')
        if not os.path.exists(gp):
            problems.append(f'{rec}: no gt.json (run draft_gt.py, then review it)')
            continue
        gt = json.load(open(gp, encoding='utf-8'))
        if gt.get('reviewed') is not True:
            problems.append(f'{rec}: gt.json not reviewed (set "reviewed": true after checking every line and number)')
            continue
        f = gt.get('fields', {})
        if not any(str(v).strip() for k, v in f.items() if not isinstance(v, list)) and not f.get('items'):
            problems.append(f'{rec}: no numbers typed in "fields"')
            continue
        recs[rec] = gt
        for fn in os.listdir(d):
            if fn.lower().endswith('.jpg') and fn[:2].upper() in CODES and not fn.startswith('ref'):
                caps[CODES[fn[:2].upper()]] += 1
                if not os.path.exists(os.path.join(d, fn[:-4] + '.corners.json')):
                    problems.append(f'{rec}/{fn}: no corners annotation (annotate.html)')
    print(f'receipts reviewed: {len(recs)} (gate minimum {GATE["min_receipts"]})')
    for code, classes in CONDITIONS.items():
        n = sum(caps[c] for c in classes)
        print(f'  {code:3s} {"+".join(classes):28s} {n:4d} captures {"" if n >= GATE["min_captures_per_condition"] else "(below minimum)"}')
    for label, n, need in (('Thai only', sum(not g.get('english') for g in recs.values()), GATE['min_receipts_thai']),
                           ('Thai + English', sum(bool(g.get('english')) for g in recs.values()), GATE['min_receipts_thai_english']),
                           ('with QR', sum(bool(g.get('qr')) for g in recs.values()), GATE['min_receipts_qr']),
                           ('with barcode', sum(bool(g.get('barcode')) for g in recs.values()), GATE['min_receipts_barcode']),
                           ('with VAT', sum(bool(str(g['fields'].get('vat', '')).strip()) for g in recs.values()), 0),
                           ('with small numbers', sum(bool(g.get('small_numbers')) for g in recs.values()), 0)):
        print(f'  receipts {label:16s} {n:4d}{"" if n >= need else f"  (below minimum {need})"}')
    for p in problems:
        print('CHECK:', p)
    if problems:
        print('Fix the CHECK lines first; nothing was ingested.')
        return 1
    return subprocess.call([sys.executable, os.path.join(os.path.dirname(HERE), 'ingest_real.py'), raw, out])


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:3]))
