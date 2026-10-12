import { LatLng, VehicleType } from '@ship/shared';
import { MatrixResult, RouteResult, RoutingProvider } from './routing.types';

/**
 * OSRM HTTP API (https://project-osrm.org/docs/v5.24.0/api/).
 * Run one OSRM instance per profile in production (car + motorbike-tuned profile);
 * the profile per vehicle is mapped here.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm';

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 2500,
  ) {}

  private profile(_v: VehicleType) {
    return 'driving';
  }

  private coords(points: LatLng[]) {
    return points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  }

  private async get(path: string): Promise<any> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
      const body: any = await res.json();
      if (body.code !== 'Ok') throw new Error(`OSRM ${body.code}: ${body.message ?? ''}`);
      return body;
    } finally {
      clearTimeout(t);
    }
  }

  async route(points: LatLng[], vehicle: VehicleType): Promise<RouteResult> {
    const body = await this.get(
      `/route/v1/${this.profile(vehicle)}/${this.coords(points)}?overview=simplified&geometries=geojson&steps=false`,
    );
    const r = body.routes[0];
    return {
      distanceM: Math.round(r.distance),
      durationS: Math.round(r.duration),
      legs: r.legs.map((l: any) => ({ distanceM: Math.round(l.distance), durationS: Math.round(l.duration) })),
      geometry: r.geometry?.coordinates ?? null,
      provider: this.name,
    };
  }

  async matrix(sources: LatLng[], destinations: LatLng[], vehicle: VehicleType): Promise<MatrixResult> {
    const all = [...sources, ...destinations];
    const src = sources.map((_, i) => i).join(';');
    const dst = destinations.map((_, i) => i + sources.length).join(';');
    const body = await this.get(
      `/table/v1/${this.profile(vehicle)}/${this.coords(all)}?sources=${src}&destinations=${dst}&annotations=duration,distance`,
    );
    const round = (m: (number | null)[][]) => m.map((row) => row.map((v) => (v === null ? null : Math.round(v))));
    return { durationsS: round(body.durations), distancesM: round(body.distances), provider: this.name };
  }
}
