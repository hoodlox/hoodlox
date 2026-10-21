// Quaternius animated animals (public/scenes/animals/*.fbx, rigged, clips Idle/Walk/Gallop/Eating/...)
// wandering the meadow. Movement and ground rules live in wander.js.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Wanderer, randomSpot, seeded } from './wander.js';

const DIR = '/scenes/animals/';
const SPECIES = ['Alpaca', 'Bull', 'Cow', 'Deer', 'Donkey', 'Fox', 'Horse', 'Horse_White', 'Husky', 'ShibaInu', 'Stag', 'Wolf'];
const FAST = /Fox|Husky|ShibaInu|Wolf/; // these trot with the Gallop clip

export async function spawnAnimals(scene, groundAt, bounds, { count = 30, scale = 0.4, seed = 1, facing = 0 } = {}) {
  const rnd = seeded(seed);
  const loader = new FBXLoader();
  const models = await Promise.all(SPECIES.map(async (name) => {
    const g = await loader.loadAsync(`${DIR}${name}.fbx`);
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds lag the animation
      // Flat-colour materials; swap the shiny Phong for matte so they match the map. The FBX stores
      // its colours linear (a cream alpaca arrives as #321d0c), so lift them to sRGB first.
      o.material = [].concat(o.material).map((m) => new THREE.MeshStandardMaterial({
        color: m.color.clone().convertLinearToSRGB(), roughness: 1, vertexColors: m.vertexColors,
      }));
    });
    g.name = name;
    return g;
  }));
  const clip = (g, name) => g.animations.find((a) => a.name.endsWith('|' + name)) ?? g.animations[0];

  const animals = [];
  for (let i = 0; i < count; i++) {
    const spot = randomSpot(groundAt, bounds, rnd);
    if (!spot) continue;
    const model = models[Math.floor(rnd() * models.length)];
    const obj = cloneSkinned(model);
    obj.scale.setScalar(scale);
    obj.position.copy(spot);
    obj.rotation.y = rnd() * Math.PI * 2;
    const fast = FAST.test(model.name);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = {
      idle: mixer.clipAction(clip(model, 'Idle')),
      eat: mixer.clipAction(clip(model, 'Eating')),
      walk: mixer.clipAction(clip(model, fast ? 'Gallop' : 'Walk')),
    };
    let current = null;
    const play = (name) => {
      if (name === 'idle' && rnd() < 0.4) name = 'eat';
      if (current === name) return;
      actions[name].reset().fadeIn(0.25).play();
      if (current) actions[current].fadeOut(0.25);
      current = name;
    };
    const wanderer = new Wanderer({ obj, groundAt, rnd, play, facing, speed: (fast ? 260 : 120) * (0.85 + rnd() * 0.3) });
    scene.add(obj);
    animals.push({ obj, mixer, wanderer });
  }
  console.warn('animals placed', animals.length, animals.slice(0, 4).map((a) => `${a.obj.name}@${a.obj.position.toArray().map((v) => v.toFixed(0)).join(',')}`).join(' '));
  return { list: animals, update(dt) { for (const a of animals) { a.mixer.update(dt); a.wanderer.update(dt); } } };
}
