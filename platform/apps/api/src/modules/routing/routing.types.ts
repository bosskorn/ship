import type { LatLng, VehicleType } from '@ship/shared';

export interface RouteLeg {
  distanceM: number;
  durationS: number;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  legs: RouteLeg[];
  /** Encoded polyline or GeoJSON LineString coordinates when the provider supports it. */
  geometry?: [number, number][] | null;
  provider: string;
}

export interface MatrixResult {
  /** durations[i][j] seconds from sources[i] to destinations[j]; null when unroutable. */
  durationsS: (number | null)[][];
  distancesM: (number | null)[][];
  provider: string;
}

export interface OptimizeStop {
  location: LatLng;
  /** Keep this stop at its current index in the input list. */
  locked?: boolean;
}

/**
 * Provider abstraction (spec §22). Business logic depends only on this interface,
 * so OSRM, Google, Mapbox, HERE... can be swapped without touching pricing/dispatch.
 */
export interface RoutingProvider {
  readonly name: string;
  route(points: LatLng[], vehicle: VehicleType): Promise<RouteResult>;
  matrix(sources: LatLng[], destinations: LatLng[], vehicle: VehicleType): Promise<MatrixResult>;
}

/** Multi-stop sequencing (VROOM-backed in Phase 3; heuristic in MVP). */
export interface RouteOptimizer {
  readonly name: string;
  /** Returns the visiting order as indexes into `stops` (pickup is always first and not included). */
  optimize(start: LatLng, stops: OptimizeStop[], vehicle: VehicleType): Promise<number[]>;
}

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');
export const ROUTE_OPTIMIZER = Symbol('ROUTE_OPTIMIZER');
