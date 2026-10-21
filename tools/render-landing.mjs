// Renders the landing page's world pictures from the live map (no player, no UI) into public/landing/.
// usage: node tools/render-landing.mjs   (dev server must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&noplayer&animals=40';
const SHOTS = [
  ['valley', '-6000,9000,20000,3000,-1500,-1000', 1920, 1080],
];
mkdirSync('public/landing', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
for (const [name, cam, w, h] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`${BASE}&cam=${cam}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  await page.addStyleTag({ content: '#info, #ctl, #dig { display: none !important; }' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `public/landing/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('saved', name);
  await page.close();
}
process.exit(0);
