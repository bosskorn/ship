import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/** Technical metrics exposed at /metrics (Prometheus). Business KPIs live in OpsMetricsService. */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpLatency = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  readonly timeToMatch = new Histogram({
    name: 'dispatch_time_to_match_seconds',
    help: 'Time from SEARCHING_DRIVER to driver accept',
    buckets: [5, 10, 20, 30, 45, 60, 90, 120, 180, 300, 600],
    registers: [this.registry],
  });
  readonly dispatchWaveLatency = new Histogram({
    name: 'dispatch_wave_compute_seconds',
    help: 'Time to compute candidates and send a wave of offers',
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
    registers: [this.registry],
  });
  readonly offers = new Counter({
    name: 'dispatch_offers_total',
    help: 'Dispatch offers by outcome',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  readonly gpsPings = new Counter({
    name: 'gps_pings_total',
    help: 'GPS pings ingested',
    labelNames: ['result'],
    registers: [this.registry],
  });
  readonly gpsLag = new Histogram({
    name: 'gps_ingest_lag_seconds',
    help: 'Device timestamp to server receive lag',
    buckets: [0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [this.registry],
  });
  readonly orderTransitions = new Counter({
    name: 'order_transitions_total',
    help: 'Order status transitions',
    labelNames: ['to'],
    registers: [this.registry],
  });
  readonly onlineDrivers = new Gauge({
    name: 'drivers_online',
    help: 'Drivers currently online (incl. busy)',
    registers: [this.registry],
  });
  readonly queueDepth = new Gauge({
    name: 'queue_jobs',
    help: 'BullMQ jobs by queue and state',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
