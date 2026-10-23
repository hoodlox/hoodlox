// Postgres access. Production: Neon over HTTP (DATABASE_URL). Local dev and tests: PGlite, an
// embedded Postgres in .data/, so the same SQL runs everywhere. Every mutation in the game is a single
// atomic statement (Neon's HTTP driver has no interactive transactions).
const SCHEMA = `
create table if not exists players (
  id text primary key,                  -- wallet address, or 'guest:<random>'
  name text not null,
  hero text not null,
  tools text[] not null default '{shovel}',
  equipped text not null default 'shovel',
  demo_tokens double precision not null default 0, -- only used while no $HOODL mint is configured
  profit_usd double precision not null default 0,
  treasures int not null default 0,
  distance double precision not null default 0,
  seconds double precision not null default 0,
  x double precision, z double precision, ry double precision, anim text, seen_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists players_name on players (lower(name));
create index if not exists players_profit on players (profit_usd desc);
create table if not exists crates (
  epoch int not null, idx int not null,
  claim_by text, claim_started timestamptz, ready_at timestamptz, claim_until timestamptz,
  dug_by text, dug_at timestamptz,
  primary key (epoch, idx)
);
create table if not exists chests (
  id bigserial primary key, player text not null, epoch int not null, idx int not null,
  rarity text not null, value_usd double precision not null,
  found_at timestamptz not null default now(), opened_at timestamptz,
  asset text, amount double precision, usd double precision
);
create index if not exists chests_player on chests (player, opened_at);
create table if not exists pools (
  epoch int not null, asset text not null,
  funded double precision not null, paid double precision not null default 0,
  primary key (epoch, asset)
);
create table if not exists balances (
  player text not null, asset text not null, amount double precision not null default 0,
  primary key (player, asset)
);
create table if not exists payouts (
  id bigserial primary key, player text not null, items jsonb not null, usd double precision not null,
  status text not null default 'pending', signature text, error text,
  created_at timestamptz not null default now(), sent_at timestamptz
);
create table if not exists purchases (
  signature text primary key, player text not null, tool text not null, at timestamptz not null default now()
);
-- Ticker rename $HUNT → $HOODL (22 Oct 2026): carry old rows over, no-ops once done.
-- (No semicolons in comments here: production splits this schema on them.)
update pools set asset = 'HOODL' where asset = 'HUNT' and not exists (select 1 from pools p2 where p2.epoch = pools.epoch and p2.asset = 'HOODL');
delete from pools where asset = 'HUNT';
update balances set asset = 'HOODL' where asset = 'HUNT' and not exists (select 1 from balances b2 where b2.player = balances.player and b2.asset = 'HOODL');
update chests set asset = 'HOODL' where asset = 'HUNT';
`;

let ready;
async function connect() {
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const run = async (text, params = []) => sql.query(text, params);
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await run(stmt);
    return run;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync } = await import('node:fs');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.exec(SCHEMA);
  return async (text, params = []) => (await db.query(text, params)).rows;
}

// q`...` is avoided on purpose: plain text + params keeps both drivers identical.
export async function q(text, params = []) {
  // Kept on globalThis: the dev server reloads this module on edits, and a second PGlite on the same
  // directory would corrupt it.
  ready ??= globalThis.__treasureDb ??= connect();
  const run = await ready.catch((e) => { ready = globalThis.__treasureDb = null; throw e; });
  return run(text, params);
}
export const one = async (text, params) => (await q(text, params))[0] ?? null;
