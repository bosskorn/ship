/* global __dirname */
/**
 * Rasterise SVG files to transparent PNGs with Chromium (exact vector rendering):
 *   node tools/brand/raster.js in.svg out.png size [in2.svg out2.png size ...]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright'));
}

(async () => {
  const args = process.argv.slice(2);
  const browser = await playwright.chromium.launch();
  for (let i = 0; i < args.length; i += 3) {
    const [src, out, size] = [args[i], args[i + 1], Number(args[i + 2])];
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(src, 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
})();
