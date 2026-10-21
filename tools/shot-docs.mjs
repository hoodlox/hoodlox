// Screenshots the Field Manual at desktop and phone width (light and dark), failing on console errors
// or a sideways scroll. usage: node tools/shot-docs.mjs [base=http://localhost:5173]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const errors = [];
for (const [name, width, height, scheme] of [['desktop', 1440, 900, 'light'], ['phone', 390, 844, 'light'], ['desktop-dark', 1440, 900, 'dark']]) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: scheme });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/docs`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('.js-mode').textContent !== '…', null, { timeout: 30000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, 'mode', await page.textContent('.js-mode'), 'pool', await page.textContent('.js-pool'), 'overflow', overflow);
  assert.ok(overflow <= 0, `${name}: page scrolls sideways`);
  await page.screenshot({ path: `shots/docs-${name}.png` });
  if (name === 'desktop') {
    await page.evaluate(() => document.querySelector('#chests').scrollIntoView());
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'shots/docs-desktop-mid.png' });
    console.log('chapter highlighted:', await page.textContent('.toc a.is-on'));
  }
  await page.close();
}
assert.deepEqual(errors, []);
console.log('docs ok');
process.exit(0);
