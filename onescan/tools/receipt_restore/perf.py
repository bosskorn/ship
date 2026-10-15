"""
Receipt Restore R&D — cost of each method on this host (single CPU thread, like a phone big
core), plus model size and an ONNX export of UVDoc (the format an Android runtime would load).

Each method runs in a fresh process so peak RSS is its own. Host timings are NOT phone timings:
they rank methods; phone numbers come from the R8 device test.

usage: python3 perf.py BENCH --uvdoc-repo R --dewarpnet-repo R --dewarpnet-w W [--n 10] [--onnx OUT_DIR]
"""
import argparse
import json
import os
import resource
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def child(a):
    import cv2
    import torch
    torch.set_num_threads(1)
    sys.path.insert(0, HERE)
    import methods
    cfg = {'uvdoc_repo': a.uvdoc_repo, 'dewarpnet_repo': a.dewarpnet_repo, 'dewarpnet_w': a.dewarpnet_w}
    cases = json.load(open(os.path.join(a.bench, 'index.json')))[: a.n]
    rss0 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    caps = [cv2.imread(os.path.join(a.bench, c, 'cap.jpg')) for c in cases]
    methods.run(a.method, caps[0], cfg)  # warm-up / model load
    t = time.time()
    shapes = []
    for cap in caps:
        out, _ = methods.run(a.method, cap, cfg)
        shapes.append(out.shape)
    el = (time.time() - t) / len(caps)
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(json.dumps({'method': a.method, 'sec_per_receipt': el, 'peak_rss_mb': rss / 1024, 'rss_after_load_inputs_mb': rss0 / 1024,
                      'output_px': int(sum(s[0] * s[1] for s in shapes) / len(shapes))}))


def model_sizes(a, onnx_dir):
    import torch
    sys.path.insert(0, HERE)
    import methods
    out = {}
    m = methods._uvdoc(a.uvdoc_repo)
    n = sum(p.numel() for p in m.parameters())
    out['uvdoc'] = {'params_m': n / 1e6, 'fp32_mb': n * 4 / 2**20, 'fp16_mb': n * 2 / 2**20, 'int8_mb_est': n / 2**20}
    wc, bm = methods._dewarpnet(a.dewarpnet_repo, a.dewarpnet_w)
    n2 = sum(p.numel() for p in wc.parameters()) + sum(p.numel() for p in bm.parameters())
    out['dewarpnet'] = {'params_m': n2 / 1e6, 'fp32_mb': n2 * 4 / 2**20, 'fp16_mb': n2 * 2 / 2**20, 'int8_mb_est': n2 / 2**20}
    if onnx_dir:
        os.makedirs(onnx_dir, exist_ok=True)
        p = os.path.join(onnx_dir, 'uvdoc.onnx')
        x = torch.rand(1, 3, 712, 488)
        torch.onnx.export(m, x, p, input_names=['image'], output_names=['grid2d', 'grid3d'], opset_version=17, dynamo=False)
        import numpy as np
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        s = ort.InferenceSession(p, so, providers=['CPUExecutionProvider'])
        xin = x.numpy()
        with torch.no_grad():
            ref = m(x)[0].numpy()
        got = s.run(None, {'image': xin})[0]
        t = time.time()
        for _ in range(5):
            s.run(None, {'image': xin})
        out['uvdoc']['onnx_mb'] = os.path.getsize(p) / 2**20
        out['uvdoc']['onnx_max_abs_diff'] = float(np.abs(ref - got).max())
        out['uvdoc']['onnx_sec_1thread_host'] = (time.time() - t) / 5
        ops = sorted({n.op_type for n in __import__('onnx').load(p).graph.node})
        out['uvdoc']['onnx_ops'] = ops
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bench')
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    ap.add_argument('--n', type=int, default=10)
    ap.add_argument('--onnx')
    ap.add_argument('--method')
    a = ap.parse_args()
    if a.method:
        return child(a)
    res = []
    for m in ['persp', 'classical', 'classical_crisp', 'uvdoc', 'dewarpnet']:
        cmd = [sys.executable, __file__, a.bench, '--uvdoc-repo', a.uvdoc_repo, '--dewarpnet-repo', a.dewarpnet_repo,
               '--dewarpnet-w', a.dewarpnet_w, '--n', str(a.n), '--method', m]
        o = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, 'OMP_NUM_THREADS': '1'})
        line = [x for x in o.stdout.splitlines() if x.startswith('{')]
        res.append(json.loads(line[-1]) if line else {'method': m, 'error': o.stderr[-400:]})
        print(json.dumps(res[-1]), flush=True)
    print(json.dumps({'models': model_sizes(a, a.onnx)}, default=str))


if __name__ == '__main__':
    main()
