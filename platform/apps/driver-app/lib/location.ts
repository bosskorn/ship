import { GPS_DISTANCE_FILTER_M, GPS_INTERVAL_MS, LocationPing } from '@ship/shared';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';

/**
 * Background GPS (spec §12, §21). Runs as an OS-managed task so pings continue with the
 * app in the background / screen off. Frequency adapts to state to save battery:
 *   offline → stopped · online idle → 30 s / 50 m · active job → 5 s / 15 m
 */
export const LOCATION_TASK = 'ship-driver-location';
export type TrackingMode = 'idle' | 'active';

let queue: LocationPing[] = [];
let flushing = false;

async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  const batch = queue.slice(0, 200);
  try {
    if (!api.session) await api.restore(); // headless JS context on Android
    if (!api.session) return;
    await api.post('/driver/location', { pings: batch });
    queue = queue.slice(batch.length);
  } catch {
    // offline: keep (bounded) and retry with the next fix
    queue = queue.slice(-500);
  } finally {
    flushing = false;
  }
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  for (const l of data.locations) {
    queue.push({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy: l.coords.accuracy ?? undefined,
      heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : undefined,
      speed: l.coords.speed != null && l.coords.speed >= 0 ? Math.min(l.coords.speed, 100) : undefined,
      ts: Math.round(l.timestamp),
      isMocked: l.mocked ?? undefined,
    });
  }
  await flush();
});

export async function ensurePermissions(): Promise<{ ok: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { ok: true, background: bg.status === 'granted' };
}

export async function startTracking(mode: TrackingMode) {
  const active = mode === 'active';
  const options: Location.LocationTaskOptions = {
    accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: active ? GPS_INTERVAL_MS.ACTIVE_IN_TRANSIT : GPS_INTERVAL_MS.ONLINE_IDLE,
    distanceInterval: active ? GPS_DISTANCE_FILTER_M.ACTIVE : GPS_DISTANCE_FILTER_M.ONLINE_IDLE,
    deferredUpdatesInterval: active ? 5_000 : 30_000,
    activityType: Location.ActivityType.AutomotiveNavigation,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: active ? 'กำลังส่งงาน' : 'ออนไลน์ รอรับงาน',
      notificationBody: 'แชร์ตำแหน่งเพื่อรับงานและให้ลูกค้าติดตาม · ออฟไลน์เพื่อหยุด',
      notificationColor: '#0052D9',
    },
  };
  // restart with the new cadence if already running
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await Location.startLocationUpdatesAsync(LOCATION_TASK, options);
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  queue = [];
}

export async function currentPosition() {
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: p.coords.latitude, lng: p.coords.longitude };
}
