"""DocSeg: small document segmentation net (128x128 YCbCr in, 64x64 page mask out).

Only ops that are trivial to re-implement on device are used: 3x3 conv (first layer),
depthwise 3x3 (stride 1/2, pad 1), pointwise 1x1, ReLU, nearest x2 upsample, channel
concat, global average pool + linear (added as a per-channel bias). BatchNorm is folded
into the preceding conv on export (see export.py).

Topology: stem (stride 2) → 4 encoder stages (64², 32², 16², 8²; stages 2–4 start with a
stride-2 block) → global context → 3 decoder stages (upsample, concat skip, 1x1, blocks)
→ 1x1 head. Capacity sits in the low-resolution stages, where it is cheap.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

# widths: stem/e1, e2, e3, e4, d3, d2, d1 · blocks: e1, e2, e3, e4, d3, d2, d1
SPEC = {'widths': (16, 32, 96, 192, 64, 32, 16), 'blocks': (1, 2, 4, 5, 1, 1, 1)}


class ConvBN(nn.Module):
    def __init__(self, cin, cout, k, stride=1, groups=1, relu=True):
        super().__init__()
        self.conv = nn.Conv2d(cin, cout, k, stride, k // 2, groups=groups, bias=False)
        self.bn = nn.BatchNorm2d(cout)
        self.relu = relu

    def forward(self, x):
        x = self.bn(self.conv(x))
        return F.relu(x) if self.relu else x


def sep(cin, cout, stride=1):
    """Depthwise 3x3 + pointwise 1x1."""
    return nn.Sequential(ConvBN(cin, cin, 3, stride, groups=cin), ConvBN(cin, cout, 1))


def stage(cin, cout, n, stride):
    return nn.Sequential(sep(cin, cout, stride), *[sep(cout, cout) for _ in range(n - 1)])


class DocSeg(nn.Module):
    def __init__(self, spec=SPEC):
        super().__init__()
        self.spec = spec
        a, b, c, d, u3, u2, u1 = spec['widths']
        n1, n2, n3, n4, m3, m2, m1 = spec['blocks']
        self.stem = ConvBN(3, a, 3, 2)          # 64
        self.e1 = stage(a, a, n1, 1)            # 64
        self.e2 = stage(a, b, n2, 2)            # 32
        self.e3 = stage(b, c, n3, 2)            # 16
        self.e4 = stage(c, d, n4, 2)            # 8
        self.ctx = nn.Linear(d, d)              # global context
        self.d3 = nn.Sequential(ConvBN(d + c, u3, 1), *[sep(u3, u3) for _ in range(m3)])   # 16
        self.d2 = nn.Sequential(ConvBN(u3 + b, u2, 1), *[sep(u2, u2) for _ in range(m2)])  # 32
        self.d1 = nn.Sequential(ConvBN(u2 + a, u1, 1), *[sep(u1, u1) for _ in range(m1)])  # 64
        self.head = nn.Conv2d(u1, 1, 1)

    def forward(self, x):
        s1 = self.e1(self.stem(x))
        s2 = self.e2(s1)
        s3 = self.e3(s2)
        s4 = self.e4(s3)
        s4 = F.relu(s4 + self.ctx(s4.mean((2, 3)))[:, :, None, None])
        up = lambda t: F.interpolate(t, scale_factor=2, mode='nearest')
        y = self.d3(torch.cat([up(s4), s3], 1))
        y = self.d2(torch.cat([up(y), s2], 1))
        y = self.d1(torch.cat([up(y), s1], 1))
        return self.head(y)  # logits, 64x64


def to_input(rgb_uint8):
    """(N,H,W,3) uint8 RGB -> (N,3,H,W) float YCbCr in [-1,1] using the app's integer luma."""
    a = rgb_uint8.float()
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    y = (r * 77 + g * 150 + b * 29) / 256
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return (torch.stack([y, cb, cr], 1).clamp(0, 255) - 128) / 128


def macs(model):
    """Multiply-accumulates per 128x128 frame (convs + context)."""
    total = 0
    hooks = []
    def conv_hook(m, i, o):
        nonlocal total
        total += o.numel() // o.shape[0] * (m.in_channels // m.groups) * m.kernel_size[0] * m.kernel_size[1]
    for m in model.modules():
        if isinstance(m, nn.Conv2d):
            hooks.append(m.register_forward_hook(conv_hook))
    model.eval()
    with torch.no_grad():
        model(torch.zeros(1, 3, 128, 128))
    for h in hooks:
        h.remove()
    return total


if __name__ == '__main__':
    m = DocSeg()
    print(sum(p.numel() for p in m.parameters()), 'params,', macs(m) / 1e6, 'M MACs')
    print(m(torch.zeros(2, 3, 128, 128)).shape)
