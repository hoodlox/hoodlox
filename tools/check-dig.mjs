// The treasure loop in the browser against the real API (demo mode, dev server on 5173):
// sign in with a wallet → stand on a crate → a rival holding it blocks the dig → dig with E → the
// server reveals the chest → buy the pickaxe (0.1% of supply) → open the chest → the reward shows in
// the dashboard. Digs run 60× faster (?fastdig=60). Screenshots: shots/dig-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { newAddress, apiEnter } from './wallet.mjs';

const BASE = 'http://localhost:5173';
const name = `Dig${Date.now().toString(36).slice(-5)}`;
const URL = `${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=4&noshadow&arena=1&fastdig=60&fresh=1&address=${newAddress()}&hero=Knight&name=${name}`;
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const sim = () => page.evaluate(() => window.__simTime);
const simWait = async (s) => { const t0 = await sim(); await page.waitForFunction((t) => window.__simTime >= t, t0 + s, { timeout: 180000 }); };
const me = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.live.me)));

await page.goto(URL, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 600000 });
const start = await me();
assert.equal(start.name, name);
assert.deepEqual([start.tools, start.equipped, start.chests.length, start.demo], [['shovel'], 'shovel', 0, true]);

// Walk onto the nearest live crate.
await page.evaluate(() => window.__game.sites.ready);
const site = await page.evaluate(() => {
  const p = window.__player.obj.position;
  const s = window.__game.sites.sites.filter((x) => x.live && !x.claimedBy).sort((a, b) => Math.hypot(a.at.x - p.x, a.at.z - p.z) - Math.hypot(b.at.x - p.x, b.at.z - p.z))[0];
  window.__player.teleport(s.at.x + 80, s.at.z + 80);
  return { i: s.id, x: s.at.x, z: s.at.z, epoch: window.__game.sites.epoch };
});
await simWait(0.5);
assert.ok(await page.isVisible('.dig__btn'), 'Dig button should show on a crate');
await page.screenshot({ path: 'shots/dig-site.png' });

// A rival (second wallet, over the API) claims it first: we are locked out until they let go.
const rival = await apiEnter(BASE);
await rival.post('/api/player', { name: `${name}R`, hero: 'Rogue' });
await rival.post('/api/sync', { x: site.x, z: site.z });
const claim = await rival.post('/api/dig/start', { epoch: site.epoch, i: site.i });
assert.ok(claim.seconds, claim.error);
await page.waitForFunction((n) => document.querySelector('.dig__btn').textContent.includes(n), `${name}R`, { timeout: 20000 });
assert.ok(await page.isDisabled('.dig__btn'), 'a crate someone is digging cannot be dug');
console.log('claimed:', await page.textContent('.dig__btn'));
await rival.post('/api/dig/cancel', { epoch: site.epoch, i: site.i });
await page.waitForFunction(() => !document.querySelector('.dig__btn').disabled, null, { timeout: 20000 });

await page.keyboard.press('KeyE');
await page.waitForSelector('.dig__bar:not([hidden])', { timeout: 20000 });
console.log('digging:', await page.textContent('.dig__label'));
await page.screenshot({ path: 'shots/dig-progress.png' });
assert.ok((await rival.post('/api/dig/start', { epoch: site.epoch, i: site.i })).error, 'others cannot claim a crate I am digging');
await page.waitForSelector('.found:not([hidden])', { timeout: 120000 });
await simWait(1.5);
await page.screenshot({ path: 'shots/dig-found.png' });
const afterDig = await me();
console.log('found:', afterDig.chests[0].rarity);
assert.deepEqual([afterDig.chests.length, afterDig.treasures], [1, 1]);
await page.click('.found__ok');

// Shop: buy the pickaxe (demo mode: 0.1% of supply off the demo balance).
await page.click('.hud__shopBtn');
await page.click('[data-buy="pickaxe"]');
await page.waitForFunction(() => window.__game.live.me.equipped === 'pickaxe', null, { timeout: 20000 });
const afterBuy = await me();
console.log('balance', start.tokens, '->', afterBuy.tokens);
assert.equal(start.tokens - afterBuy.tokens, 1_000_000);
await page.screenshot({ path: 'shots/dig-shop.png' });

// Inventory: open the chest; the server pays out of the epoch pool.
await page.click('.hud__bagBtn');
await page.screenshot({ path: 'shots/dig-bag.png' });
await page.click(`[data-open="${afterDig.chests[0].id}"]`);
await page.waitForFunction(() => !document.querySelector('.reveal__ok').disabled, null, { timeout: 20000 });
await page.screenshot({ path: 'shots/dig-reveal.png' });
console.log('reward:', await page.textContent('.reveal__title'), await page.textContent('.reveal__usd'));
const afterOpen = await me();
assert.equal(afterOpen.chests.length, 0);
assert.ok(afterOpen.profit > 0 && Object.values(afterOpen.balances).some((n) => n > 0));
await page.click('.reveal__ok');

// Dashboard: rewards list the balance; redeem waits for a vault in demo mode.
await page.click('.hud__dashBtn');
await page.click('.dash__tab[data-tab="rewards"]');
assert.ok(!(await page.textContent('.js-balances')).includes('Nothing'));
await page.screenshot({ path: 'shots/dash-rewards-filled.png' });
assert.match(await page.textContent('.dash .js-xp'), /^1 \/ 5 chests/);
console.log('dig ok');
process.exit(0);
