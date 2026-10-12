/**
 * Generates the น้องช่าง brand SVG kit into /brand.
 * Run: node scripts/brand-svgs.mjs   (then scripts/export-brand-png.mjs for PNGs)
 *
 * Geometry is shared with src/brand/Logo.tsx (96×96 grid).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'brand');
mkdirSync(out, { recursive: true });

const PRIMARY = '#0B5FFF';
const ACCENT = '#12C2E9';
const INK = '#181818';
const ROOF = 'M20 46 L48 22 L76 46';
const WALLS = 'M28 42 V74 H68 V42';
const FONT = "'Noto Sans Thai', 'Sukhumvit Set', 'Thonburi', sans-serif";

/** House + wrench door; the wrench notch is a real cut-out (mask). */
const symbol = ({ stroke, tool, id = 's', tx = 0, ty = 0, scale = 1, house = true, wrench = true }) => `
  <g transform="translate(${tx} ${ty}) scale(${scale})">
    <defs>
      <mask id="${id}-notch" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="96">
        <rect width="96" height="96" fill="#fff"/>
        <rect x="44.5" y="44" width="7" height="10" rx="1.5" fill="#000"/>
      </mask>
    </defs>
    ${house ? `<path d="${ROOF}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${WALLS}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${wrench ? `<g mask="url(#${id}-notch)" fill="${tool}">
      <rect x="44" y="56" width="8" height="18"/>
      <circle cx="48" cy="55" r="9"/>
    </g>` : ''}
  </g>`;

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">\n<title>${title}</title>${body}\n</svg>\n`;

const word = (x, y, size, fill, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="600" fill="${fill}" text-anchor="${anchor}">น้องช่าง</text>`;

const files = {
  // App icon: full-bleed square (stores apply their own corner mask).
  'app-icon.svg': svg(1024, 1024, `<rect width="1024" height="1024" fill="${PRIMARY}"/>${symbol({ stroke: '#fff', tool: ACCENT, scale: 1024 / 96 * 0.78, tx: 1024 * 0.11, ty: 1024 * 0.11 })}`, 'น้องช่าง app icon'),
  // Symbol with rounded container (in-app, social avatars).
  'symbol.svg': svg(96, 96, `<rect width="96" height="96" rx="22" fill="${PRIMARY}"/>${symbol({ stroke: '#fff', tool: ACCENT })}`, 'น้องช่าง symbol'),
  // Primary logo: symbol over wordmark.
  'logo-primary.svg': svg(240, 200, `<rect x="72" y="0" width="96" height="96" rx="22" fill="${PRIMARY}"/>${symbol({ stroke: '#fff', tool: ACCENT, tx: 72 })}${word(120, 160, 44, PRIMARY, 'middle')}`, 'น้องช่าง'),
  // Horizontal logo.
  'logo-horizontal.svg': svg(320, 96, `<rect width="96" height="96" rx="22" fill="${PRIMARY}"/>${symbol({ stroke: '#fff', tool: ACCENT })}${word(116, 66, 48, PRIMARY)}`, 'น้องช่าง'),
  // Monochrome (no container) for dark and light backgrounds.
  'logo-mono-white.svg': svg(320, 96, `${symbol({ stroke: '#fff', tool: '#fff', id: 'w' })}${word(108, 66, 48, '#fff')}`, 'น้องช่าง monochrome white'),
  'logo-mono-dark.svg': svg(320, 96, `${symbol({ stroke: INK, tool: INK, id: 'd' })}${word(108, 66, 48, INK)}`, 'น้องช่าง monochrome dark'),
  // Splash frame 0 (house only; the wrench animates in — see BrandAnimation.tsx).
  'splash-logo.svg': svg(96, 96, `<rect width="96" height="96" rx="22" fill="#fff" fill-opacity="0.12"/>${symbol({ stroke: '#fff', tool: ACCENT, wrench: false })}`, 'น้องช่าง splash'),
  // Android adaptive icon layers (108dp canvas, 66dp safe zone).
  'android-foreground.svg': svg(1024, 1024, symbol({ stroke: '#fff', tool: ACCENT, id: 'f', scale: 1024 / 96 * 0.56, tx: 1024 * 0.22, ty: 1024 * 0.22 }), 'android foreground'),
  'android-monochrome.svg': svg(1024, 1024, symbol({ stroke: '#fff', tool: '#fff', id: 'm', scale: 1024 / 96 * 0.56, tx: 1024 * 0.22, ty: 1024 * 0.22 }), 'android monochrome'),
  'android-background.svg': svg(1024, 1024, `<rect width="1024" height="1024" fill="${PRIMARY}"/>`, 'android background'),
};

for (const [name, content] of Object.entries(files)) writeFileSync(join(out, name), content);
console.log(`wrote ${Object.keys(files).length} files to ${out}`);
