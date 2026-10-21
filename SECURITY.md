# Security policy

Hoodlox holds player rewards in a vault wallet on Robinhood Chain, so bugs that could move funds,
skip a dig timer, claim someone else's crate or chest, or replay a tool payment matter most.

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub's private report instead:
**Security → Report a vulnerability** on this repository. Include steps to reproduce and what an
attacker gains. We aim to reply within 3 days.

## In scope

- `server/` and `api/`: auth, crate claims, dig timing, chest payouts, shop verification, redeem.
- Anything that lets one wallet act as another, or move vault funds without a matching reward.

## Out of scope

- Client-side movement (positions are reported by the client; the server only checks distance to a crate).
- Prices from third-party feeds (CoinGecko, DexScreener).
- Denial of service against the hosting provider.
