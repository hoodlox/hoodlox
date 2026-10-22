// Player: a KayKit adventurer driven Roblox-style. WASD/arrows move relative to the camera, Shift
// runs, Space jumps, V toggles third person <-> first person, drag (mouse or finger) orbits the view.
// Touch buttons call setTouch()/jump()/toggleView() from the overlay in map.html.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadHero, loadClips, CLIP } from './agents.js';

const WALK = 300, RUN = 650, GRAVITY = -3000, JUMP = 1000; // cm, cm/s, cm/s²
const EYE = 165, STEP_UP = 200; // cm
const TP_FOV = 50, FP_FOV = 72; // degrees (vertical)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function createPlayer(scene, camera, dom, groundAt, spawn, { hero = 'Knight', name = 'You', scale = 75, view = 'tp' } = {}) {
  const [model, clips] = await Promise.all([loadHero(hero), loadClips()]);
  const obj = cloneSkinned(model); // the cached template is shared with other hunters using this hero
  obj.scale.setScalar(scale);
  // No name tag over the player's own head: names are for other hunters to read.

  // The animation libraries share the character's bone names, so their clips drive it directly.
  const mixer = new THREE.AnimationMixer(obj);
  const actions = Object.fromEntries(Object.entries(CLIP).map(([k, n]) => [k, mixer.clipAction(clips.find((c) => c.name === n))]));
  let busy = null; // 'dig' while digging: movement keys are read (to cancel) but the hero stays put
  let current = null;
  const play = (n) => {
    if (current === n) return;
    actions[n].reset().fadeIn(0.15).play();
    if (current) actions[current].fadeOut(0.15);
    current = n;
  };

  // Spawn on the nearest walkable spot to the requested point.
  let x = spawn.x, z = spawn.z, groundY = groundAt(x, z);
  for (let r = 300; groundY === null && r < 30000; r += 300) {
    for (let a = 0; a < Math.PI * 2 && groundY === null; a += Math.PI / 8) {
      const px = spawn.x + Math.cos(a) * r, pz = spawn.z + Math.sin(a) * r;
      const py = groundAt(px, pz);
      if (py !== null) { x = px; z = pz; groundY = py; }
    }
  }
  obj.position.set(x, groundY ?? 0, z);
  scene.add(obj);

  // --- input -------------------------------------------------------------------------------------
  const keys = new Set();
  const touch = { run: 0 };
  const stick = { x: 0, y: 0 }; // analog joystick, -1..1, y is forward
  let yaw = 0, pitch = 0.5, vy = 0, grounded = true;
  const stats = { distance: 0, seconds: 0 };
  let wantsMove = false;
  const jump = () => { if (grounded && !busy) { vy = JUMP; grounded = false; } };
  // First person starts looking almost level; third person looks down over the shoulder.
  const toggleView = () => { view = view === 'tp' ? 'fp' : 'tp'; obj.visible = view === 'tp'; pitch = view === 'fp' ? 0.1 : 0.5; dom.dispatchEvent(new CustomEvent('view', { detail: view })); };
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  addEventListener('keydown', (e) => {
    if (typing(e) || document.body.classList.contains('dash-open')) return; // the dashboard has the keys
    keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); jump(); }
    if (e.code === 'KeyV') toggleView();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  let drag = null;
  dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); });
  dom.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw -= (e.clientX - drag.x) * 0.005;
    pitch = clamp(pitch + (e.clientY - drag.y) * 0.005, view === 'tp' ? -0.2 : -1.3, 1.3);
    drag = { x: e.clientX, y: e.clientY };
  });
  dom.addEventListener('pointerup', () => { drag = null; });
  dom.addEventListener('pointercancel', () => { drag = null; });
  obj.visible = view === 'tp';

  const pressed = (...codes) => (codes.some((c) => keys.has(c)) ? 1 : 0);
  const target = new THREE.Vector3();

  function update(dt) {
    mixer.update(dt);
    stats.seconds += dt;
    const p = obj.position;
    const f = pressed('KeyW', 'ArrowUp') - pressed('KeyS', 'ArrowDown') + stick.y;
    const s = pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft') + stick.x;
    const stickMag = Math.hypot(stick.x, stick.y);
    // The stick only walks; running is Shift or the run button.
    const running = pressed('ShiftLeft', 'ShiftRight') || touch.run;
    const len = Math.hypot(f, s);
    wantsMove = len > 0;
    // Camera looks along (sin yaw, 0, cos yaw). Three.js is right-handed, so screen-right is
    // (-cos yaw, 0, sin yaw), not (cos yaw, 0, -sin yaw).
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    if (len > 0 && !busy) {
      const dx = (sy * f - cy * s) / len, dz = (cy * f + sy * s) / len;
      // A lightly pushed stick walks slower; from half way out it walks at full speed.
      const throttle = stickMag > 0 && !pressed('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight') ? Math.max(0.4, Math.min(1, stickMag / 0.5)) : 1;
      const speed = (running ? RUN : WALK) * (running ? 1 : throttle);
      const nx = p.x + dx * speed * dt, nz = p.z + dz * speed * dt;
      const gy = groundAt(nx, nz);
      if (gy !== null && gy - groundY < STEP_UP) { stats.distance += Math.hypot(nx - p.x, nz - p.z); p.x = nx; p.z = nz; groundY = gy; }
      if (view === 'tp') {
        const want = Math.atan2(dx, dz);
        let d = want - obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        obj.rotation.y += d * Math.min(1, dt * 12);
      }
    }
    if (view === 'fp' && !busy) obj.rotation.y = yaw;
    // Vertical: glued to the ground while walking (so going downhill never counts as falling and
    // refuses a jump), gravity while airborne.
    vy += GRAVITY * dt;
    if (grounded && vy <= 0 && p.y - groundY < STEP_UP) { p.y = groundY; vy = 0; }
    else {
      const ny = p.y + vy * dt;
      if (ny <= groundY) { p.y = groundY; vy = 0; grounded = true; } else { p.y = ny; grounded = false; }
    }
    play(busy ?? (!grounded ? 'jump' : len > 0 ? (running ? 'run' : 'walk') : 'idle'));

    if (view === 'tp') {
      // Further back on narrow (portrait phone) screens so the hunter and its surroundings fit.
      const dist = camera.aspect < 0.8 ? 1200 : 850, cp = Math.cos(pitch);
      camera.position.set(p.x - sy * dist * cp, p.y + EYE + Math.sin(pitch) * dist, p.z - cy * dist * cp);
      camera.lookAt(target.set(p.x, p.y + EYE * 0.8, p.z));
    } else {
      // A wider lens and the eye a little behind the head make first person feel zoomed out.
      const cp = Math.cos(pitch), back = 45;
      camera.position.set(p.x - sy * back, p.y + EYE, p.z - cy * back);
      camera.lookAt(target.set(p.x + sy * cp * 100, p.y + EYE - Math.sin(pitch) * 100, p.z + cy * cp * 100));
    }
    const fov = view === 'fp' ? FP_FOV : TP_FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  return {
    obj, update, jump, toggleView, stats,
    get view() { return view; },
    get wantsMove() { return wantsMove; },
    get state() { return current ?? 'idle'; }, // animation state: idle | walk | run | jump | dig
    setBusy(state) { busy = state; },
    // Move straight to a walkable spot (used by tools/check-dig.mjs).
    teleport(x, z) { const y = groundAt(x, z); if (y === null) return false; obj.position.set(x, y, z); groundY = y; vy = 0; grounded = true; return true; },
    get debug() { return { grounded, vy, groundY, y: obj.position.y, keys: [...keys] }; },
    setTouch(key, value) { touch[key] = value; },
    setStick(x, y) { stick.x = x; stick.y = y; },
  };
}
