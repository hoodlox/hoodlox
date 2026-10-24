// Stills for the intro video, 1920×1080, from the running dev server (npm run dev). A wallet hunter and
// three API hunters gather around one crate so the shots show a busy valley; then dig → found → shop
// → bag → reveal → dashboard. Output: video/shots/*.png. usage: node video/capture.mjs [only,names]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { newAddress, apiEnter } from '../tools/wallet.mjs';

const BASE = 'http://localhost:5173', OUT = 'video/shots';
const only = process.argv[2]?.split(',');
const want = (n) => !only || only.includes(n);
mkdirSync(OUT, { recursive: true });
const tag = String(Date.now() % 97).padStart(2, '0');
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const VIEW = { width: 1920, height: 1080 };
const HIDE = '#hint{display:none!important}';
const shot = async (page, name) => { if (want(name)) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); } };
const sim = (page) => page.evaluate(() => window.__simTime);
const simWait = async (page, s) => { const t0 = await sim(page); await page.waitForFunction((t) => window.__simTime >= t, t0 + s, { timeout: 180000 }); };

// Landing + docs.
if (want('landing') || want('docs')) {
  const p = await browser.newPage({ viewport: VIEW });
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); await shot(p, 'landing');
  await p.goto(`${BASE}/docs`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500); await shot(p, 'docs');
  await p.close();
}

// Gate: the hero picker, then the same card filled in (name + wallet address), scrolled to the form.
if (want('gate-heroes') || want('gate-form')) {
  const p = await browser.newPage({ viewport: VIEW });
  await p.goto(`${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=6&fresh=1`, { waitUntil: 'commit' });
  await p.addStyleTag({ content: HIDE }).catch(() => {});
  await p.waitForSelector('.gate__addr', { timeout: 300000 });
  await p.waitForFunction(() => !document.querySelector('.gate__play').disabled, null, { timeout: 600000 });
  await p.click('.hero[data-hero="Knight"]');
  await p.waitForTimeout(800);
  await shot(p, 'gate-heroes');
  await p.fill('.gate__name', 'Loxley');
  await p.fill('.gate__addr', '0x8f3C9a2E41b7D05c6A19e2F4b38D7c0A5e61B2d9');
  await p.evaluate(() => { const c = document.querySelector('.gate__card'); c.scrollTop = c.scrollHeight; });
  await p.waitForTimeout(800);
  await shot(p, 'gate-form');
  await p.close();
}

