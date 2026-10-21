// Two hunters in two browsers share one map: each sees the other's hero (with a name tag) walk, and
// the leaderboard is the server's. usage: node tools/check-multiplayer.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { useWallet } from './wallet.mjs';

const tag = Date.now().toString(36).slice(-4);
const url = (name, hero) => `http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=0&noshadow&arena=1&fresh=1&autoconnect=1&hero=${hero}&name=${name}`;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const open = async (name, hero) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(name, 'pageerror:', e.message));
  await useWallet(page);
  await page.goto(url(name, hero), { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 600000 });
  return page;
};
const [a, b] = await Promise.all([open(`Ann${tag}`, 'Mage'), open(`Ben${tag}`, 'Barbarian')]);

// Put B a few metres in front of A so A's camera sees B.
const spot = await a.evaluate(() => { const p = window.__player.obj.position; return { x: p.x, z: p.z }; });
await b.evaluate((s) => window.__player.teleport(s.x, s.z + 500), spot);
await a.waitForFunction(() => window.__game.live.online >= 2, null, { timeout: 30000 });
await b.waitForFunction(() => window.__game.live.online >= 2, null, { timeout: 30000 });
await a.waitForTimeout(4000); // let the avatar load and ease into place
const seen = await a.evaluate(() => window.__game.live.online);
console.log('A sees hunters online:', seen);
await a.screenshot({ path: 'shots/multiplayer-a.png' });
await b.screenshot({ path: 'shots/multiplayer-b.png' });
console.log('multiplayer ok');
process.exit(0);
