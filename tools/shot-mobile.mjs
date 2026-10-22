// Phone screenshots (390×844, touch, mobile UA): the hunter picker and the in-game HUD + joystick.
// usage: node tools/shot-mobile.mjs [base=http://localhost:5173]
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${base}/play?fresh=1&animals=0&noshadow`, { waitUntil: 'commit' });
await page.waitForSelector('.gate__guest', { timeout: 600000 });
await page.tap('.gate__guest');
await page.waitForSelector('.gate__step--agent:not([hidden])');
await page.waitForFunction(() => [...document.querySelectorAll('.hero img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60000 });
await page.screenshot({ path: 'shots/mobile-picker.png' });
console.log('picker: all 6 hunter images loaded');
await page.fill('.gate__name', `M${Date.now().toString(36).slice(-6)}`);
await page.waitForFunction(() => !document.querySelector('.gate__play').disabled, null, { timeout: 600000 });
await page.tap('.gate__play');
await page.waitForSelector('.dash:not([hidden])', { timeout: 600000 });
await page.screenshot({ path: 'shots/mobile-dash.png' });
await page.tap('.dash__enter');
await page.waitForTimeout(2500);
const layout = await page.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  return { hud: r('.hud').height, stats: r('.hud__stats').width, stick: r('#stick').width, overflow: document.documentElement.scrollWidth - innerWidth };
});
console.log('layout', layout);
assert.ok(layout.stick > 100, 'joystick shows on phones');
assert.ok(layout.overflow <= 0, 'no sideways scroll');
await page.screenshot({ path: 'shots/mobile-game.png' });
process.exit(0);
