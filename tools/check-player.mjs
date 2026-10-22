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

// Record the highest point every frame while the jump plays out (frames are coarse headless).
await simWait(0.3);
const before = await pos();
await page.evaluate(() => {
  window.__peak = -Infinity;
  const tick = () => { window.__peak = Math.max(window.__peak, window.__player.obj.position.y); if (!window.__stopPeak) requestAnimationFrame(tick); };
  window.__stopPeak = false;
  tick();
});
await page.keyboard.press('Space');
await simWait(0.8);
const peak = await page.evaluate(() => { window.__stopPeak = true; return window.__peak; });
console.log('jump peak', (peak - before[1]).toFixed(0), 'cm');
assert.ok(peak - before[1] > 50, 'Space should lift the hero');
await simWait(1);

await page.keyboard.press('KeyV');
await simWait(0.2);
const state = await page.evaluate(() => ({ view: window.__player.view, visible: window.__player.obj.visible, label: document.getElementById('view').textContent }));
console.log('after V', state);
assert.deepEqual(state, { view: 'fp', visible: false, label: '1st person' });
await page.screenshot({ path: 'shots/player-fp.png' });

// Joystick: every direction moves the hunter that way on screen, a full push walks (never runs),
// the run button runs, and letting go recentres the ball.
await open('&touch=1');
const box = await page.locator('#stick').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = box.width / 2 - 14;
// Screen axes on the ground plane: camera right and camera forward, flattened.
const axes = () => page.evaluate(() => {
  const e = window.__camera.matrixWorld.elements;
  const right = [e[0], e[2]], fwd = [-e[8], -e[10]];
  const n = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l]; };
  return { right: n(right), fwd: n(fwd) };
});
const push = async (dx, dy) => {
  const a = await pos(), ax = await axes();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
  const held = await simWait(1);
  const b = await pos();
  const state = await page.evaluate(() => window.__player.state);
  await page.mouse.up();
  await simWait(0.3);
  const m = [b[0] - a[0], b[2] - a[2]], len = Math.hypot(...m);
  return { state, speed: len / held, right: (m[0] * ax.right[0] + m[1] * ax.right[1]) / len, fwd: (m[0] * ax.fwd[0] + m[1] * ax.fwd[1]) / len };
};
const walks = [];
for (const [name, dx, dy, axis] of [['right', R, 0, 'right'], ['left', -R, 0, 'right'], ['up', 0, -R, 'fwd'], ['down', 0, R, 'fwd']]) {
  const r = await push(dx * 1.4, dy * 1.4);
  const want = name === 'left' || name === 'down' ? -1 : 1;
  console.log(`stick ${name}: ${r.speed.toFixed(0)} cm/s, along screen ${axis} ${r[axis].toFixed(2)}`);
  assert.ok(r[axis] * want > 0.9, `pushing ${name} must move the hunter ${name} on screen`);
  assert.equal(r.state, 'walk', `a full push walks, it does not run (${name})`);
  walks.push(r.speed);
}
// Keyboard D goes screen-right too.
{
  const a = await pos(), ax = await axes();
  await page.keyboard.down('KeyD'); await simWait(0.8); await page.keyboard.up('KeyD'); await simWait(0.3);
  const b = await pos(), m = [b[0] - a[0], b[2] - a[2]], l = Math.hypot(...m);
  const along = (m[0] * ax.right[0] + m[1] * ax.right[1]) / l;
  console.log('key D along screen right', along.toFixed(2));
  assert.ok(along > 0.9, 'D must move screen-right');
}
await page.click('#run');
const run = await push(0, -R * 1.4);
console.log('with run button:', run.speed.toFixed(0), 'cm/s');
// Headless frame timing skews the speeds, so check what the hunter is doing instead.
assert.equal(run.state, 'run', 'the run button runs');
assert.ok(run.speed > Math.max(...walks), 'running covers more ground than walking');
assert.equal(await page.evaluate(() => document.querySelector('.stick__knob').style.transform), '', 'released ball recentres');
await page.screenshot({ path: 'shots/player-touch.png' });
await browser.close();
console.log('player ok');
