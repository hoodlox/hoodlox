// Checks tools/vault-withdraw.mjs on a local Robinhood Chain fork: a vault holding ETH and $HOODL (a
// live Pons token stands in) sweeps everything to a new address. usage: node tools/check-withdraw.mjs
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createPublicClient, createTestClient, createWalletClient, http, erc20Abi, parseEther, parseUnits, formatEther, formatUnits } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const TOKEN = '0xd1127a84ebce5765ec337141fbfe6407ca2eddce';
const HOLDER = '0x8366a39CC670B4001A1121B8F6A443A643e40951';
const RPC = 'http://127.0.0.1:8547';
const anvil = spawn(join(homedir(), '.foundry', 'bin', 'anvil'), ['--fork-url', 'https://robinhood-rpc.publicnode.com', '--port', '8547', '--silent'], { stdio: 'ignore' });
process.on('exit', () => anvil.kill());
const chain = { id: 4663, name: 'fork', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const test = createTestClient({ chain, mode: 'anvil', transport: http(RPC) });
for (let i = 0; ; i++) { try { await pub.getBlockNumber(); break; } catch { if (i > 60) throw new Error('anvil did not start'); await new Promise((r) => setTimeout(r, 500)); } }

const vaultKey = generatePrivateKey(), vault = privateKeyToAccount(vaultKey).address;
const dest = privateKeyToAccount(generatePrivateKey()).address;
await test.setBalance({ address: vault, value: parseEther('1') });
await test.setBalance({ address: HOLDER, value: parseEther('1') });
await test.impersonateAccount({ address: HOLDER });
const holder = createWalletClient({ account: HOLDER, chain, transport: http(RPC) });
await pub.waitForTransactionReceipt({ hash: await holder.writeContract({ address: TOKEN, abi: erc20Abi, functionName: 'transfer', args: [vault, parseUnits('3000000', 18)] }) });

const env = { ...process.env, VAULT_KEY: vaultKey, HOODL_TOKEN: TOKEN, RPC_URL: RPC, STOCK_TOKENS: '{}' };
const dry = execFileSync('node', ['tools/vault-withdraw.mjs', '--to', dest], { env, encoding: 'utf8' });
console.log(dry.trim());
assert.equal(await pub.getBalance({ address: dest }), 0n, 'a dry run sends nothing');

console.log(execFileSync('node', ['tools/vault-withdraw.mjs', '--to', dest, '--yes'], { env, encoding: 'utf8' }).trim());
const tok = (a) => pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [a] });
console.log(`dest: ${formatEther(await pub.getBalance({ address: dest }))} ETH, ${formatUnits(await tok(dest), 18)} HOODL; vault left ${formatEther(await pub.getBalance({ address: vault }))} ETH`);
assert.equal(await tok(dest), parseUnits('3000000', 18), 'all tokens moved');
assert.equal(await tok(vault), 0n);
assert.ok(await pub.getBalance({ address: dest }) > parseEther('0.99'), 'ETH moved, minus a little gas');
console.log('withdraw ok');
process.exit(0);
