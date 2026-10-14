"""Document presence gate: "is there a document in this photo?" — before segmentation.

Tiny CNN on 96x96 Y/Cb/Cr (the post-capture analysis image, downscaled), ~80k parameters,
~8 MFLOPs; re-implemented in plain TS (src/core/document-engine/capture/crop/presence.ts).

Training data, balanced 50/50:
  positives — DocCorner train photos with a document (+ synthetic documents on surfaces)
  negatives — DocCorner train photos without one, plus hard negatives generated on the fly:
              real CC0 surface photos (marble, tile, wood, concrete, fabric), real
              no-document photos, and rectangles that are not documents (screens, boxes,
              frames, posters, envelopes, notebooks, packaging, table edges, walls, black
              screens). False positives on real negatives are mined and oversampled.

    python3 presence.py train --shards DIR --tex DIR --out presence.pt [--mine fp.npz]
    python3 presence.py export presence.pt presence.bin parity.bin
"""
import argparse, glob, math, os, struct, sys, time
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
import cv2

IN = 96
WIDTHS = (16, 32, 64, 96)


class Presence(nn.Module):
    def __init__(self):
        super().__init__()
        layers, c = [], 3
        for w in WIDTHS:
            layers += [nn.Conv2d(c, w, 3, 2, 1, bias=False), nn.BatchNorm2d(w), nn.ReLU(inplace=True),
                       nn.Conv2d(w, w, 3, 1, 1, bias=False), nn.BatchNorm2d(w), nn.ReLU(inplace=True)]
            c = w
        self.body = nn.Sequential(*layers)
        self.head = nn.Linear(2 * c, 1)

    def forward(self, x):
        f = self.body(x)
        return self.head(torch.cat([f.mean((2, 3)), f.amax((2, 3))], 1))[:, 0]


def to_input(rgb):
    """(N,H,W,3) uint8 RGB -> (N,3,IN,IN) Y/Cb/Cr in [-1,1], app integer luma (as DocSeg)."""
    a = torch.from_numpy(rgb).float()
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = (r * 77 + g * 150 + b * 29) / 256
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    x = (torch.stack([y, cb, cr], 1).clamp(0, 255) - 128) / 128
    return F.interpolate(x, size=(IN, IN), mode='area') if x.shape[-1] != IN else x


