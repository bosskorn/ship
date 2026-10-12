# OSRM (routing, distance, ETA)

The API talks to routing only through the `RoutingProvider` interface
(`apps/api/src/modules/routing/routing.types.ts`). Providers:

| Provider | Use | Notes |
|---|---|---|
| `haversine` | dev / tests / fallback | straight line × 1.3, per-vehicle Bangkok speeds |
| `osrm` | production default | wrapped in `FallbackRoutingProvider` → degrades to haversine on errors/timeouts |

Run locally:

```bash
./infra/osrm/prepare.sh                 # downloads Thailand extract and builds the graph
docker compose --profile osrm up -d osrm
ROUTING_PROVIDER=osrm OSRM_URL=http://localhost:5000 pnpm dev:api
```

Production notes
- One OSRM instance per profile. The stock `car.lua` underestimates motorcycles in Bangkok traffic;
  add a tuned `motorbike.lua` profile and map `MOTORCYCLE` to it in `OsrmRoutingProvider.profile()`.
- Rebuild weekly from Geofabrik; serve behind an internal load balancer.
- VROOM (multi-stop optimisation, Phase 3) plugs in behind `RouteOptimizer`
  (`apps/api/src/modules/routing/optimizer.ts`), replacing the heuristic optimizer.
- Google/Mapbox/HERE can be added as further `RoutingProvider` implementations without touching
  pricing or dispatch.
