"""
Receipt Restore R&D — evaluation. For every benchmark case and method:

  OCR (Tesseract tha+eng, the same models the app bundles): CER, WER vs ground-truth text
  Numeric integrity: each price / VAT / total / date / time / receipt no. / tax ID / phone is
      found exactly, or ALTERED (a same-length string differing by one digit — a wrong number),
      or missing
  QR / Code 128: decoded and equal to the payload
  Geometry: local distortion (mean dense-flow magnitude vs the flat reference, px at 576 wide)
  Image similarity: SSIM vs the flat reference (grey, 576 wide)
  Time per method (this host, CPU)

usage: python3 evaluate.py BENCH OUT --methods persp,classical,... [--workers 4] [--limit N]
Writes OUT/results.jsonl (one row per case x method, incl. OCR text) and OUT/samples/.
"""
import argparse
import json
import os

os.environ.setdefault('OMP_THREAD_LIMIT', '1')  # Tesseract threads per process (we parallelise by case)
import re
import time
from multiprocessing import Pool

import cv2
import numpy as np

CFG = {}


def compact(s):
    return re.sub(r'\s+', '', s)


def numeric_tokens(f):
    toks = [('date', f['date']), ('time', f['time']), ('receipt_no', f['receipt_no']), ('tax_id', f['tax_id']),
            ('phone', f['phone']), ('total', f['total']), ('vat', f['vat']), ('pre_vat', f['pre_vat']),
            ('cash', f['cash']), ('change', f['change'])]
    toks += [('item', v) for v in f['items']] + [('unit', v) for v in f['unit_prices']]
    return toks


def check_token(tok, text):
    """found | altered | missing. 'altered' = some same-length window differs in exactly one
    position where both characters are digits (e.g. 1,590.00 read as 1,590.80)."""
    t = compact(tok)
    if t in text:
        return 'found'
    L = len(t)
    digits = [i for i, c in enumerate(t) if c.isdigit()]
    if not digits:
        return 'missing'
    for i in range(0, len(text) - L + 1):
        w = text[i:i + L]
        diff = [j for j in range(L) if w[j] != t[j]]
        if len(diff) == 1 and t[diff[0]].isdigit() and w[diff[0]].isdigit():
            # same shape around it (separators match) — a misread number, not unrelated text
            return 'altered'
    return 'missing'


def ocr(gray):
    import pytesseract
    return pytesseract.image_to_string(gray, lang='tha+eng', config='--psm 6 --oem 1')


def decode(gray):
    import zxingcpp
    res = zxingcpp.read_barcodes(gray)
    out = {}
    for r in res:
        out.setdefault(r.format.name, []).append(r.text)
    return out


