/**
 * Cloud is optional and OFF by default (spec §26, §66.1). These guards are the
 * single gate every upload path must pass; violating calls throw.
 */
export type CloudProviderId = 'onescan' | 'google_drive' | 'onedrive' | 'dropbox' | 'webdav';

export interface CloudSettings {
  backupEnabled: boolean;
  provider: CloudProviderId | null;
}

export interface UploadIntent {
  /** Was this triggered by an explicit user action (vs. background auto-upload)? */
  userInitiated: boolean;
  /** Payload has already been encrypted on device. */
  encrypted: boolean;
}

export type UploadDecision = { allowed: true } | { allowed: false; reason: 'cloud_off' | 'no_provider' | 'auto_upload_off' | 'not_encrypted' };

export function canUpload(cloud: CloudSettings, autoUpload: boolean, intent: UploadIntent): UploadDecision {
  if (!cloud.backupEnabled) return { allowed: false, reason: 'cloud_off' };
  if (!cloud.provider) return { allowed: false, reason: 'no_provider' };
  if (!intent.userInitiated && !autoUpload) return { allowed: false, reason: 'auto_upload_off' };
  if (!intent.encrypted) return { allowed: false, reason: 'not_encrypted' };
  return { allowed: true };
}

/** Metadata the server may know (spec §59): about the document, not the document. */
export interface CloudObjectMeta {
  objectId: string;
  size: number;
  encrypted: true;
  createdAt: number;
}
