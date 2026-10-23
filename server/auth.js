// Sessions. A holder types their wallet address (no wallet connection, no signature) and gets an
// HMAC-signed token. The address is only ever paid, never charged: redeems go to it and tool purchases
// must come from it on-chain, so typing someone else's address can only send that person rewards.
// Guests get a token without an address and can only look.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { checksum } from './chain.js';

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

// The checksummed player id for a typed address, or throws.
export function addressId(address) {
  const addr = checksum(String(address ?? '').trim());
  if (!addr || /^0x0{40}$/i.test(addr)) throw Object.assign(new Error('Enter your wallet address: 0x followed by 40 letters and numbers.'), { status: 400 });
  return addr;
}

export const guestId = () => `guest:${randomBytes(9).toString('base64url')}`;
export const isGuest = (id) => id.startsWith('guest:');
