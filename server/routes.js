// The game API. Framework-free: handle({ method, path, headers, body }) → { status, body }. Mounted by
// api/index.js on Vercel and by the Vite dev server locally.
import { config } from './config.js';
import { q, one } from './db.js';
import { issue, verify, newNonce, login, guestId, isGuest } from './auth.js';
import { epochOf, epochEndsAt, layout, publicLayout, poolAssets, crateValueUsd, pickReward } from './rules.js';
import { priceUsd } from './prices.js';
import { holding, payable, purchaseTx, verifyPurchase, sendPayout, payoutState, vaultAccount } from './chain.js';
import { TOOLS, tool as toolOf, HEROES, TOKEN, TOKEN_SUPPLY, levelOf, validName } from '../src/game.js';

const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
const toolPrice = (t) => t.price; // $HOODL ui units (a share of supply, see game.js)

// Test knobs (dev only): shorter epochs and faster digs, sent by the browser as headers.
const knobs = (h) => ({
  epochSecs: config.testKnobs && +h['x-epochsec'] > 0 ? +h['x-epochsec'] : config.epochSeconds,
  speed: config.testKnobs && +h['x-fastdig'] > 0 ? +h['x-fastdig'] : 1,
});

// Wallet holdings are cached a minute per player.
const holds = new Map();
async function hoodlBalance(id) {
  if (!config.hoodlToken || isGuest(id)) return null;
  const c = holds.get(id);
  if (c && Date.now() - c.at < 60_000) return c.v;
  const v = await holding(id, config.hoodlToken).catch(() => null);
  holds.set(id, { v, at: Date.now() });
  return v;
}

async function me(id) {
  const p = await one('select * from players where id = $1', [id]);
  if (!p) return null;
  const [chests, bal, history, payouts, rank] = await Promise.all([
    q('select id, rarity from chests where player = $1 and opened_at is null order by id', [id]),
    q('select asset, amount from balances where player = $1 and amount > 0', [id]),
    q('select rarity, asset, amount, usd, opened_at from chests where player = $1 and opened_at is not null order by opened_at desc limit 20', [id]),
    q('select id, items, usd, status, signature, created_at from payouts where player = $1 order by id desc limit 20', [id]),
    one('select count(*)::int + 1 as rank from players where profit_usd > $1 and id not like \'guest:%\'', [p.profit_usd]),
  ]);
  const balances = Object.fromEntries(bal.map((b) => [b.asset, b.amount]));
  return {
    id, guest: isGuest(id), name: p.name, hero: p.hero, tools: p.tools, equipped: p.equipped,
    tokens: config.hoodlToken ? await hoodlBalance(id) : p.demo_tokens, demo: !config.hoodlToken,
    profit: p.profit_usd, treasures: p.treasures, level: levelOf(p).level,
    distance: p.distance, seconds: p.seconds, rank: isGuest(id) ? null : rank.rank,
    chests: chests.map((c) => ({ id: Number(c.id), rarity: c.rarity })),
    balances, payable: Object.fromEntries(Object.keys(balances).map((a) => [a, payable(a)])),
    history: history.map((h) => ({ rarity: h.rarity, asset: h.asset, amount: h.amount, usd: h.usd, at: h.opened_at })),
    claimed: payouts.map((x) => ({ id: Number(x.id), items: x.items, usd: x.usd, status: x.status, signature: x.signature, at: x.created_at })),
  };
}

async function pool(n) {
  await q(`insert into pools (epoch, asset, funded) select $1, a, f from unnest($2::text[], $3::float8[]) as t(a, f) on conflict do nothing`,
    [n, poolAssets().map((p) => p.asset), poolAssets().map((p) => p.funded)]);
  const rows = await q('select asset, funded, paid from pools where epoch = $1', [n]);
  const out = [];
  for (const r of rows) {
    const price = r.asset === 'STOCK_USD' ? 1 : await priceUsd(r.asset);
    out.push({ asset: r.asset === 'STOCK_USD' ? 'Stocks' : r.asset, funded: r.funded, paid: r.paid, usd: r.funded * price, leftUsd: (r.funded - r.paid) * price });
  }
  return out;
}

async function authed(ctx) {
  const id = verify(ctx.headers.authorization);
  if (!id) fail(401, 'Sign in first.');
  return id;
}
async function wallet(ctx) {
  const id = await authed(ctx);
  if (isGuest(id)) fail(403, 'Connect a wallet to do this. Guests can only look around.');
  return id;
}

