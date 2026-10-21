// Epochs on the server: each buries 20–30 crates with rarities split by the drop odds (rarities never
// reach the browser), a dug crate stays gone, and at rollover every leftover crate is cleared and a
// new set is buried. Uses 60-second epochs via the dev-only x-epochsec header.
// usage: node tools/check-epoch.mjs
import assert from 'node:assert/strict';
import { apiSignIn } from './wallet.mjs';
import { rarityMix, seeded } from '../src/game.js';

const BASE = 'http://localhost:5173';
const H = { 'x-epochsec': '60', 'x-fastdig': '60' };
const get = async (path) => (await fetch(BASE + path, { headers: H })).json();

for (const n of [20, 25, 30]) {
  const c = {};
  for (const r of rarityMix(n, seeded(n))) c[r] = (c[r] ?? 0) + 1;
  assert.ok(c.common > c.uncommon && c.uncommon > c.rare, `rarer crates must be fewer (${JSON.stringify(c)})`);
}

const s = await apiSignIn(BASE);
const post = async (path, body) => (await fetch(BASE + path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', authorization: `Bearer ${s.token}`, ...H } })).json();
await post('/api/player', { name: `Ep${Date.now().toString(36).slice(-6)}`, hero: 'Ranger' });

// Start right after a rollover so the dig cannot straddle one.
let ep = await get('/api/epoch');
await new Promise((r) => setTimeout(r, ep.endsAt - Date.now() + 300));
const a = await get('/api/epoch');
console.log('epoch', a.epoch, 'crates', a.crates.length);
assert.ok(a.crates.length >= 20 && a.crates.length <= 30);
assert.ok(a.crates.every((c) => !('rarity' in c)), 'rarities stay on the server');

const crate = a.crates[0];
await post('/api/sync', { x: crate.x, z: crate.z });
const st = await post('/api/dig/start', { epoch: a.epoch, i: crate.i });
assert.ok(st.seconds, st.error);
await new Promise((r) => setTimeout(r, st.seconds * 1000 + 300));
const fin = await post('/api/dig/finish', { epoch: a.epoch, i: crate.i });
assert.ok(fin.chest, fin.error);
const sync = await post('/api/sync', { x: crate.x, z: crate.z });
assert.ok(sync.dug.includes(crate.i), 'a dug crate stays gone');

// Rollover: a different, full set; the old crate cannot be dug any more.
await new Promise((r) => setTimeout(r, a.endsAt - Date.now() + 300));
const b = await get('/api/epoch');
const after = await post('/api/sync', { x: crate.x, z: crate.z });
console.log('new epoch', b.epoch, 'crates', b.crates.length, 'dug', after.dug.length);
assert.equal(b.epoch, a.epoch + 1);
assert.equal(after.dug.length, 0, 'the new epoch starts full');
assert.notDeepEqual(b.crates.map((c) => c.x), a.crates.map((c) => c.x), 'crates move each epoch');
const stale = await post('/api/dig/start', { epoch: a.epoch, i: 1 });
assert.match(stale.error ?? '', /ended/, 'leftover crates of the old epoch are gone');
console.log('epoch ok');
