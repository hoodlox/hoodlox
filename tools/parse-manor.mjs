// Turn Synty's Demo.unity (YAML) from the extracted unitypackage into public/manor/layout.json
// ([{ model, pos:[x,y,z], rot:[x,y,z,w], scale:[x,y,z] }] in Unity left-handed space) and
// public/manor/mats.json ({ matName: { tex, color, emissive, alpha } }) for the Three.js viewer.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = 'C:/Users/Galih Putra/assets-extract/manor-unity';
const OUT = 'public/manor';
const SCENE_GUID = 'bba5f2747095ec24cad421c97d1172f9'; // PolygonMapsDarkFantasyManor/Scenes/Demo.unity

const rows = readFileSync(`${SRC}/guidmap.tsv`, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split('\t'));
const guidPath = Object.fromEntries(rows.map(([g, p]) => [g, p]));
const base = (p) => p.split('/').pop().replace(/\.\w+$/, '');
const asset = (guid) => readFileSync(`${SRC}/${guid}/asset`, 'utf8');

// --- materials ---------------------------------------------------------------------------------
const mats = {};
for (const [guid, p] of rows) {
  if (!p.endsWith('.mat')) continue;
  const y = asset(guid);
  // Synty's shader graph names its slots _Albedo_Map/_Emission_Map; plain URP mats use _BaseMap/_MainTex.
  const tex = (keys) => keys.map((k) => y.match(new RegExp(`${k}:\\r?\\n\\s+m_Texture: \\{fileID: \\d+, guid: ([0-9a-f]+)`))?.[1]).find(Boolean);
  const texGuid = tex(['_Albedo_Map', '_BaseMap', '_MainTex']);
  const emGuid = tex(['_Emission_Map', '_EmissionMap']);
  const col = y.match(/- _Color: \{r: ([^,]+), g: ([^,]+), b: ([^,]+), a: ([^}]+)\}/) ?? y.match(/- _BaseColor: \{r: ([^,]+), g: ([^,]+), b: ([^,]+), a: ([^}]+)\}/);
  const surface = /RenderType: Transparent|_SURFACE_TYPE_TRANSPARENT/.test(y) ? 1 : 0;
  mats[base(p)] = {
    guid,
    tex: texGuid && guidPath[texGuid] ? guidPath[texGuid].split('/').pop() : null,
    emissive: emGuid && guidPath[emGuid] ? guidPath[emGuid].split('/').pop() : null,
    color: col ? [+col[1], +col[2], +col[3]] : [1, 1, 1],
    alpha: col ? +col[4] : 1,
    transparent: surface === 1,
  };
}
const matByGuid = Object.fromEntries(Object.entries(mats).map(([n, m]) => [m.guid, n]));

// Unity wraps long lines, so "guid: …,\n        type: 3}" must be tolerated everywhere a target appears.
const TARGET = 'target: \\{fileID: (-?\\d+), guid: [0-9a-f]+,\\s*type: \\d\\}';
const MAT_MODS = new RegExp(`${TARGET}\\n\\s+propertyPath: m_Materials\\.Array\\.data\\[(\\d+)\\]\\n\\s+value: ?\\n\\s+objectReference: \\{fileID: \\d+, guid: ([0-9a-f]+)`, 'g');
// Material slots from a YAML block: { rendererFileID: [matName|null, ...] }. Unknown guids (materials
// from packs not in this package) become null so the viewer can fall back.
function matSlots(y) {
  const out = {};
  for (const [, target, idx, mg] of y.matchAll(MAT_MODS)) (out[target] ??= [])[+idx] = matByGuid[mg] ?? null;
  return out;
}

// --- per-prefab default materials ------------------------------------------------------------
// FBX files import with no materials (materialImportMode 0); the prefab assigns them per renderer.
// Renderer fileIDs are name hashes we cannot invert, so take the first renderer's slots for the
// whole model. ponytail: wrong on the 3 multi-renderer prefabs, fix by hashing names if it shows.
const models = {};
for (const [guid, p] of rows) {
  if (!p.endsWith('.prefab')) continue;
  const slots = Object.values(matSlots(asset(guid)))[0];
  if (slots) models[base(p)] = slots;
}

// --- scene -------------------------------------------------------------------------------------
const yaml = asset(SCENE_GUID);
const blocks = yaml.split(/^--- /m).slice(1);
const transforms = {};          // fileID -> {pos, rot, scale, parent}
const strippedToInstance = {};  // stripped transform fileID -> owning PrefabInstance fileID
const instances = [];
let multiTarget = 0;

