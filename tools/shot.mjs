// Headless screenshot of the running Vite dev server using installed Chrome.
// usage: node tools/shot.mjs <out.png> [query] [page=/]
import { chromium } from 'playwright';

const [out = 'shots/shot.png', query = '', page_ = '/kit.html'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 600)); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('response', (r) => { if (r.status() >= 400) console.log('http', r.status(), r.url()); });
await page.goto(`http://localhost:5173${page_}?${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
