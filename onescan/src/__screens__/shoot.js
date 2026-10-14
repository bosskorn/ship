/* global __dirname */
/**
 * Render the review screens and capture them like an Android phone (412×915 dp, 2.625×).
 *
 *   node src/__screens__/shoot.js [outDir]
 *
 * Uses Playwright (globally installed) with the preinstalled Chromium.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] ?? path.join(__dirname, 'out'));
const root = path.join(__dirname, '../..');
execFileSync('npx', ['jest', '-c', 'src/__screens__/jest.config.js', '--forceExit', '--silent'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SHOTS_OUT: out },
});

let playwright;
try {
  playwright = require('playwright');
} catch {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  playwright = require(path.join(globalRoot, 'playwright'));
}

(async () => {
  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625 });
  for (const f of fs.readdirSync(out).filter((n) => n.endsWith('.html')).sort()) {
    // A "-360" suffix captures a small phone (360 dp wide); others are 412 dp.
    await page.setViewportSize({ width: /-360\.html$/.test(f) ? 360 : 412, height: 915 });
    await page.goto(`file://${path.join(out, f)}`);
    await page.evaluate(() => document.fonts.ready);
    // Full page: the scroll view is unrolled so the whole Home is visible.
    // RN <Image> only paints after a load event that jsdom never fires: draw the logo here.
    const logo = `file://${path.join(root, 'assets/splash-icon.png')}`;
    await page.addStyleTag({ content: `[data-testid="home-logo"]{background:url("${logo}") center/contain no-repeat}` });
    await page.addStyleTag({ content: `[data-testid="onboarding-logo"]{background:url("${logo}") center/contain no-repeat}` });
    if (f.startsWith('app-')) {
      // Whole-app frames: exactly one phone screen, as rendered.
      const w = /-360\.html$/.test(f) ? 360 : 412;
      await page.setViewportSize({ width: w, height: 915 });
      await page.waitForTimeout(700); // let sheet / modal entry animations finish
      await page.screenshot({ path: path.join(out, f.replace('.html', '.png')) });
      console.log(f.replace('.html', '.png'));
      continue;
    }
    const pageNo = /^onboarding-(\d)/.exec(f);
    if (pageNo) {
      // Pager screens keep their viewport; show page N of the horizontal list.
      await page.evaluate((n) => {
        for (const el of document.querySelectorAll('div')) if (el.scrollWidth > el.clientWidth + 10) el.scrollLeft = el.clientWidth * (n - 1);
      }, Number(pageNo[1]));
      await page.screenshot({ path: path.join(out, f.replace('.html', '.png')) });
      console.log(f.replace('.html', '.png'));
      continue;
    }
    await page.addStyleTag({ content: 'div{overflow:visible!important} #root,#root>div{height:auto!important;min-height:0!important}' });
    await page.screenshot({ path: path.join(out, f.replace('.html', '.png')), fullPage: true });
    console.log(f.replace('.html', '.png'));
  }
  await browser.close();
})();
