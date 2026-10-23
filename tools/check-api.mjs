// End-to-end API check without a browser: sign in with a fresh wallet keypair, create a hunter, read
// the epoch, walk to a crate, dig it (fast), open the chest, buy a tool in demo mode, try to redeem,
// read the leaderboard. Also checks the anti-cheat rules: guests cannot dig, a claimed crate cannot be
// taken, a dig cannot finish early, a chest cannot be opened twice.
// usage: node tools/check-api.mjs   (dev server running)
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const BASE = process.env.BASE ?? 'http://localhost:5173';
async function call(path, { token, body, method = body ? 'POST' : 'GET', headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: res.status, ...(await res.json()) };
}
// Holders enter with a typed address: no wallet connection, no signature.
const signIn = (kp) => call('/api/auth/address', { body: { address: kp.address.toLowerCase() } });
const FAST = { 'x-fastdig': '30' };

const kp = privateKeyToAccount(generatePrivateKey()), rival = privateKeyToAccount(generatePrivateKey());
const a = await signIn(kp);
assert.equal(a.status, 200, a.error);
assert.equal(a.me, null, 'a new wallet has no hunter yet');
const name = `T${Date.now().toString(36).slice(-6)}`;
const created = await call('/api/player', { token: a.token, body: { name, hero: 'Mage' } });
assert.equal(created.status, 200, created.error);
assert.equal((await call('/api/player', { token: (await signIn(rival)).token, body: { name, hero: 'Knight' } })).status, 409, 'names are unique');
const r = await signIn(rival);
await call('/api/player', { token: r.token, body: { name: `${name}r`, hero: 'Knight' } });

// Malformed addresses are refused; the same address brings back the same hunter.
for (const address of ['', '0x123', 'hello', `0x${'0'.repeat(40)}`]) assert.equal((await call('/api/auth/address', { body: { address } })).status, 400, `refuses "${address}"`);
assert.equal(a.me === null && (await call('/api/me', { token: a.token })).me.id, kp.address, 'id is the checksummed address');
assert.equal((await signIn(kp)).me.name, name, 'entering again with the address returns the hunter');

const ep = await call('/api/epoch');
console.log('epoch', ep.epoch, 'crates', ep.crates.length, 'pool', ep.pool.map((p) => `${p.asset} ${p.funded}`).join(', '));
assert.ok(ep.crates.length >= 20 && ep.crates.length <= 30);
assert.ok(ep.crates.every((c) => !('rarity' in c)), 'rarity must stay secret');

// Pick a crate nobody has dug, walk there.
let sync = await call('/api/sync', { token: a.token, body: { x: 0, z: 0 } });
const crate = ep.crates.find((c) => !sync.dug.includes(c.i) && !sync.claims[c.i]);
await call('/api/sync', { token: a.token, body: { x: crate.x + 100, z: crate.z, anim: 'walk', dd: 500, ds: 1 } });
await call('/api/sync', { token: r.token, body: { x: crate.x - 100, z: crate.z } });

const guest = await call('/api/auth/guest', { body: {} });
await call('/api/player', { token: guest.token, body: { name: `${name}g`, hero: 'Rogue' } });
assert.equal((await call('/api/dig/start', { token: guest.token, body: { epoch: ep.epoch, i: crate.i } })).status, 403, 'guests cannot dig');

const start = await call('/api/dig/start', { token: a.token, headers: FAST, body: { epoch: ep.epoch, i: crate.i } });
assert.equal(start.status, 200, start.error);
assert.equal((await call('/api/dig/start', { token: r.token, headers: FAST, body: { epoch: ep.epoch, i: crate.i } })).status, 409, 'claimed crate is locked');
sync = await call('/api/sync', { token: r.token, body: { x: crate.x - 100, z: crate.z } });
assert.equal(sync.claims[crate.i], name, 'others see who is digging');
assert.ok(sync.players.some((p) => p.name === name), 'others see me on the map');
assert.equal((await call('/api/dig/finish', { token: a.token, body: { epoch: ep.epoch, i: crate.i } })).status, 409, 'cannot finish early');

await new Promise((res) => setTimeout(res, start.seconds * 1000 + 300));
const fin = await call('/api/dig/finish', { token: a.token, body: { epoch: ep.epoch, i: crate.i } });
assert.equal(fin.status, 200, fin.error);
console.log('dug', fin.chest);
assert.equal(fin.me.treasures, 1);
assert.equal((await call('/api/dig/finish', { token: a.token, body: { epoch: ep.epoch, i: crate.i } })).status, 409, 'cannot dig twice');

const open = await call('/api/chest/open', { token: a.token, body: { id: fin.chest.id } });
assert.equal(open.status, 200, open.error);
console.log('reward', open.reward);
assert.ok(open.reward && open.reward.amount > 0 && open.me.profit > 0);
assert.equal((await call('/api/chest/open', { token: a.token, body: { id: fin.chest.id } })).status, 404, 'chest opens once');
assert.equal((await call('/api/chest/open', { token: r.token, body: { id: fin.chest.id } })).status, 404, 'only the owner opens it');

const before = open.me.tokens;
const buy = await call('/api/shop/buy', { token: a.token, body: { tool: 'pickaxe' } });
assert.equal(buy.status, 200, buy.error);
assert.equal(before - buy.me.tokens, 1_000_000, 'demo pickaxe costs 0.1% of supply');
assert.equal(buy.me.equipped, 'pickaxe');
assert.equal((await call('/api/shop/buy', { token: a.token, body: { tool: 'pickaxe' } })).status, 409, 'no double purchase');

const red = await call('/api/redeem', { token: a.token, body: {} });
console.log('redeem without vault:', red.status, red.error);
assert.equal(red.status, 400);

const board = await call('/api/leaderboard', { token: a.token });
assert.ok(board.top.some((p) => p.me && p.name === name));
assert.ok(!board.top.some((p) => p.name === `${name}g`), 'guests are not ranked');
console.log('api ok');