# ---------------------------------------------------------------- hard negatives on the fly
class NegGen:
    def __init__(self, tex_dir, negs, seed, holdout=False):
        """Surface photos: every 5th is held out of training (holdout=True selects only those)."""
        self.rng = np.random.default_rng(seed)
        files = sorted(glob.glob(f'{tex_dir}/*.jpg'))
        files = [f for i, f in enumerate(files) if (i % 5 == 0) == holdout]
        self.tex = [cv2.resize(cv2.imread(f), (512, 512), interpolation=cv2.INTER_AREA)[..., ::-1] for f in files]
        self.negs = negs

    def U(self, a, b):
        return float(self.rng.uniform(a, b))

    def surface(self, R):
        r = self.rng.random()
        if r < .55 and self.tex:
            t = self.tex[self.rng.integers(len(self.tex))]; h, w = t.shape[:2]
            s = int(self.U(.2, 1) * min(h, w)); x0, y0 = self.rng.integers(0, w - s + 1), self.rng.integers(0, h - s + 1)
            img = cv2.resize(t[y0:y0 + s, x0:x0 + s], (R, R), interpolation=cv2.INTER_AREA).astype(np.float32)
            if self.rng.random() < .35:
                img = img * self.U(.3, .7) + self.U(150, 240) * (1 - self.U(.3, .7))
            return img
        if r < .85 and len(self.negs):
            return cv2.resize(self.negs[self.rng.integers(len(self.negs))], (R, R)).astype(np.float32)
        c = self.U(5, 250)  # white wall / black screen / plain table
        return np.full((R, R, 3), c, np.float32) + self.rng.normal(0, 3, (R, R, 3))

    def rect(self, img, R):
        kind = self.rng.integers(9)
        w, h = int(self.U(.2, .8) * R), int(self.U(.2, .8) * R)
        s = np.zeros((h, w, 3), np.float32)
        if kind == 0:  # screen with text-like lines
            s[:] = self.U(5, 40); s[3:-3, 3:-3] = self.U(160, 250)
            for y in range(6, h - 4, int(self.U(3, 6))): s[y, 6:max(7, w - 6 - self.rng.integers(0, w // 2))] = self.U(20, 90)
        elif kind == 1:  # box / packaging: coloured, printed blocks
            s[:] = [self.U(30, 230) for _ in range(3)]
            for _ in range(self.rng.integers(1, 4)):
                x, y = self.rng.integers(0, max(1, w - 8)), self.rng.integers(0, max(1, h - 8))
                s[y:y + self.rng.integers(4, max(5, h // 2)), x:x + self.rng.integers(4, max(5, w // 2))] = [self.U(0, 255) for _ in range(3)]
        elif kind == 2:  # picture frame
            s[:] = [self.U(40, 160), self.U(30, 120), self.U(10, 80)]
            if len(self.negs) and w > 12 and h > 12: s[5:-5, 5:-5] = cv2.resize(self.negs[self.rng.integers(len(self.negs))], (w - 10, h - 10))
        elif kind == 3 and len(self.negs):  # poster / photo
            s[:] = cv2.resize(self.negs[self.rng.integers(len(self.negs))], (w, h))
        elif kind == 4:  # envelope
            s[:] = self.U(180, 245); cv2.line(s, (0, 0), (w // 2, h // 2), (140, 140, 140), 1); cv2.line(s, (w - 1, 0), (w // 2, h // 2), (140, 140, 140), 1)
        elif kind == 5:  # notebook stack
            s[:] = [self.U(20, 230) for _ in range(3)]; s[-4:] *= .7
        elif kind == 6:  # black screen / tablet
            s[:] = self.U(0, 30); s[:2] = s[-2:] = self.U(60, 120)
        elif kind == 7:  # tile / grout rectangle
            s[:] = self.U(150, 240); s[:2] = s[-2:] = s[:, :2] = s[:, -2:] = self.U(60, 140)
        else:  # table edge: half plane
            o = self.surface(R); yy, xx = np.mgrid[0:R, 0:R]; a = self.U(0, math.pi)
            side = (np.cos(a) * (xx - R / 2) + np.sin(a) * (yy - R / 2)) > self.U(-.3, .3) * R
            return np.where(side[..., None], o * self.U(.6, 1.2), img)
        a = self.U(-.8, .8); M = cv2.getRotationMatrix2D((w / 2, h / 2), math.degrees(a), 1)
        cx, cy = self.U(.2, .8) * R, self.U(.2, .8) * R
        M[0, 2] += cx - w / 2; M[1, 2] += cy - h / 2
        wp = cv2.warpAffine(s, M, (R, R)); m = cv2.warpAffine(np.ones((h, w), np.float32), M, (R, R))[..., None]
        return img * (1 - m) + wp * m

    def sample(self, R=IN):
        img = self.surface(R)
        for _ in range(self.rng.integers(0, 4)):
            img = self.rect(img, R)
        yy, xx = np.mgrid[0:R, 0:R].astype(np.float32)
        img = img * (1 - self.U(0, .4) * (xx / R if self.rng.random() < .5 else yy / R))[..., None]
        if self.rng.random() < .3: img = cv2.GaussianBlur(img, (0, 0), self.U(.4, 1.5))
        return np.clip(img + self.rng.normal(0, self.U(1, 4), img.shape), 0, 255).astype(np.uint8)


def load_shards(paths, max_pos, R=IN):
    pos, neg = [], []
    for p in paths:
        z = np.load(p)
        for im, n in zip(z['imgs'], z['neg']):
            im = cv2.resize(im, (R, R), interpolation=cv2.INTER_AREA)
            (neg if n else pos).append(im)
        if len(pos) >= max_pos:
            break
    return np.stack(pos[:max_pos]), np.stack(neg) if neg else np.zeros((0, R, R, 3), np.uint8)


def augment(x, rng):
    """Flips / 90° turns and colour jitter on uint8 batch."""
    if rng.random() < .5: x = x[:, :, ::-1]
    if rng.random() < .5: x = x[:, ::-1]
    if rng.random() < .5: x = x.transpose(0, 2, 1, 3)
    x = x.astype(np.float32) * rng.uniform(.75, 1.25, (len(x), 1, 1, 3)) + rng.uniform(-25, 25, (len(x), 1, 1, 1))
    return np.clip(x, 0, 255).astype(np.uint8).copy()


def train(a):
    torch.manual_seed(0); torch.set_num_threads(a.threads)
    rng = np.random.default_rng(0)
    shards = sorted(p for p in glob.glob(f'{a.shards}/*.npz') if 'val' not in p)
    pos, rneg = load_shards(shards, a.max_pos)
    extra = []
    for p in a.pos_extra:
        z = np.load(p); extra.append(np.stack([cv2.resize(i, (IN, IN), interpolation=cv2.INTER_AREA) for i, n in zip(z['imgs'], z['neg']) if not n][:a.max_pos // 4]))
    if extra: pos = np.concatenate([pos] + extra)
    mined = np.load(a.mine)['imgs'] if a.mine and os.path.exists(a.mine) else np.zeros((0, IN, IN, 3), np.uint8)
    gen = NegGen(a.tex, rneg, 1)
    print(f'positives {len(pos)}, real negatives {len(rneg)}, mined false positives {len(mined)}', flush=True)
    model = Presence()
    if a.resume: model.load_state_dict(torch.load(a.resume))
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    steps = a.epochs * a.steps; sched = torch.optim.lr_scheduler.OneCycleLR(opt, a.lr, total_steps=steps, pct_start=.1)
    half = a.bs // 2
    for ep in range(a.epochs):
        t0 = time.time(); tot = 0
        for k in range(a.steps):
            p = pos[rng.integers(0, len(pos), half)]
            # negatives: 35% real photos, 15% mined false positives, rest generated hard negatives
            nr = int(half * .35) if len(rneg) else 0; nm = int(half * .15) if len(mined) else 0
            n = [rneg[rng.integers(0, len(rneg), nr)]] if nr else []
            if nm: n.append(mined[rng.integers(0, len(mined), nm)])
            n.append(np.stack([gen.sample() for _ in range(half - nr - nm)]))
            x = augment(np.concatenate([p] + n), rng); y = torch.cat([torch.ones(half), torch.zeros(half)])
            logit = model(to_input(x))
            # False positives cost more than misses: a missed document only loses auto crop.
            loss = F.binary_cross_entropy_with_logits(logit, y, pos_weight=torch.tensor(1.0)) + \
                   a.fp_weight * F.binary_cross_entropy_with_logits(logit[half:], y[half:])
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item()
        torch.save(model.state_dict(), a.out)
        print(f'ep {ep} loss {tot / a.steps:.4f} ({time.time() - t0:.0f}s)', flush=True)


def fold(conv, bn):
    s = bn.weight.detach() / torch.sqrt(bn.running_var + bn.eps)
    return (conv.weight.detach() * s[:, None, None, None]).numpy(), (bn.bias.detach() - bn.running_mean * s).numpy()


def export(pt, out, parity):
    """PRS1: ASCII 'PRS1', uint32 count, then float32 arrays (uint32 length + data):
    per conv: weight [cout][cin][3][3], bias; then head weight [2C], bias [1]."""
    m = Presence(); m.load_state_dict(torch.load(pt, map_location='cpu')); m.eval()
    arrays = []
    mods = list(m.body)
    for i in range(0, len(mods), 3):
        arrays += list(fold(mods[i], mods[i + 1]))
    arrays += [m.head.weight.detach().numpy().ravel(), m.head.bias.detach().numpy()]
    with open(out, 'wb') as f:
        f.write(b'PRS1'); f.write(struct.pack('<I', len(arrays)))
        for x in arrays:
            x = np.ascontiguousarray(x, dtype='<f4').ravel(); f.write(struct.pack('<I', x.size)); f.write(x.tobytes())
    rng = np.random.default_rng(5)
    img = (rng.random((1, IN, IN, 3)) * 255).astype(np.uint8)
    img[0, 20:76, 24:72] = 230  # a bright sheet
    with torch.no_grad(): logit = m(to_input(img)).item()
    x = to_input(img)[0].numpy()  # 3 x IN x IN in [-1,1]
    planes = np.clip(x * 128 + 128, 0, 255).round().astype(np.uint8)
    with open(parity, 'wb') as f:
        f.write(planes.tobytes()); f.write(struct.pack('<f', logit))
    print(out, len(arrays), 'arrays', sum(a.size for a in arrays), 'floats; parity logit', logit)


def planes_input(y, cb, cr):
    """App path: uint8 planes (analysis image) -> adaptive average pool to IN -> [-1,1]."""
    x = torch.from_numpy(np.stack([y, cb, cr]).astype(np.float32))[None]
    return (F.adaptive_avg_pool2d(x, IN) - 128) / 128


@torch.no_grad()
def probs_bench(model, bench):
    import json
    meta = json.load(open(f'{bench}/cases.json')); out = {}
    for k, v in meta.items():
        pl = [np.frombuffer(open(f'{bench}/{k}.{e}', 'rb').read(), np.uint8).reshape(v['h'], v['w']) for e in ('bin', 'cb', 'cr')]
        out[k] = (float(torch.sigmoid(model(planes_input(*pl)))), bool(v['truth']), v.get('split', 'test'), v.get('category', ''))
    return out


@torch.no_grad()
def probs_rgb(model, imgs):
    r = []
    for i in range(0, len(imgs), 256):
        r += torch.sigmoid(model(to_input(imgs[i:i + 256]))).tolist()
    return np.array(r)


def evaluate_cmd(a):
    m = Presence(); m.load_state_dict(torch.load(a.pt, map_location='cpu')); m.eval()
    res = probs_bench(m, a.bench)
    vpos, vneg = [], []
    for p in sorted(glob.glob(f'{a.shards}/*val*.npz')):
        z = np.load(p); pr = probs_rgb(m, np.stack([cv2.resize(i, (IN, IN), interpolation=cv2.INTER_AREA) for i in z['imgs']]))
        vpos += pr[~z['neg']].tolist(); vneg += pr[z['neg']].tolist()
    tune_neg = [p for p, d, sp, _ in res.values() if not d and sp == 'tune'] + vneg
    tune_pos = [p for p, d, sp, _ in res.values() if d and sp == 'tune'] + vpos
    # "present": lowest threshold with <= 0.5% false positives on real negatives (tune + val);
    # "none": highest threshold that still keeps >= 99% of real documents above it.
    tn = np.sort(tune_neg)[::-1]; present = float(tn[int(len(tn) * 0.005)]) + 1e-6
    real_pos = np.sort([p for p, d, sp, _ in res.values() if d and sp == 'tune'])
    none = float(real_pos[int(len(real_pos) * 0.01)]) - 1e-6
    none = min(none, present)
    print(f'thresholds: present >= {present:.4f}, none <= {none:.4f}  (tune: {len(tune_neg)} real negatives, {len(tune_pos)} documents)')
    def rep(label, pos, neg):
        pos, neg = np.array(pos), np.array(neg)
        if len(neg):
            print(f'  {label:28s} no-document n={len(neg):5d}: false "present" {100*(neg >= present).mean():5.2f}%  uncertain {100*((neg > none) & (neg < present)).mean():5.1f}%')
        if len(pos):
            print(f'  {label:28s} documents   n={len(pos):5d}: present {100*(pos >= present).mean():5.1f}%  uncertain {100*((pos > none) & (pos < present)).mean():5.1f}%  missed (none) {100*(pos <= none).mean():5.1f}%')
    print('== train validation shards'); rep('val', vpos, vneg)
    print('== held-out real (b384 test split)')
    rep('all', [p for p, d, sp, _ in res.values() if d and sp == 'test'], [p for p, d, sp, _ in res.values() if not d and sp == 'test'])
    if a.syn:
        sres = probs_bench(m, a.syn)
        print('== surface benchmark (synthetic, documents only)'); rep('syn', [p for p, d, sp, _ in sres.values() if d], [])
    if a.tex_holdout:
        g = NegGen(a.tex_holdout, np.zeros((0, IN, IN, 3), np.uint8), 9, holdout=True)
        # Several crops per held-out surface photo (whole, quarters), as a camera would frame it.
        crops = []
        for t in g.tex:
            crops.append(t)
            crops += [t[y:y + 256, x:x + 256] for y in (0, 256) for x in (0, 256)]
        imgs = np.stack([cv2.resize(c, (IN, IN), interpolation=cv2.INTER_AREA) for c in crops])
        print(f'== hard-negative real (held-out CC0 surface photos: {len(g.tex)} photos, {len(imgs)} views)'); rep('surfaces', [], probs_rgb(m, imgs))
    if a.json:
        import json
        json.dump({'present': present, 'none': none}, open(a.json, 'w'))


def mine_cmd(a):
    """False positives on real negatives (training shards) + generated hard negatives -> npz."""
    m = Presence(); m.load_state_dict(torch.load(a.pt, map_location='cpu')); m.eval()
    shards = sorted(p for p in glob.glob(f'{a.shards}/*.npz') if 'val' not in p)
    rneg = []
    for sp in shards:
        z = np.load(sp)
        rneg += [cv2.resize(i, (IN, IN), interpolation=cv2.INTER_AREA) for i, n in zip(z['imgs'], z['neg']) if n]
    rneg = np.stack(rneg)
    gen = NegGen(a.tex, rneg, 77)
    cand = np.concatenate([rneg, np.stack([gen.sample() for _ in range(a.generated)])])
    p = probs_rgb(m, cand)
    keep = cand[p >= a.thr]
    np.savez(a.out, imgs=keep)
    print(f'false positives: {len(keep)} of {len(cand)} (real {int((p[:len(rneg)] >= a.thr).sum())} of {len(rneg)})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd')
    t = sub.add_parser('train')
    t.add_argument('--shards', required=True); t.add_argument('--tex', required=True); t.add_argument('--out', required=True)
    t.add_argument('--pos-extra', nargs='*', default=[]); t.add_argument('--mine'); t.add_argument('--resume')
    t.add_argument('--epochs', type=int, default=12); t.add_argument('--steps', type=int, default=300); t.add_argument('--bs', type=int, default=96)
    t.add_argument('--lr', type=float, default=3e-3); t.add_argument('--fp-weight', type=float, default=1.0)
    t.add_argument('--max-pos', type=int, default=24000); t.add_argument('--threads', type=int, default=2)
    e = sub.add_parser('export'); e.add_argument('pt'); e.add_argument('out'); e.add_argument('parity')
    v = sub.add_parser('eval'); v.add_argument('pt'); v.add_argument('--bench', required=True); v.add_argument('--shards', required=True)
    v.add_argument('--syn'); v.add_argument('--tex-holdout'); v.add_argument('--json')
    mi = sub.add_parser('mine'); mi.add_argument('pt'); mi.add_argument('--shards', required=True); mi.add_argument('--tex', required=True)
    mi.add_argument('--out', required=True); mi.add_argument('--generated', type=int, default=20000); mi.add_argument('--thr', type=float, default=0.5)
    a = ap.parse_args()
    {'train': train, 'eval': evaluate_cmd, 'mine': mine_cmd}[a.cmd](a) if a.cmd != 'export' else export(a.pt, a.out, a.parity)
