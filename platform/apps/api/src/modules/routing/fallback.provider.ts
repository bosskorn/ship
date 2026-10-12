import { Logger } from '@nestjs/common';
import { LatLng, VehicleType } from '@ship/shared';
import { MatrixResult, RouteResult, RoutingProvider } from './routing.types';

/** Tries the primary provider, degrades to the fallback on error/timeout. */
export class FallbackRoutingProvider implements RoutingProvider {
  private readonly logger = new Logger('Routing');
  readonly name: string;

  constructor(
    private readonly primary: RoutingProvider,
    private readonly fallback: RoutingProvider,
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async route(points: LatLng[], vehicle: VehicleType): Promise<RouteResult> {
    try {
      return await this.primary.route(points, vehicle);
    } catch (e) {
      this.logger.warn(`${this.primary.name} route failed, falling back: ${(e as Error).message}`);
      return this.fallback.route(points, vehicle);
    }
  }

  async matrix(sources: LatLng[], destinations: LatLng[], vehicle: VehicleType): Promise<MatrixResult> {
    try {
      return await this.primary.matrix(sources, destinations, vehicle);
    } catch (e) {
      this.logger.warn(`${this.primary.name} matrix failed, falling back: ${(e as Error).message}`);
      return this.fallback.matrix(sources, destinations, vehicle);
    }
  }
}
