import React, { forwardRef } from 'react';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { OneScanVision, NativeImage } from './OneScanVision';

export interface CameraFrame {
  width: number;
  height: number;
  /** base64 8-bit luminance (Y), upright. */
  data: string;
  /** base64 chroma planes (Cb, Cr), same size as `data`. */
  cb?: string;
  cr?: string;
  /** base64 64×64 page probabilities (0..255) from the on-device DocSeg model. */
  mask?: string;
}

export interface OneScanCameraViewProps extends ViewProps {
  torch?: boolean;
  active?: boolean;
  frameMaxEdge?: number;
  frameIntervalMs?: number;
  onCameraReady?: () => void;
  onFrame?: (e: NativeSyntheticEvent<CameraFrame>) => void;
  onCameraError?: (e: NativeSyntheticEvent<{ message: string }>) => void;
}

export interface OneScanCameraViewRef {
  takePhoto(): Promise<NativeImage>;
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