for (const b of blocks) {
  const head = b.match(/^!u!(\d+) &(\d+)( stripped)?/);
  if (!head) continue;
  const [, type, id, stripped] = head;
  if (type === '4' && stripped) strippedToInstance[id] = b.match(/m_PrefabInstance: \{fileID: (\d+)\}/)[1];
  if (type === '4' && !stripped) {
    const v = (k) => b.match(new RegExp(`${k}: \\{x: ([^,]+), y: ([^,]+), z: ([^,}]+)(?:, w: ([^}]+))?\\}`));
    const p = v('m_LocalPosition'), r = v('m_LocalRotation'), s = v('m_LocalScale');
    transforms[id] = { pos: [+p[1], +p[2], +p[3]], rot: [+r[1], +r[2], +r[3], +r[4]], scale: [+s[1], +s[2], +s[3]], parent: b.match(/m_Father: \{fileID: (\d+)\}/)[1] };
  }
  if (type === '1001') {
    const guid = b.match(/m_SourcePrefab: \{fileID: \d+, guid: ([0-9a-f]+)/)?.[1];
    const model = guidPath[guid] ? base(guidPath[guid]) : null;
    // Transform mods may target several transforms (prefab children); the root is the first target
    // that carries a position mod.
    const targets = [...new Set([...b.matchAll(new RegExp(`${TARGET}\\n\\s+propertyPath: m_LocalPosition\\.x`, 'g'))].map((m) => m[1]))];
    if (targets.length > 1) multiTarget++;
    const rootT = targets[0];
    const mod = (k, d) => {
      const m = b.match(new RegExp(`target: \\{fileID: ${rootT}, guid: [0-9a-f]+,\\s*type: \\d\\}\\n\\s+propertyPath: ${k}\\n\\s+value: ([-.0-9e]+)`));
      return m ? +m[1] : d;
    };
    // Per-instance material overrides (wallpaper variants etc.), first renderer only, see models above.
    const slots = Object.values(matSlots(b))[0];
    instances.push({
      id, model, guid,
      parent: b.match(/m_TransformParent: \{fileID: (\d+)\}/)[1],
      pos: [mod('m_LocalPosition.x', 0), mod('m_LocalPosition.y', 0), mod('m_LocalPosition.z', 0)],
      rot: [mod('m_LocalRotation.x', 0), mod('m_LocalRotation.y', 0), mod('m_LocalRotation.z', 0), mod('m_LocalRotation.w', 1)],
      scale: [mod('m_LocalScale.x', 1), mod('m_LocalScale.y', 1), mod('m_LocalScale.z', 1)],
      slots,
    });
  }
}

const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q, v) => {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
};
const instanceById = Object.fromEntries(instances.map((i) => [i.id, i]));
const parentOf = (pid) => transforms[pid] ?? instanceById[strippedToInstance[pid]];
function toWorld(local, parentId) {
  let { pos, rot, scale } = local;
  let pid = parentId, missing = false;
  while (pid && pid !== '0') {
    const t = parentOf(pid);
    if (!t) { missing = true; break; }
    pos = qrot(t.rot, pos.map((c, i) => c * t.scale[i])).map((c, i) => c + t.pos[i]);
    rot = qmul(t.rot, rot);
    scale = scale.map((c, i) => c * t.scale[i]);
    pid = t.parent;
  }
  return { pos, rot, scale, missing };
}

// Prefab variants wrap another prefab or the FBX; the model file is the FBX with the same name as the
// prefab. Anything without such an FBX (FX, characters) is skipped.
const hasFbx = (m) => existsSync(`${OUT}/models/${m}.fbx`);
let missingParents = 0, noModel = 0;
const skipped = {};
const layout = instances.map((i) => {
  if (!i.model || !hasFbx(i.model)) { noModel++; skipped[i.model] = (skipped[i.model] ?? 0) + 1; return null; }
  const { missing, ...w } = toWorld(i, i.parent);
  if (missing) missingParents++;
  return { model: i.model, ...w, slots: i.slots };
}).filter(Boolean);

writeFileSync(`${OUT}/layout.json`, JSON.stringify(layout));
writeFileSync(`${OUT}/mats.json`, JSON.stringify(mats));
writeFileSync(`${OUT}/models.json`, JSON.stringify(models));
const slotNames = Object.values(models).flat().concat(layout.flatMap((l) => l.slots ?? []));
console.log(`models with slots=${Object.keys(models).length} slot refs=${slotNames.length} unresolved=${slotNames.filter((s) => s === null).length}`);
console.log(`instances=${instances.length} placed=${layout.length} noModel=${noModel} missingParents=${missingParents} multiTarget=${multiTarget} mats=${Object.keys(mats).length}`);
console.log('models used:', new Set(layout.map((l) => l.model)).size);
console.log('skipped:', Object.entries(skipped).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([m, n]) => `${m}×${n}`).join(', '));
const xs = layout.map((l) => l.pos[0]), zs = layout.map((l) => l.pos[2]), ys = layout.map((l) => l.pos[1]);
console.log('bounds x', Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1), 'y', Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1), 'z', Math.min(...zs).toFixed(1), Math.max(...zs).toFixed(1));
console.log('mats with tex:', Object.values(mats).filter((m) => m.tex).length, 'sample:', Object.entries(mats).slice(0, 5).map(([n, m]) => `${n}->${m.tex}`).join(' | '));
