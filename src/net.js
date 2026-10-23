// Client for the game API (server/routes.js) plus the live state every UI reads: `live.me` is one
// stable object updated in place, so the HUD and dashboard can keep a reference to it.
const KEY = 'treasurehunt.session';
const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const set = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

// Dev-only test knobs, passed through from the page URL (the server ignores them in production).
const q = new URLSearchParams(location.search);
const knobs = {};
if (q.has('fastdig')) knobs['x-fastdig'] = q.get('fastdig');
if (q.has('epochsec')) knobs['x-epochsec'] = q.get('epochsec');

let token = get();
export async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...knobs, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: 'Server unreachable.' }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { status: res.status });
  return data;
}

export const live = {
  me: {},          // my hunter (see me() in server/routes.js)
  config: null,    // /api/config
  epoch: null,     // { epoch, endsAt, crates, pool }
  board: [],       // leaderboard rows
  online: 1,       // hunters seen in the last sync
  skew: 0,         // server clock − local clock, ms
};
export const setMe = (m) => { if (m) Object.assign(live.me, m); return live.me; };

export const session = {
  get token() { return token; },
  use(t) { token = t; set(t); },
  clear() { token = null; set(null); },
};

// Enter with a wallet address (no wallet connection, no signature). Returns { me } (null for a new holder).
export async function enterWith(address) {
  const res = await api('/api/auth/address', { address });
  session.use(res.token);
  return res;
}

// What to send for a tool when $HOODL is live: { from, to, token, amount }. The holder sends it from
// their own wallet app and pastes the transaction hash into buyTool.
export const paymentFor = async (id) => (await api('/api/shop/tx', { tool: id })).pay;

// Buys a tool. Demo mode just asks the server; otherwise the server checks the pasted payment hash
// on-chain (retrying while it confirms).
export async function buyTool(id, hash) {
  if (live.config?.demo) return setMe((await api('/api/shop/buy', { tool: id })).me);
  for (let i = 0; ; i++) {
    try { return setMe((await api('/api/shop/buy', { tool: id, hash })).me); } catch (e) {
      if (e.status !== 402 || i >= 10) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
