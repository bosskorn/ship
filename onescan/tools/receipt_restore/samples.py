"""
Receipt Restore R&D — Before / After sheets from evaluate.py's saved samples.
One row per sample case: capture | reference | each method (same crop window, full resolution
detail so digits can be compared by eye).

usage: python3 samples.py BENCH EVAL_DIR OUT_DIR
"""
import os
import sys

import cv2
import numpy as np

ORDER = ['persp', 'classical', 'classical_crisp', 'uvdoc', 'dewarpnet', 'uvdoc_rect']


def label(img, text):
    img = img.copy()
    cv2.rectangle(img, (0, 0), (img.shape[1], 30), (255, 255, 255), -1)
    cv2.putText(img, text, (6, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 200), 2)
    return img


def main(bench, ev, out):
    os.makedirs(out, exist_ok=True)
    sd = os.path.join(ev, 'samples')
    for case in sorted(os.listdir(sd)):
        cap = cv2.imread(os.path.join(bench, case, 'cap.jpg'))
        ref = cv2.imread(os.path.join(bench, case, 'ref.png'))
        W = 420
        cols = [label(cv2.resize(cap, (W * 2, int(cap.shape[0] * W * 2 / cap.shape[1]))), 'capture')]
        tiles = [('reference', ref)] + [(m, cv2.imread(os.path.join(sd, case, m + '.jpg'))) for m in ORDER if os.path.exists(os.path.join(sd, case, m + '.jpg'))]
        # whole receipt, small
        full = [label(cv2.resize(t, (W, int(t.shape[0] * W / t.shape[1]))), n) for n, t in tiles]
        H = max(x.shape[0] for x in full + cols)
        pad = lambda x: cv2.copyMakeBorder(x, 0, H - x.shape[0], 0, 0, cv2.BORDER_CONSTANT, value=(235, 235, 235))  # noqa: E731
        row = np.hstack([pad(x) for x in cols + full])
        # detail: the totals block (lower middle) at 1:1 from each 1152-wide output
        det = []
        for n, t in tiles:
            t = cv2.resize(t, (1152, int(t.shape[0] * 1152 / t.shape[1])))
            y0 = int(t.shape[0] * 0.55)
            det.append(label(t[y0:y0 + 520, 560:1152], n))
        dh = max(x.shape[0] for x in det)
        detail = np.hstack([cv2.copyMakeBorder(x, 0, dh - x.shape[0], 0, 4, cv2.BORDER_CONSTANT, value=(235, 235, 235)) for x in det])
        cv2.imwrite(os.path.join(out, f'{case}_full.jpg'), row, [cv2.IMWRITE_JPEG_QUALITY, 85])
        cv2.imwrite(os.path.join(out, f'{case}_detail.jpg'), detail, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(case)


if __name__ == '__main__':
    main(*sys.argv[1:4])
