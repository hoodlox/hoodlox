// Prints the node tree, meshes, materials, animation clips and bounds of an FBX via the running dev server.
// usage: node tools/probe-fbx.mjs scenes/characters/Foo.fbx
import { chromium } from 'playwright';

const [file] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log(m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:5173/map.html?scene=none');
await page.evaluate(async (file) => {
  // Bare specifiers don't resolve from page.evaluate, so go through Vite's node_modules paths.
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { FBXLoader } = await import('/node_modules/three/examples/jsm/loaders/FBXLoader.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  let g;
  if (/\.gl(b|tf)$/i.test(file)) { const r = await new GLTFLoader().loadAsync(`/${file}`); g = r.scene; g.animations = r.animations; }
  else g = await new FBXLoader().loadAsync(`/${file}`);
  const b = new THREE.Box3().setFromObject(g);
  console.log('bounds', b.min.toArray().map((v) => v.toFixed(1)).join(','), b.max.toArray().map((v) => v.toFixed(1)).join(','));
  console.log('animations', g.animations.map((a) => `${a.name} (${a.duration.toFixed(2)}s, ${a.tracks.length} tracks)`).join(' | ') || 'none');
  g.traverse((o) => {
    const mats = o.isMesh ? [].concat(o.material).map((m) => `${m.name}${m.map ? '[map:' + (m.map.image?.src?.split('/').pop() ?? m.map.name) + ']' : ''}`).join(',') : '';
    const skin = o.isSkinnedMesh ? ` skinned bones=${o.skeleton.bones.length}` : '';
    const box = o.isMesh ? ' size=' + new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray().map((v) => v.toFixed(0)).join('x') : '';
    console.log(`${'  '.repeat(o.parent ? 1 : 0)}${o.type} ${o.name}${skin}${box} ${mats}`);
  });
}, file);
await browser.close();
