// Renders the UI pictures from portrait.html on a transparent background:
//   public/scenes/adventurers/portraits/<Hero>.png
//   public/scenes/chests/icons/<rarity>-closed.png and <rarity>-open.png
// usage: node tools/render-portraits.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const HEROES = ['Knight', 'Barbarian', 'Rogue', 'Rogue_Hooded', 'Mage', 'Ranger'];
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const jobs = [
  ...HEROES.map((h) => [`public/scenes/adventurers/portraits/${h}.png`, `hero=${h}`]),
  ...RARITIES.flatMap((r) => [
    [`public/scenes/chests/icons/${r}-closed.png`, `chest=${r}&open=0`],
    [`public/scenes/chests/icons/${r}-open.png`, `chest=${r}&open=1`],
  ]),
];
mkdirSync('public/scenes/adventurers/portraits', { recursive: true });
mkdirSync('public/scenes/chests/icons', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const [out, query] of jobs) {
  await page.goto(`http://localhost:5173/portrait.html?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.screenshot({ path: out, omitBackground: true });
  console.log('saved', out);
}
process.exit(0); // closing the SwiftShader browser sometimes hangs
