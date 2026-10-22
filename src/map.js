// Renders Synty's Demo scene from public/manor/layout.json (made by tools/parse-manor.mjs).
// ?mirror=x|z|0 picks the Unity→Three handedness flip (x is the one proven on Nine2Five).
// ?cam=x,y,z,tx,ty,tz overrides the camera.  ?noshadow disables shadows.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { spawnAnimals } from './animals.js';
import { createPlayer } from './player.js';
import { groundProbe } from './ground.js';
import { createGate } from './gate.js';
import { createHUD } from './hud.js';
import { createRemotePlayers } from './agents.js';
import { api, live, setMe } from './net.js';
import { createDigSites, createDigging } from './dig.js';
import { createSfx } from './sfx.js';
import { createDashboard } from './dashboard.js';

const q = new URLSearchParams(location.search);
// The game map is the default; ?manor opens the old Synty manor viewer (dev assets only).
if (!q.has('scene') && !q.has('manor')) { q.set('scene', 'forest/Mining_Pack_Free.fbx'); q.set('tex', 'PP_Color_Palette.png'); }
const MIRROR = q.get('mirror') ?? 'x';
const info = document.getElementById('info');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !q.has('noshadow');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b4663);
scene.fog = new THREE.Fog(0x3b4663, 300, 900);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 3000);
const controls = new OrbitControls(camera, renderer.domElement);

const hemi = new THREE.HemisphereLight(0xc9d6ff, 0x3a3326, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.8);
sun.position.set(200, 300, 100);
sun.castShadow = renderer.shadowMap.enabled;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = sun.shadow.camera.bottom = -160;
sun.shadow.camera.right = sun.shadow.camera.top = 160;
sun.target.position.set(-10, 0, -4);
scene.add(sun.target);
sun.shadow.camera.far = 1200;
sun.shadow.bias = -0.0008;
scene.add(sun);

// Wire the on-screen buttons (map.html) to the player. Shown on touch devices or with ?touch.
function bindControls(player) {
  if (matchMedia('(pointer: coarse)').matches || q.has('touch')) document.body.classList.add('touch');
  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); on(); });
    for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, off);
  };
  // Analog joystick: the knob follows the thumb inside the ring; distance from the centre sets the
  // walking speed. Running is the run button only.
  const stick = document.getElementById('stick'), knob = stick.querySelector('.stick__knob');
  let sid = null;
  const move = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2 - 14;
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) { x *= R / d; y *= R / d; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    const mag = Math.min(1, d / R);
    player.setStick(mag < 0.12 ? 0 : x / R, mag < 0.12 ? 0 : -y / R);
  };
  const release = () => { sid = null; stick.classList.remove('is-active'); knob.style.transform = ''; player.setStick(0, 0); };
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid); stick.classList.add('is-active'); move(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) move(e); });
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);
  hold(document.getElementById('jump'), () => player.jump(), () => {});
  const run = document.getElementById('run');
  run.addEventListener('click', () => { run.classList.toggle('on'); player.setTouch('run', run.classList.contains('on') ? 1 : 0); });
  const view = document.getElementById('view');
  const label = () => { view.textContent = player.view === 'tp' ? '3rd person' : '1st person'; };
  view.addEventListener('click', () => { player.toggleView(); label(); });
  renderer.domElement.addEventListener('view', label);
  label();
}

