// Lists every .gltf in public/kit/<kit> into public/kit/<kit>/manifest.json so the viewer can load them.
// usage: node tools/manifest.mjs [kit=medieval]
import { readdirSync, writeFileSync } from 'node:fs';

const kit = process.argv[2] ?? 'medieval';
const dir = `public/kit/${kit}`;
// Keeps the extension so the viewer can pick the loader (.gltf or .fbx).
const names = readdirSync(dir).filter((f) => /\.(gltf|fbx)$/i.test(f)).sort();
writeFileSync(`${dir}/manifest.json`, JSON.stringify(names));
console.log(kit, names.length, 'models');