const routes = {
  'GET /api/config': async () => ({
    chainId: config.chainId, explorer: config.explorer, hoodlToken: config.hoodlToken, vault: vaultAccount()?.address ?? null,
    minHold: config.minHold, demo: !config.hoodlToken, tokenSupply: TOKEN_SUPPLY,
    tools: TOOLS.map((t) => ({ ...t, price: toolPrice(t) })),
  }),

  // --- sessions ---
  'POST /api/auth/nonce': () => newNonce(),
  'POST /api/auth/login': async ({ body }) => {
    const id = await login(String(body.address), String(body.signature), String(body.nonce));
    return { token: issue(id), me: await me(id) };
  },
  'POST /api/auth/guest': async () => ({ token: issue(guestId()), me: null }),
  'POST /api/player': async (ctx) => {
    const id = await authed(ctx);
    const name = String(ctx.body.name ?? '').trim(), hero = String(ctx.body.hero ?? '');
    if (!validName(name)) fail(400, 'Names are 2–16 letters, numbers, spaces, . \' or -.');
    if (!HEROES.includes(hero)) fail(400, 'Unknown hunter.');
    try {
      await q('insert into players (id, name, hero, demo_tokens) values ($1, $2, $3, $4) on conflict (id) do nothing',
        [id, name, hero, config.hoodlToken || isGuest(id) ? 0 : config.demoTokens]);
    } catch (e) { if (/players_name|unique/.test(e.message)) fail(409, 'That name is taken.'); throw e; }
    return { me: await me(id) };
  },
  'GET /api/me': async (ctx) => ({ me: await me(await authed(ctx)) }),

  // --- world ---
  'GET /api/epoch': async (ctx) => {
    const { epochSecs } = knobs(ctx.headers);
    const n = epochOf(epochSecs);
    const online = await one(`select count(*)::int as n from players where seen_at > now() - interval '15 seconds'`);
    return { epoch: n, seconds: epochSecs, endsAt: epochEndsAt(n, epochSecs), crates: publicLayout(n), pool: await pool(n), online: online.n };
  },
  // Called about once a second: stores where I am, returns who else is around and which crates are taken.
  'POST /api/sync': async (ctx) => {
    const id = await authed(ctx);
    const { epochSecs } = knobs(ctx.headers);
    const b = ctx.body;
    const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
    await q(`update players set x = $2, z = $3, ry = $4, anim = $5, seen_at = now(),
      distance = distance + $6, seconds = seconds + $7 where id = $1`,
    [id, Number(b.x) || 0, Number(b.z) || 0, Number(b.ry) || 0, String(b.anim ?? 'idle').slice(0, 8), num(b.dd, 3000), num(b.ds, 5)]);
    const n = epochOf(epochSecs);
    const [crates, players] = await Promise.all([
      q(`select c.idx, c.dug_by is not null as dug, case when c.claim_until > now() then p.name end as claim
         from crates c left join players p on p.id = c.claim_by where c.epoch = $1`, [n]),
      q(`select id, name, hero, x, z, ry, anim from players where seen_at > now() - interval '12 seconds' and id <> $1 limit 100`, [id]),
    ]);
    return {
      epoch: n, endsAt: epochEndsAt(n, epochSecs), now: Date.now(),
      dug: crates.filter((c) => c.dug).map((c) => c.idx),
      claims: Object.fromEntries(crates.filter((c) => c.claim && !c.dug).map((c) => [c.idx, c.claim])),
      players: players.map((p) => ({ key: p.id.slice(-8), name: p.name, hero: p.hero, x: p.x, z: p.z, ry: p.ry, anim: p.anim })),
    };
  },

  // --- digging ---
  'POST /api/dig/start': async (ctx) => {
    const id = await wallet(ctx);
    const { epochSecs, speed } = knobs(ctx.headers);
    const n = epochOf(epochSecs);
    if (Number(ctx.body.epoch) !== n) fail(409, 'That crate belongs to an epoch that has ended.');
    const crate = layout(n).crates[Number(ctx.body.i)];
    if (!crate) fail(404, 'No crate there.');
    if (config.hoodlToken && config.minHold > 0 && ((await hoodlBalance(id)) ?? 0) < config.minHold) {
      fail(403, `Hold at least ${config.minHold.toLocaleString('en-US')} $${TOKEN} to dig.`);
    }
    const p = await one('select equipped, x, z from players where id = $1', [id]);
    if (!p) fail(404, 'Create your hunter first.');
    if (p.x !== null && Math.hypot(p.x - crate.x, p.z - crate.z) > 1500) fail(409, 'Walk up to the crate first.');
    const secs = toolOf(p.equipped).seconds / speed;
    const row = await one(`insert into crates (epoch, idx, claim_by, claim_started, ready_at, claim_until)
      values ($1, $2, $3, now(), now() + make_interval(secs => $4::float8), now() + make_interval(secs => $4::float8 + 30))
      on conflict (epoch, idx) do update set claim_by = excluded.claim_by, claim_started = excluded.claim_started,
        ready_at = excluded.ready_at, claim_until = excluded.claim_until
      where crates.dug_by is null and (crates.claim_by is null or crates.claim_by = excluded.claim_by or crates.claim_until < now())
      returning ready_at`, [n, crate.i, id, secs]);
    if (!row) fail(409, 'Someone else is digging this crate.');
    return { seconds: secs, readyAt: new Date(row.ready_at).getTime() };
  },
  'POST /api/dig/cancel': async (ctx) => {
    const id = await wallet(ctx);
    await q('update crates set claim_by = null where epoch = $1 and idx = $2 and claim_by = $3 and dug_by is null', [Number(ctx.body.epoch), Number(ctx.body.i), id]);
    return { ok: true };
  },
  'POST /api/dig/finish': async (ctx) => {
    const id = await wallet(ctx);
    const n = Number(ctx.body.epoch), i = Number(ctx.body.i);
    const done = await one(`update crates set dug_by = $3, dug_at = now(), claim_by = null
      where epoch = $1 and idx = $2 and dug_by is null and claim_by = $3
        and ready_at <= now() + interval '1 second' and claim_until > now() returning idx`, [n, i, id]);
    if (!done) fail(409, 'This dig is not finished, or the crate was lost.');
    const crate = layout(n).crates[i];
    const value = await crateValueUsd(n, crate.rarity);
    const chest = await one('insert into chests (player, epoch, idx, rarity, value_usd) values ($1, $2, $3, $4, $5) returning id',
      [id, n, i, crate.rarity, value]);
    await q('update players set treasures = treasures + 1 where id = $1', [id]);
    return { chest: { id: Number(chest.id), rarity: crate.rarity }, me: await me(id) };
  },

  // --- chests ---
  'POST /api/chest/open': async (ctx) => {
    const id = await wallet(ctx);
    const c = await one('update chests set opened_at = now() where id = $1 and player = $2 and opened_at is null returning epoch, value_usd',
      [Number(ctx.body.id), id]);
    if (!c) fail(404, 'That chest is not yours or is already open.');
    await pool(c.epoch);
    let reward = null;
    for (let attempt = 0; attempt < 3 && !reward; attempt++) {
      const pick = await pickReward(c.value_usd, await q('select asset, funded, paid from pools where epoch = $1', [c.epoch]));
      if (!pick) break;
      const ok = await one('update pools set paid = paid + $3 where epoch = $1 and asset = $2 and paid + $3 <= funded * 1.000001 returning asset',
        [c.epoch, pick.pool, pick.debit]);
      if (ok) reward = pick;
    }
    if (!reward) {
      await q('update chests set asset = null, amount = 0, usd = 0 where id = $1', [Number(ctx.body.id)]);
      return { reward: null, me: await me(id) };
    }
    await q('update chests set asset = $2, amount = $3, usd = $4 where id = $1', [Number(ctx.body.id), reward.asset, reward.amount, reward.usd]);
    await q(`insert into balances (player, asset, amount) values ($1, $2, $3)
      on conflict (player, asset) do update set amount = balances.amount + excluded.amount`, [id, reward.asset, reward.amount]);
    await q('update players set profit_usd = profit_usd + $2 where id = $1', [id, reward.usd]);
    return { reward: { asset: reward.asset, amount: reward.amount, usd: reward.usd }, me: await me(id) };
  },

  // --- shop ---
  'POST /api/shop/tx': async (ctx) => {
    const id = await wallet(ctx);
    if (!config.hoodlToken) fail(400, 'Demo mode: no token payment needed.');
    const t = TOOLS.find((x) => x.id === ctx.body.tool && x.price > 0) ?? fail(404, 'Unknown tool.');
    return { tx: await purchaseTx(toolPrice(t)) };
  },
  'POST /api/shop/buy': async (ctx) => {
    const id = await wallet(ctx);
    const t = TOOLS.find((x) => x.id === ctx.body.tool && x.price > 0) ?? fail(404, 'Unknown tool.');
    if (!config.hoodlToken) {
      const row = await one(`update players set demo_tokens = demo_tokens - $2, tools = array_append(tools, $3), equipped = $3
        where id = $1 and demo_tokens >= $2 and not ($3 = any(tools)) returning id`, [id, toolPrice(t), t.id]);
      if (!row) fail(409, 'Not enough $HOODL, or you already own it.');
    } else {
      const hash = String(ctx.body.hash ?? '').toLowerCase();
      if (!hash || !(await verifyPurchase(hash, id, toolPrice(t)))) fail(402, 'Payment not found on-chain yet. Try again in a few seconds.');
      const fresh = await one('insert into purchases (signature, player, tool) values ($1, $2, $3) on conflict do nothing returning signature', [hash, id, t.id]);
      if (!fresh) fail(409, 'That payment was already used.');
      await q('update players set tools = array_append(tools, $2), equipped = $2 where id = $1 and not ($2 = any(tools))', [id, t.id]);
      holds.delete(id);
    }
    return { me: await me(id) };
  },
  'POST /api/shop/equip': async (ctx) => {
    const id = await wallet(ctx);
    const row = await one('update players set equipped = $2 where id = $1 and $2 = any(tools) returning id', [id, String(ctx.body.tool)]);
    if (!row) fail(409, 'You do not own that tool.');
    return { me: await me(id) };
  },

  // --- redeem ---
  'POST /api/redeem': async (ctx) => {
    const id = await wallet(ctx);
    const assets = (await q('select asset from balances where player = $1 and amount > 0', [id])).map((r) => r.asset).filter(payable);
    if (!assets.length) fail(400, vaultAccount() ? 'Nothing to redeem yet.' : 'Redeem opens once the vault is live.');
    const items = await q(`with old as (select asset, amount from balances where player = $1 and asset = any($2) and amount > 0 for update)
      update balances b set amount = 0 from old where b.player = $1 and b.asset = old.asset returning old.asset, old.amount`, [id, assets]);
    if (!items.length) fail(409, 'Already redeemed.');
    // One payout (one transaction) per asset.
    const rows = [];
    for (const it of items) {
      const usd = it.amount * (await priceUsd(it.asset));
      rows.push(await one('insert into payouts (player, items, usd) values ($1, $2, $3) returning id', [id, JSON.stringify([it]), usd]));
    }
    for (const r of rows) await processPayout(Number(r.id)).catch(() => {}); // the cron retries anything left pending
    const done = await q('select status, usd from payouts where id = any($1)', [rows.map((r) => r.id)]);
    return {
      payout: { status: done.every((d) => d.status === 'sent') ? 'sent' : 'pending', usd: done.reduce((a, d) => a + d.usd, 0) },
      me: await me(id),
    };
  },

  'GET /api/leaderboard': async (ctx) => {
    const id = verify(ctx.headers.authorization);
    const top = await q(`select id, name, hero, profit_usd, treasures from players where id not like 'guest:%'
      order by profit_usd desc, treasures desc limit 50`);
    return { top: top.map((p) => ({ me: p.id === id, name: p.name, hero: p.hero, profit: p.profit_usd, treasures: p.treasures, level: levelOf(p).level })) };
  },

  // Sends pending redeems and recovers stuck ones. Vercel cron / GitHub Actions call this.
  'GET /api/cron/payouts': async (ctx) => {
    if (config.cronSecret && ctx.headers.authorization !== `Bearer ${config.cronSecret}`) fail(401, 'Nope.');
    // No signature means nothing was broadcast (e.g. the vault was empty mid-migration): safe to resend.
    await q(`update payouts set status = 'pending' where status in ('sending', 'failed') and created_at < now() - interval '3 minutes' and signature is null`);
    const stuck = await q(`select id, signature from payouts where status in ('sending', 'failed') and signature is not null and created_at < now() - interval '3 minutes'`);
    for (const s of stuck) {
      const state = await payoutState(s.signature);
      if (state === 'sent') await q(`update payouts set status = 'sent', sent_at = now() where id = $1`, [s.id]);
      else if (state === 'dropped') await q(`update payouts set status = 'pending', signature = null where id = $1`, [s.id]);
    }
    const pending = await q(`select id from payouts where status = 'pending' order by id limit 10`);
    const done = [];
    for (const p of pending) done.push(await processPayout(Number(p.id)).then(() => p.id, (e) => `${p.id}: ${e.message}`));
    return { processed: done };
  },
};

async function processPayout(pid) {
  const p = await one(`update payouts set status = 'sending' where id = $1 and status = 'pending' returning player, items`, [pid]);
  if (!p) return;
  try {
    const [item] = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
    const hash = await sendPayout(p.player, item, (h) => q('update payouts set signature = $2 where id = $1', [pid, h]));
    await q(`update payouts set status = 'sent', signature = $2, sent_at = now(), error = null where id = $1`, [pid, hash]);
  } catch (e) {
    await q(`update payouts set status = 'failed', error = $2 where id = $1`, [pid, String(e.message).slice(0, 300)]);
    throw e;
  }
}

export async function handle({ method, path, headers = {}, body = {} }) {
  const route = routes[`${method} ${path.replace(/\/$/, '')}`];
  if (!route) return { status: 404, body: { error: 'Not found' } };
  try {
    return { status: 200, body: await route({ method, path, headers, body: body ?? {} }) };
  } catch (e) {
    if (!e.status) console.error(e);
    return { status: e.status ?? 500, body: { error: e.status ? e.message : 'Server error, try again.' } };
  }
}
