// Screens for the update posts, from a separate dev server (BASE, default :5180, ETH + USDG pools):
// treasure sense + live finds, the reveal with "Share on X", the payout address card, the 5-minute
// warning and the new-epoch toast (short epochs via ?epochsec). Writes video/shots/upd-*.png.
import { chromium } from 'playwright';
import { newAddress, apiEnter } from '../tools/wallet.mjs';

// EPOCH under 300 s shows the 5-minute warning at once; STEP=newepoch with EPOCH=400 waits for a clean
// rollover toast instead (the warning only starts 100 s into such an epoch).
const BASE = process.env.BASE ?? 'http://localhost:5180', OUT = 'video/shots', EPOCH = +(process.env.EPOCH ?? 280);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shot = async (page, n) => { await page.screenshot({ path: `${OUT}/upd-${n}.png`, timeout: 180000 }); console.log('shot', n); };
const tag = Date.now() % 100;

// Named hunters dig and open a few chests over the API so the finds feed has real entries.
const H = { 'x-fastdig': '60', 'x-epochsec': String(EPOCH), 'content-type': 'application/json' };
const call = async (path, body, token) => (await fetch(BASE + path, { method: body ? 'POST' : 'GET', body: body && JSON.stringify(body), headers: { ...H, ...(token ? { authorization: `Bearer ${token}` } : {}) } })).json();
async function seedFinds() {
  const ep = await call('/api/epoch');
  let k = 0;
  for (const [n, hero] of [['Mira', 'Ranger'], ['Kaito', 'Rogue'], ['Bram', 'Barbarian'], ['Aria', 'Mage']]) {
    const r = await apiEnter(BASE); await r.post('/api/player', { name: `${n}${tag}`, hero });
    const sync = await call('/api/sync', { x: 0, z: 0 }, r.token);
    const c = ep.crates.filter((x) => !sync.dug.includes(x.i) && !sync.claims[x.i])[k++ + 3];
    await call('/api/sync', { x: c.x, z: c.z }, r.token);
    const st = await call('/api/dig/start', { epoch: ep.epoch, i: c.i }, r.token);
    await new Promise((ok) => setTimeout(ok, (st.seconds ?? 1) * 1000 + 400));
    const f = await call('/api/dig/finish', { epoch: ep.epoch, i: c.i }, r.token);
    if (f.chest) console.log(n, (await call('/api/chest/open', { id: f.chest.id }, r.token)).reward);
  }
}

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${BASE}/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=6&arena=1&fastdig=60&epochsec=${EPOCH}&fresh=1&address=${newAddress()}&hero=Knight&name=Loxley${tag}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ready === true && window.__game, null, { timeout: 900000 });
await page.addStyleTag({ content: '#hint{display:none!important}' });
await page.evaluate(() => window.__game.sites.ready);
if (process.env.STEP === 'newepoch') {
  await page.waitForFunction(() => /New epoch/.test(document.querySelector('.toast')?.textContent ?? '') && !document.querySelector('.toast').hidden, null, { timeout: (2 * EPOCH + 30) * 1000 });
  await page.waitForTimeout(600);
  await shot(page, 'newepoch');
  await browser.close(); process.exit(0);
}
await page.waitForTimeout(3000); // the 5-minute toast fires first (epochs here are shorter than 5 minutes)
await shot(page, 'ending');

await seedFinds();
// Nearest crate, approached: warm → hot → burning.
const site = await page.evaluate(() => { const s = window.__game.sites.sites.find((x) => x.live && !x.claimedBy); return { x: s.at.x, z: s.at.z }; });
for (const [lvl, dz] of [['warm', -3200], ['hot', -1400], ['burning', -330]]) {
  await page.evaluate(([s, dz]) => window.__player.teleport(s.x + 120, s.z + dz), [site, dz]);
  await page.waitForTimeout(12000); // finds poll every 10 s
  await shot(page, `sense-${lvl}`);
}

// Dig, open, and the reveal with its share button.
await page.evaluate((s) => window.__player.teleport(s.x + 60, s.z - 190), site);
await page.waitForSelector('.dig__btn:not([hidden]):not([disabled])', { timeout: 60000 });
await page.keyboard.press('KeyE');
await page.waitForSelector('.found:not([hidden])', { timeout: 300000 });
await page.click('.found__bag');
await page.click('.bag [data-open]');
await page.waitForSelector('.reveal__share:not([hidden])', { timeout: 30000 });
await page.waitForTimeout(800);
console.log('share link:', decodeURIComponent(await page.getAttribute('.reveal__share', 'href')));
await shot(page, 'share');
await page.click('.reveal__ok');

// Payout address in Rewards.
await page.click('.hud__dashBtn');
await page.click('.dash__tab[data-tab="rewards"]');
await page.waitForTimeout(1500);
await shot(page, 'payto');
await page.click('.dash__enter');

// Wait for the epoch to roll over: the new-epoch toast.
await page.waitForFunction(() => /New epoch/.test(document.querySelector('.toast')?.textContent ?? '') && !document.querySelector('.toast').hidden, null, { timeout: (EPOCH + 30) * 1000 });
await page.waitForTimeout(600);
await shot(page, 'newepoch');
await browser.close();
process.exit(0);