def geometry(ref_gray, out_gray):
    W = 576
    r = cv2.resize(ref_gray, (W, int(ref_gray.shape[0] * W / ref_gray.shape[1])), interpolation=cv2.INTER_AREA)
    o = cv2.resize(out_gray, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    from skimage.metrics import structural_similarity
    import methods
    ssim = float(structural_similarity(r, o, data_range=255))
    # Geometry only: put every output through the same paper normalisation first, so shading
    # and tone choices do not count as distortion (persp and classical share one geometry).
    on = cv2.cvtColor(methods.tone(cv2.cvtColor(o, cv2.COLOR_GRAY2BGR), 'crisp'), cv2.COLOR_BGR2GRAY)
    rn = r
    ssim_geo = float(structural_similarity(rn, on, data_range=255))
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    flow = dis.calc(rn, on, None)
    mag = np.linalg.norm(flow, axis=2)
    ink = r < 160
    ld = float(mag[ink].mean()) if ink.any() else float(mag.mean())
    return ssim, ssim_geo, ld


def score(name, gt, ref_gray, img_bgr, elapsed):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
    if gray.shape[1] != 1152:
        gray = cv2.resize(gray, (1152, int(gray.shape[0] * 1152 / gray.shape[1])), interpolation=cv2.INTER_AREA)
    from rapidfuzz.distance import Levenshtein
    text = ocr(gray)
    gt_text = compact(''.join(gt['lines']))
    tc = compact(text)
    cer = Levenshtein.distance(gt_text, tc) / max(1, len(gt_text))
    gt_words = ' '.join(gt['lines']).split()
    wer = Levenshtein.distance(gt_words, text.split()) / max(1, len(gt_words))
    nums = {}
    for kind, tok in numeric_tokens(gt['fields']):
        nums.setdefault(kind, []).append(check_token(tok, tc))
    codes = decode(gray)
    qr_ok = gt['qr'] in codes.get('QRCode', [])
    bc_ok = gt['barcode'] in codes.get('Code128', [])
    ssim, ssim_geo, ld = geometry(ref_gray, gray)
    flat = [v for vs in nums.values() for v in vs]
    return {
        'method': name, 'cer': cer, 'wer': wer, 'qr': qr_ok, 'barcode': bc_ok, 'ssim': ssim, 'ssim_geo': ssim_geo, 'ld': ld, 'sec': elapsed,
        'num_found': flat.count('found'), 'num_altered': flat.count('altered'), 'num_missing': flat.count('missing'), 'num_total': len(flat),
        'nums': nums, 'text': text, 'out_h': int(img_bgr.shape[0]),
    }


def work(case):
    import torch
    torch.set_num_threads(1)
    import methods
    d = os.path.join(CFG['bench'], case)
    gt = json.load(open(os.path.join(d, 'gt.json'), encoding='utf-8'))
    cap = cv2.imread(os.path.join(d, 'cap.jpg'))
    ref = cv2.imread(os.path.join(d, 'ref.png'), cv2.IMREAD_GRAYSCALE)
    rows = []
    base = {'case': case, 'class': gt['class']}
    if CFG['with_ref']:
        rows.append({**base, **score('reference', gt, ref, ref, 0.0)})
    quad = methods.detect_receipt(cap)
    gq = np.float32(gt['corners'])
    det_err = float(np.linalg.norm(methods.order_quad(quad) - gq, axis=1).mean())
    for m in CFG['methods']:
        t = time.time()
        try:
            out, info = methods.run(m, cap, CFG, quad=quad)
        except Exception as e:  # a method failing is a result, not a crash of the benchmark
            rows.append({**base, 'method': m, 'error': str(e)[:200]})
            continue
        el = time.time() - t
        r = {**base, **score(m, gt, ref, out, el), 'det_err_px': det_err}
        if 'grid' in info:
            g = info['grid']
            # deviation of the predicted grid from a bilinear (flat) grid = how warped the model thinks it is
            gh, gw = g.shape[1], g.shape[2]
            yy, xx = np.meshgrid(np.linspace(0, 1, gh), np.linspace(0, 1, gw), indexing='ij')
            c = [g[:, 0, 0], g[:, 0, -1], g[:, -1, -1], g[:, -1, 0]]
            bil = (c[0][:, None, None] * (1 - xx) * (1 - yy) + c[1][:, None, None] * xx * (1 - yy) +
                   c[2][:, None, None] * xx * yy + c[3][:, None, None] * (1 - xx) * yy)
            r['grid_dev'] = float(np.abs(g - bil).mean())
        rows.append(r)
        if CFG['samples'] and int(case[:3]) % CFG['samples'] == 0:
            sd = os.path.join(CFG['out'], 'samples', case)
            os.makedirs(sd, exist_ok=True)
            cv2.imwrite(os.path.join(sd, f'{m}.jpg'), out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('out')
    ap.add_argument('--methods', default='persp,classical,classical_crisp,dewarpnet,uvdoc,uvdoc_rect')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--samples', type=int, default=16, help='save outputs of every Nth case (0 = none)')
    ap.add_argument('--no-ref', action='store_true')
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    a = ap.parse_args()
    CFG.update(bench=a.bench, out=a.out, methods=a.methods.split(','), with_ref=not a.no_ref, samples=a.samples,
               uvdoc_repo=a.uvdoc_repo, dewarpnet_repo=a.dewarpnet_repo, dewarpnet_w=a.dewarpnet_w)
    os.makedirs(a.out, exist_ok=True)
    cases = json.load(open(os.path.join(a.bench, 'index.json')))
    if a.limit:
        cases = cases[:a.limit]
    done = set()
    path = os.path.join(a.out, 'results.jsonl')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            done.add(json.loads(line)['case'])
    todo = [c for c in cases if c not in done]
    with Pool(a.workers) as pool, open(path, 'a', encoding='utf-8') as f:
        for rows in pool.imap_unordered(work, todo):
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
            f.flush()
            print(rows[0]['case'], flush=True)


if __name__ == '__main__':
    main()
