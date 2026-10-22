// Shared game rules and formatting, used by the browser and the server (server/*.js imports this
// file, so it must stay free of DOM and three.js). Balances, epochs and rewards live on the server.
export const BRAND = 'Hoodlox';
export const TOKEN = 'HOODL';
export const HEROES = ['Knight', 'Barbarian', 'Rogue', 'Rogue_Hooded', 'Mage', 'Ranger'];
export const portrait = (hero) => `/scenes/adventurers/portraits/${hero}.png`; // made by tools/render-portraits.mjs

export const countdown = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`;
};
export const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 })}`;
export const short = (a) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
export const metres = (cm) => (cm >= 100_000 ? `${(cm / 100_000).toFixed(1)} km` : `${Math.round(cm / 100)} m`);
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
export const validName = (n) => /^[\w .'-]{2,16}$/.test(n.trim());
export const amount = (asset, n) => (asset === TOKEN ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 6 }));

// Seeded random. The seed is scrambled first (murmur3 finaliser): a plain LCG gives nearly the same
// first numbers for neighbouring seeds, which made consecutive epochs bury the same crate count.
export const seeded = (seed) => {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b); s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35); s = (s ^ (s >>> 16)) >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};

// --- tools ---------------------------------------------------------------------------------------
export const TOKEN_SUPPLY = 1_000_000_000; // Robinhood Chain launchpad supply (Pons, letscash)
export const ofSupply = (pct) => Math.round(TOKEN_SUPPLY * pct / 100);
export const DEMO_BALANCE = ofSupply(0.35); // what demo mode credits each new hunter (landing shows it too)
// Every hunter starts with the free shovel; the others cost a share of supply, paid in $HOODL.
export const TOOLS = [
  { id: 'shovel', name: 'Rusty Shovel', seconds: 60, price: 0 },
  { id: 'pickaxe', name: 'Iron Pickaxe', seconds: 30, price: ofSupply(0.1) },
  { id: 'drill', name: 'Golden Drill', seconds: 15, price: ofSupply(0.2) },
];
export const tool = (id) => TOOLS.find((t) => t.id === id) ?? TOOLS[0];

// --- crates --------------------------------------------------------------------------------------
// Rarity of a crate. `skin` picks the chest texture in public/scenes/chests.
export const RARITIES = [
  { id: 'common', name: 'Common', weight: 55, color: '#b9c0cc', skin: 'TreasureChest_Metal' },
  { id: 'uncommon', name: 'Uncommon', weight: 25, color: '#6fd68a', skin: 'TreasureChest_Green' },
  { id: 'rare', name: 'Rare', weight: 12, color: '#5aa8ff', skin: 'TreasureChest_Blue' },
  { id: 'epic', name: 'Epic', weight: 6, color: '#c77dff', skin: 'TreasureChest_Red' },
  { id: 'legendary', name: 'Legendary', weight: 2, color: '#f3c35a', skin: 'TreasureChest_WoodGold' },
];
export const rarity = (id) => RARITIES.find((r) => r.id === id) ?? RARITIES[0];
export const CRATES_MIN = 20, CRATES_MAX = 30;

// Split n crates over the rarities in proportion to their weights (largest remainder, ties broken by
// rnd), then shuffle. 25 crates → about 14 common, 6 uncommon, 3 rare, 1–2 epic, 0–1 legendary.
export function rarityMix(n, rnd) {
  const total = RARITIES.reduce((a, r) => a + r.weight, 0);
  const share = RARITIES.map((r) => ({ id: r.id, exact: (n * r.weight) / total, tie: rnd() }));
  for (const s of share) s.count = Math.floor(s.exact);
  let left = n - share.reduce((a, s) => a + s.count, 0);
  for (const s of [...share].sort((a, b) => (b.exact % 1) - (a.exact % 1) || b.tie - a.tie)) if (left-- > 0) s.count++;
  const list = share.flatMap((s) => Array(s.count).fill(s.id));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// Fallback USD prices (when the live price feed is down). The server prefers live ones.
export const PRICES = { ETH: 2500, [TOKEN]: 0.00002, TSLA: 380, NVDA: 180, AAPL: 230, SPY: 640 };

// Level from chests found: 5 chests per level.
export const CHESTS_PER_LEVEL = 5;
export const levelOf = (a) => ({ level: 1 + Math.floor(a.treasures / CHESTS_PER_LEVEL), xp: a.treasures % CHESTS_PER_LEVEL, next: CHESTS_PER_LEVEL });
