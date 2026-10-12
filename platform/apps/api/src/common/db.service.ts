import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { AppConfig, CONFIG } from '../config';

// Keep NUMERIC and BIGINT as strings (never parse money into JS floats).
types.setTypeParser(types.builtins.NUMERIC, (v) => v);
types.setTypeParser(types.builtins.INT8, (v) => v);

export type Queryable = Pick<PoolClient, 'query'>;

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly pool: Pool;

  constructor(@Inject(CONFIG) cfg: AppConfig) {
    this.pool = new Pool({
      connectionString: cfg.DATABASE_URL,
      ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
      max: 20,
      statement_timeout: 10_000,
    });
    this.pool.on('error', (err) => this.logger.error(`pg pool error: ${err.message}`));
  }

  async query<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], client?: Queryable): Promise<T[]> {
    const res = await (client ?? this.pool).query<T>(sql, params as any[]);
    return res.rows;
  }

  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], client?: Queryable): Promise<T | null> {
    const rows = await this.query<T>(sql, params, client);
    return rows[0] ?? null;
  }

  /**
   * Run fn in a transaction. Deadlock / serialization failures are retried.
   * Callbacks registered with onCommit run only after a successful COMMIT
   * (use it to publish domain events / socket messages).
   */
  async tx<T>(fn: (client: PoolClient, onCommit: (cb: () => void | Promise<void>) => void) => Promise<T>, retries = 2): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const client = await this.pool.connect();
      const hooks: (() => void | Promise<void>)[] = [];
      let released = false;
      try {
        await client.query('BEGIN');
        const result = await fn(client, (cb) => hooks.push(cb));
        await client.query('COMMIT');
        client.release();
        released = true;
        for (const h of hooks) {
          try {
            await h();
          } catch (e) {
            this.logger.error(`onCommit hook failed: ${(e as Error).message}`);
          }
        }
        return result;
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (attempt < retries && (err?.code === '40001' || err?.code === '40P01')) continue;
        throw err;
      } finally {
        if (!released) client.release();
      }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

/** SQL fragment helpers for PostGIS points. */
export const pointSql = (latIdx: number, lngIdx: number) =>
  `ST_SetSRID(ST_MakePoint($${lngIdx}, $${latIdx}), 4326)::geography`;
