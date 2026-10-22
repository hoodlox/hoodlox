// Dev withdraw / migration: moves what the vault holds to another address. Nothing in the game locks
// the vault; this just does it in one go instead of by hand.
//
//   VAULT_KEY=0x… HOODL_TOKEN=0x… node tools/vault-withdraw.mjs --to 0xNew            (dry run: shows balances)
//   VAULT_KEY=0x… HOODL_TOKEN=0x… node tools/vault-withdraw.mjs --to 0xNew --yes      (sends everything)
//   … --asset ETH --amount 0.5 --yes                                                   (one asset, part of it)
//
// ETH keeps a little behind for the gas of the token transfers. RPC_URL / CHAIN_ID / STOCK_TOKENS as
// in server/config.js. After a full sweep, redeems fail (and stay pending) until the new vault is set.
import { createPublicClient, createWalletClient, http, defineChain, erc20Abi, formatUnits, parseUnits, isAddress, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const to = opt('to'), onlyAsset = opt('asset'), partial = opt('amount'), send = args.includes('--yes');
if (!process.env.VAULT_KEY) throw new Error('Set VAULT_KEY (the vault private key).');
if (!to || !isAddress(to)) throw new Error('Give --to <address>.');

const rpc = process.env.RPC_URL ?? 'https://robinhood-rpc.publicnode.com';
const chain = defineChain({ id: Number(process.env.CHAIN_ID ?? 4663), name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const account = privateKeyToAccount(process.env.VAULT_KEY.trim().replace(/^(0x)?/, '0x'));
const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

const STOCKS = { TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', SPY: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C' };
const tokens = { ...(process.env.HOODL_TOKEN ? { HOODL: process.env.HOODL_TOKEN } : {}), ...(process.env.STOCK_TOKENS ? JSON.parse(process.env.STOCK_TOKENS) : STOCKS) };

console.log(`vault ${account.address} → ${getAddress(to)}  (${send ? 'SENDING' : 'dry run, add --yes to send'})`);
const plan = [];
for (const [asset, token] of Object.entries(tokens)) {
  if (onlyAsset && onlyAsset !== asset) continue;
  const [raw, dec] = await Promise.all([
    pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] }),
    pub.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const amt = partial ? parseUnits(partial, dec) : raw;
  console.log(`  ${asset.padEnd(6)} ${formatUnits(raw, dec)}${partial ? `  (sending ${partial})` : ''}`);
  if (amt > 0n && amt <= raw) plan.push({ asset, token, amt, dec });
}
if (!onlyAsset || onlyAsset === 'ETH') {
  const bal = await pub.getBalance({ address: account.address });
  const reserve = parseUnits('0.0005', 18) * BigInt(plan.length + 1); // gas for the token transfers and this one
  const amt = partial && onlyAsset === 'ETH' ? parseUnits(partial, 18) : bal > reserve ? bal - reserve : 0n;
  console.log(`  ETH    ${formatUnits(bal, 18)}  (sending ${formatUnits(amt, 18)}, keeping gas)`);
  if (amt > 0n) plan.push({ asset: 'ETH', amt, dec: 18 });
}
for (const p of send ? plan : []) { // tokens first, ETH last so gas is there for every transfer
  const hash = p.asset === 'ETH'
    ? await wallet.sendTransaction({ to, value: p.amt })
    : await wallet.writeContract({ address: p.token, abi: erc20Abi, functionName: 'transfer', args: [to, p.amt] });
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`  sent ${formatUnits(p.amt, p.dec)} ${p.asset}: ${r.status} ${hash}`);
}
