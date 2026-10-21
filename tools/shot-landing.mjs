// Full-page screenshots of the landing at desktop and phone width, failing on console errors or a
// horizontal overflow. Saves shots/landing-desktop.png and shots/landing-phone.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Lazy images only load when scrolled to; walk the page once.
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, 'overflow px', overflow, 'cards', await page.locator('.card').count(), 'slides', await page.locator('.slide').count());
  assert.ok(overflow <= 0, `${name}: page scrolls sideways`);
  await page.screenshot({ path: `shots/landing-${name}.png`, fullPage: true });
  await page.close();
}
assert.deepEqual(errors, []);
console.log('landing ok');
process.exit(0);