// ?scene=forest/Mining_Pack_Free.fbx&tex=PP_Color_Palette.png renders one whole-scene FBX from
// public/scenes/ instead of the Synty layout; its camera is fitted to the model's bounds.
if (q.has('scene')) {
  const gate = q.has('noplayer') ? null : createGate(q); // shown at once, over the loading map
  const dir = `/scenes/${q.get('scene').split('/')[0]}/`;
  const g = await new FBXLoader().loadAsync(`/scenes/${q.get('scene')}`);
  const tex = q.get('tex') ? new THREE.TextureLoader().load(dir + q.get('tex')) : null;
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace; // FBX UVs expect three's default flipY
    // A colour-palette atlas must be sampled exactly, or neighbouring swatches bleed together.
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
  }
  // FBX materials come in as shiny Phong; low poly art wants flat matte faces.
  const matte = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    o.material = matte;
  });
  // The FBX also carries loose sample tiles west of the real map; keep only the map, then surround
  // it with copies on request (?tile=3 → 3×3). Odd copies are mirrored to hide the repeat.
  const main = new THREE.Group();
  const CUT = q.has('cut') ? +q.get('cut') : -14000;
  for (const ch of [...g.children]) {
    const cx = new THREE.Box3().setFromObject(ch).getCenter(new THREE.Vector3()).x;
    if (cx > CUT) main.add(ch);
  }
  scene.add(main);
  const mb = new THREE.Box3().setFromObject(main), ms = mb.getSize(new THREE.Vector3());
  // The mountain ring is open on its +z edge. Mirror a copy across that edge (?join=0 disables) so
  // the two halves meet open-edge to open-edge and close into one bigger map. A small overlap hides
  // the seam; three flips face winding itself for a negative scale.
  if (q.get('join') !== '0') {
    const overlap = +(q.get('overlap') ?? 3000); // 400 still showed a sliver of sky at the seam
    const copy = main.clone();
    copy.scale.z = -1;
    copy.position.z = 2 * mb.max.z - overlap; // z' = 2·edge − z
    scene.add(copy);
    mb.expandByPoint(new THREE.Vector3(mb.min.x, mb.min.y, copy.position.z - mb.min.z));
    mb.getSize(ms);
  }
  const mc = mb.getCenter(new THREE.Vector3());
  // Animals wander only on the meadow meshes (?animals=60 ?animalScale=0.4 ?facing=0 radians).
  scene.updateMatrixWorld(true);
  const groundMeshes = [], blockers = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/^PP_(Meadow|Lake_Ground)/.test(o.name)) groundMeshes.push(o);
    else if (/^PP_(Forest_Mountain|Rock)/.test(o.name)) blockers.push(o);
  });
  const groundAt = groundProbe(groundMeshes, blockers);
  window.__ground = { groundAt, bounds: mb }; // tools/build-spots.mjs samples this
  const animals = await spawnAnimals(scene, groundAt, mb, {
    count: +(q.get('animals') ?? 60), scale: +(q.get('animalScale') ?? 0.4), facing: +(q.get('facing') ?? 0),
  });
  let player = null, agents = null, sites = null, digging = null, sfx = null;
  hemi.intensity = 0.6;
  hemi.color.set(0xbfd8f5); hemi.groundColor.set(0x4a5a30);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const b = mb, c = mc, s = ms; // camera and shadows follow the original tile, not the copies
  const r = Math.max(s.x, s.z);
  // Shadow frustum sized to the scene (this FBX is in centimetres, so r is tens of thousands).
  sun.shadow.camera.left = sun.shadow.camera.bottom = -r * 0.6;
  sun.shadow.camera.right = sun.shadow.camera.top = r * 0.6;
  sun.shadow.camera.near = r * 0.1;
  sun.shadow.camera.far = r * 4;
  sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(c.x + r * 0.6, c.y + r, c.z + r * 0.4); sun.target.position.copy(c); scene.add(sun.target);
  camera.far = r * 20; camera.updateProjectionMatrix();
  scene.fog = null;
  scene.background = new THREE.Color(0x9fd0ee);
  sun.intensity = 1.8;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = r * 0.001;
  sun.shadow.radius = 4;
  if (q.has('follow')) {
    // ?follow=N parks the camera a few metres from animal N.
    const a = animals.list[+q.get('follow') % animals.list.length].obj.position;
    camera.position.set(a.x + 900, a.y + 600, a.z + 1300); controls.target.set(a.x, a.y + 80, a.z);
  } else if (q.has('cam')) {
    const [x, y, z, tx, ty, tz] = q.get('cam').split(',').map(Number);
    camera.position.set(x, y, z); controls.target.set(tx, ty, tz);
  } else {
    camera.position.set(c.x, c.y + r * 0.7, c.z + r * 0.9);
    controls.target.copy(c);
  }
  controls.update();
  info.textContent = `${q.get('scene')} size ${s.toArray().map((v) => v.toFixed(0)).join('×')}`;
  console.warn('scene bounds', b.min.toArray().map((v) => v.toFixed(0)).join(','), b.max.toArray().map((v) => v.toFixed(0)).join(','));
  // Largest top-level child is the main map; log its centre so a close-up camera can be aimed at it.
  const big = g.children.map((ch) => ({ ch, b: new THREE.Box3().setFromObject(ch) })).sort((a, b2) => b2.b.getSize(new THREE.Vector3()).length() - a.b.getSize(new THREE.Vector3()).length())[0];
  if (big) console.warn('main child', big.ch.name, big.b.min.toArray().map((v) => v.toFixed(0)).join(','), big.b.max.toArray().map((v) => v.toFixed(0)).join(','), 'children', g.children.length);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    window.__simTime = (window.__simTime ?? 0) + dt; // lets tools/check-player.mjs measure in simulated seconds
    animals.update(dt);
    if (agents) agents.update(dt);
    if (sites) sites.update(dt);
    if (digging) digging.update(dt);
    if (player) player.update(dt); else controls.update();
    if (sfx) sfx.update(dt, player.state);
    renderer.render(scene, camera);
  });
  // The map is rendering behind the gate now. Gate → player → HUD + dashboard → live sync.
  // (?noplayer keeps the free orbit camera, ?pov=fp|tp, ?touch shows the buttons, ?arena=1 skips the lobby.)
  if (gate) {
    gate.ready();
    const { agent } = await gate.result;
    console.warn('stage: gate passed');
    live.config = await api('/api/config');
    player = await createPlayer(scene, camera, renderer.domElement, groundAt, c, { hero: agent.hero, name: agent.name, view: q.get('pov') ?? 'tp' });
    console.warn('stage: player');
    controls.enabled = false;
    window.__player = player;
    window.__camera = camera; // tools/check-player.mjs checks movement against the screen axes
    bindControls(player);
    sites = createDigSites(scene, groundAt);
    sfx = createSfx();
    let dash = null;
    const hud = createHUD({ me: agent, sites, onOpen: () => setTimeout(sfx.coins, 1100), onDash: () => dash.open() });
    digging = createDigging({ scene, player, sites, agent, onFound: (chest) => { sfx.found(); hud.found(chest); }, onError: hud.toast });
    agents = createRemotePlayers(scene, groundAt);

    // Live loop: every second report where I am and pull who else is here and which crates are
    // taken; a new epoch number fetches the new crate layout; the board and my hunter refresh slowly.
    const loadEpoch = async () => {
      const ep = await api('/api/epoch');
      live.epoch = { ...ep, startedAt: ep.endsAt - ep.seconds * 1000 };
      sites.setEpoch(ep);
    };
    const refreshBoard = async () => { live.board = (await api('/api/leaderboard')).top; };
    let last = { d: 0, s: 0 };
    let ticks = 0;
    const sync = async () => {
      const p = player.obj.position;
      const res = await api('/api/sync', {
        x: Math.round(p.x), z: Math.round(p.z), ry: +player.obj.rotation.y.toFixed(2), anim: player.state,
        dd: player.stats.distance - last.d, ds: player.stats.seconds - last.s,
      });
      last = { d: player.stats.distance, s: player.stats.seconds };
      live.skew = res.now - Date.now();
      live.online = res.players.length + 1;
      if (res.epoch !== sites.epoch) await loadEpoch();
      sites.applySync(res);
      agents.apply(res.players);
      if (++ticks % 15 === 0) { refreshBoard().catch(() => {}); setMe((await api('/api/me')).me); }
    };
    await Promise.all([loadEpoch(), refreshBoard()]);
    const loop = () => sync().catch(() => {}).finally(() => setTimeout(loop, 1000));
    loop();

    // The dashboard is the lobby: it opens first and "Enter arena" drops the hunter in.
    dash = createDashboard({ me: agent, sites, hud });
    if (!q.has('arena')) dash.open();
    window.__game = { agent, sites, digging, dash, live, refreshBoard };
    info.hidden = true;
    console.warn('stage: online');
  }
  window.__ready = true;
} else {
// --- Synty layout path (manor) ------------------------------------------------------------------
const [layout, mats, models] = await Promise.all([
  fetch('/manor/layout.json').then((r) => r.json()),
  fetch('/manor/mats.json').then((r) => r.json()),
  fetch('/manor/models.json').then((r) => r.json()),
]);

// --- materials: Synty FBX material names match the .mat names -------------------------------
const texLoader = new THREE.TextureLoader().setPath('/manor/tex/');
const tgaLoader = new TGALoader().setPath('/manor/tex/');
const texCache = new Map();
function texture(file) {
  if (!texCache.has(file)) {
    const t = (file.endsWith('.tga') ? tgaLoader : texLoader).load(file);
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // FBX UVs are already top-down
    texCache.set(file, t);
  }
  return texCache.get(file);
}
const matCache = new Map();
const fallback = new THREE.MeshStandardMaterial({ color: 0xb8a98c });
function material(name) {
  if (matCache.has(name)) return matCache.get(name);
  const d = mats[name];
  let m = fallback;
  if (d) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...d.color),
      map: d.tex ? texture(d.tex) : null,
      emissiveMap: d.emissive ? texture(d.emissive) : null,
      emissive: d.emissive ? 0xffffff : 0x000000,
      transparent: d.transparent,
      opacity: d.transparent ? d.alpha : 1,
      depthWrite: !d.transparent,
      side: THREE.DoubleSide,
    });
  }
  matCache.set(name, m);
  return m;
}

