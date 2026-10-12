/**
 * Rasterises /brand SVGs into /assets using Chromium's headless shell
 * (exact viewport, transparent background).
 * Run: CHROME=/path/to/chrome-headless-shell node scripts/export-brand-png.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME ?? 'chrome-headless-shell';
const tmp = mkdtempSync(join(tmpdir(), 'brand-'));

const jobs = [
  ['app-icon.svg', 'icon.png', 1024],
  ['android-foreground.svg', 'android-icon-foreground.png', 1024],
  ['android-background.svg', 'android-icon-background.png', 1024],
  ['android-monochrome.svg', 'android-icon-monochrome.png', 1024],
  ['splash-logo.svg', 'splash-icon.png', 480],
];

for (const [src, dest, size] of jobs) {
  const svg = readFileSync(join(root, 'brand', src), 'utf8');
  const html = join(tmp, `${dest}.html`);
  writeFileSync(
    html,
    `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${size}px;height:${size}px;display:block"></body></html>`,
  );
  execFileSync(chrome, [
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${join(root, 'assets', dest)}`,
    `file://${html}`,
  ], { stdio: 'ignore' });
  console.log(`assets/${dest}`);
}
