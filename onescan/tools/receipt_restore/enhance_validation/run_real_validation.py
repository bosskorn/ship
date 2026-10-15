"""
Receipt Enhance — real-receipt validation run (host). Input: a folder produced by
check_dataset.py + ../ingest_real.py from the Owner's real captures. Nothing is uploaded; OCR
and code decoding run locally.

For every capture:
  boundary   the annotated corners (= the crop the user confirms in the app's editor); the R1
             detector only when a capture has no annotation (recorded per row)
  original   perspective only, no tone (what the user sees as "ต้นฉบับ" after cropping)
  enhanced   the candidate: enhance_policy (crisp for normal, natural for long / not sure)
  crisp, natural  both tones on the same crop, as diagnostics for the long-receipt rule
  reference  the flat reference (OCR ceiling)

Measures per image: numbers exact / ALTERED / missing per field kind, CER and Thai-only CER
(when gt lines are given), QR and 1-D barcode decode (any symbology), enhance time on this host.
Per number: Original -> Enhanced transition (kept / recovered / lost / newly ALTERED).
Original safety: SHA-256 of every input capture before and after the run must match.

Outputs: OUT/results.jsonl, OUT/summary.md (coverage, results, product gate), OUT/review/
(Before/After images + index.html to open on a phone, no network code).

usage: python3 run_real_validation.py INGESTED_DIR OUT [--workers 4]
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from multiprocessing import Pool

os.environ.setdefault('OMP_THREAD_LIMIT', '1')
import cv2  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import enhance_policy  # noqa: E402
import evaluate  # noqa: E402
import methods  # noqa: E402
from gate import GATE, evaluate_gate  # noqa: E402

KEY_FIELDS = ['total', 'vat', 'pre_vat', 'date', 'time', 'tax_id']
SCALAR_FIELDS = ['date', 'time', 'receipt_no', 'tax_id', 'phone', 'total', 'vat', 'pre_vat', 'cash', 'change']
THAI = re.compile(r'[฀-๿]')
CFG = {}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def tokens(fields):
    """(kind, value) for every non-empty number on the receipt (real receipts lack some fields)."""
    out = [(k, fields.get(k, '')) for k in SCALAR_FIELDS]
    out += [('item', v) for v in fields.get('items', [])] + [('unit', v) for v in fields.get('unit_prices', [])]
    return [(k, str(v)) for k, v in out if str(v).strip()]


def score(gt, img_bgr):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    if gray.shape[1] != 1152:
        gray = cv2.resize(gray, (1152, int(gray.shape[0] * 1152 / gray.shape[1])), interpolation=cv2.INTER_AREA)
    from rapidfuzz.distance import Levenshtein
    text = evaluate.ocr(gray)
    tc = evaluate.compact(text)
    nums = [(k, evaluate.check_token(v, tc)) for k, v in tokens(gt['fields'])]
    r = {'nums': nums, 'num_total': len(nums), 'num_found': sum(s == 'found' for _, s in nums),
         'num_altered': sum(s == 'altered' for _, s in nums), 'text': text}
    if gt.get('lines'):
        g = evaluate.compact(''.join(gt['lines']))
        r['cer'] = Levenshtein.distance(g, tc) / max(1, len(g))
        gth, oth = ''.join(THAI.findall(g)), ''.join(THAI.findall(tc))
        r['thai_cer'] = Levenshtein.distance(gth, oth) / len(gth) if gth else None
    codes = evaluate.decode(gray)
    qr = [t for f, ts in codes.items() if f in ('QRCode', 'MicroQRCode') for t in ts]
    bars = [t for f, ts in codes.items() if f not in ('QRCode', 'MicroQRCode') for t in ts]
    r['qr'] = (gt['qr'] in qr) if gt.get('qr') else None
    r['barcode'] = (gt['barcode'] in bars) if gt.get('barcode') else None
    return r


def work(case):
    d = os.path.join(CFG['data'], case)
    gt = json.load(open(os.path.join(d, 'gt.json'), encoding='utf-8'))
    capp = os.path.join(d, 'cap.jpg')
    h0 = sha256(capp)
    cap = cv2.imread(capp)
    ref = cv2.imread(os.path.join(d, 'ref.png'))
    exp = os.path.join(d, 'extras.json')
    if os.path.exists(exp):
        quad, src = json.load(open(exp))['true_corners'], 'annotated'
    else:
        quad, src = methods.detect_receipt(cap).tolist(), 'r1_detector'
    t = time.perf_counter()
    orig, enh, dec = enhance_policy.enhance(cap, quad)
    ms = (time.perf_counter() - t) * 1000
    imgs = {'original': orig, 'enhanced': enh, 'crisp': methods.tone(orig, 'crisp'), 'natural': methods.tone(orig, 'natural'), 'reference': ref}
    row = {'case': case, 'receipt': case.rsplit('_', 1)[0], 'code': case.rsplit('_', 1)[1], 'class': gt['class'], 'boundary': src,
           'decision': dec, 'enhance_ms_host': round(ms, 1), 'english': bool(gt.get('english')), 'device': gt.get('device', ''),
           'has_qr': bool(gt.get('qr')), 'has_barcode': bool(gt.get('barcode')), 'small_text': gt['class'] == 'small_text' or bool(gt.get('small_numbers'))}
    row['scores'] = {k: score(gt, v) for k, v in imgs.items()}
    rd = os.path.join(CFG['out'], 'review')
    for k in ('original', 'enhanced'):
        cv2.imwrite(os.path.join(rd, f'{case}__{k}.jpg'), imgs[k], [cv2.IMWRITE_JPEG_QUALITY, 92])
    row['input_sha256'] = h0
    row['input_unchanged'] = sha256(capp) == h0
    return row


def transitions(rows, a='original', b='enhanced'):
    c = Counter()
    key = Counter()
    for r in rows:
        for (kind, x), (_, y) in zip(r['scores'][a]['nums'], r['scores'][b]['nums']):
            if x == 'found' and y == 'found':
                c['kept'] += 1
            elif x != 'found' and y == 'found':
                c['recovered'] += 1
            elif x == 'found' and y == 'missing':
                c['lost'] += 1
            elif y == 'altered' and x != 'altered':
                c['newly_altered'] += 1
                if kind in KEY_FIELDS:
                    key[kind] += 1
            else:
                c['missed_both'] += 1
    return c, key


def pct(x):
    return '–' if x is None or (isinstance(x, float) and np.isnan(x)) else f'{100 * x:.1f}%'


def table(title, header, rows):
    s = f'#### {title}\n\n| ' + ' | '.join(header) + ' |\n|' + '---|' * len(header) + '\n'
    return s + ''.join('| ' + ' | '.join(str(v) for v in r) + ' |\n' for r in rows) + '\n'


def agg(rows, k):
    sc = [r['scores'][k] for r in rows]
    tot = sum(s['num_total'] for s in sc)
    cer = [s['cer'] for s in sc if s.get('cer') is not None]
    tcer = [s['thai_cer'] for s in sc if s.get('thai_cer') is not None]
    qr = [s['qr'] for s in sc if s['qr'] is not None]
    bc = [s['barcode'] for s in sc if s['barcode'] is not None]
    return {'n': len(rows), 'exact': sum(s['num_found'] for s in sc) / tot if tot else None, 'altered': sum(s['num_altered'] for s in sc),
            'cer': float(np.median(cer)) if cer else None, 'thai_cer': float(np.median(tcer)) if tcer else None,
            'qr': float(np.mean(qr)) if qr else None, 'barcode': float(np.mean(bc)) if bc else None}


def coverage(rows):
    recs = {r['receipt']: r for r in rows}
    c = Counter(r['class'] for r in rows)
    out = [(f'captures: {k}', v) for k, v in sorted(c.items())]
    out += [('receipts', len(recs)), ('receipts Thai only', sum(not r['english'] for r in recs.values())),
            ('receipts Thai + English', sum(r['english'] for r in recs.values())), ('receipts with QR', sum(r['has_qr'] for r in recs.values())),
            ('receipts with barcode', sum(r['has_barcode'] for r in recs.values())), ('captures with small numbers', sum(r['small_text'] for r in rows)),
            ('devices', len({r['device'] for r in rows if r['device']}))]
    return out


def review_html(rows, path):
    items = []
    for r in sorted(rows, key=lambda r: r['case']):
        e, o = r['scores']['enhanced'], r['scores']['original']
        items.append(
            f'<section><h2>{html.escape(r["case"])} · {html.escape(r["class"])}</h2>'
            f'<p>tone: <b>{r["decision"]["tone"]}</b> ({r["decision"]["reason"]}) · numbers {o["num_found"]}/{o["num_total"]} → '
            f'{e["num_found"]}/{e["num_total"]} · ALTERED {o["num_altered"]} → {e["num_altered"]}</p>'
            f'<div class="pair"><figure><figcaption>ต้นฉบับ</figcaption><img loading="lazy" src="{html.escape(r["case"])}__original.jpg"></figure>'
            f'<figure><figcaption>ปรับให้อ่านง่าย</figcaption><img loading="lazy" src="{html.escape(r["case"])}__enhanced.jpg"></figure></div></section>')
    page = ('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            '<title>Receipt Enhance Review</title><style>:root{--bg:#fafaf7;--fg:#1f2328;--line:#d6d6cf;color-scheme:light}'
            '@media (prefers-color-scheme:dark){:root{--bg:#16181b;--fg:#e6e6e1;--line:#3a3d42;color-scheme:dark}}'
            'body{margin:0;padding:12px max(16px,env(safe-area-inset-left));background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,"Noto Sans Thai",sans-serif}'
            'section{border-top:1px solid var(--line);padding:12px 0}h2{font-size:16px;margin:0 0 4px}p{margin:0 0 8px}'
            '.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}figure{margin:0;min-width:0}img{width:100%;height:auto;display:block}'
            'figcaption{font-weight:600}</style></head><body><h1>Receipt Enhance — Before / After</h1>'
            '<p>เปิดไฟล์นี้บนโทรศัพท์ (คัดลอกทั้งโฟลเดอร์ผ่าน USB) — ไม่มีการเชื่อมต่อเครือข่าย</p>' + ''.join(items) + '</body></html>')
    open(path, 'w', encoding='utf-8').write(page)


def summarise(rows, out):
    s = '# Receipt Enhance — real-receipt validation summary\n\n'
    s += f'Policy `{enhance_policy.POLICY_VERSION}`; gate `{GATE["version"]}`.\n\n'
    s += table('Coverage', ['item', 'count'], coverage(rows))
    groups = [('all', rows), ('long (L1)', [r for r in rows if r['class'] == 'long']), ('normal-length', [r for r in rows if r['class'] != 'long'])]
    groups += [(c, [r for r in rows if r['class'] == c]) for c in sorted({r['class'] for r in rows}) if c != 'long']
    res = []
    for name, rs in groups:
        if not rs:
            continue
        for k in ('reference', 'original', 'enhanced', 'crisp', 'natural'):
            a = agg(rs, k)
            res.append([name, k, a['n'], pct(a['exact']), a['altered'], f"{a['cer']:.3f}" if a['cer'] is not None else '–',
                        f"{a['thai_cer']:.3f}" if a['thai_cer'] is not None else '–', pct(a['qr']), pct(a['barcode'])])
    s += table('Results', ['group', 'image', 'captures', 'numbers exact', 'ALTERED', 'CER median', 'Thai CER median', 'QR', 'barcode'], res)
    c, key = transitions(rows)
    s += table('Every number: Original → Enhanced', ['kept', 'recovered', 'lost', 'newly ALTERED', 'newly ALTERED in total/VAT/pre-VAT/date/time/tax ID', 'missed by both'],
               [[c['kept'], c['recovered'], c['lost'], c['newly_altered'], sum(key.values()) or 0, c['missed_both']]])
    dec = Counter((r['class'] == 'long', r['decision']['tone'], r['decision']['reason']) for r in rows)
    s += table('Tone decisions', ['long capture (L1)', 'tone', 'reason', 'captures'], [[a, b, cc, n] for (a, b, cc), n in sorted(dec.items())])
    ms = [r['enhance_ms_host'] for r in rows]
    s += f'Enhance time on this host (not a device figure): median {np.median(ms):.0f} ms, P95 {np.percentile(ms, 95):.0f} ms.\n\n'
    g = evaluate_gate(rows, transitions, agg)
    s += table('Product gate (host part; device and Owner items stay PENDING)', ['#', 'criterion', 'measured', 'result'], g)
    open(os.path.join(out, 'summary.md'), 'w', encoding='utf-8').write(s)
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('data')
    ap.add_argument('out')
    ap.add_argument('--workers', type=int, default=4)
    a = ap.parse_args()
    CFG.update(data=a.data, out=a.out)
    os.makedirs(os.path.join(a.out, 'review'), exist_ok=True)
    cases = json.load(open(os.path.join(a.data, 'index.json')))
    rows = []
    with Pool(a.workers) as pool, open(os.path.join(a.out, 'results.jsonl'), 'w', encoding='utf-8') as f:
        for r in pool.imap_unordered(work, cases):
            f.write(json.dumps(r, ensure_ascii=False, default=float) + '\n')
            f.flush()
            rows.append(r)
            print(r['case'], r['decision']['tone'], flush=True)
    review_html(rows, os.path.join(a.out, 'review', 'index.html'))
    print(summarise(rows, a.out))


if __name__ == '__main__':
    main()
