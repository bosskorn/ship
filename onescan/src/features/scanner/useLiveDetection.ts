import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { DocumentEngine } from '@/core/document-engine/DocumentEngine';
import { AutoCaptureController, CaptureHint, defaultAutoCaptureConfig } from '@/core/document-engine/capture/autoCapture';
import { pageShape } from '@/core/document-engine/capture/qualityCoach';
import type { Quad } from '@/core/document-engine/model';
import type { CameraFrame } from '@/native/OneScanCameraView';

const SMOOTHING = 0.5;
const MIN_DISPLAY_CONFIDENCE = defaultAutoCaptureConfig.minConfidence;
/** Consecutive frames before the detected page kind (card / not card) flips. */
const SHAPE_FRAMES = 3;
/** Minimum time between two "ready" haptics. */
const READY_TAP_GAP_MS = 2500;

interface LiveState {
  quad: Quad | null;
  frame: { width: number; height: number } | null;
  hint: CaptureHint;
  /** The page has looked like an ID-1 card for a few frames. */
  card: boolean;
}

/**
 * Turns native live frames (DocSeg mask + brightness/sharpness, computed on the camera
 * thread) into a smoothed border, a capture hint and the auto-capture trigger. The JS
 * work per frame is a 64×64 mask walk at ~4 fps; it never touches frame pixels.
 */
export function useLiveDetection(opts: { autoCapture: boolean; paused: boolean; onFire: () => void; onReady?: () => void }) {
  const controller = useRef(new AutoCaptureController());
  const busy = useRef(false);
  const smoothed = useRef<Quad | null>(null);
  const shape = useRef({ card: false, streak: 0 });
  const wasReady = useRef(false);
  const lastReadyTap = useRef(0);
  const [state, setState] = useState<LiveState>({ quad: null, frame: null, hint: 'searching', card: false });
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const onFrame = useCallback((e: NativeSyntheticEvent<CameraFrame>) => {
    const { paused, autoCapture, onFire, onReady } = optsRef.current;
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
      const size = { width: frame.width, height: frame.height };
      const isCard = quad ? pageShape(quad, size) === 'card' : false;
      const s = shape.current;
      if (isCard !== s.card) {
        s.streak++;
        if (s.streak >= SHAPE_FRAMES) {
          s.card = isCard;
          s.streak = 0;
        }
      } else s.streak = 0;
      const r = controller.current.push({ ...d, quad, at: Date.now() });
      const ready = r.hint === 'ready';
      // One light tap per ready moment: a flickering border must not buzz repeatedly.
      const now = Date.now();
      if (ready && !wasReady.current && now - lastReadyTap.current > READY_TAP_GAP_MS) {
        lastReadyTap.current = now;
        onReady?.();
      }
      wasReady.current = ready;
      setState({ quad, frame: size, hint: r.hint, card: s.card });
      if (r.fire && autoCapture) onFire();
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    controller.current.reset();
    smoothed.current = null;
    wasReady.current = false;
  }, []);

  return { ...state, onFrame, reset };
}
