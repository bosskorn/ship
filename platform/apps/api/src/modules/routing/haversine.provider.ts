import { haversineMeters, LatLng, VehicleType } from '@ship/shared';
import { MatrixResult, RouteResult, RoutingProvider } from './routing.types';

/** Average urban speeds (m/s) for Bangkok-like traffic. Tunable from real trip data later. */
const SPEED_MS: Record<VehicleType, number> = {
  MOTORCYCLE: 7.5, // ~27 km/h
  CAR: 6.1, // ~22 km/h
  PICKUP: 5.8,
  VAN: 5.6,
};
/** Straight-line to road-network distance factor. */
const ROAD_FACTOR = 1.3;

/**
 * Network-free fallback. Good enough for dev/tests and for degrading gracefully
 * when OSRM is down; never the primary in production.
 */
export class HaversineRoutingProvider implements RoutingProvider {
  readonly name = 'haversine';

  async route(points: LatLng[], vehicle: VehicleType): Promise<RouteResult> {
    const legs = [];
    for (let i = 1; i < points.length; i++) legs.push(this.leg(points[i - 1], points[i], vehicle));
    return {
      distanceM: legs.reduce((s, l) => s + l.distanceM, 0),
      durationS: legs.reduce((s, l) => s + l.durationS, 0),
      legs,
      geometry: points.map((p) => [p.lng, p.lat]),
      provider: this.name,
    };
  }

  async matrix(sources: LatLng[], destinations: LatLng[], vehicle: VehicleType): Promise<MatrixResult> {
    const d = sources.map((s) => destinations.map((t) => this.leg(s, t, vehicle)));
    return {
      durationsS: d.map((row) => row.map((l) => l.durationS)),
      distancesM: d.map((row) => row.map((l) => l.distanceM)),
      provider: this.name,
    };
  }

  private leg(a: LatLng, b: LatLng, vehicle: VehicleType) {
    const distanceM = Math.round(haversineMeters(a, b) * ROAD_FACTOR);
    return { distanceM, durationS: Math.round(distanceM / SPEED_MS[vehicle]) };
  }
}
