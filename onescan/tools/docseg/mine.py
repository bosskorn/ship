"""Hard example mining for DocSeg: run a checkpoint over training shards, keep the samples
it gets wrong, sorted into failure types, and write them as an extra shard for the next
round (train.py --extra hard.npz --extra-repeat 2).

    python3 mine.py model.pt out_hard.npz shard1.npz [shard2.npz ...]

Types: false_positive (no document, mask fires), false_negative (page mostly missed),
background_as_document (mask spills well past the page), sub_region (mask is a part of
the page), wrong_corner (other IoU < 0.85).
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
    kinds = collections.Counter(); keep_i, keep_c, keep_n = [], [], []
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
            for j, i in enumerate(idx):
                total += 1
                if neg[i]:
                    if pa[j] / n_px > 0.05:
                        kinds['false_positive'] += 1
                    else:
                        continue
                else:
                    iou = inter[j] / max(1.0, uni[j])
                    if iou >= IOU_HARD:
                        continue
                    if pa[j] < 0.3 * ta[j]:
                        kinds['false_negative'] += 1
                    elif pa[j] > 1.4 * ta[j] and inter[j] > 0.85 * ta[j]:
                        kinds['background_as_document'] += 1
                    elif inter[j] > 0.9 * pa[j] and pa[j] < 0.75 * ta[j]:
                        kinds['sub_region'] += 1
                    else:
                        kinds['wrong_corner'] += 1
                keep_i.append(imgs[i]); keep_c.append(corners[i]); keep_n.append(neg[i])
        print(sp.split('/')[-1], 'hard so far', len(keep_i), flush=True)
    np.savez(out, imgs=np.stack(keep_i), corners=np.stack(keep_c), neg=np.array(keep_n))
    print(f'{len(keep_i)} hard of {total}:', dict(kinds))


if __name__ == '__main__':
    main()
