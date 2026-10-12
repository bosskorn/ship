import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig, CONFIG } from '../config';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {
    this.client = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  }

  /** A fresh connection (BullMQ workers and socket.io adapter need dedicated ones). */
  duplicate(): Redis {
    return this.client.duplicate();
  }

  connectionOptions() {
    const url = new URL(this.cfg.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      password: url.password || undefined,
      db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
      maxRetriesPerRequest: null,
    };
  }

  /** Acquire a short-lived lock. Returns a release function or null. */
  async lock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    const token = Math.random().toString(36).slice(2);
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;
    return async () => {
      // release only if we still own it
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    };
  }

  /** Fixed-window counter. Returns true if the call is within the limit. */
  async rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
    const k = `rl:${key}`;
    const n = await this.client.incr(k);
    if (n === 1) await this.client.expire(k, windowSec);
    return n <= limit;
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