// --- models ------------------------------------------------------------------------------------
const fbxLoader = new FBXLoader().setPath('/manor/models/');
const modelCache = new Map();
let unresolved = 0;
function loadModel(name) {
  if (!modelCache.has(name)) {
    modelCache.set(name, fbxLoader.loadAsync(`${name}.fbx`).then((g) => {
      g.scale.setScalar(0.01); // Synty FBX is authored in centimetres
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeVertexNormals(); // Synty FBX normals can arrive as NaN
        o.castShadow = o.receiveShadow = true;
      });
      return g;
    }));
  }
  return modelCache.get(name);
}
// FBX files carry no usable materials; slots come from the prefab (models.json), overridden per
// instance (layout slots). A null slot is a material from a pack that is not in this package.
function applySlots(obj, slots) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const pick = (i) => { const n = slots?.[i]; if (!n) unresolved++; return n ? material(n) : fallback; };
    o.material = Array.isArray(o.material) ? o.material.map((_, i) => pick(i)) : pick(0);
  });
}

// Unity is left-handed, Three.js right-handed.
const toThree =(obj, [x, y, z], [qx, qy, qz, qw]) => {
  if (MIRROR === 'z') { obj.position.set(x, y, -z); obj.quaternion.set(-qx, -qy, qz, qw); }
  else if (MIRROR === 'x') { obj.position.set(-x, y, z); obj.quaternion.set(qx, -qy, -qz, qw); }
  else { obj.position.set(x, y, z); obj.quaternion.set(qx, qy, qz, qw); }
};

