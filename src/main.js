// Kit viewer. Default: a scattered meadow built from the kit (?seed=1 ?count=600).
// ?view=grid lays every model out on a grid instead (?cols=12 ?cell=8).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const q = new URLSearchParams(location.search);
const kit = q.get('kit') ?? 'nature';
const info = document.getElementById('info');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd0ee);
scene.fog = new THREE.Fog(0x9fd0ee, 120, 260);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b8a3a, 1.4));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
sun.position.set(60, 100, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = sun.shadow.camera.bottom = -110;
sun.shadow.camera.right = sun.shadow.camera.top = 110;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0005;
scene.add(sun);

const names = await (await fetch(`/kit/${kit}/manifest.json`)).json();
const gltfLoader = new GLTFLoader().setPath(`/kit/${kit}/`);
const fbxLoader = new FBXLoader().setPath(`/kit/${kit}/`);
// Synty FBX ships without its atlas textures and with NaN normals, so it gets a plain material.
const plain = new THREE.MeshStandardMaterial({ color: 0xb8a98c, side: THREE.DoubleSide });
const models = {};
let done = 0;
await Promise.all(names.map(async (file) => {
  const name = file.replace(/\.\w+$/, '');
  try {
    let m;
    if (file.endsWith('.gltf')) {
      m = (await gltfLoader.loadAsync(file)).scene;
    } else {
      m = await fbxLoader.loadAsync(file);
      m.scale.setScalar(0.01); // Synty FBX is authored in centimetres
      m.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals(); o.material = plain; } });
    }
    m.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    models[name] = m;
  } catch (e) {
    console.error('failed', name, e);
  }
  info.textContent = `${kit}: ${++done}/${names.length}`;
}));

function ground(w, h) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x8fb95a }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
  return g;
}

if (q.get('view') === 'grid') {
  const cols = +(q.get('cols') ?? 12);
  const cell = +(q.get('cell') ?? 8);
  const rows = Math.ceil(names.length / cols);
  const g = ground(cols * cell + 20, rows * cell + 20);
  g.position.set((cols * cell) / 2 - cell / 2, 0, (rows * cell) / 2 - cell / 2);
  names.forEach((file, i) => {
    const name = file.replace(/\.\w+$/, '');
    if (!models[name]) return;
    models[name].position.set((i % cols) * cell, 0, Math.floor(i / cols) * cell);
    scene.add(models[name]);
  });
  camera.position.set(-15, 40, -15);
  controls.target.copy(g.position);
} else {
  // Seeded RNG so the same seed always gives the same meadow.
  let s = +(q.get('seed') ?? 1) >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const R = 90;
  ground(R * 2.4, R * 2.4);
  // [prefix match, weight]
  const layers = [
    ['CommonTree_', 10], ['Pine_', 6], ['TwistedTree_', 4], ['DeadTree_', 1],
    ['Bush_', 8], ['Rock_', 4], ['Pebble_', 6], ['Grass_', 30], ['Flower_', 8],
    ['Fern_', 4], ['Plant_', 4], ['Mushroom_', 2], ['Clover_', 4],
  ];
  const total = layers.reduce((a, [, w]) => a + w, 0);
  const byPrefix = (p) => Object.keys(models).filter((n) => n.startsWith(p));
  const count = +(q.get('count') ?? 600);
  // ponytail: pure random scatter, no overlap test; add Poisson-disc if trees intersect too often
  for (let i = 0; i < count; i++) {
    let pick = rnd() * total;
    const [prefix] = layers.find(([, w]) => (pick -= w) < 0);
    const pool = byPrefix(prefix);
    const m = models[pool[Math.floor(rnd() * pool.length)]].clone();
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * R;
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    m.rotation.y = rnd() * Math.PI * 2;
    m.scale.setScalar(0.8 + rnd() * 0.5);
    scene.add(m);
  }
  camera.position.set(0, 28, 70);
  controls.target.set(0, 4, 0);
}

controls.update();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
window.__ready = true;
