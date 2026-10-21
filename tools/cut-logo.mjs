// Cuts the Hoodlox logo out of its flat navy background: alpha grows with each pixel's distance from
// the background colour (soft edge), edge colours are un-mixed from the navy, then the mark is cropped
// tight and saved as public/brand/logo.png (1024) plus favicon sizes.
// usage: node tools/cut-logo.mjs <source image>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = process.argv[2];
const data = `data:image/jpeg;base64,${readFileSync(src).toString('base64')}`;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
const out = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  // Background = median of the four corner patches.
  const samples = [];
  for (const [x0, y0] of [[0, 0], [c.width - 40, 0], [0, c.height - 40], [c.width - 40, c.height - 40]]) {
    for (let y = y0; y < y0 + 40; y += 4) for (let x = x0; x < x0 + 40; x += 4) { const i = (y * c.width + x) * 4; samples.push([px[i], px[i + 1], px[i + 2]]); }
  }
  const bg = [0, 1, 2].map((k) => samples.map((s) => s[k]).sort((a, b) => a - b)[samples.length >> 1]);
  // Colour distance from the navy: the fill only crosses pixels under HI, and alpha ramps LO→HI there.
  // A low HI keeps the logo's own dark navy shading (bottom of the legs) from leaking out.
  const LO = 9, HI = 30;
  const W = c.width, N = W * c.height;
  const dist = new Float32Array(N);
  for (let p = 0; p < N; p++) { const i = p * 4; dist[p] = Math.max(Math.abs(px[i] - bg[0]), Math.abs(px[i + 1] - bg[1]), Math.abs(px[i + 2] - bg[2])); }
  // Only background connected to the image border is removed (flood fill through pixels close to
  // the navy), so dark shading inside the letters stays opaque.
  const outside = new Uint8Array(N);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, N - W + x);
  for (let y = 0; y < c.height; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || dist[p] >= HI) continue;
    outside[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < N - W) stack.push(p + W);
  }
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
  for (let i = 0; i < px.length; i += 4) {
    const p = i / 4;
    const a = outside[p] ? Math.min(1, Math.max(0, (dist[p] - LO) / (HI - LO))) : 1;
    if (a > 0) {
      for (let k = 0; k < 3; k++) px[i + k] = Math.min(255, Math.max(0, Math.round((px[i + k] - bg[k] * (1 - a)) / a)));
      const x = p % c.width, y = (p / c.width) | 0;
      if (a > 0.5) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    px[i + 3] = Math.round(a * 255);
  }
  g.putImageData(d, 0, 0);
  // Square crop around the mark with a little breathing room.
  const side = Math.max(maxX - minX, maxY - minY) * 1.08;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const sizes = {};
  for (const s of [1024, 512, 180, 64, 32]) {
    const o = new OffscreenCanvas(s, s);
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, s, s);
    const blob = await o.convertToBlob({ type: 'image/png' });
    sizes[s] = [...new Uint8Array(await blob.arrayBuffer())];
  }
  return { bg, box: [minX, minY, maxX, maxY], sizes };
}, data);
mkdirSync('public/brand', { recursive: true });
for (const [s, bytes] of Object.entries(out.sizes)) writeFileSync(s === '1024' ? 'public/brand/logo.png' : `public/brand/logo-${s}.png`, Buffer.from(bytes));
console.log('background', out.bg, 'mark box', out.box);
process.exit(0);
