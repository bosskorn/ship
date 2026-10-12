/* Minimal forward-only SQL migration runner. */
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { Client } from 'pg';
import { loadConfig } from '../config';

async function main() {
  const cfg = loadConfig();
  const dir = resolve(__dirname, '../../migrations');
  const client = new Client({ connectionString: cfg.DATABASE_URL, ssl: cfg.DATABASE_SSL ? { rejectUnauthorized: true } : undefined });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    // Serialize concurrent deploys.
    await client.query('SELECT pg_advisory_lock(727274)');
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      const sql = await fs.readFile(join(dir, f), 'utf8');
      process.stdout.write(`applying ${f} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await client.query('COMMIT');
        console.log('ok');
      } catch (e) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw e;
      }
    }
    console.log('migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
