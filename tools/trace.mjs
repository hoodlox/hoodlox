// Loads a page and prints every console line with seconds since start, then reports readiness.
// usage: node tools/trace.mjs "<query>" [seconds=180]
import { chromium } from 'playwright';

const [query, secs = '180'] = process.argv.slice(2);
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (!/skinning|\[vite\]/.test(m.text())) console.log(stamp(), m.type(), m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log(stamp(), 'pageerror', e.message));
page.on('requestfinished', (r) => { if (/\.(fbx|glb|png)$/.test(r.url())) console.log(stamp(), 'loaded', r.url().split('/').slice(-2).join('/')); });
page.on('requestfailed', (r) => console.log(stamp(), 'FAILED', r.url()));
await page.goto(`http://localhost:5173/map.html?${query}`, { waitUntil: 'commit' });
try { await page.waitForFunction(() => window.__ready === true, null, { timeout: +secs * 1000 }); console.log(stamp(), 'READY'); }
catch { console.log(stamp(), 'not ready', await page.evaluate(() => ({ gated: document.body.classList.contains('gated'), play: document.querySelector('.gate__play')?.textContent }))); }
process.exit(0);
