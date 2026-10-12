import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig, CONFIG } from '../../config';
import { DbService } from '../../common/db.service';
import { MetricsService } from '../../common/metrics.service';
import { RedisService } from '../../common/redis.service';

@Controller()
export class HealthController {
  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('health')
  async health() {
    const [db, redis] = await Promise.all([
      this.db.one('SELECT postgis_version() AS v').then((r) => ({ ok: true, postgis: r?.v })).catch((e) => ({ ok: false, error: e.message })),
      this.redis.client.ping().then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message })),
    ]);
    return { ok: db.ok && redis.ok, db, redis, time: new Date().toISOString() };
  }

  /** Prometheus scrape endpoint; protect with METRICS_TOKEN outside the cluster. */
  @Get('metrics')
  async scrape(@Headers('authorization') auth: string | undefined, @Res() res: Response) {
    if (this.cfg.METRICS_TOKEN && auth !== `Bearer ${this.cfg.METRICS_TOKEN}`) {
      res.status(401).end();
      return;
    }
    res.setHeader('content-type', this.metrics.registry.contentType);
    res.end(await this.metrics.registry.metrics());
  }
}
