// USD prices, cached a minute: ETH from CoinGecko, $HOODL and the stock tokens from DexScreener's
// Robinhood Chain pairs (deepest pool wins). The placeholder prices in game.js are the fallback
// (offline, a fork, or a token with no pool yet).
import { PRICES, TOKEN } from '../src/game.js';
import { config } from './config.js';

const tokenOf = (asset) => (asset === TOKEN ? config.hoodlToken : config.stockTokens[asset]);
let cache = { at: 0, prices: {} };

async function refresh() {
  const prices = {};
  const json = (url) => fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.json());
  await Promise.all([
    json('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then((d) => { if (d.ethereum?.usd > 0) prices.ETH = d.ethereum.usd; }).catch(() => {}),
    (async () => {
      const assets = [TOKEN, ...Object.keys(config.stockTokens)].filter(tokenOf);
      const pairs = await json(`https://api.dexscreener.com/tokens/v1/robinhood/${assets.map(tokenOf).join(',')}`);
      for (const a of assets) {
        const best = pairs.filter((p) => p.baseToken.address.toLowerCase() === tokenOf(a).toLowerCase())
          .sort((x, y) => (y.liquidity?.usd ?? 0) - (x.liquidity?.usd ?? 0))[0];
        if (+best?.priceUsd > 0) prices[a] = +best.priceUsd;
      }
    })().catch(() => {}),
  ]);
  cache = { at: Date.now(), prices };
}

export async function priceUsd(asset) {
  if (Date.now() - cache.at > 60_000) await refresh();
  return cache.prices[asset] ?? PRICES[asset] ?? 0;
}
