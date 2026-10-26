// Stills + element boxes for the how-to-play video, from a separate dev server with its own database
// and ETH-only pools (BASE, default :5180): gate → dashboard → valley → dig → found → inventory →
// reveal → rewards → redeem. The live-mode screens (claim) come from stubbed answers, so no real ETH
// moves. Writes video/shots/tut-*.png and video/shots/tut.json (boxes in 1920×1080 shot pixels).
//   node video/tutorial-capture.mjs --probe     shoots nearby crates to video/probe-t/ to pick SITE
//   SITE=<id> node video/tutorial-capture.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { newAddress, apiEnter } from '../tools/wallet.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5180', OUT = 'video/shots';
const VAULT = '0xb6Dca88D7d3ec3B35FF41aA56DbcB9B0F90B56b8';
const probe = process.argv.includes('--probe');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: probe ? { width: 960, height: 540 } : { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const boxes = {};
const box = async (name, sel) => { const b = await page.locator(sel).first().boundingBox(); boxes[name] = b && [b.x, b.y, b.width, b.height].map(Math.round); };
const shot = async (name) => { await page.screenshot({ path: `${OUT}/tut-${name}.png` }); console.log('shot', name); };
const sim = () => page.evaluate(() => window.__simTime);
const simWait = async (s) => { const t0 = await sim(); await page.waitForFunction((t) => window.__simTime >= t, t0 + s, { timeout: 300000 }); };

// Live-mode look without live funds: config says live, balances are payable, redeem answers "sent".
let redeemed = null;
const patch = (me) => {
  me.payable = Object.fromEntries(Object.keys(me.balances ?? {}).map((a) => [a, true]));
  if (redeemed) { me.balances = {}; me.claimed = [redeemed, ...(me.claimed ?? []).filter((c) => c.id !== redeemed.id)]; }
  return me;
};
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/redeem') {
    const { me } = await (await route.fetch({ url: `${BASE}/api/me`, method: 'GET' })).json();
    const usd = me.history.reduce((a, h) => a + (h.usd ?? 0), 0);
    redeemed = { id: 1, items: Object.entries(me.balances).map(([asset, amount]) => ({ asset, amount })), usd, status: 'sent', signature: '0x8479b095111c887d0cad769c688b1a7d5478cfcf41cf5375c5d4a98b68dde8eb', at: new Date().toISOString() };
    return route.fulfill({ json: { payout: { status: 'sent', usd }, me: patch(me) } });
  }
  const res = await route.fetch();
  const j = await res.json().catch(() => null);
  if (!j) return route.fulfill({ response: res });
  if (path === '/api/config') Object.assign(j, { demo: false, vault: VAULT });
  if (j.me) patch(j.me);
  return route.fulfill({ response: res, json: j });
});

await page.goto(`${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=8&fastdig=12&fresh=1${process.env.NOSHADOW ? '&noshadow' : ''}${probe ? `&noshadow&address=${newAddress()}&name=Pr${Date.now() % 1000}` : ''}`, { waitUntil: 'commit' });
await page.addStyleTag({ content: '#hint{display:none!important}' }).catch(() => {});

if (probe) {
  await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
  await page.addStyleTag({ content: '#hint,.dash{display:none!important}' });
  await page.evaluate(() => window.__game.sites.ready);
  const sites = await page.evaluate(() => window.__game.sites.sites.filter((x) => x.live).map((x) => ({ i: x.id, x: x.at.x, z: x.at.z })));
  mkdirSync('video/probe-t', { recursive: true });
  for (const s of sites) {
    await page.evaluate((s) => window.__player.teleport(s.x + 130, s.z - 300), s);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `video/probe-t/crate-${s.i}.png` });
  }
  console.log('probed', sites.length);
  await browser.close(); process.exit(0);
}

// 1–3. Gate: hunter, name, address.
await page.waitForSelector('.gate__addr', { timeout: 300000 });
await page.waitForFunction(() => !document.querySelector('.gate__play').disabled, null, { timeout: 900000 });
await page.click('.hero[data-hero="Ranger"]'); await page.click('.hero[data-hero="Knight"]'); // Knight preselected; toggle so the shot is clean
await page.evaluate(() => { document.querySelector('.gate__card').scrollTop = 0; });
await page.mouse.move(5, 5);
await page.waitForTimeout(600);
await box('mage', '.hero[data-hero="Mage"]');
await shot('gate');
await page.click('.hero[data-hero="Mage"]');
await page.mouse.move(5, 5);
await page.waitForTimeout(600);
await shot('gate-mage');
await page.evaluate(() => { const c = document.querySelector('.gate__card'); c.scrollTop = c.scrollHeight; });
await page.waitForTimeout(400);
for (const [k, s] of [['name', '.gate__name'], ['addr', '.gate__addr'], ['play', '.gate__play']]) await box(k, s);
await shot('form');
const name = `Loxley${Date.now() % 100}`, address = newAddress();
boxes.nameText = name; boxes.addrText = address;
await page.fill('.gate__name', name); await page.fill('.gate__addr', address);
await page.waitForTimeout(400);
await shot('form-filled');
await page.click('.gate__play');

