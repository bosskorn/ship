"""
Receipt Restore R&D — cost of each method on the same workload as the evaluation (all cases of
the given benchmark folders), one fresh process per method, 1 CPU thread (like one phone big
core). Host timings rank methods; phone timings come from the R8 device test.

Per method: init / model load time, per-receipt median / P95, long-receipt median, peak RSS,
temp storage written (a private empty TMPDIR is measured), encoded output size, failures.
Also: parameters, fp32/fp16/int8 sizes, and an ONNX export of UVDoc checked against PyTorch.

usage: python3 perf.py OUT.jsonl --bench B1 [--bench B2] --uvdoc-repo R --dewarpnet-repo R --dewarpnet-w W [--onnx DIR] [--parallel 4]
"""
import argparse
import json
import os
import resource
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
METHODS = ['persp', 'classical', 'classical_crisp', 'uvdoc', 'dewarpnet']


def dir_size(p):
    t = 0
    for root, _, files in os.walk(p):
        for f in files:
            try:
                t += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return t


def child(a):
    t0 = time.time()
    import cv2
    import numpy as np
    import torch
    torch.set_num_threads(1)
    cv2.setNumThreads(1)
    sys.path.insert(0, HERE)
    import methods
    cfg = {'uvdoc_repo': a.uvdoc_repo, 'dewarpnet_repo': a.dewarpnet_repo, 'dewarpnet_w': a.dewarpnet_w}
    cases = []
    for b in a.bench:
        cases += [(b, c) for c in json.load(open(os.path.join(b, 'index.json')))]
    # init = imports + model load + one warm-up run (what the first Restore of a session costs)
    first = cv2.imread(os.path.join(cases[0][0], cases[0][1], 'cap.jpg'))
    methods.run(a.method, first, cfg)
    init = time.time() - t0
    secs, long_secs, sizes, fails = [], [], [], 0
    tmp = os.environ['TMPDIR']
    tmp_peak = 0
    for b, c in cases:
        cap = cv2.imread(os.path.join(b, c, 'cap.jpg'))
        t = time.time()
        try:
            out, _ = methods.run(a.method, cap, cfg)
        except Exception:
            fails += 1
            continue
        el = time.time() - t
        secs.append(el)
        if c.endswith('_long'):
            long_secs.append(el)
        ok, buf = cv2.imencode('.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, 90])
        sizes.append(len(buf) / 1024)
        tmp_peak = max(tmp_peak, dir_size(tmp))
    print(json.dumps({
        'method': a.method, 'n': len(secs), 'failures': fails, 'init_sec': init,
        'sec_median': float(np.median(secs)), 'sec_p95': float(np.percentile(secs, 95)), 'sec_max': float(max(secs)),
        'sec_long_median': float(np.median(long_secs)) if long_secs else None,
        'peak_rss_mb': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
        'tmp_peak_mb': tmp_peak / 2**20, 'out_jpeg_kb_median': float(np.median(sizes)),
    }), flush=True)


def model_sizes(a):
    import numpy as np
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
    if a.onnx:
        os.makedirs(a.onnx, exist_ok=True)
        p = os.path.join(a.onnx, 'uvdoc.onnx')
        x = torch.rand(1, 3, 712, 488)
        torch.onnx.export(m, x, p, input_names=['image'], output_names=['grid2d', 'grid3d'], opset_version=17, dynamo=False)
        import onnx
        import onnxruntime as ort
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        s = ort.InferenceSession(p, so, providers=['CPUExecutionProvider'])
        with torch.no_grad():
            ref = m(x)[0].numpy()
        got = s.run(None, {'image': x.numpy()})[0]
        t = time.time()
        for _ in range(5):
            s.run(None, {'image': x.numpy()})
        out['uvdoc'].update(onnx_mb=os.path.getsize(p) / 2**20, onnx_max_abs_diff=float(np.abs(ref - got).max()),
                            onnx_sec_1thread_host=(time.time() - t) / 5, onnx_ops=sorted({nd.op_type for nd in onnx.load(p).graph.node}))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--bench', action='append', required=True)
    ap.add_argument('--uvdoc-repo', required=True)
    ap.add_argument('--dewarpnet-repo', required=True)
    ap.add_argument('--dewarpnet-w', required=True)
    ap.add_argument('--onnx')
    ap.add_argument('--parallel', type=int, default=4)
    ap.add_argument('--method')
    a = ap.parse_args()
    if a.method:
        return child(a)
    base = [sys.executable, __file__, a.out, '--uvdoc-repo', a.uvdoc_repo, '--dewarpnet-repo', a.dewarpnet_repo, '--dewarpnet-w', a.dewarpnet_w]
    for b in a.bench:
        base += ['--bench', b]
    # longest first, one process per core
    order = ['dewarpnet', 'uvdoc', 'classical', 'classical_crisp', 'persp']
    procs, results = [], []
    for m in order:
        while len([p for p in procs if p[1].poll() is None]) >= a.parallel:
            time.sleep(1)
        tmp = tempfile.mkdtemp(prefix=f'perf_{m}_')
        env = {**os.environ, 'OMP_NUM_THREADS': '1', 'OMP_THREAD_LIMIT': '1', 'TMPDIR': tmp}
        procs.append((m, subprocess.Popen(base + ['--method', m], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env), tmp))
    with open(a.out, 'w') as f:
        for m, p, tmp in procs:
            so, se = p.communicate()
            line = [x for x in so.splitlines() if x.startswith('{')]
            r = json.loads(line[-1]) if line else {'method': m, 'error': (se or '')[-400:], 'returncode': p.returncode}
            r['tmp_left_mb'] = dir_size(tmp) / 2**20
            shutil.rmtree(tmp, ignore_errors=True)
            f.write(json.dumps(r) + '\n')
            print(json.dumps(r), flush=True)
        f.write(json.dumps({'models': model_sizes(a)}, default=str) + '\n')


if __name__ == '__main__':
    main()
