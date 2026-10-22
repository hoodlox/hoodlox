# Deploying Hoodlox

The site is a static Vite build plus one serverless function (`api/index.js`) on Vercel, with
Postgres on Neon and a Robinhood Chain vault wallet for payouts.

## 1. Vercel project + database
1. `npx vercel login`, then from this folder `npx vercel link` (new project).
2. In the Vercel dashboard: Storage → Create → Neon Postgres → connect to the project. This sets
   `DATABASE_URL`. Tables are created on the first request.
3. Add `SESSION_SECRET`, `CRATE_SALT`, `CRON_SECRET` (any long random strings).

## 2. Vault and token
- Make a new wallet for the vault only. Put its private key in `VAULT_KEY`.
- Fund it with ETH on Robinhood Chain for the pool and for gas (a redeem is one transfer per asset,
  a fraction of a cent each).
- Launch $HOODL (Pons or letscash.fun), put its address in `HOODL_TOKEN`, and move the epoch pools'
  $HOODL into the vault.
- For stock rewards, buy TSLA / NVDA / AAPL / SPY stock tokens into the vault. The official Robinhood
  addresses are built in (`server/config.js`); `STOCK_TOKENS` overrides them. A stock the vault does
  not hold makes that redeem fail and retry until it does.
- Size `POOL_ETH` / `POOL_HOODL` / `POOL_STOCK_USD` so 12 epochs a day fit what the vault holds.

## Moving the vault (withdraw / migration)
The vault is a plain wallet, not a contract: nothing locks it, and whoever holds `VAULT_KEY` can move
its funds at any time. To move to a new vault in one go:
1. `VAULT_KEY=<old key> HOODL_TOKEN=<token> node tools/vault-withdraw.mjs --to <new vault>` shows what
   it would send. Add `--yes` to send. `--asset ETH --amount 0.5` moves part of one asset.
2. Set `VAULT_KEY` to the new wallet's key in Vercel and redeploy.

Redeems that come in while the vault is empty stay pending and the cron pays them once the new vault
is funded. Tested on a fork: `node tools/check-withdraw.mjs`.

## 3. Deploy
`npx vercel --prod`. The landing is `/`, the game is `/play`.

## Checks before going live
- `npm run dev`, then `node tools/check-api.mjs`, `node tools/check-dig.mjs`, `node tools/check-game.mjs`.
- Real payments on a local fork of Robinhood Chain: `node tools/check-fork.mjs` (needs Foundry's
  `anvil`; starts the fork and its own dev server).
- Production rehearsal: `npm run build`, then `NODE_ENV=production SESSION_SECRET=x CRATE_SALT=y PORT=5190 node tools/serve-dist.mjs`
  and `BASE=http://localhost:5190 node tools/check-api.mjs`.
