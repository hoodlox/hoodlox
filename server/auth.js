// Sessions. A wallet signs a one-time message (EIP-191, no transaction, no fee); the server recovers
// the signer and issues an HMAC-signed token. Guests get a token without a wallet and can only look.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { verifyMessage } from 'viem';
import { config } from './config.js';
import { checksum } from './chain.js';
import { q, one } from './db.js';

const b64 = (s) => Buffer.from(s).toString('base64url');
const mac = (s) => createHmac('sha256', config.sessionSecret).update(s).digest('base64url');
const DAY = 86400_000;

export function issue(id) {
  const body = b64(JSON.stringify({ id, exp: Date.now() + 14 * DAY }));
  return `${body}.${mac(body)}`;
}
// Player id from "Authorization: Bearer <token>", or null.
export function verify(header) {
  const token = header?.replace(/^Bearer /, '') ?? '';
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const { id, exp } = JSON.parse(Buffer.from(body, 'base64url').toString());
  return exp > Date.now() ? id : null;
}

export const loginMessage = (nonce) => `Sign in to Hoodlox.\n\nThis only proves you own this wallet. It costs nothing and sends no transaction.\n\nNonce: ${nonce}`;

export async function newNonce() {
  const nonce = randomBytes(16).toString('hex');
  await q('delete from nonces where created_at < now() - interval \'10 minutes\'');
  await q('insert into nonces (nonce) values ($1)', [nonce]);
  return { nonce, message: loginMessage(nonce) };
}

// Checks the signed nonce (single use) and returns the checksummed wallet address, or throws.
export async function login(address, signature, nonce) {
  const used = await one('delete from nonces where nonce = $1 and created_at > now() - interval \'10 minutes\' returning nonce', [nonce]);
  if (!used) throw Object.assign(new Error('Sign-in expired, try again.'), { status: 401 });
  const addr = checksum(address);
  const ok = addr && /^0x[0-9a-fA-F]+$/.test(signature)
    && await verifyMessage({ address: addr, message: loginMessage(nonce), signature }).catch(() => false);
  if (!ok) throw Object.assign(new Error('Signature does not match this wallet.'), { status: 401 });
  return addr;
}

export const guestId = () => `guest:${randomBytes(9).toString('base64url')}`;
export const isGuest = (id) => id.startsWith('guest:');
