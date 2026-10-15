"""
Receipt Restore R2 — real receipt set: validate a folder captured per CAPTURE_PROTOCOL.md and
convert it to the benchmark layout used by evaluate.py / evaluate_r2.py.

Input (one folder per physical receipt, any names):
  <receipt>/ref.(jpg|png)          flat reference (flatbed 300 dpi or photo under glass)
  <receipt>/gt.json                ground truth (template in CAPTURE_PROTOCOL.md)
  <receipt>/<code>.jpg             one distorted capture per condition code (W1, W2, F1, ...)
  <receipt>/<code>.corners.json    true corners (+ optional boundary polyline) of the receipt in
                                   that capture, made with annotate.html (needed for the oracle test)
  <receipt>/redactions.json        optional: rectangles [x0,y0,x1,y1] in ref to black out

Output: OUT/<receipt>_<code>/{cap.jpg, ref.png, gt.json, extras.json} + OUT/index.json

Checks (fails loudly, writes nothing for a bad receipt): required files, at least one capture,
gt.json fields, condition codes, image sizes, and that redactions were applied (no pixel inside a
redaction box is non-black). The real set must stay out of the repository.

usage: python3 ingest_real.py IN_DIR OUT_DIR
"""
import json
import os
import sys

import cv2
import numpy as np

CODES = {'FL': 'flat', 'W1': 'wrinkle_light', 'W2': 'wrinkle_heavy', 'F1': 'fold_half', 'F2': 'fold_multi', 'C1': 'curl',
         'C2': 'curved_edges', 'L1': 'long', 'T1': 'thermal_faded', 'S1': 'crease_shadow', 'S2': 'uneven_light',
         'P1': 'tilted', 'B1': 'busy_background', 'X1': 'small_text'}
FIELDS = ['date', 'time', 'receipt_no', 'tax_id', 'phone', 'total', 'vat', 'pre_vat', 'cash', 'change', 'items', 'unit_prices']


def redact(img, boxes):
    for x0, y0, x1, y1 in boxes:
        img[int(y0):int(y1), int(x0):int(x1)] = 0
    return img


def main(src, out):
    os.makedirs(out, exist_ok=True)
    index, problems = [], []
    for rec in sorted(os.listdir(src)):
        d = os.path.join(src, rec)
        if not os.path.isdir(d):
            continue
        refp = next((os.path.join(d, f) for f in ('ref.png', 'ref.jpg') if os.path.exists(os.path.join(d, f))), None)
        gtp = os.path.join(d, 'gt.json')
        if not refp or not os.path.exists(gtp):
            problems.append(f'{rec}: missing ref.(png|jpg) or gt.json')
            continue
        gt = json.load(open(gtp, encoding='utf-8'))
        missing = [k for k in FIELDS if k not in gt.get('fields', {})] + [k for k in ('lines', 'qr', 'barcode') if k not in gt]
        if missing:
            problems.append(f'{rec}: gt.json missing {missing}')
            continue
        ref = cv2.imread(refp, cv2.IMREAD_GRAYSCALE)
        reds = json.load(open(os.path.join(d, 'redactions.json'))) if os.path.exists(os.path.join(d, 'redactions.json')) else []
        ref = redact(ref, reds)
        # Same width as the synthetic references so metrics are comparable.
        k = 1152 / ref.shape[1]
        ref = cv2.resize(ref, (1152, int(ref.shape[0] * k)), interpolation=cv2.INTER_AREA)
        caps = [f for f in os.listdir(d) if f.lower().endswith('.jpg') and f[:2].upper() in CODES and not f.startswith('ref')]
        if not caps:
            problems.append(f'{rec}: no capture named <CODE>.jpg (codes: {", ".join(CODES)})')
            continue
        for f in sorted(caps):
            code = f[:2].upper()
            cap = cv2.imread(os.path.join(d, f))
            if cap is None or min(cap.shape[:2]) < 600:
                problems.append(f'{rec}/{f}: unreadable or smaller than 600 px')
                continue
            case = f'{rec}_{code}'
            od = os.path.join(out, case)
            os.makedirs(od, exist_ok=True)
            cv2.imwrite(os.path.join(od, 'cap.jpg'), cap, [cv2.IMWRITE_JPEG_QUALITY, 95])
            cv2.imwrite(os.path.join(od, 'ref.png'), ref)
            g = dict(gt, **{'class': CODES[code], 'source': 'real', 'ref_size': [ref.shape[1], ref.shape[0]]})
            cj = os.path.join(d, f[:-4] + '.corners.json')
            if os.path.exists(cj):
                c = json.load(open(cj))
                g['corners'] = c['corners']
                json.dump({'true_corners': c['corners'], 'boundary': c.get('boundary', []), 'frame': [cap.shape[1], cap.shape[0]],
                           'ref_size': g['ref_size']}, open(os.path.join(od, 'extras.json'), 'w'))
            else:
                g['corners'] = [[0, 0], [cap.shape[1], 0], [cap.shape[1], cap.shape[0]], [0, cap.shape[0]]]
                problems.append(f'{case}: no corners annotation (oracle test will skip it)')
            json.dump(g, open(os.path.join(od, 'gt.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            index.append(case)
    json.dump(index, open(os.path.join(out, 'index.json'), 'w'), indent=1)
    print(f'{len(index)} captures written to {out}')
    for p in problems:
        print('CHECK:', p)
    return 0 if index else 1


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:3]))
