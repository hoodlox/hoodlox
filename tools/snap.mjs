// Screenshot portrait.html for each query given and echo its console. Exits hard because closing the
// SwiftShader browser sometimes hangs. usage: node tools/snap.mjs out.png "chest=rare&open=0" [out2.png "..."]
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on('console', (m) => console.log(m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (let i = 0; i < args.length; i += 2) {
  await page.goto(`http://localhost:5173/portrait.html?${args[i + 1]}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.screenshot({ path: args[i], omitBackground: true });
  console.log('saved', args[i]);
}
process.exit(0);
