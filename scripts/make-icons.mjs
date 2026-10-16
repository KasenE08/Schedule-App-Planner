// Renders scripts/icon-source.png (the app icon artwork, recolored) to the app's PNG icon sizes.
// Needs Playwright with Chromium: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

/** Shifts the purple artwork to the app's teal/sky palette and boosts saturation. */
const FILTER = 'hue-rotate(-55deg) saturate(1.6)';
const src = `data:image/png;base64,${readFileSync(new URL('./icon-source.png', import.meta.url)).toString('base64')}`;
const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:#05060b"><img src="${src}" style="width:${size}px;height:${size}px;display:block;filter:${FILTER}"></body>`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: `public/icon-${size}.png`, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
