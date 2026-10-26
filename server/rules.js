// Game rules on the server: epochs, where each epoch's crates lie and what is inside them, and how an
// opened chest is paid out of that epoch's pool. Rarities come from a secret salt, so the browser
// learns a crate's rarity only once it is dug.
import { createHash, randomInt } from 'node:crypto';
import { seeded, rarityMix, CRATES_MIN, CRATES_MAX, RARITIES, TOKEN } from '../src/game.js';
import { config, spots } from './config.js';
import { priceUsd } from './prices.js';

// Epochs count from the season start, so the first epoch is #1.
const GENESIS = Date.UTC(2026, 9, 20) / 1000; // season 0
export const epochOf = (secs = config.epochSeconds, now = Date.now()) => Math.floor((now / 1000 - GENESIS) / secs) + 1;
export const epochEndsAt = (n, secs = config.epochSeconds) => (GENESIS + n * secs) * 1000;

const saltSeed = (n) => createHash('sha256').update(`${config.crateSalt}:${n}`).digest().readUInt32LE(0);
// Value weight of each rarity: a legendary is worth 40 commons.
export const TIER = { common: 1, uncommon: 2.5, rare: 6, epic: 15, legendary: 40 };

const layouts = new Map();
// Crates for epoch n: 20–30 spots at least ~25 m apart, each with a rarity split by the drop odds.
export function layout(n) {
  if (layouts.has(n)) return layouts.get(n);
  const rnd = seeded(saltSeed(n));
  const count = CRATES_MIN + Math.floor(rnd() * (CRATES_MAX - CRATES_MIN + 1));
  const mix = rarityMix(count, rnd);
  const picked = [];
  for (let tries = 0; picked.length < count && tries < 5000; tries++) {
    const [x, z] = spots[Math.floor(rnd() * spots.length)];
    if (picked.every((p) => Math.hypot(p.x - x, p.z - z) > 2500)) picked.push({ i: picked.length, x, z, rarity: mix[picked.length] });
  }
  const weight = picked.reduce((a, c) => a + TIER[c.rarity], 0);
  const out = { n, crates: picked, weight };
  layouts.set(n, out);
  if (layouts.size > 8) layouts.delete(layouts.keys().next().value);
  return out;
}
export const publicLayout = (n) => layout(n).crates.map(({ i, x, z }) => ({ i, x, z }));

// Pool assets for an epoch, in the units they are paid in. STOCK_USD is a dollar budget paid out as
// tokenized stocks.
export const poolAssets = () => [
  { asset: 'ETH', funded: config.pool.ETH },
  { asset: TOKEN, funded: config.pool.HOODL },
  { asset: 'STOCK_USD', funded: config.pool.STOCK_USD },
];
// A crate's dollar value: its share of the epoch pool by rarity weight, so opening every crate of an
// epoch pays out exactly that epoch's pool (poolUsd: what that epoch's pool was actually funded with).
export const crateValueUsd = (n, rarityId, poolUsd) => (poolUsd * TIER[rarityId]) / layout(n).weight;

// Pick which asset an opened chest pays, weighted by what is left of each in the pool, and size it to
// the chest's dollar value.
export async function pickReward(valueUsd, remaining) {
  const options = [];
  for (const r of remaining) {
    const price = r.asset === 'STOCK_USD' ? 1 : await priceUsd(r.asset);
    const leftUsd = (r.funded - r.paid) * price;
    if (leftUsd >= valueUsd * 0.999) options.push({ ...r, price, leftUsd });
  }
  if (!options.length) return null;
  let x = randomInt(1_000_000) / 1_000_000 * options.reduce((a, o) => a + o.leftUsd, 0);
  const o = options.find((p) => (x -= p.leftUsd) < 0) ?? options.at(-1);
  if (o.asset === 'STOCK_USD') {
    const stocks = Object.keys(config.stockTokens);
    const stock = stocks[randomInt(stocks.length)];
    return { pool: 'STOCK_USD', debit: valueUsd, asset: stock, amount: +(valueUsd / (await priceUsd(stock))).toFixed(6), usd: valueUsd };
  }
  const amount = o.asset === TOKEN ? Math.floor(valueUsd / o.price) : +(valueUsd / o.price).toFixed(6);
  return { pool: o.asset, debit: amount, asset: o.asset, amount, usd: amount * o.price };
}

export { RARITIES };
