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

// Joystick: a half push walks, a push to the edge runs, letting go stops and recentres the ball.
await open('&touch=1');
const box = await page.locator('#stick').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width / 2 - 14;
const stickRun = async (dy) => {
  const a = await pos();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + dy, { steps: 4 });
  const held = await simWait(1);
  const b = await pos();
  await page.mouse.up();
  return Math.hypot(b[0] - a[0], b[2] - a[2]) / held;
};
const walkSpeed = await stickRun(-R * 0.6);
const runSpeed = await stickRun(-R * 1.4);
console.log('joystick walk', walkSpeed.toFixed(0), 'cm/s, run', runSpeed.toFixed(0), 'cm/s');
assert.ok(walkSpeed > 120 && walkSpeed < 320, 'a half push should walk');
assert.ok(runSpeed > 500, 'a full push should run');
assert.equal(await page.evaluate(() => document.querySelector('.stick__knob').style.transform), '', 'released ball recentres');
await page.screenshot({ path: 'shots/player-touch.png' });
await browser.close();
console.log('player ok');
