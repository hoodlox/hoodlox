// Renders one picture on a transparent square canvas for the UI:
//   ?hero=Knight            a hero in its idle pose (character picker, leaderboard)
//   ?chest=rare&open=0..1   a chest of that rarity, lid closed (0) to fully open (1)
// tools/render-portraits.mjs screenshots it into public/.
import * as THREE from 'three';
import { loadHero, loadClips, HERO_HEIGHT } from './agents.js';
import { makeChest } from './chest.js';

const q = new URLSearchParams(location.search);
const SIZE = +(q.get('size') ?? 512);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x55493a, 1.4));
const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
key.position.set(2, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0xbcd0ff, 1.2);
rim.position.set(-3, 3, -2);
scene.add(rim);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 500);

if (q.has('chest')) {
  const chest = await makeChest(q.get('chest'));
  scene.add(chest.obj);
  chest.obj.rotation.y = +(q.get('turn') ?? -0.5);
  // Frame the wide-open pose so closed and open pictures line up and the lid never clips.
  chest.setOpen(1);
  chest.obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(chest.obj, true); // precise: follows the skinned lid
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z);
  camera.position.set(c.x, c.y + r * 0.5, c.z + r * 2.3);
  camera.lookAt(c);
  chest.setOpen(+(q.get('open') ?? 0));
} else {
  const [hero, clips] = await Promise.all([loadHero(q.get('hero') ?? 'Knight'), loadClips()]);
  scene.add(hero);
  hero.rotation.y = -0.35; // a touch of three-quarter view
  const mixer = new THREE.AnimationMixer(hero);
  mixer.clipAction(clips.find((c) => c.name === 'Idle_A')).play();
  mixer.update(0.4);
  camera.position.set(0, HERO_HEIGHT * 0.55, 5.6);
  camera.lookAt(0, HERO_HEIGHT * 0.5, 0);
}
renderer.render(scene, camera);
window.__ready = true;