// 4. Dashboard, then into the valley.
await page.waitForSelector('.dash:not([hidden])', { timeout: 120000 }).catch(async (e) => {
  console.log('gate error:', await page.textContent('.gate__err').catch(() => '?'));
  await page.screenshot({ path: `${OUT}/tut-debug.png` });
  throw e;
});
await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
await page.waitForTimeout(1500);
await box('enter', '.dash__enter');
await shot('dash');
await page.click('.dash__enter');
await page.evaluate(() => window.__game.sites.ready);

// 5. A crate in open meadow (SITE, scouted with --probe), approached in three steps.
const site = await page.evaluate((want) => {
  const live = window.__game.sites.sites.filter((x) => x.live && !x.claimedBy);
  const s = live.find((x) => x.id === want) ?? live[0];
  return { i: s.id, x: s.at.x, z: s.at.z, epoch: window.__game.sites.epoch };
}, +(process.env.SITE ?? -1));
console.log('site', site.i);
const rivals = [];
for (const [n, hero, dx, dz] of [['Aria', 'Mage', -520, 300], ['Bram', 'Barbarian', 480, 420]]) {
  const r = await apiEnter(BASE); await r.post('/api/player', { name: `${n}${Date.now() % 100}`, hero });
  r.pos = { x: site.x + dx, z: site.z + dz, ry: 3, anim: 'idle' }; rivals.push(r);
}
const keepAlive = setInterval(() => rivals.forEach((r) => r.post('/api/sync', r.pos).catch(() => {})), 900);
const chestOnScreen = () => page.evaluate((i) => {
  const s = window.__game.sites.sites.find((x) => x.id === i);
  const p = s.at.clone(); p.y -= 20; p.project(window.__camera);
  return [Math.round((p.x + 1) * 960), Math.round((1 - p.y) * 540)];
}, site.i);
for (const [k, dz] of [['walk1', -1300], ['walk2', -800], ['near', -330]]) {
  await page.evaluate(([s, dz]) => window.__player.teleport(s.x + 120, s.z + dz), [site, dz]);
  await page.waitForTimeout(k === 'walk1' ? 6000 : 2500);
  await simWait(0.4);
  boxes[`chest_${k}`] = await chestOnScreen();
  await shot(k);
}

// 6. Within reach: the dig button, then digging.
await page.evaluate((s) => window.__player.teleport(s.x + 60, s.z - 190), site);
await page.waitForSelector('.dig__btn:not([hidden]):not([disabled])', { timeout: 60000 });
await simWait(0.5);
await box('digbtn', '.dig__btn');
boxes.chest_dig = await chestOnScreen();
await shot('digbtn');
await page.keyboard.press('KeyE');
await page.waitForSelector('.dig__bar:not([hidden])', { timeout: 20000 });
await simWait(1.2);
await box('digbar', '.dig__bar');
await shot('digging');

// 7. Found → inventory → open → reveal.
await page.waitForSelector('.found:not([hidden])', { timeout: 900000 });
await simWait(1.2);
await box('foundbag', '.found__bag');
await box('foundcard', '.found .modal__card');
await shot('found');
await page.click('.found__bag');
await page.waitForTimeout(800);
await box('open', '.bag [data-open]');
await box('bagpanel', '.panel.bag');
await shot('bag');
await page.click('.bag [data-open]');
await page.waitForFunction(() => !document.querySelector('.reveal__ok').disabled, null, { timeout: 30000 });
await page.waitForTimeout(900);
await box('revealcard', '.reveal .modal__card');
await box('collect', '.reveal__ok');
await shot('reveal');
await page.click('.reveal__ok');

// 8–9. Dashboard → Rewards → Redeem to wallet.
await page.click('.hud__dashBtn');
await page.waitForTimeout(800);
await box('tabrewards', '.dash__tab[data-tab="rewards"]');
await shot('dash2');
await page.click('.dash__tab[data-tab="rewards"]');
await page.waitForTimeout(1500);
await box('redeem', '.js-redeem');
await box('balances', '.js-balances');
await shot('rewards');
await page.click('.js-redeem');
await page.waitForTimeout(2500);
await box('claimed', '.js-claimed');
await box('redeemnote', '.js-redeemnote');
await shot('redeemed');

clearInterval(keepAlive);
writeFileSync(`${OUT}/tut.json`, JSON.stringify(boxes, null, 1));
console.log(JSON.stringify(boxes));
await browser.close();
process.exit(0);
