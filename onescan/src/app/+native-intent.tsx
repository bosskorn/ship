import { isAuthLink, isCustomSchemeAuthLink, productionAppLinks, putAuthLink } from '@/services/auth/linkInbox';

/** Email links carry their one-time data in the fragment: keep it for the callback screen. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  // With verified App Links (production), email links never use the custom scheme: drop any that do.
  if (productionAppLinks() && isCustomSchemeAuthLink(path)) return '/';
  if (isAuthLink(path)) {
    putAuthLink(path);
    return '/auth/callback';
  }
  return path;
}
