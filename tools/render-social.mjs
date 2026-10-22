// Social banners with the hunters: X header (1500×500, bottom-left kept clear for the avatar),
// DexScreener header (1500×500, content centred) and a DexScreener icon (500×500).
// Heroes are rendered fresh at 1024 px from portrait.html (dev server must be running).
// Output: docs/assets/social/. usage: node tools/render-social.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'docs/assets/social';
const HEROES = ['Rogue_Hooded', 'Ranger', 'Mage', 'Knight', 'Barbarian', 'Rogue'];
const COLORS = { Rogue_Hooded: '#7d8590', Ranger: '#52b04a', Mage: '#7c5cff', Knight: '#f06a54', Barbarian: '#f08a2c', Rogue: '#3a8df2' };
mkdirSync(`${OUT}/heroes`, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

// 1. Big transparent hero renders.
{
  const p = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  for (const h of HEROES) {
    const file = `${OUT}/heroes/${h}.png`;
    if (existsSync(file)) continue;
    await p.goto(`http://localhost:5173/portrait.html?hero=${h}&size=1024`);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await p.screenshot({ path: file, omitBackground: true });
    console.log('hero', h);
  }
  await p.close();
}

const img = (f, type = 'png') => `data:image/${type};base64,${readFileSync(f).toString('base64')}`;
const hero = Object.fromEntries(HEROES.map((h) => [h, img(`${OUT}/heroes/${h}.png`)]));
const logo = img('public/brand/logo-512.png');
const valley = img('public/landing/valley.jpg', 'jpeg');
const chestOpen = img('public/scenes/chests/icons/legendary-open.png');
const chestEpic = img('public/scenes/chests/icons/epic-closed.png');
const chestRare = img('public/scenes/chests/icons/rare-closed.png');

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">';
const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body { overflow: hidden; background: #020f2a; font-family: 'JetBrains Mono', monospace; color: #eef2f7; position: relative; }
  .bg { position: absolute; inset: 0; background: url(${valley}) 50% 85% / cover; filter: saturate(1.15); }
  .night { position: absolute; inset: 0; background:
    radial-gradient(60% 90% at 50% 120%, rgba(74,222,128,.35), transparent 60%),
    linear-gradient(180deg, rgba(2,15,42,.25) 0%, rgba(2,15,42,.55) 55%, rgba(2,15,42,.92) 100%); }
  .rays { position: absolute; inset: -20%; background: repeating-conic-gradient(from 0deg at 50% 110%, rgba(166,242,93,.10) 0 6deg, transparent 6deg 14deg);
    mask-image: radial-gradient(closest-side at 50% 100%, #000, transparent); }
  .mote { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #ffe39a; box-shadow: 0 0 12px 4px rgba(255,214,120,.65); }
  .h { position: absolute; bottom: 0; filter: drop-shadow(0 18px 24px rgba(0,0,0,.55)); }
  .glow { position: absolute; border-radius: 50%; filter: blur(36px); opacity: .55; }
  .chest { position: absolute; filter: drop-shadow(0 18px 30px rgba(0,0,0,.6)); }
  h1 { font: 400 1px/0.86 'Anton', Impact, sans-serif; letter-spacing: .01em;
    background: linear-gradient(90deg, #38bdf8, #4ade80 65%, #a6f25d); -webkit-background-clip: text; color: transparent;
    filter: drop-shadow(0 6px 18px rgba(2,15,42,.8)); }
  .tag { font: 400 1px/1 'Anton', Impact, sans-serif; text-transform: uppercase; color: #fff; text-shadow: 0 4px 16px rgba(2,15,42,.9); }
  .pill { display: inline-block; padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(166,242,93,.6); background: rgba(2,15,42,.75); color: #a6f25d; font-size: 15px; font-weight: 700; }
`;
const motes = (n, w, h, seed) => {
  let s = seed;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: n }, () => `<i class="mote" style="left:${(r() * w) | 0}px;top:${(r() * h) | 0}px;opacity:${(0.35 + r() * 0.6).toFixed(2)};transform:scale(${(0.5 + r()).toFixed(2)})"></i>`).join('');
};
// A row of heroes, middle ones bigger and in front.
const crowd = (order, xs, sizes, bottom = -14) => order.map((h, i) => `
  <i class="glow" style="left:${xs[i] + sizes[i] * 0.2}px;bottom:${bottom + sizes[i] * 0.15}px;width:${sizes[i] * 0.6}px;height:${sizes[i] * 0.45}px;background:${COLORS[h]}"></i>
  <img class="h" src="${hero[h]}" style="left:${xs[i]}px;bottom:${bottom}px;width:${sizes[i]}px;z-index:${10 - Math.abs(i - (order.length - 1) / 2) * 2 | 0}">`).join('');

// X header: avatar sits over the bottom-left (~400×200 at 1500×500), so text goes right, heroes centre-right.
const xHeader = `<!doctype html><html><head>${FONTS}<style>${BASE}
  body { width: 1500px; height: 500px; }
  h1 { font-size: 150px; }
  .tag { font-size: 44px; margin-top: 10px; }
</style></head><body>
  <div class="bg"></div><div class="night"></div><div class="rays"></div>${motes(40, 1500, 500, 7)}
  <div style="position:absolute;inset:0;background:linear-gradient(270deg, rgba(2,15,42,.92) 0%, rgba(2,15,42,.7) 30%, transparent 52%)"></div>
  ${crowd(['Ranger', 'Mage', 'Knight', 'Barbarian'], [360, 480, 610, 745], [290, 350, 370, 320])}
  <img class="chest" src="${chestOpen}" style="left:525px;bottom:-26px;width:250px;z-index:20">
  <img class="chest" src="${chestRare}" style="left:330px;bottom:-14px;width:115px;z-index:20;transform:rotate(-10deg)">
  <div style="position:absolute;right:56px;top:58px;text-align:right;z-index:30">
    <div style="display:flex;align-items:center;justify-content:flex-end;gap:18px"><img src="${logo}" style="width:118px;filter:drop-shadow(0 12px 30px rgba(40,220,160,.45))"><h1>HOODLOX</h1></div>
    <p class="tag">Dig. Open. Earn.</p>
    <p style="margin-top:16px;font-size:18px;color:#cfd8e6;line-height:1.45">A shared 3D treasure valley on Robinhood Chain.<br>New crates every 2 hours. ETH · $HOODL · stock tokens.</p>
    <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end"><span class="pill">hoodlox.fun</span><span class="pill">play now</span></div>
  </div>
</body></html>`;

// DexScreener header: 3:1, may be cropped at the sides, so the story sits in the middle.
const dexHeader = `<!doctype html><html><head>${FONTS}<style>${BASE}
  body { width: 1500px; height: 500px; }
  h1 { font-size: 132px; }
  .tag { font-size: 38px; margin-top: 8px; }
</style></head><body>
  <div class="bg" style="background-position:50% 75%"></div><div class="night"></div><div class="rays"></div>${motes(46, 1500, 500, 21)}
  ${crowd(['Rogue_Hooded', 'Ranger', 'Mage'], [120, 250, 380], [300, 340, 380])}
  ${crowd(['Knight', 'Barbarian', 'Rogue'], [740, 880, 1040], [380, 340, 300])}
  <img class="chest" src="${chestOpen}" style="left:575px;bottom:-30px;width:350px;z-index:20">
  <img class="chest" src="${chestEpic}" style="left:60px;bottom:-12px;width:150px;z-index:20;transform:rotate(-8deg)">
  <img class="chest" src="${chestRare}" style="right:60px;bottom:-12px;width:150px;z-index:20;transform:rotate(8deg)">
  <div style="position:absolute;left:0;right:0;top:34px;text-align:center;z-index:30">
    <div style="display:inline-flex;align-items:center;gap:16px"><img src="${logo}" style="width:104px;filter:drop-shadow(0 12px 30px rgba(40,220,160,.45))"><h1>HOODLOX</h1></div>
    <p class="tag">Dig crates · Open chests · Earn on Robinhood Chain</p>
  </div>
</body></html>`;

// DexScreener icon: the logo on the brand navy with a soft glow.
const dexIcon = `<!doctype html><html><head><style>
  body { margin: 0; width: 500px; height: 500px; display: grid; place-items: center;
    background: radial-gradient(70% 70% at 50% 45%, #0d3b4f 0%, #031634 60%, #020f2a 100%); }
  img { width: 380px; filter: drop-shadow(0 18px 40px rgba(40,220,160,.45)); }
</style></head><body><img src="${logo}"></body></html>`;

for (const [name, html, w, h] of [['x-header', xHeader, 1500, 500], ['dexscreener-header', dexHeader, 1500, 500], ['dexscreener-icon', dexIcon, 500, 500]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', `${OUT}/${name}.png`);
  await p.close();
}
process.exit(0);
