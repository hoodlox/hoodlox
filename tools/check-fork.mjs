// Real-money path on a local fork of Robinhood Chain (Foundry's anvil), calling the API router
// in-process with a live vault:
//  1. a fresh player signs in (EIP-191) and creates a hunter,
//  2. buys the pickaxe with a real $HOODL transfer; the server verifies it on-chain and the same hash
//     cannot be reused,
//  3. digs and opens chests until it holds a reward, redeems, and the ETH/$HOODL lands in the wallet.
// $HOODL is played by HIRED (a live Pons token), funded by impersonating its largest holder.
// usage: node tools/check-fork.mjs   (FORK_RPC= to fork from another node)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, createWalletClient, createTestClient, http, erc20Abi, parseEther, parseUnits, formatEther, formatUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const HOODL = '0xd1127a84ebce5765ec337141fbfe6407ca2eddce';
const HOLDER = '0x8366a39CC670B4001A1121B8F6A443A643e40951'; // HIRED's largest holder (Pons reserve)
const RPC = 'http://127.0.0.1:8546';
const FORK = process.env.FORK_RPC ?? 'https://robinhood-rpc.publicnode.com';

const anvil = spawn(join(homedir(), '.foundry', 'bin', 'anvil'), ['--fork-url', FORK, '--port', '8546', '--silent'], { stdio: 'ignore' });
const stop = () => anvil.kill();
process.on('exit', stop);
const chain = { id: 4663, name: 'fork', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
for (let i = 0; ; i++) {
  try { await pub.getBlockNumber(); break; } catch { if (i > 60) throw new Error('anvil did not start'); await new Promise((r) => setTimeout(r, 500)); }
}

// Random keys: anvil's default accounts carry an EIP-7702 sweeper on Robinhood Chain mainnet.
const vaultKey = generatePrivateKey(), playerKey = generatePrivateKey();
const vault = privateKeyToAccount(vaultKey), player = privateKeyToAccount(playerKey), stranger = privateKeyToAccount(generatePrivateKey());
for (const a of [vault.address, player.address, stranger.address, HOLDER]) await test.setBalance({ address: a, value: parseEther('1') });
await test.impersonateAccount({ address: HOLDER });
const holder = createWalletClient({ account: HOLDER, chain, transport: http(RPC) });
Object.assign(process.env, {
  RPC_URL: RPC, VAULT_KEY: vaultKey, HOODL_TOKEN: HOODL, HOODL_MIN_HOLD: '1000000', POOL_ETH: '5', POOL_USDG: '3', POOL_HOODL: '2000000', POOL_STOCK_USD: '0',
  PGLITE_DIR: mkdtempSync(join(tmpdir(), 'th-fork-')), ALLOW_TEST_KNOBS: '1',
});

// USDG first, while the fork's block is fresh: the public RPC only serves recent blocks, so storage the
// USDG proxy has not touched yet cannot be read a minute into the run. The same holder has USDG
// (6 decimals): 10 into the vault, then one 1.25 USDG redeem item to the player.
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const usdgOf = (a) => pub.readContract({ address: USDG, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
for (const [to, n] of [[player.address, '5000000'], [vault.address, '5000000'], [stranger.address, '2000000']]) {
  await pub.waitForTransactionReceipt({ hash: await holder.writeContract({ address: HOODL, abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(n, 18)] }) });
}
await pub.waitForTransactionReceipt({ hash: await holder.writeContract({ address: USDG, abi: erc20Abi, functionName: 'transfer', args: [vault.address, parseUnits('10', 6)] }) });
const usdgBefore = await usdgOf(player.address);
const { sendPayout } = await import('../server/chain.js');
await sendPayout(player.address, { asset: 'USDG', amount: 1.25 });
assert.equal(await usdgOf(player.address) - usdgBefore, 1_250_000n, 'USDG payout sends 1.25 USDG');
console.log('USDG payout ok');

// A demo-era balance left in the database must be wiped when the game first runs live.
const { q } = await import('../server/db.js');
await q(`insert into balances (player, asset, amount) values ('0xDemo', 'ETH', 3)`);
const { handle } = await import('../server/routes.js');
const FAST = { 'x-fastdig': '30' };
async function call(path, { token, body } = {}) {
  const { status, body: out } = await handle({ method: body ? 'POST' : 'GET', path, body, headers: { ...FAST, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return { status, ...out };
}
const hunt = async () => Number(formatUnits(await pub.readContract({ address: HOODL, abi: erc20Abi, functionName: 'balanceOf', args: [player.address] }), 18));
const eth = async () => Number(formatEther(await pub.getBalance({ address: player.address })));

const cfg = await call('/api/config');
assert.equal(cfg.demo, false);
assert.equal(cfg.vault, vault.address);
assert.equal((await q('select count(*)::int as n from balances'))[0].n, 0, 'going live clears demo balances');
// POOL_ETH asks for 5 ETH an epoch; the vault holds 1, so the epoch gets what it can cover.
const ethPool = (await call('/api/epoch')).pool.find((p) => p.asset === 'ETH').funded;
console.log('epoch ETH pool (asked 5, vault holds 1):', ethPool);
assert.ok(ethPool > 0.99 && ethPool <= 0.998, 'pool is capped to the vault minus gas');
assert.equal((await call('/api/epoch')).pool.find((p) => p.asset === 'USDG').funded, 3, 'USDG pool funded from the vault (8.75 left, asked 3)');

// 1. Enter with the address only. Holders get in; an empty wallet and the vault itself do not.
const nobody = privateKeyToAccount(generatePrivateKey()).address;
assert.equal((await call('/api/auth/address', { body: { address: nobody } })).status, 403, 'non-holders cannot hunt');
assert.equal((await call('/api/auth/address', { body: { address: vault.address } })).status, 400, 'the vault is not a player');
const login = await call('/api/auth/address', { body: { address: player.address.toLowerCase() } });
assert.equal(login.status, 200, login.error);
const token = login.token;
let me = (await call('/api/player', { token, body: { name: `Fk${Date.now().toString(36).slice(-6)}`, hero: 'Ranger' } })).me;
console.log('hunter', me.name, '$HOODL on-chain', me.tokens);
assert.equal(me.tokens, 5_000_000);

// 2. Buy the pickaxe: the holder sends the $HOODL from their own wallet app and pastes the hash.
const { pay } = await call('/api/shop/tx', { token, body: { tool: 'pickaxe' } });
assert.deepEqual([pay.from, pay.to, pay.amount], [player.address, vault.address, 1_000_000]);
const send = (account) => createWalletClient({ account, chain, transport: http(RPC) })
  .writeContract({ address: HOODL, abi: erc20Abi, functionName: 'transfer', args: [pay.to, parseUnits(String(pay.amount), 18)] });
// Someone who typed this address pays from their own wallet: that does not unlock anything here.
const foreign = await send(stranger);
await pub.waitForTransactionReceipt({ hash: foreign });
assert.equal((await call('/api/shop/buy', { token, body: { tool: 'pickaxe', hash: foreign } })).status, 402, 'payment must come from the hunter address');
const hash = await send(player);
await pub.waitForTransactionReceipt({ hash });
const bought = await call('/api/shop/buy', { token, body: { tool: 'pickaxe', hash } });
assert.equal(bought.status, 200, bought.error);
assert.ok(bought.me.tools.includes('pickaxe'));
assert.ok((await call('/api/shop/buy', { token, body: { tool: 'drill', hash } })).status >= 400, 'a payment buys one tool only');
for (const bad of ['0x1234', `0x${'ab'.repeat(32)}`]) {
  assert.equal((await call('/api/shop/buy', { token, body: { tool: 'drill', hash: bad } })).status, 402, 'a malformed or unknown hash buys nothing');
}
console.log('pickaxe paid', hash);
me = bought.me;

// 3. Dig until a reward is held, then redeem.
const ethBefore = await eth(), huntBefore = await hunt();
for (let round = 0; round < 8 && !Object.keys(me.balances).some((a) => me.payable[a]); round++) {
  const ep = await call('/api/epoch');
  const sync = await call('/api/sync', { token, body: { x: 0, z: 0 } });
  const crate = ep.crates.find((c) => !sync.dug.includes(c.i) && !sync.claims[c.i]);
  await call('/api/sync', { token, body: { x: crate.x, z: crate.z } });
  const st = await call('/api/dig/start', { token, body: { epoch: ep.epoch, i: crate.i } });
  assert.equal(st.status, 200, st.error);
  await new Promise((r) => setTimeout(r, st.seconds * 1000 + 300));
  const fin = await call('/api/dig/finish', { token, body: { epoch: ep.epoch, i: crate.i } });
  assert.equal(fin.status, 200, fin.error);
  const open = await call('/api/chest/open', { token, body: { id: fin.chest.id } });
  console.log('chest', fin.chest.rarity, '->', open.reward);
  me = open.me;
}
const red = await call('/api/redeem', { token, body: {} });
console.log('redeem', red.status, red.payout ?? red.error);
assert.equal(red.status, 200, red.error);
assert.equal(red.payout.status, 'sent');
const claimed = red.me.claimed.map((c) => `${c.items[0].asset} ${c.status} ${c.signature}`);
console.log(claimed.join('\n'));
const ethAfter = await eth(), huntAfter = await hunt();
console.log(`player ETH ${ethBefore} -> ${ethAfter}, $HOODL ${huntBefore} -> ${huntAfter}`);
assert.ok(ethAfter > ethBefore || huntAfter > huntBefore, 'redeem should land in the wallet');
assert.equal((await call('/api/redeem', { token, body: {} })).status, 400, 'nothing left to redeem twice');
console.log('fork ok');
process.exit(0);
