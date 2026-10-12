"""Train DocSeg on corner-labelled document photos.

Input: a directory of .npz shards with `imgs` (N,S,S,3 uint8 RGB, squashed to square),
`corners` (N,8 normalized tl,tr,br,bl x/y) and `neg` (N bool, no document). Masks are
rendered on the fly from the corners after the same random affine as the image, so the
geometry stays exact under augmentation.

    python3 train.py --data DIR --out docseg.pt [--epochs 20]
"""
import argparse, glob, math, time
import numpy as np
import torch
import torch.nn.functional as F
from model import DocSeg, to_input

IN, OUT = 128, 64


def load(paths):
    """Concatenates shards into preallocated arrays (keeps peak memory at ~1x)."""
    sizes = [len(np.load(p)['neg']) for p in paths]
    first = np.load(paths[0])['imgs']
    imgs = np.empty((sum(sizes),) + first.shape[1:], np.uint8)
    corners = np.empty((sum(sizes), 8), np.float32); neg = np.empty(sum(sizes), bool)
    o = 0
    for p, n in zip(paths, sizes):
        z = np.load(p)
        imgs[o:o + n] = z['imgs']; corners[o:o + n] = z['corners']; neg[o:o + n] = z['neg']
        o += n
    return imgs, corners, neg


def random_theta(n, train):
    """Affine (output -> input, normalized coords) per sample."""
    if not train:
        return torch.eye(2, 3).repeat(n, 1, 1)
    ang = (torch.rand(n) * 2 - 1) * math.radians(12) + torch.randint(0, 4, (n,)) * (math.pi / 2)
    s = 0.72 + torch.rand(n) * 0.33                      # zoom in up to ~1.4x, out slightly
    out = torch.rand(n) < 0.3                            # zoom out: small, distant documents
    s = torch.where(out, 1.0 + torch.rand(n) * 0.7, s)
    asp = torch.exp((torch.rand(n) * 2 - 1) * 0.12)
    sx, sy = s * asp, s / asp
    flip = torch.where(torch.rand(n) < 0.5, -1.0, 1.0)
    c, si = torch.cos(ang), torch.sin(ang)
    A = torch.stack([torch.stack([c * sx * flip, -si * sy], 1), torch.stack([si * sx * flip, c * sy], 1)], 1)
    reach = torch.where(s <= 1, (1.08 - s).clamp(min=0.03), (s - 1) * 0.6 + 0.03)
    t = (torch.rand(n, 2) * 2 - 1) * reach[:, None]
    return torch.cat([A, t[:, :, None]], 2)


def render_masks(theta, corners, neg):
    """Soft page masks (N,1,OUT,OUT): coverage ramp one output pixel wide."""
    n = theta.shape[0]
    grid = F.affine_grid(theta, (n, 1, OUT, OUT), align_corners=False)  # (n,OUT,OUT,2) in [-1,1]
    q = corners.view(n, 4, 2) * 2 - 1
    a, b = q, q.roll(-1, 1)
    e = b - a
    area = (a[:, :, 0] * b[:, :, 1] - b[:, :, 0] * a[:, :, 1]).sum(1)
    sign = torch.where(area >= 0, 1.0, -1.0)
    p = grid[:, :, :, None, :]                                           # (n,H,W,1,2)
    cross = e[:, None, None, :, 0] * (p[..., 1] - a[:, None, None, :, 1]) - e[:, None, None, :, 1] * (p[..., 0] - a[:, None, None, :, 0])
    d = cross / e.norm(dim=-1).clamp(min=1e-6)[:, None, None, :]
    inside = (d * sign[:, None, None, None]).min(-1).values
    px = 2.0 / OUT * theta[:, :, :2].abs().sum((1, 2))[:, None, None] / 2
    m = (0.5 + inside / px).clamp(0, 1)
    m[neg] = 0
    return m[:, None]


def photometric(rgb):
    """rgb float (N,3,H,W) 0..255."""
    n = rgb.shape[0]
    gray = rgb.mean(1, keepdim=True)
    sat = 0.55 + torch.rand(n, 1, 1, 1) * 0.9
    sat = torch.where(torch.rand(n, 1, 1, 1) < 0.08, torch.zeros_like(sat), sat)
    rgb = gray + (rgb - gray) * sat
    mean = rgb.mean((1, 2, 3), keepdim=True)
    rgb = (rgb - mean) * (0.65 + torch.rand(n, 1, 1, 1) * 0.7) + mean * (0.7 + torch.rand(n, 1, 1, 1) * 0.6)
    rgb = rgb * (1 + (torch.rand(n, 3, 1, 1) * 2 - 1) * 0.08)       # white balance
    blur = torch.rand(n) < 0.25
    if blur.any():
        rgb[blur] = F.avg_pool2d(F.pad(rgb[blur], (1, 1, 1, 1), mode='replicate'), 3, 1)
    rgb = rgb + torch.randn_like(rgb) * torch.rand(n, 1, 1, 1) * 6
    return rgb.clamp(0, 255)


