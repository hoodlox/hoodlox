// Scouting: shoots the 8 nearest crates from a raised camera so the intro can use the clearest one.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { newAddress } from '../tools/wallet.mjs';

mkdirSync('video/probe', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=0&noshadow&arena=1&fresh=1&address=${newAddress()}&hero=Knight&name=Probe${Date.now() % 1000}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
await page.addStyleTag({ content: '#hint,.dash{display:none!important}' });
await page.evaluate(() => window.__game.sites.ready);
const sites = await page.evaluate(() => window.__game.sites.sites.filter((x) => x.live).map((x) => ({ i: x.id, x: x.at.x, z: x.at.z })));
// Raise the camera once: drag down = higher pitch.
await page.mouse.move(480, 270); await page.mouse.down(); await page.mouse.move(480, 330, { steps: 4 }); await page.mouse.up();
for (const s of sites) {
  await page.evaluate((s) => window.__player.teleport(s.x + 150, s.z - 380), s);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `video/probe/crate-${s.i}.png` });
}
console.log(JSON.stringify(sites));
await browser.close();
process.exit(0);
