"""
Receipt Enhance — draft gt.json for one real receipt, made locally from its flat reference so the
Owner types less: every printed line (local Tesseract) and the QR / barcode payloads (local
zxing). Nothing leaves the computer.

The draft is NOT ground truth: OCR makes mistakes. A person must correct every line, type every
number into "fields", then set "reviewed": true. check_dataset.py rejects unreviewed drafts.

usage: python3 draft_gt.py RECEIPT_DIR      (needs RECEIPT_DIR/ref.png or ref.jpg; writes gt.json
                                             only if it does not exist yet)
"""
import json
import os
import sys

os.environ.setdefault('OMP_THREAD_LIMIT', '1')
import cv2  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import evaluate  # noqa: E402


def main(d):
    out = os.path.join(d, 'gt.json')
    if os.path.exists(out):
        print(f'{out} exists — not overwritten')
        return 1
    refp = next((os.path.join(d, f) for f in ('ref.png', 'ref.jpg') if os.path.exists(os.path.join(d, f))), None)
    if not refp:
        print('need ref.png or ref.jpg')
        return 1
    g = cv2.imread(refp, cv2.IMREAD_GRAYSCALE)
    g = cv2.resize(g, (1152, int(g.shape[0] * 1152 / g.shape[1])), interpolation=cv2.INTER_AREA)
    lines = [ln.strip() for ln in evaluate.ocr(g).splitlines() if ln.strip()]
    codes = evaluate.decode(g)
    qr = next((t for f, ts in codes.items() if f in ('QRCode', 'MicroQRCode') for t in ts), '')
    bar = next(((f, t) for f, ts in codes.items() if f not in ('QRCode', 'MicroQRCode') for t in ts), ('', ''))
    draft = {
        'reviewed': False,
        '_how_to': 'Correct every line against the paper receipt; type every number below exactly as printed '
                   '(empty string if the receipt has none); set english/small_numbers/device; then set reviewed to true.',
        'device': '', 'english': False, 'small_numbers': False,
        'lines': lines,
        'fields': {'date': '', 'time': '', 'receipt_no': '', 'tax_id': '', 'phone': '', 'total': '', 'vat': '', 'pre_vat': '',
                   'cash': '', 'change': '', 'items': [], 'unit_prices': []},
        'qr': qr, 'barcode': bar[1], 'barcode_format': bar[0],
    }
    json.dump(draft, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'draft written: {out} ({len(lines)} lines, QR {"yes" if qr else "no"}, barcode {bar[0] or "no"}) — review it before use')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
