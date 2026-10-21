// Smallest check that the player works: W moves the hero at walking speed, Space lifts it, V switches
// to first person and hides the body, the touch button walks too. Headless SwiftShader renders only a
// few frames per second, so everything is measured in simulated seconds (window.__simTime), not wall time.
// Saves shots/player-tp.png, shots/player-fp.png, shots/player-touch.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => { if (e.message !== 'scene-only') console.log('pageerror:', e.message); });
const pos = () => page.evaluate(() => window.__player.obj.position.toArray());
const sim = () => page.evaluate(() => window.__simTime);
const simWait = async (seconds) => { const t0 = await sim(); await page.waitForFunction((t) => window.__simTime >= t, t0 + seconds, { timeout: 120000 }); return (await sim()) - t0; };
const open = async (extra = '') => {
  await page.goto(`http://localhost:5173/map.html?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png&animals=10&guest=1&arena=1&name=P${Date.now().toString(36).slice(-6)}${extra}`, { waitUntil: 'commit' }); // the scene takes a minute under SwiftShader
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  await simWait(0.5);
};

await open();
const p0 = await pos();
await page.keyboard.down('KeyW');
const walked = await simWait(1);
await page.keyboard.up('KeyW');
const p1 = await pos();
const speed = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / walked;
console.log('walk speed', speed.toFixed(0), 'cm/s');
assert.ok(speed > 240 && speed < 360, 'W should walk at about 300 cm/s');
await page.screenshot({ path: 'shots/player-tp.png' });

// A whole jump lasts 0.67 simulated seconds and the headless frame loop is coarse, so sample the
// height right after the key press rather than after a wait.
const before = await pos();
await page.keyboard.press('Space');
const p2 = await pos();
console.log('lift right after Space', (p2[1] - before[1]).toFixed(0), 'cm');
assert.ok(p2[1] - before[1] > 50, 'Space should lift the hero');
await simWait(1.5);

await page.keyboard.press('KeyV');
await simWait(0.2);
const state = await page.evaluate(() => ({ view: window.__player.view, visible: window.__player.obj.visible, label: document.getElementById('view').textContent }));
console.log('after V', state);
assert.deepEqual(state, { view: 'fp', visible: false, label: '1st person' });
await page.screenshot({ path: 'shots/player-fp.png' });

await open('&touch=1');
const t0 = await pos();
const box = await page.locator('#f').boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await page.mouse.down();
const held = await simWait(1);
await page.mouse.up();
const t1 = await pos();
const tspeed = Math.hypot(t1[0] - t0[0], t1[2] - t0[2]) / held;
console.log('touch button speed', tspeed.toFixed(0), 'cm/s');
assert.ok(tspeed > 240 && tspeed < 360, 'forward button should walk at about 300 cm/s');
await page.screenshot({ path: 'shots/player-touch.png' });
await browser.close();
console.log('player ok');
