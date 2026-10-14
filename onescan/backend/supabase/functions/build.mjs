// Bundles the OneScan API Edge Function into one file for `supabase functions deploy` or the
// Supabase MCP deploy tool: node backend/supabase/functions/build.mjs → functions/onescan-api/dist/index.js
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// esbuild is installed with the API's dev tools (vitest → vite): run `npm ci` in backend/api first.
const { build } = createRequire(join(here, '../../api/package.json'))('esbuild');
await build({
  entryPoints: [join(here, 'onescan-api/index.ts')],
  outfile: join(here, 'onescan-api/dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  // Dependencies load from npm at runtime (same versions as backend/api/package.json).
  alias: { jose: 'npm:jose@5.9.6' },
  external: ['npm:*'],
  legalComments: 'none',
  charset: 'utf8',
});
