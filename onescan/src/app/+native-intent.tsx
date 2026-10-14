import { isAuthLink, putAuthLink } from '@/services/auth/linkInbox';

/** Email links carry their one-time data in the fragment: keep it for the callback screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (isAuthLink(path)) {
    putAuthLink(path);
    return '/auth/callback';
  }
  return path;
}
