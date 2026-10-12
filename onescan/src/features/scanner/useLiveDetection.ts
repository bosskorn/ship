import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { AutoCaptureController, CaptureHint, defaultAutoCaptureConfig } from '@/core/document-engine/capture/autoCapture';
import type { Quad } from '@/core/document-engine/model';
import type { CameraFrame } from '@/native/OneScanCameraView';

const SMOOTHING = 0.5;
const MIN_DISPLAY_CONFIDENCE = defaultAutoCaptureConfig.minConfidence;

/**
 * Runs the shared JS detector on live camera frames, smooths the border and
 * feeds the auto-capture state machine. `onFire` is called when the page has
 * been steady long enough.
 */
export function useLiveDetection(opts: { autoCapture: boolean; paused: boolean; onFire: () => void }) {
  const controller = useRef(new AutoCaptureController());
  const busy = useRef(false);
  const smoothed = useRef<Quad | null>(null);
  const [state, setState] = useState<{ quad: Quad | null; frame: { width: number; height: number } | null; hint: CaptureHint }>({
    quad: null,
    frame: null,
    hint: 'searching',
  });
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const onFrame = useCallback((e: NativeSyntheticEvent<CameraFrame>) => {
    const { paused, autoCapture, onFire } = optsRef.current;
    if (busy.current || paused) return;
    busy.current = true;
    try {
      const frame = e.nativeEvent;
      const d = DocumentEngine.capture.detectFrame(frame);
      let quad: Quad | null = null;
      // Only draw a border the auto-capture logic would also accept, so the
      // overlay and the status hint never disagree.
      if (d.quad && d.confidence >= MIN_DISPLAY_CONFIDENCE) {
        const prev = smoothed.current;
        quad = prev
          ? (d.quad.map((p, i) => ({ x: prev[i].x + (p.x - prev[i].x) * SMOOTHING, y: prev[i].y + (p.y - prev[i].y) * SMOOTHING })) as Quad)
          : d.quad;
      }
      smoothed.current = quad;
      const r = controller.current.push({ ...d, quad, at: Date.now() });
      setState({ quad, frame: { width: frame.width, height: frame.height }, hint: r.hint });
      if (r.fire && autoCapture) onFire();
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    controller.current.reset();
    smoothed.current = null;
  }, []);

  return { ...state, onFrame, reset };
}