const bounds = new THREE.Box3();
let done = 0, failed = 0;
await Promise.all(layout.map(async (it) => {
  const src = await loadModel(it.model).catch((e) => { console.error('failed', it.model, e.message); failed++; return null; });
  if (src) {
    const obj = src.clone();
    applySlots(obj, it.slots ?? models[it.model]);
    toThree(obj, it.pos, it.rot);
    obj.scale.multiply(new THREE.Vector3(...it.scale));
    scene.add(obj);
    bounds.expandByPoint(obj.position);
  }
  info.textContent = `manor: ${++done}/${layout.length}${failed ? ` (${failed} failed)` : ''}`;
}));
if (unresolved) console.warn('mesh slots without a material in this package:', unresolved);

const c = bounds.getCenter(new THREE.Vector3());
const s = bounds.getSize(new THREE.Vector3());
if (q.has('cam')) {
  const [x, y, z, tx, ty, tz] = q.get('cam').split(',').map(Number);
  camera.position.set(x, y, z); controls.target.set(tx, ty, tz);
} else {
  // The manor itself sits around Unity (10, 0, -4); the far cliffs are set dressing.
  camera.position.set(-10, 80, 110);
  controls.target.set(-10, 5, -4);
}
controls.update();
console.log('bounds', bounds.min.toArray().map((v) => v.toFixed(0)), bounds.max.toArray().map((v) => v.toFixed(0)));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
window.__ready = true;
}