// Game shell against the real API: the gate blocks until a hunter is picked and named (an empty or
// taken name is refused), the lobby dashboard opens with every section, guests cannot dig or
// redeem, the HUD panels render server data, and a reload with the saved session skips the gate.
// Screenshots: shots/gate-*.png, shots/dash-*.png, shots/game-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const tag = Date.now().toString(36).slice(-5);
const URL = 'http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=4&noshadow';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // one context: the session survives reloads
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(URL + '&fresh=1', { waitUntil: 'commit' });
await page.waitForSelector('.gate', { timeout: 300000 });
await page.waitForFunction(() => !document.querySelector('.gate__play').disabled, null, { timeout: 600000 });
assert.equal(await page.evaluate(() => window.__ready), undefined, 'map must not report ready while the gate is up');
assert.equal(await page.$('.gate__connect'), null, 'no wallet connection anywhere');

// Holders type an address; a malformed one is refused before any request.
await page.fill('.gate__addr', '0x12345');
await page.click('.gate__play');
assert.ok(await page.$('.gate__addr.is-bad'), 'a bad address should be flagged');
assert.match(await page.textContent('.gate__err'), /wallet address/);

await page.click('.hero[data-hero="Mage"]');
await page.click('.gate__guest'); // empty name is refused
await page.waitForSelector('.gate__name.is-bad');
await page.fill('.gate__name', `Gst${tag}`);
await page.screenshot({ path: 'shots/gate-agent.png' });
await page.click('.gate__guest');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
assert.equal(await page.$('.gate'), null, 'gate should be gone after Play');
assert.equal(await page.textContent('.hud__meName'), `Gst${tag}`);

// Lobby dashboard first.
await page.waitForSelector('.dash:not([hidden])');
assert.equal(await page.textContent('.ov__name'), `Gst${tag}`);
await page.waitForFunction(() => /Epoch #\d+ · ends in \d+h/.test(document.querySelector('.dash__epoch').textContent), null, { timeout: 20000 });
await page.screenshot({ path: 'shots/dash-overview.png' });
for (const tab of ['rewards', 'pool', 'leaderboard', 'inventory', 'shop']) {
  await page.click(`.dash__tab[data-tab="${tab}"]`);
  assert.ok(await page.isVisible(`.dash__sec[data-sec="${tab}"]`), `${tab} section should show`);
  await page.screenshot({ path: `shots/dash-${tab}.png` });
  if (tab === 'rewards') assert.ok(await page.isDisabled('.js-redeem'), 'guests cannot redeem');
  if (tab === 'pool') assert.equal(await page.locator('.js-legend li').count(), 3, 'pool shows SOL, HOODL and xStocks');
  if (tab === 'shop') assert.ok(await page.isDisabled('.js-shop [data-buy="pickaxe"]'), 'guests cannot buy');
}
await page.keyboard.press('KeyW'); // keys belong to the dashboard, the hero must not walk
await page.click('.dash__enter');
assert.ok(await page.isHidden('.dash'), 'Enter arena closes the dashboard');
await page.click('.hud__dashBtn');
assert.ok(await page.isVisible('.dash'), 'HUD button reopens it');
await page.keyboard.press('KeyH');
assert.ok(await page.isHidden('.dash'), 'H toggles it closed');

// A guest standing on a crate is told to connect a wallet.
await page.evaluate(() => window.__game.sites.ready);
await page.evaluate(() => { const s = window.__game.sites.sites.find((x) => x.live); window.__player.teleport(s.at.x + 80, s.at.z + 80); });
await page.waitForFunction(() => !document.querySelector('.dig__btn').hidden, null, { timeout: 20000 });
assert.equal(await page.textContent('.dig__btn'), 'Enter a wallet address to dig');
assert.ok(await page.isDisabled('.dig__btn'));

await page.click('.hud__boardBtn');
await page.screenshot({ path: 'shots/game-board.png' });
await page.click('.hud__meBtn');
assert.ok(await page.isHidden('.board'), 'opening stats closes the leaderboard');
assert.equal(await page.textContent('.me__hero'), 'Arcane · Mage');
assert.equal(await page.textContent('.me__rank'), 'Guest');
await page.screenshot({ path: 'shots/game-stats.png' });

// Returning visitor: the saved session walks straight in.
await page.goto(URL + '&arena=1', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
assert.equal(await page.textContent('.hud__meName'), `Gst${tag}`, 'saved session should be reused');
console.log('game ok');
process.exit(0);
