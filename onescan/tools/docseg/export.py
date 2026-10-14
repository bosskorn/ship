"""Export a trained DocSeg to the on-device weight file (BatchNorm folded).

Layout (little endian): ASCII "DSG2", 7 x uint32 block counts (encoder stages e1..e4,
decoder stages d3..d1), uint32 array count, then the float32 arrays in forward order,
each as uint32 length + data. Conv weights are [cout][cin/groups][kh][kw];
each conv is followed by its bias. The runtimes (src/core/document-engine/capture/docSeg.ts,
DocSeg.kt, DocSeg.swift) hard-code this order.

Also writes a parity vector for runtime tests: Y, Cb, Cr planes (128x128 uint8 each)
followed by the expected 64x64 float32 logits.

    python3 export.py docseg.pt docseg.bin [parity.bin]
"""
import struct, sys
import numpy as np
import torch
from model import DocSeg, ConvBN, SPEC


def fold(m: ConvBN):
    w = m.conv.weight.detach()
    bn = m.bn
    s = bn.weight.detach() / torch.sqrt(bn.running_var + bn.eps)
    return (w * s[:, None, None, None]).numpy(), (bn.bias.detach() - bn.running_mean * s).numpy()


def convs(model):
    """ConvBN modules in forward order (excluding ctx/head)."""
    seq = [model.stem, model.e1, model.e2, model.e3, model.e4]
    out = []
    for s in seq:
        out += [m for m in s.modules() if isinstance(m, ConvBN)]
    ctx = (model.ctx.weight.detach().numpy(), model.ctx.bias.detach().numpy())
    dec = []
    for s in (model.d3, model.d2, model.d1):
        dec += [m for m in s.modules() if isinstance(m, ConvBN)]
    return out, ctx, dec


def main():
    src, dst = sys.argv[1], sys.argv[2]
    model = DocSeg(SPEC); model.load_state_dict(torch.load(src, map_location='cpu')); model.eval()
    enc, ctx, dec = convs(model)
    arrays = []
    for m in enc:
        arrays += list(fold(m))
    arrays += [ctx[0], ctx[1]]
    for m in dec:
        arrays += list(fold(m))
    arrays += [model.head.weight.detach().numpy(), model.head.bias.detach().numpy()]
    with open(dst, 'wb') as f:
        f.write(b'DSG2'); f.write(struct.pack('<7I', *SPEC['blocks'])); f.write(struct.pack('<I', len(arrays)))
        for a in arrays:
            a = np.ascontiguousarray(a, dtype='<f4').ravel()
            f.write(struct.pack('<I', a.size)); f.write(a.tobytes())
    print(dst, len(arrays), 'arrays', sum(a.size for a in arrays), 'floats')
    if len(sys.argv) > 3:
        # A synthetic scene that looks like a document photo (no real images in the repo):
        # a tilted page with lines of text on a textured, darker tinted table. A blank
        # rectangle is not enough — the model is trained to ignore blank cards and tiles.
        yy, xx = np.mgrid[0:128, 0:128].astype(np.float32)
        page = ((xx - 30) * 0.97 + (yy - 20) * 0.26 > 0) & ((xx - 100) * 0.97 + (yy - 40) * 0.26 < 0) & \
               ((yy - 18) * 0.97 - (xx - 30) * 0.26 > 0) & ((yy - 110) * 0.97 - (xx - 30) * 0.26 < 0)
        u = (xx - 30) * 0.97 + (yy - 20) * 0.26          # along the page width
        v = (yy - 18) * 0.97 - (xx - 30) * 0.26          # down the page
        rng = np.random.default_rng(3)
        # Printed-page layout: a title, paragraphs with ragged line ends and word gaps.
        text = np.zeros_like(page)
        line_v = [9.0, 10.5] + [16 + 3.2 * i for i in range(22) if i not in (6, 13, 19)]
        for i, lv in enumerate(line_v):
            end = 60 - (rng.uniform(0, 25) if i in (1, 7, 14, 20) else rng.uniform(0, 4))
            row = (v > lv) & (v < lv + (2.0 if i < 2 else 1.3)) & (u > 6) & (u < end)
            gaps = np.zeros_like(u, dtype=bool)
            x0 = 6.0
            while x0 < end:
                x0 += rng.uniform(3, 9)
                gaps |= (u > x0) & (u < x0 + 1.1)
            text |= page & row & ~gaps
        table = 90 + xx * 0.3 + rng.normal(0, 6, xx.shape) + 8 * np.sin(xx / 5 + yy / 9)
        y = np.clip(np.where(text, 70, np.where(page, 212 - yy * 0.15 + rng.normal(0, 2, xx.shape), table)), 0, 255).astype(np.uint8)
        cb = np.where(page, 126, 112).astype(np.uint8)
        cr = np.where(page, 129, 150).astype(np.uint8)
        x = torch.from_numpy((np.stack([y, cb, cr]).astype(np.float32) - 128) / 128)[None]
        with torch.no_grad():
            logits = model(x)[0, 0].numpy().astype('<f4')
        with open(sys.argv[3], 'wb') as f:
            f.write(y.tobytes()); f.write(cb.tobytes()); f.write(cr.tobytes()); f.write(logits.tobytes())
        print('parity: page px', int(page.sum()), 'mask>0', int((logits > 0).sum()))


if __name__ == '__main__':
    main()
