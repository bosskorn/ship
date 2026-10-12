import { Global, Module } from '@nestjs/common';
import { AppConfig, CONFIG } from '../../config';
import { FallbackRoutingProvider } from './fallback.provider';
import { HaversineRoutingProvider } from './haversine.provider';
import { HeuristicRouteOptimizer } from './optimizer';
import { OsrmRoutingProvider } from './osrm.provider';
import { ROUTE_OPTIMIZER, ROUTING_PROVIDER, RoutingProvider } from './routing.types';

@Global()
@Module({
  providers: [
    {
      provide: ROUTING_PROVIDER,
      inject: [CONFIG],
      useFactory: (cfg: AppConfig): RoutingProvider => {
        const fallback = new HaversineRoutingProvider();
        if (cfg.ROUTING_PROVIDER === 'osrm') {
          if (!cfg.OSRM_URL) throw new Error('OSRM_URL is required when ROUTING_PROVIDER=osrm');
          return new FallbackRoutingProvider(new OsrmRoutingProvider(cfg.OSRM_URL), fallback);
        }
        return fallback;
      },
    },
    { provide: ROUTE_OPTIMIZER, useClass: HeuristicRouteOptimizer },
  ],
  exports: [ROUTING_PROVIDER, ROUTE_OPTIMIZER],
})
export class RoutingModule {}
