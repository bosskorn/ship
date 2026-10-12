import { haversineMeters, LatLng } from '@ship/shared';
import { OptimizeStop, RouteOptimizer } from './routing.types';

/**
 * Nearest-neighbour + 2-opt with locked positions. Fine for <= 20 stops.
 * Phase 3 replaces this with a VROOM-backed optimizer behind the same interface.
 */
export class HeuristicRouteOptimizer implements RouteOptimizer {
  readonly name = 'heuristic';

  async optimize(start: LatLng, stops: OptimizeStop[]): Promise<number[]> {
    const n = stops.length;
    if (n <= 1) return stops.map((_, i) => i);

    const slots: (number | null)[] = stops.map((s, i) => (s.locked ? i : null));
    const free = stops.map((_, i) => i).filter((i) => !stops[i].locked);

    // Greedy fill of free slots in order, from the previous position.
    let prev = start;
    const remaining = new Set(free);
    for (let pos = 0; pos < n; pos++) {
      if (slots[pos] !== null) {
        prev = stops[slots[pos]!].location;
        continue;
      }
      let best = -1;
      let bestD = Infinity;
      for (const i of remaining) {
        const d = haversineMeters(prev, stops[i].location);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      slots[pos] = best;
      remaining.delete(best);
      prev = stops[best].location;
    }
    const order = slots as number[];

    // 2-opt restricted to swaps of free positions.
    const cost = (o: number[]) => {
      let c = 0;
      let p = start;
      for (const i of o) {
        c += haversineMeters(p, stops[i].location);
        p = stops[i].location;
      }
      return c;
    };
    const freePositions = order.map((_, pos) => pos).filter((pos) => !stops[order[pos]].locked);
    let improved = true;
    let best = cost(order);
    while (improved) {
      improved = false;
      for (let a = 0; a < freePositions.length; a++) {
        for (let b = a + 1; b < freePositions.length; b++) {
          const pa = freePositions[a];
          const pb = freePositions[b];
          [order[pa], order[pb]] = [order[pb], order[pa]];
          const c = cost(order);
          if (c + 1e-6 < best) {
            best = c;
            improved = true;
          } else {
            [order[pa], order[pb]] = [order[pb], order[pa]];
          }
        }
      }
    }
    return order;
  }
}
