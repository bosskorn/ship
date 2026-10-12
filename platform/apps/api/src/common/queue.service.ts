import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Job, JobsOptions, Queue, Worker } from 'bullmq';
import { AppConfig, CONFIG } from '../config';
import { MetricsService } from './metrics.service';
import { RedisService } from './redis.service';

export type QueueName = 'dispatch' | 'maintenance';
type Handler = (data: any, job: Job) => Promise<unknown>;

/**
 * BullMQ wrapper. Feature modules register handlers by job name in their constructors;
 * workers start on bootstrap (only when RUN_WORKERS=true, so API-only pods can opt out).
 */
@Injectable()
export class QueueService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Queue');
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];
  private readonly handlers = new Map<string, Handler>();
  private readonly repeatables: { queue: QueueName; name: string; everyMs: number }[] = [];
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  queue(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, {
        connection: this.redis.connectionOptions(),
        defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000, attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(queue: QueueName, name: string, data: unknown, opts?: JobsOptions) {
    return this.queue(queue).add(name, data, opts);
  }

  handle(queue: QueueName, name: string, fn: Handler) {
    this.handlers.set(`${queue}:${name}`, fn);
  }

  every(queue: QueueName, name: string, everyMs: number) {
    this.repeatables.push({ queue, name, everyMs });
  }

  async onApplicationBootstrap() {
    if (!this.cfg.RUN_WORKERS) return;
    for (const name of ['dispatch', 'maintenance'] as QueueName[]) {
      const worker = new Worker(
        name,
        async (job) => {
          const fn = this.handlers.get(`${name}:${job.name}`);
          if (!fn) throw new Error(`No handler for ${name}:${job.name}`);
          return fn(job.data, job);
        },
        { connection: this.redis.connectionOptions(), concurrency: name === 'dispatch' ? 20 : 2 },
      );
      worker.on('failed', (job, err) => this.logger.error(`${name}:${job?.name} failed: ${err.message}`));
      this.workers.push(worker);
    }
    for (const r of this.repeatables) {
      await this.queue(r.queue).upsertJobScheduler(`${r.name}-scheduler`, { every: r.everyMs }, { name: r.name, data: {} });
    }
    this.metricsTimer = setInterval(() => void this.collectMetrics(), 15_000);
  }

  private async collectMetrics() {
    for (const [name, q] of this.queues) {
      try {
        const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed');
        for (const [state, n] of Object.entries(counts)) this.metrics.queueDepth.set({ queue: name, state }, n);
      } catch {
        /* ignore */
      }
    }
  }

  async onModuleDestroy() {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
