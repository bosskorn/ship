import { useNetworkState } from 'expo-network';

/** True only when we know we're offline (unknown → treated as online). */
export function useIsOffline() {
  const state = useNetworkState();
  return state.isConnected === false || state.isInternetReachable === false;
}
