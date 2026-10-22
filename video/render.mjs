// Renders video/intro.html frame by frame (dev server on 5173) and mixes voice, music and effects.
//   node video/render.mjs --preview 3,10.5,40     stills → video/build/preview/
//   node video/render.mjs                         full MP4 → video/out/hoodlox-intro.mp4
// FRAMES_DIR (default: os tmp) holds the JPG frames; WORKERS sets parallel pages.
import { chromium } from 'playwright';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { mixCues } from './sfx.mjs';
import { FFMPEG } from './ff.mjs';

const URL = 'http://localhost:5173/video/intro.html';
const FPS = 30, WORKERS = +(process.env.WORKERS ?? 4);
const args = process.argv.slice(2);
const preview = args.includes('--preview') ? args[args.indexOf('--preview') + 1].split(',').map(Number) : null;
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const open = async () => {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto(URL); await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return p;
};
const grab = (p, t, path, type = 'jpeg') => p.evaluate((t) => window.__render(t), t).then(() => p.locator('#stage').screenshot({ path, type, ...(type === 'jpeg' ? { quality: 93 } : {}) }));

if (preview) {
  mkdirSync('video/build/preview', { recursive: true });
  const p = await open();
  for (const t of preview) { await grab(p, t, `video/build/preview/t${t}.png`, 'png'); console.log('preview', t); }
  await browser.close(); process.exit(0);
}

const first = await open();
const total = await first.evaluate(() => window.__total);
const cues = await first.evaluate(() => window.__cues);
const n = Math.ceil(total * FPS);
const dir = process.env.FRAMES_DIR ?? join(tmpdir(), 'hoodlox-frames');
if (existsSync(dir) && !process.env.KEEP) rmSync(dir, { recursive: true });
mkdirSync(dir, { recursive: true });
console.log(`${n} frames, ${total.toFixed(1)} s, ${cues.length} sound cues → ${dir}`);

const pages = [first, ...(await Promise.all(Array.from({ length: WORKERS - 1 }, open)))];
let next = 0, done = 0;
const t0 = Date.now();
await Promise.all(pages.map(async (p) => {
  for (let f; (f = next++) < n;) {
    const path = join(dir, `${String(f).padStart(5, '0')}.jpg`);
    if (!existsSync(path)) await grab(p, f / FPS, path);
    if (++done % 150 === 0) console.log(`${done}/${n}  ${((Date.now() - t0) / done * (n - done) / 60000).toFixed(1)} min left`);
  }
}));
await browser.close();

// Audio: effects track from the cues, then voice lines at their scene offsets, music ducked under the voice.
mkdirSync('video/out', { recursive: true });
mixCues(cues, total, 'video/build/sfx.wav');
const TL = (await import('./build/timeline.json', { with: { type: 'json' } })).default;
const inputs = ['-framerate', String(FPS), '-i', join(dir, '%05d.jpg'), '-stream_loop', '-1', '-i', 'public/audio/treasure_hunter.mp3', '-i', 'video/build/sfx.wav'];
const vo = TL.scenes.map((s, i) => { inputs.push('-i', s.file); const ms = Math.round((s.start + s.vo) * 1000); return `[${i + 3}:a]aresample=44100,adelay=${ms}|${ms},volume=1.7[v${i}]`; });
const filter = [
  ...vo,
  `${TL.scenes.map((_, i) => `[v${i}]`).join('')}amix=inputs=${TL.scenes.length}:normalize=0,asplit[vo][key]`,
  `[1:a]aresample=44100,volume=0.42,afade=t=in:d=1.5,afade=t=out:st=${(total - 3).toFixed(2)}:d=3[m]`,
  '[m][key]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=500[md]',
  '[2:a]volume=0.9[fx]',
  '[vo][md][fx]amix=inputs=3:normalize=0,alimiter=limit=0.95[a]',
];
const out = 'video/out/hoodlox-intro.mp4';
const r = spawnSync(FFMPEG, ['-y', '-v', 'error', ...inputs, '-filter_complex', filter.join(';'), '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status) throw new Error('ffmpeg failed');
console.log('wrote', out);
