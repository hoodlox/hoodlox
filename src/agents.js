// Other hunters on the shared map, as reported by the server each sync: KayKit heroes with name tags,
// eased toward their last known position and playing whatever they are doing (walk, run, dig...).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { attachLabel } from './label.js';

export const HERO_DIR = '/scenes/adventurers/';
export const HERO_HEIGHT = 2.5; // model units, before scaling to cm

// Loads a hero (a template to clone) and the shared animation libraries; cached.
const loader = new GLTFLoader();
const cache = new Map();
export function loadHero(hero) {
  if (!cache.has(hero)) {
    cache.set(hero, loader.loadAsync(`${HERO_DIR}${hero}.glb`).then((g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
      return g.scene;
    }));
  }
  return cache.get(hero);
}
let clipsPromise;
export function loadClips() {
  clipsPromise ??= Promise.all([
    loader.loadAsync(`${HERO_DIR}Rig_Medium_MovementBasic.glb`),
    loader.loadAsync(`${HERO_DIR}Rig_Medium_General.glb`),
  ]).then(([a, b]) => [...a.animations, ...b.animations]);
  return clipsPromise;
}
export const CLIP = { idle: 'Idle_A', walk: 'Walking_A', run: 'Running_A', jump: 'Jump_Idle', dig: 'PickUp' };

export function createRemotePlayers(scene, groundAt, { scale = 75 } = {}) {
  const avatars = new Map(); // key → avatar
  let clips = null;
  loadClips().then((c) => { clips = c; });

  async function spawn(p) {
    const a = { key: p.key, target: new THREE.Vector3(p.x, 0, p.z), ry: p.ry, anim: p.anim, obj: null, seen: true };
    avatars.set(p.key, a);
    const [model, all] = await Promise.all([loadHero(p.hero), loadClips()]);
    if (!avatars.has(p.key)) return; // left before it loaded
    a.obj = cloneSkinned(model);
    a.obj.scale.setScalar(scale);
    a.obj.position.set(p.x, groundAt(p.x, p.z) ?? 0, p.z);
    attachLabel(a.obj, p.name, HERO_HEIGHT);
    a.mixer = new THREE.AnimationMixer(a.obj);
    a.actions = Object.fromEntries(Object.entries(CLIP).map(([k, n]) => [k, a.mixer.clipAction(all.find((c) => c.name === n))]));
    scene.add(a.obj);
  }

  // Server sync: players seen in the last few seconds. Anyone missing twice in a row is removed.
  function apply(list) {
    for (const a of avatars.values()) a.seen = false;
    for (const p of list) {
      const a = avatars.get(p.key);
      if (!a) { spawn(p); continue; }
      a.seen = true; a.misses = 0;
      a.target.set(p.x, 0, p.z);
      a.ry = p.ry;
      a.anim = p.anim;
    }
    for (const [k, a] of avatars) {
      if (a.seen) continue;
      if ((a.misses = (a.misses ?? 0) + 1) >= 2) { a.obj?.removeFromParent(); avatars.delete(k); }
    }
  }

  function update(dt) {
    for (const a of avatars.values()) {
      if (!a.obj) continue;
      const p = a.obj.position;
      // Ease toward the reported spot; snap if it is far (teleport, long lag).
      const d = Math.hypot(a.target.x - p.x, a.target.z - p.z);
      const k = d > 3000 ? 1 : Math.min(1, dt * 5);
      p.x += (a.target.x - p.x) * k;
      p.z += (a.target.z - p.z) * k;
      p.y = groundAt(p.x, p.z) ?? p.y;
      let dr = a.ry - a.obj.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.obj.rotation.y += dr * Math.min(1, dt * 8);
      const want = a.actions[a.anim] ? a.anim : 'idle';
      if (a.current !== want) {
        a.actions[want].reset().fadeIn(0.2).play();
        if (a.current) a.actions[a.current].fadeOut(0.2);
        a.current = want;
      }
      a.mixer.update(dt);
    }
  }
  return { apply, update, get count() { return avatars.size; } };
}
