"""Half-resolution PNG of every capture (+ original size) for the DocSeg host harness."""
import json
import os
import sys

import cv2

bench, out = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
meta = {}
for c in json.load(open(os.path.join(bench, 'index.json'))):
    im = cv2.imread(os.path.join(bench, c, 'cap.jpg'))
    h, w = im.shape[:2]
    half = cv2.resize(im, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(out, c + '.png'), cv2.cvtColor(half, cv2.COLOR_BGR2RGB)[:, :, ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 6])
    meta[c] = {'w': w, 'h': h}
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'))
print(len(meta))
