"""Hard example mining for DocSeg: run a checkpoint over training shards, keep the samples
it gets wrong, sorted into failure types, and write them as an extra shard for the next
round (train.py --extra hard.npz --extra-repeat 2).

    python3 mine.py model.pt out_hard.npz shard1.npz [shard2.npz ...]

Types: false_positive (no document, mask fires), false_negative (page mostly missed),
background_as_document (mask spills well past the page), sub_region (mask is a part of
the page), crop_cuts_document (mask just inside the page: would cut its edge),
wrong_corner (other IoU < 0.85). Also counted across types: small_document (page < 25% of
the frame) and white_on_white (page and its surroundings of similar brightness).
The output keeps each sample's type (`kind`) and flags so a round can oversample groups.
"""
import sys, collections, numpy as np, torch
from model import DocSeg
from train import batch

IOU_HARD = 0.85


def main():
    pt, out, shards = sys.argv[1], sys.argv[2], sys.argv[3:]
    torch.set_num_threads(4)
    model = DocSeg().to(memory_format=torch.channels_last)
    model.load_state_dict(torch.load(pt, map_location='cpu')); model.eval()
    kinds = collections.Counter(); flags = collections.Counter()
    keep_i, keep_c, keep_n, keep_k, keep_small, keep_wow = [], [], [], [], [], []
    total = 0
    for sp in shards:
        z = np.load(sp); imgs, corners, neg = z['imgs'], z['corners'], z['neg']
        for s in range(0, len(imgs), 256):
            idx = np.arange(s, min(s + 256, len(imgs)))
            with torch.no_grad():
                x, y = batch(imgs, corners, neg, idx, False)
                p = (model(x) > 0).float(); t = (y > 0.5).float()
            pa = p.sum((1, 2, 3)).numpy(); ta = t.sum((1, 2, 3)).numpy()
            inter = (p * t).sum((1, 2, 3)).numpy(); uni = ((p + t) > 0).float().sum((1, 2, 3)).numpy()
            n_px = p[0].numel()
            tm = (t[:, 0] > 0.5).numpy()
            for j, i in enumerate(idx):
                total += 1
                small = wow = False
                if neg[i]:
                    if pa[j] / n_px > 0.05:
                        kind = 'false_positive'
                    else:
                        continue
                else:
                    iou = inter[j] / max(1.0, uni[j])
                    if iou >= IOU_HARD:
                        continue
                    if pa[j] < 0.3 * ta[j]:
                        kind = 'false_negative'
                    elif pa[j] > 1.4 * ta[j] and inter[j] > 0.85 * ta[j]:
                        kind = 'background_as_document'
                    elif inter[j] > 0.9 * pa[j] and pa[j] < 0.75 * ta[j]:
                        kind = 'sub_region'
                    elif inter[j] > 0.9 * pa[j]:
                        kind = 'crop_cuts_document'
                    else:
                        kind = 'wrong_corner'
                    small = ta[j] / n_px < 0.25
                    wow = white_on_white(imgs[i], tm[j])
                kinds[kind] += 1; flags['small_document'] += small; flags['white_on_white'] += wow
                keep_i.append(imgs[i]); keep_c.append(corners[i]); keep_n.append(neg[i])
                keep_k.append(kind); keep_small.append(small); keep_wow.append(wow)
        print(sp.split('/')[-1], 'hard so far', len(keep_i), flush=True)
    np.savez(out, imgs=np.stack(keep_i), corners=np.stack(keep_c), neg=np.array(keep_n),
             kind=np.array(keep_k), small=np.array(keep_small), white_on_white=np.array(keep_wow))
    print(f'{len(keep_i)} hard of {total}:', dict(kinds), dict(flags))


def white_on_white(img, page_mask):
    """Page and a ring of background around it differ by < 25 luma levels."""
    import cv2
    y = cv2.cvtColor(np.ascontiguousarray(img), cv2.COLOR_RGB2GRAY).astype(np.float32)
    m = cv2.resize(page_mask.astype(np.uint8), (y.shape[1], y.shape[0]), interpolation=cv2.INTER_NEAREST)
    ring = (cv2.dilate(m, np.ones((15, 15), np.uint8)) > 0) & (m == 0)
    if m.sum() < 20 or ring.sum() < 20:
        return False
    return abs(float(y[m > 0].mean()) - float(y[ring].mean())) < 25


if __name__ == '__main__':
    main()
