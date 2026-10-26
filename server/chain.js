// Everything that touches Robinhood Chain: the vault key, $HOODL holdings, verifying tool purchases and
// sending redeems. ETH is native; $HOODL and the stock tokens are plain ERC-20s.
import {
  createPublicClient, createWalletClient, defineChain, http, getAddress, isAddress, isHash, keccak256,
  encodeFunctionData, erc20Abi, parseEventLogs, parseUnits, formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from './config.js';
import { TOKEN } from '../src/game.js';

export const chain = defineChain({
  id: config.chainId,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

let pub;
export const client = () => (pub ??= createPublicClient({ chain, transport: http(config.rpcUrl, { timeout: 20_000, retryCount: 2 }) }));

let vault;
export function vaultAccount() {
  if (!config.vaultKey) return null;
  vault ??= privateKeyToAccount(config.vaultKey.trim().replace(/^(0x)?/, '0x'));
  return vault;
}

export const tokenOf = (asset) => (asset === TOKEN ? config.hoodlToken : asset === 'USDG' ? config.usdgToken : config.stockTokens[asset] ?? null);
// Assets the vault can actually pay out right now.
export const payable = (asset) => !!vaultAccount() && (asset === 'ETH' || !!tokenOf(asset));
export const checksum = (a) => (isAddress(a) ? getAddress(a) : null);

// What the vault holds of one asset right now (ui units).
export async function vaultHolds(asset) {
  const v = vaultAccount().address;
  return asset === 'ETH' ? Number(formatUnits(await client().getBalance({ address: v }), 18)) : holding(v, tokenOf(asset));
}

const decimals = new Map();
async function decimalsOf(token) {
  if (!decimals.has(token)) decimals.set(token, await client().readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }));
  return decimals.get(token);
}
const units = async (token, ui) => parseUnits(String(ui), await decimalsOf(token));

// A wallet's balance of one token (ui units).
export async function holding(owner, token) {
  const raw = await client().readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
  return Number(formatUnits(raw, await decimalsOf(token)));
}

// True when `hash` is a successful transaction carrying at least amountUi $HOODL from `player` to the
// vault. Replays are stopped by the purchases table (the hash is its primary key).
export async function verifyPurchase(hash, player, amountUi) {
  if (!isHash(hash)) return false;
  const receipt = await client().getTransactionReceipt({ hash }).catch(() => null);
  if (receipt?.status !== 'success') return false;
  const need = await units(config.hoodlToken, amountUi);
  const vaultAddr = vaultAccount().address.toLowerCase();
  return parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs }).some((l) =>
    l.address.toLowerCase() === config.hoodlToken.toLowerCase()
    && l.args.from.toLowerCase() === player.toLowerCase()
    && l.args.to.toLowerCase() === vaultAddr
    && l.args.value >= need);
}

// Send one redeem item to `to`. `onSigned(hash)` runs before the broadcast so the caller can record it
// (a retry then checks it instead of paying twice). Returns the hash once the transfer succeeded.
export async function sendPayout(to, { asset, amount }, onSigned = async () => {}) {
  const account = vaultAccount();
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
  const call = asset === 'ETH'
    ? { to, value: parseUnits(String(amount), 18) }
    : { to: tokenOf(asset), data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, await units(tokenOf(asset), amount)] }) };
  const request = await wallet.prepareTransactionRequest({ account, ...call });
  const raw = await wallet.signTransaction(request);
  const hash = keccak256(raw);
  await onSigned(hash);
  await client().sendRawTransaction({ serializedTransaction: raw });
  const receipt = await client().waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== 'success') throw new Error(`payout reverted: ${hash}`);
  return hash;
}

// Fate of an earlier payout hash: 'sent', 'pending' (node still has it), or 'dropped' (safe to resend:
// it never landed, or it reverted and moved nothing).
// ponytail: a dropped raw tx could in theory be rebroadcast later; reuse its nonce on resend if that ever matters.
export async function payoutState(hash) {
  const receipt = await client().getTransactionReceipt({ hash }).catch(() => null);
  if (receipt) return receipt.status === 'success' ? 'sent' : 'dropped';
  return (await client().getTransaction({ hash }).catch(() => null)) ? 'pending' : 'dropped';
}
