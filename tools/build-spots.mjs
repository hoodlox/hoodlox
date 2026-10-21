// Samples the map for walkable meadow spots (same ground rules as the game) and writes
// server/spots.json: [[x, z], ...] in cm. The server buries each epoch's crates on these.
// usage: node tools/build-spots.mjs   (dev server running)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const STEP = 450; // cm between samples
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto('http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&noplayer&animals=0&noshadow', { waitUntil: 'commit' });
await page.waitForFunction(() => window.__ground, null, { timeout: 600000 });
const spots = await page.evaluate((step) => {
  const { groundAt, bounds } = window.__ground;
  const out = [];
  for (let x = bounds.min.x; x <= bounds.max.x; x += step) {
    for (let z = bounds.min.z; z <= bounds.max.z; z += step) {
      // Keep spots with walkable ground all around, so a crate never sits on a ledge.
      const ok = [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150]].every(([dx, dz]) => groundAt(x + dx, z + dz) !== null);
      if (ok) out.push([Math.round(x), Math.round(z)]);
    }
  }
  return out;
}, STEP);
mkdirSync('server', { recursive: true });
writeFileSync('server/spots.json', JSON.stringify(spots));
console.log('spots', spots.length);
process.exit(0);
