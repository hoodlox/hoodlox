// Treasure chest from low-poly-treasure-chest-set (public/scenes/chests): a skinned chest whose
// "Take 001" clip swings the lid open, plus a coin pile inside. One template, re-skinned per rarity.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { rarity } from './game.js';

const DIR = '/scenes/chests/';
const texLoader = new THREE.TextureLoader().setPath(DIR);
const skins = new Map();
const skin = (name) => {
  if (!skins.has(name)) {
    skins.set(name, texLoader.loadAsync(`${name}.png`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
    }));
  }
  return skins.get(name);
};

let template;
export function loadChest() {
  template ??= Promise.all([new FBXLoader().loadAsync(`${DIR}TreasureChest.fbx`), skin('Coins')]).then(([g, coins]) => {
    // The file also carries a five-chest showcase and baked shadow planes; keep the chest and its coins.
    for (const o of [...g.children]) if (/^ShadowPlane|TreasureChest003/.test(o.name)) o.removeFromParent();
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
      if (o.name === 'TreasureCoins') o.material = coins;
    });
    return g;
  });
  return template;
}

// The source clip swings the lid wide by ~35% of its length, then lets it fall half shut. Only that
// first stretch is used: 0 = closed, 1 = wide open.
const OPEN_AT = 0.35;
const OPEN_SECONDS = 0.8;

// A chest of the given rarity. setOpen(0..1) poses the lid; open() animates it to 1 via update(dt).
// `skinName` overrides the rarity skin (buried chests all look alike so the rarity stays a surprise).
export async function makeChest(rarityId, skinName = rarity(rarityId).skin) {
  const [g, mat] = await Promise.all([loadChest(), skin(skinName)]);
  const obj = cloneSkinned(g);
  obj.traverse((o) => { if (o.isMesh && o.name !== 'TreasureCoins') o.material = mat; });
  const mixer = new THREE.AnimationMixer(obj);
  const act = mixer.clipAction(g.animations[0]);
  act.play();
  act.paused = true;
  let t = 0, opening = false;
  const setOpen = (v) => { t = Math.min(1, Math.max(0, v)); act.time = t * OPEN_AT * act.getClip().duration; mixer.update(0); };
  setOpen(0);
  return {
    obj, setOpen,
    open() { opening = true; },
    update(dt) { if (opening && t < 1) setOpen(t + dt / OPEN_SECONDS); },
  };
}