// The arena.
const page = await browser.newPage({ viewport: VIEW });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const name = `Loxley${tag}`;
await page.goto(`${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=10&arena=1&fastdig=20&fresh=1&address=${newAddress()}&hero=Knight&name=${name}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
await page.addStyleTag({ content: HIDE });
await page.evaluate(() => window.__game.sites.ready);
await simWait(page, 1);

// Gather everyone a few metres from one crate in open meadow (scouted with video/probe.mjs).
const site = await page.evaluate((want) => {
  const live = window.__game.sites.sites.filter((x) => x.live && !x.claimedBy);
  const s = live.find((x) => x.id === want) ?? live[0];
  return { i: s.id, x: s.at.x, z: s.at.z, epoch: window.__game.sites.epoch };
}, +(process.env.SITE ?? 14));
console.log('site', site.i);
const rivals = [];
for (const [n, hero, dx, dz, ry] of [['Aria', 'Mage', -420, 250, 2.2], ['Bram', 'Barbarian', 380, 320, -2.4], ['Kaito', 'Ranger', 120, 650, 3.1]]) {
  const r = await apiEnter(BASE);
  const res = await r.post('/api/player', { name: `${n}${tag}`, hero });
  if (res.error) console.log(n, res.error);
  r.pos = { x: site.x + dx, z: site.z + dz, ry, anim: 'idle' };
  rivals.push(r);
}
const keepAlive = setInterval(() => rivals.forEach((r) => r.post('/api/sync', r.pos).catch(() => {})), 900);
rivals.forEach((r) => r.post('/api/sync', r.pos));

// Stand back from the crate, facing it (the camera sits behind the hunter at yaw 0, looking +z).
await page.evaluate((s) => window.__player.teleport(s.x - 60, s.z - 520), site);
await page.waitForFunction(() => window.__game.live.online >= 4, null, { timeout: 60000 }).catch(() => console.log('rivals not all online'));
await page.waitForTimeout(5000);
await page.mouse.move(960, 540); await page.mouse.down(); await page.mouse.move(960, 570, { steps: 4 }); await page.mouse.up(); // a little higher
await simWait(page, 1);
await shot(page, 'world-crowd');

// Orbit for a wider look: drag on the canvas.
const drag = async (dx, dy = 0) => {
  await page.mouse.move(960, 540); await page.mouse.down();
  await page.mouse.move(960 + dx, 540 + dy, { steps: 6 }); await page.mouse.up();
  await simWait(page, 0.3);
};
await drag(0, 60); await shot(page, 'world-high');
await drag(500, -60); await shot(page, 'world-side');
await drag(-500, 0);

// First person.
await page.keyboard.press('KeyV'); await simWait(page, 0.4); await shot(page, 'world-fp');
await page.keyboard.press('KeyV'); await simWait(page, 0.4);

// Walk up to the crate and dig.
await page.evaluate((s) => window.__player.teleport(s.x + 130, s.z - 300), site);
await simWait(page, 0.6);
await shot(page, 'crate');
await page.evaluate((s) => window.__player.teleport(s.x + 60, s.z - 190), site); // within reach (2.6 m)
await page.waitForSelector('.dig__btn:not([hidden]):not([disabled])', { timeout: 60000 });
await page.keyboard.press('KeyE');
await page.waitForSelector('.dig__bar:not([hidden])', { timeout: 20000 });
await simWait(page, 1);
await shot(page, 'dig');
await page.waitForSelector('.found:not([hidden])', { timeout: 900000 });
await simWait(page, 1.5);
await shot(page, 'found');
await page.click('.found__ok');

// The others dig too (at normal speed: API calls carry no fastdig header), so the leaderboard has rivals.
const rivalDigs = [];
for (const r of rivals) {
  const c = (await page.evaluate(() => window.__game.sites.sites.filter((x) => x.live && !x.claimedBy).map((x) => ({ i: x.id, x: x.at.x, z: x.at.z }))))[rivals.indexOf(r) + 1];
  if (!c) continue;
  await r.post('/api/sync', { x: c.x, z: c.z });
  const st = await r.post('/api/dig/start', { epoch: site.epoch, i: c.i });
  if (st.error) { console.log('rival dig', st.error); continue; }
  rivalDigs.push(new Promise((ok) => setTimeout(async () => {
    const f = await r.post('/api/dig/finish', { epoch: site.epoch, i: c.i });
    if (f.chest) console.log('rival', (await r.post('/api/chest/open', { id: f.chest.id })).reward?.usd ?? f.chest.rarity);
    else console.log('rival finish', f.error);
    ok();
  }, st.seconds * 1000 + 500)));
}

await page.click('.hud__shopBtn'); await page.waitForTimeout(600); await shot(page, 'shop');
await page.click('[data-buy="pickaxe"]');
await page.waitForFunction(() => window.__game.live.me.equipped === 'pickaxe', null, { timeout: 20000 });
await page.waitForTimeout(600); await shot(page, 'shop-bought');
await page.click('.hud__bagBtn'); await page.waitForTimeout(600); await shot(page, 'bag');
const chest = await page.evaluate(() => window.__game.live.me.chests[0].id);
await page.click(`[data-open="${chest}"]`);
await page.waitForFunction(() => !document.querySelector('.reveal__ok').disabled, null, { timeout: 20000 });
await page.waitForTimeout(800); await shot(page, 'reveal');
await page.click('.reveal__ok');

await Promise.all(rivalDigs);
await page.waitForTimeout(2500);
await page.click('.hud__boardBtn'); await page.waitForTimeout(1500); await shot(page, 'board');
await page.click('.hud__meBtn'); await page.waitForTimeout(800); await shot(page, 'stats');
await page.click('.hud__meBtn').catch(() => {});

await page.click('.hud__dashBtn'); await page.waitForTimeout(1000); await shot(page, 'dash-overview');
for (const tab of ['rewards', 'pool', 'leaderboard', 'inventory', 'shop']) {
  await page.click(`.dash__tab[data-tab="${tab}"]`); await page.waitForTimeout(1200); await shot(page, `dash-${tab}`);
}
// Phone view (guest, touch controls) at the same crate.
if (want('phone')) {
  const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ph.goto(`${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=4&guest=1&arena=1&touch=1&name=Pip${tag}&hero=Ranger`, { waitUntil: 'commit' });
  await ph.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
  await ph.addStyleTag({ content: HIDE });
  await ph.evaluate((s) => window.__player.teleport(s.x - 200, s.z - 650), site);
  await ph.waitForTimeout(5000);
  await shot(ph, 'phone');
}
clearInterval(keepAlive);
await browser.close();
console.log('capture done');
process.exit(0);
