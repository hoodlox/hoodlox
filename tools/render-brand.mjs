// Renders the README banner (docs/assets/banner.png, 1600×640) and the link-preview thumbnail
// (public/brand/og.png, 1200×630) from HTML: logo + wordmark + tagline over the valley render.
// Also writes public/favicon.ico (32 px PNG inside an ICO). usage: node tools/render-brand.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const b64 = (f) => readFileSync(f).toString('base64');
const logo = `data:image/png;base64,${b64('public/brand/logo-512.png')}`;
const valley = `data:image/jpeg;base64,${b64('public/landing/valley.jpg')}`;
const chest = `data:image/png;base64,${b64('public/scenes/chests/icons/legendary-open.png')}`;
const chest2 = `data:image/png;base64,${b64('public/scenes/chests/icons/rare-closed.png')}`;

const page = (w, h, compact) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${w}px; height: ${h}px; overflow: hidden; background: #020f2a; font-family: 'JetBrains Mono', monospace; color: #eef2f7; }
  .bg { position: absolute; inset: 0; background: url(${valley}) 62% 80% / cover; }
  .shade { position: absolute; inset: 0; background:
    linear-gradient(90deg, #020f2a 0%, rgba(2,15,42,.94) 34%, rgba(2,15,42,.55) 62%, rgba(2,15,42,.15) 100%),
    linear-gradient(0deg, rgba(2,15,42,.65), transparent 45%); }
  .grid { position: absolute; inset: 0; opacity: .12; background:
    linear-gradient(#7fd3ff 1px, transparent 1px) 0 0 / 64px 64px, linear-gradient(90deg, #7fd3ff 1px, transparent 1px) 0 0 / 64px 64px;
    mask-image: linear-gradient(90deg, #000, transparent 55%); }
  .copy { position: absolute; left: ${compact ? 64 : 88}px; top: 50%; transform: translateY(-50%); width: ${compact ? 640 : 760}px; }
  .row { display: flex; align-items: center; gap: ${compact ? 22 : 28}px; }
  .row img { width: ${compact ? 128 : 150}px; filter: drop-shadow(0 18px 36px rgba(40, 220, 160, .35)); }
  h1 { font: 400 ${compact ? 120 : 140}px/0.9 'Anton', Impact, sans-serif; letter-spacing: .01em;
    background: linear-gradient(90deg, #38bdf8, #4ade80 70%, #a6f25d); -webkit-background-clip: text; color: transparent; }
  p.tag { margin-top: ${compact ? 26 : 30}px; font: 400 ${compact ? 40 : 44}px/1.08 'Anton', Impact, sans-serif; text-transform: uppercase; }
  p.sub { margin-top: 16px; font-size: ${compact ? 19 : 20}px; color: #b9c6d8; line-height: 1.5; }
  .pills { display: flex; gap: 10px; margin-top: 22px; }
  .pills span { padding: 7px 14px; border-radius: 999px; border: 1px solid rgba(166,242,93,.45); background: rgba(2,15,42,.6); color: #a6f25d; font-size: 15px; }
  .chest { position: absolute; filter: drop-shadow(0 24px 40px rgba(0,0,0,.55)); }
</style></head><body>
  <div class="bg"></div><div class="shade"></div><div class="grid"></div>
  <img class="chest" src="${chest}" style="right:${compact ? 70 : 120}px;bottom:${compact ? 40 : 50}px;width:${compact ? 270 : 300}px">
  <img class="chest" src="${chest2}" style="right:${compact ? 300 : 400}px;bottom:${compact ? 30 : 40}px;width:${compact ? 150 : 170}px;transform:rotate(-8deg)">
  <div class="copy">
    <div class="row"><img src="${logo}"><h1>HOODLOX</h1></div>
    <p class="tag">Dig. Open. Earn.</p>
    <p class="sub">One shared 3D valley on Robinhood Chain. Crates are buried every 2 hours. Dig them up, open them for ETH, $HOODL and stock tokens.</p>
    <div class="pills"><span>hoodlox.fun</span><span>EVM 4663</span><span>Season 0</span></div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
async function shot(w, h, compact, out) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(page(w, h, compact), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out });
  await p.close();
  console.log('saved', out);
}
mkdirSync('docs/assets', { recursive: true });
await shot(1600, 640, false, 'docs/assets/banner.png');
await shot(1200, 630, true, 'public/brand/og.png');

// favicon.ico = a single 32×32 PNG wrapped in an ICO header (supported by every browser).
const png = readFileSync('public/brand/logo-32.png');
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([ico, png]));
console.log('saved public/favicon.ico');
process.exit(0);
