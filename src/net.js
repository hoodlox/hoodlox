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

// The EVM wallet in the page (MetaMask, Rabby, Coinbase…), or a test stand-in tools put on window.ethereum.
export const provider = () => window.ethereum ?? null;

// Connect + sign the server's nonce (no transaction). Returns { me } (me is null for a new wallet).
export async function signIn() {
  const p = provider();
  if (!p) throw new Error('No wallet found. Install MetaMask or Rabby, or look around as a guest.');
  const [address] = await p.request({ method: 'eth_requestAccounts' });
  const { nonce, message } = await api('/api/auth/nonce', {});
  const hex = `0x${[...new TextEncoder().encode(message)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const signature = await p.request({ method: 'personal_sign', params: [hex, address] });
  const res = await api('/api/auth/login', { address, nonce, signature });
  session.use(res.token);
  return { address, me: res.me };
}

// Puts the wallet on Robinhood Chain, adding the network first if the wallet does not know it.
async function useChain(chainId) {
  const p = provider(), id = `0x${chainId.toString(16)}`;
  try { await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: id }] }); } catch (e) {
    if (e.code !== 4902) throw e;
    await p.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: id, chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://robinhood-rpc.publicnode.com'], blockExplorerUrls: [live.config.explorer],
    }] });
  }
}

// Buys a tool. Demo mode just asks the server; otherwise the wallet sends the $HUNT payment the
// server prepared, and the server checks it on-chain (retrying while it confirms).
export async function buyTool(id) {
  if (live.config?.demo) return setMe((await api('/api/shop/buy', { tool: id })).me);
  const { tx } = await api('/api/shop/tx', { tool: id });
  await useChain(tx.chainId);
  const [from] = await provider().request({ method: 'eth_requestAccounts' });
  const hash = await provider().request({ method: 'eth_sendTransaction', params: [{ from, to: tx.to, data: tx.data }] });
  for (let i = 0; ; i++) {
    try { return setMe((await api('/api/shop/buy', { tool: id, hash })).me); } catch (e) {
      if (e.status !== 402 || i >= 10) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