def batch(imgs, corners, neg, idx, train):
    x = torch.from_numpy(imgs[idx]).permute(0, 3, 1, 2).float()
    c = torch.from_numpy(corners[idx]); g = torch.from_numpy(neg[idx])
    theta = random_theta(len(idx), train)
    x = F.grid_sample(x, F.affine_grid(theta, (len(idx), 3, IN, IN), align_corners=False), mode='bilinear', padding_mode='zeros', align_corners=False)
    if train:
        x = photometric(x)
    y = render_masks(theta, c, g)
    x = to_input(x.round().permute(0, 2, 3, 1))
    return x.contiguous(memory_format=torch.channels_last), y


def loss_fn(logit, y):
    bce = F.binary_cross_entropy_with_logits(logit, y)
    p = torch.sigmoid(logit)
    inter = (p * y).sum((1, 2, 3)); den = (p + y).sum((1, 2, 3))
    dice = 1 - (2 * inter + 1) / (den + 1)
    return bce + dice.mean()


@torch.no_grad()
def evaluate(model, imgs, corners, neg):
    model.eval(); ious = []; negfp = []
    for i in range(0, len(imgs), 256):
        idx = np.arange(i, min(i + 256, len(imgs)))
        x, y = batch(imgs, corners, neg, idx, False)
        p = (model(x) > 0).float(); t = (y > 0.5).float()
        inter = (p * t).sum((1, 2, 3)); uni = ((p + t) > 0).float().sum((1, 2, 3))
        g = torch.from_numpy(neg[idx])
        ious += (inter / uni.clamp(min=1))[~g].tolist()
        negfp += (p.mean((1, 2, 3)) > 0.05)[g].tolist()
    model.train()
    return float(np.mean(ious)), float(np.mean(np.array(ious) > 0.9)), float(np.mean(negfp)) if negfp else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=20); ap.add_argument('--bs', type=int, default=64)
    ap.add_argument('--lr', type=float, default=3e-3); ap.add_argument('--resume')
    ap.add_argument('--extra', default='', help='comma-separated extra .npz shards (e.g. hard photos)')
    ap.add_argument('--extra-repeat', type=int, default=1, help='oversample extra shards this many times')
    ap.add_argument('--val', default='', help='comma-separated .npz shards to validate on instead')
    a = ap.parse_args()
    torch.manual_seed(0); np.random.seed(0); torch.set_num_threads(4)
    paths = sorted(glob.glob(a.data + '/*.npz'))
    val_paths = a.val.split(',') if a.val else [p for p in paths if 'val' in p][:2]
    tr_paths = [p for p in paths if p not in val_paths]
    extra = [p for p in a.extra.split(',') if p] * a.extra_repeat
    imgs, corners, neg = load(tr_paths + extra)
    vimgs, vcorners, vneg = load(val_paths)
    print(f'train {len(imgs)} (neg {neg.sum()}), val {len(vimgs)}', flush=True)
    model = DocSeg().to(memory_format=torch.channels_last)
    if a.resume:
        model.load_state_dict(torch.load(a.resume))
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    steps = a.epochs * (len(imgs) // a.bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, a.lr, total_steps=steps, pct_start=0.1)
    best = -1
    for ep in range(a.epochs):
        perm = np.random.permutation(len(imgs)); t0 = time.time(); tot = 0
        for k in range(len(imgs) // a.bs):
            x, y = batch(imgs, corners, neg, np.sort(perm[k * a.bs:(k + 1) * a.bs]), True)
            loss = loss_fn(model(x), y)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item()
        miou, good, fp = evaluate(model, vimgs, vcorners, vneg)
        print(f'ep {ep} loss {tot / (k + 1):.4f} val mIoU {miou:.4f} IoU>0.9 {good:.3f} negFP {fp:.3f} ({time.time() - t0:.0f}s)', flush=True)
        if miou > best:
            best = miou; torch.save(model.state_dict(), a.out)


if __name__ == '__main__':
    main()
