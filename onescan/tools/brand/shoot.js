/* global __dirname */
/**
 * Screenshot HTML boards: node tools/brand/shoot.js file.html out.png [width]
 * Uses Playwright (global install) with the preinstalled Chromium.
 */
const { execFileSync } = require('child_process');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright'));
}

(async () => {
  const [html, out, width = '1400'] = process.argv.slice(2);
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(width), height: 200 }, deviceScaleFactor: 2 });
  await page.goto(`file://${path.resolve(html)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})();
