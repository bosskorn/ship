import React, { forwardRef } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { OneScanVision, CapturedPhoto } from './OneScanVision';

export interface CameraFrame {
  width: number;
  height: number;
  /** Mean luminance 0..1 and Laplacian sharpness 0..1, computed natively. */
  brightness?: number;
  sharpness?: number;
  /** base64 8-bit luminance (Y), upright — only sent when there is no DocSeg mask. */
  data?: string;
  /** base64 chroma planes (Cb, Cr), same size as `data`. */
  cb?: string;
  cr?: string;
  /** base64 64×64 page probabilities (0..255) from the on-device DocSeg model. */
  mask?: string;
}

/** Still size/quality tier: `hd` ≈ 12 MP JPEG 95, `max` = largest the camera offers (≤ ~26 MP) JPEG 97. */
export type CaptureQuality = 'hd' | 'max';

export interface CameraReadyInfo {
  captureQuality?: CaptureQuality;
  /** Upright still size the camera will capture at, when it reports one. */
  captureWidth?: number;
  captureHeight?: number;
}

export interface OneScanCameraViewProps extends ViewProps {
  torch?: boolean;
  active?: boolean;
  frameMaxEdge?: number;
  frameIntervalMs?: number;
  captureQuality?: CaptureQuality;
  onCameraReady?: (e: NativeSyntheticEvent<CameraReadyInfo>) => void;
  onFrame?: (e: NativeSyntheticEvent<CameraFrame>) => void;
  onCameraError?: (e: NativeSyntheticEvent<{ message: string }>) => void;
}

export interface OneScanCameraViewRef {
  takePhoto(): Promise<CapturedPhoto>;
}

const NativeView: React.ComponentType<OneScanCameraViewProps & { ref?: React.Ref<OneScanCameraViewRef> }> | null =
  OneScanVision ? requireNativeView('OneScanVision') : null;

/** Native scanner camera with live luminance frames; `null` when the module is unavailable. */
export const OneScanCameraView = NativeView
  ? forwardRef<OneScanCameraViewRef, OneScanCameraViewProps>(function OneScanCameraView(props, ref) {
      const Cmp = NativeView!;
      return <Cmp {...props} ref={ref} />;
    })
  : null;
