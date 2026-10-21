// Server configuration from the environment. Everything that touches real funds is opt-in: without a
// vault and the $HUNT token the game runs in demo mode (demo $HUNT balance, payouts held).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Robinhood's official stock tokens on Robinhood Chain (18 decimals, verified on-chain in hoodstock).
const STOCKS = {
  TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  SPY: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
};

const env = process.env;
const prod = env.NODE_ENV === 'production' || !!env.VERCEL;
const need = (k, devDefault) => {
  if (env[k]) return env[k];
  if (prod) throw new Error(`${k} must be set in production`);
  return devDefault;
};

export const config = {
  prod,
  sessionSecret: need('SESSION_SECRET', 'dev-session-secret'),
  crateSalt: need('CRATE_SALT', 'dev-crate-salt'), // secret: crate rarities derive from it
  rpcUrl: env.RPC_URL ?? 'https://robinhood-rpc.publicnode.com',
  chainId: Number(env.CHAIN_ID ?? 4663),      // Robinhood Chain mainnet
  explorer: env.EXPLORER ?? 'https://robinhoodchain.blockscout.com',
  vaultKey: env.VAULT_KEY ?? null,            // hex private key; pays redeems, receives tool payments
  huntToken: env.HUNT_TOKEN ?? null,          // $HUNT ERC-20; unset → demo mode for $HUNT
  minHold: Number(env.HUNT_MIN_HOLD ?? 0),    // $HUNT (ui units) a wallet must hold to dig
  stockTokens: env.STOCK_TOKENS ? JSON.parse(env.STOCK_TOKENS) : STOCKS, // { "TSLA": "0x…", ... }
  // What each 2-hour epoch's crates pay out in total.
  pool: { ETH: Number(env.POOL_ETH ?? 0.015), HUNT: Number(env.POOL_HUNT ?? 2_000_000), STOCK_USD: Number(env.POOL_STOCK_USD ?? 25) },
  epochSeconds: Number(env.EPOCH_SECONDS ?? 7200),
  demoTokens: Number(env.DEMO_TOKENS ?? 3_500_000),
  cronSecret: env.CRON_SECRET ?? null,
  testKnobs: env.ALLOW_TEST_KNOBS === '1' && !prod, // ?fastdig / ?epochsec from the browser, dev only
};

export const spots = JSON.parse(readFileSync(fileURLToPath(new URL('./spots.json', import.meta.url)), 'utf8'));
