import { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, ImageProps } from 'react-native';
import { DocumentFileStore } from '@/core/document-engine/storage/DocumentFileStore';

/** Resolved readable URIs (decrypted cache copies), shared across screens. */
const resolved = new Map<string, string>();
/** Bumped when resolutions go stale (a file was encrypted in place): images re-resolve. */
let epoch = 0;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getEpoch = () => epoch;

/** Readable URI for a stored file: the decrypted cache copy of an encrypted document file. */
export function useReadableUri(uri: string | null | undefined): string | null {
  const e = useSyncExternalStore(subscribe, getEpoch);
  const [state, setState] = useState<{ uri: string; plain: string; epoch: number } | null>(null);
  useEffect(() => {
    if (!uri || resolved.has(uri)) return;
    let alive = true;
    DocumentFileStore.readableUri(uri)
      .then((plain) => {
        resolved.set(uri, plain);
        if (alive) setState({ uri, plain, epoch: e });
      })
      .catch(() => {
        // Not readable (missing or damaged file): show nothing.
      });
    return () => {
      alive = false;
    };
  }, [uri, e]);
  if (!uri) return null;
  return resolved.get(uri) ?? (state?.uri === uri && state.epoch === e ? state.plain : null);
}

/** Forget resolved copies; mounted images resolve again. */
export function clearReadableUris() {
  resolved.clear();
  epoch++;
  listeners.forEach((l) => l());
}

/** `<Image source={{ uri }}>` for document files that may be encrypted at rest. */
export function SecureImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string | null | undefined }) {
  const plain = useReadableUri(uri);
  return <Image {...props} source={plain ? { uri: plain } : undefined} />;
}
