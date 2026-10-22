// In-game HUD: top bar, leaderboard (top profit), my stats, the tool shop, the inventory (chests and
// rewards), the "chest found" popup and the chest opening reveal. State comes from the server
// (net.js live); every action is a server call that returns the updated hunter.
import { BRAND, TOKEN, TOOLS, tool, rarity, amount, TOKEN_SUPPLY, countdown, usd, short, metres, clock, portrait } from './game.js';
import { api, live, setMe, buyTool } from './net.js';
import { HERO_CARD } from './cards.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const icon = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON_BOARD = icon('<path d="M5 20V10M12 20V4M19 20v-7"/>');
const ICON_ME = icon('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>');
const ICON_SHOP = icon('<path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8L4 9z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>');
const ICON_DASH = icon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>');
const ICON_BAG = icon('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V5h6v2M4 12h16"/>');
export const chestImg = (id, open = false) => `/scenes/chests/icons/${id}-${open ? 'open' : 'closed'}.png`;
const pct = (n) => `${(n / TOKEN_SUPPLY * 100).toFixed(2)}% supply`;
const tok = (n) => `${amount(TOKEN, n ?? 0)} $${TOKEN}`;
const fmtTime = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);
export const epochLeft = () => countdown((live.epoch?.endsAt ?? 0) - (Date.now() + live.skew));

const MARKUP = `
<div>
<header class="hud">
  <a class="hud__brand" href="/"><img class="brand__logo" src="/brand/logo-64.png" alt="" /><b>${BRAND}</b></a>
  <div class="hud__stats">
    <div><span>Crates</span><b class="hud__sites">—</b></div>
    <div><span>Epoch</span><b class="hud__epoch">—</b></div>
    <div><span>Online</span><b class="hud__online">1</b></div>
  </div>
  <div class="hud__actions">
    <button class="icon-btn hud__dashBtn" type="button" aria-label="Dashboard" title="Dashboard (H)">${ICON_DASH}<span class="hud__dashLabel">Dashboard</span></button>
    <button class="icon-btn hud__shopBtn" type="button" aria-label="Shop" title="Shop">${ICON_SHOP}</button>
    <button class="icon-btn hud__bagBtn" type="button" aria-label="Inventory" title="Inventory">${ICON_BAG}<i class="badge" hidden></i></button>
    <button class="icon-btn hud__boardBtn" type="button" aria-label="Leaderboard" title="Leaderboard">${ICON_BOARD}</button>
    <button class="icon-btn icon-btn--me hud__meBtn" type="button" title="My stats">${ICON_ME}<span class="hud__meName"></span></button>
  </div>
</header>

<aside class="panel board" hidden>
  <header class="panel__head"><b>Leaderboard · top profit</b><button class="panel__close" type="button" aria-label="Close">&times;</button></header>
  <ol class="board__list"></ol>
</aside>

<aside class="panel me" hidden>
  <header class="panel__head"><b>My stats</b><button class="panel__close" type="button" aria-label="Close">&times;</button></header>
  <div class="me__top"><span class="me__portrait"></span><div><b class="me__name"></b><span class="me__hero"></span><span class="me__wallet"></span></div></div>
  <dl class="me__grid">
    <div><dt>Rank</dt><dd class="me__rank">—</dd></div>
    <div><dt>Profit</dt><dd class="me__profit">—</dd></div>
    <div><dt>Chests found</dt><dd class="me__treasures">—</dd></div>
    <div><dt>Unopened</dt><dd class="me__unopened">—</dd></div>
    <div><dt>Tool</dt><dd class="me__tool">—</dd></div>
    <div><dt>$${TOKEN} balance</dt><dd class="me__tokens">—</dd></div>
    <div><dt>Distance</dt><dd class="me__distance">—</dd></div>
    <div><dt>Time played</dt><dd class="me__time">—</dd></div>
  </dl>
  <p class="me__note js-modenote"></p>
</aside>

<aside class="panel shop" hidden>
  <header class="panel__head"><b>Shop · digging tools</b><button class="panel__close" type="button" aria-label="Close">&times;</button></header>
  <p class="shop__balance"></p>
  <ul class="shop__list"></ul>
  <p class="me__note">Faster tools dig the same crates in less time. Paid in $${TOKEN}, a share of supply.</p>
</aside>

<aside class="panel bag" hidden>
  <header class="panel__head"><b>Inventory</b><button class="panel__close" type="button" aria-label="Close">&times;</button></header>
  <nav class="tabs"><button class="tab is-on" type="button" data-tab="chests">Chests</button><button class="tab" type="button" data-tab="rewards">Rewards</button></nav>
  <div class="bag__chests"><ul class="chests"></ul><p class="bag__empty">No chests yet. Look for crates sunk halfway into the grass and dig there.</p></div>
  <div class="bag__rewards" hidden><ul class="balances"></ul><ol class="history"></ol></div>
</aside>

<div class="modal found" hidden role="dialog" aria-modal="true" aria-labelledby="found-title">
  <div class="modal__card">
    <img class="found__img" alt="" />
    <p class="found__tag"></p>
    <h2 id="found-title" class="found__title"></h2>
    <p class="found__sub">Added to your inventory. Open it from there.</p>
    <div class="modal__actions"><button class="btn found__bag" type="button">Inventory</button><button class="btn btn--primary found__ok" type="button">Keep hunting</button></div>
  </div>
</div>

<div class="toast" role="status" hidden></div>

<div class="modal reveal" hidden role="dialog" aria-modal="true" aria-labelledby="reveal-title">
  <div class="modal__card">
    <div class="reveal__stage"><img class="reveal__img" alt="" /></div>
    <p class="found__tag reveal__tag"></p>
    <h2 id="reveal-title" class="reveal__title">Opening…</h2>
    <p class="reveal__usd"></p>
    <div class="modal__actions"><button class="btn btn--primary reveal__ok" type="button" disabled>Collect</button></div>
  </div>
</div>
</div>`;

export function createHUD({ me, sites, onOpen = () => {}, onDash = () => {} }) {
  const wrap = el(MARKUP);
  document.body.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const panels = [...wrap.querySelectorAll('.panel')];
  const renders = { board: renderBoard, me: renderMe, shop: renderShop, bag: renderBag };
  const open = (name) => { const p = $(`.${name}`); const show = p.hidden; for (const o of panels) o.hidden = true; if (show) { renders[name](); p.hidden = false; } };
  for (const name of Object.keys(renders)) $(`.hud__${name}Btn`).addEventListener('click', () => open(name));
  for (const b of wrap.querySelectorAll('.panel__close')) b.addEventListener('click', () => { b.closest('.panel').hidden = true; });
  $('.hud__dashBtn').addEventListener('click', () => { for (const o of panels) o.hidden = true; onDash(); });
  // Lets the dashboard jump straight into a panel ('bag' | 'shop' | 'board' | 'me').
  const show = (name) => { for (const o of panels) o.hidden = true; renders[name](); $(`.${name}`).hidden = false; };

  let toastTimer;
  const toast = (msg) => {
    const t = $('.toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
  };

  $('.hud__meName').textContent = me.name;
  $('.me__name').textContent = me.name;
  $('.me__wallet').textContent = me.guest ? 'guest' : short(me.id);
  $('.me__portrait').style.cssText = `--p:url(${portrait(me.hero)});--c:${HERO_CARD[me.hero].color}`;
  $('.me__hero').textContent = `${HERO_CARD[me.hero].side} · ${HERO_CARD[me.hero].name}`;

  function renderBoard() {
    $('.board__list').innerHTML = live.board.slice(0, 25).map((p, i) => `
      <li class="row${p.me ? ' is-me' : ''}">
        <b class="row__rank">${i + 1}</b>
        <span class="row__portrait" style="--p:url(${portrait(p.hero)});--c:${HERO_CARD[p.hero].color}"></span>
        <div class="row__who"><b>${p.name}</b><span>${HERO_CARD[p.hero].name} · Lv ${p.level}</span></div>
        <div class="row__num"><b>${usd(p.profit)}</b><span>${p.treasures} chests</span></div>
      </li>`).join('') || '<li class="muted" style="padding:12px">No hunters ranked yet.</li>';
  }
  function renderMe() {
    $('.me__rank').textContent = me.rank ? `#${me.rank}` : 'Guest';
    $('.me__profit').textContent = usd(me.profit);
    $('.me__treasures').textContent = me.treasures;
    $('.me__unopened').textContent = me.chests.length;
    $('.me__tool').textContent = tool(me.equipped).name;
    $('.me__tokens').textContent = me.tokens === null ? '—' : amount(TOKEN, me.tokens);
    $('.me__distance').textContent = metres(me.distance ?? 0);
    $('.me__time').textContent = clock(me.seconds ?? 0);
    $('.js-modenote').textContent = live.config?.demo
      ? `Demo mode: $${TOKEN} is simulated until the token launches.`
      : 'Balances settle on Robinhood Chain.';
  }

  // --- shop --------------------------------------------------------------------------------------
  let paying = null;
  function renderShop() {
    $('.shop__balance').textContent = me.guest ? 'Connect a wallet to buy tools.' : `Balance: ${tok(me.tokens)}`;
    $('.shop__list').innerHTML = TOOLS.map((t) => {
      const owned = me.tools.includes(t.id), on = me.equipped === t.id;
      const action = on ? '<button class="btn btn--small" type="button" disabled>Equipped</button>'
        : owned ? `<button class="btn btn--small" type="button" data-equip="${t.id}">Equip</button>`
        : paying === t.id ? '<button class="btn btn--small" type="button" disabled>Paying…</button>'
        : `<button class="btn btn--small btn--primary" type="button" data-buy="${t.id}"${me.guest || (me.tokens ?? 0) < t.price || paying ? ' disabled' : ''}>Buy</button>`;
      return `<li class="tool${on ? ' is-on' : ''}">
        <div class="tool__icon tool__icon--${t.id}">${['⛏', '⚒', '⚙'][TOOLS.indexOf(t)]}</div>
        <div class="tool__info"><b>${t.name}</b><span>Digs a crate in ${fmtTime(t.seconds)}</span>
          <span class="tool__price">${t.price ? `${tok(t.price)} · ${pct(t.price)}` : 'Free starter tool'}</span></div>
        ${action}</li>`;
    }).join('');
  }
  async function buy(id) {
    paying = id;
    renderShop();
    try { await buyTool(id); toast(`${tool(id).name} equipped.`); } catch (e) { toast(e.message); } finally { paying = null; renderShop(); }
  }
  async function equip(id) {
    try { setMe((await api('/api/shop/equip', { tool: id })).me); } catch (e) { toast(e.message); }
    renderShop();
  }
  $('.shop__list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]')?.dataset.buy, q = e.target.closest('[data-equip]')?.dataset.equip;
    if (b) buy(b); else if (q) equip(q);
  });

  // --- inventory -----------------------------------------------------------------------------------
  for (const b of wrap.querySelectorAll('.tab')) {
    b.addEventListener('click', () => {
      for (const o of wrap.querySelectorAll('.tab')) o.classList.toggle('is-on', o === b);
      $('.bag__chests').hidden = b.dataset.tab !== 'chests';
      $('.bag__rewards').hidden = b.dataset.tab !== 'rewards';
    });
  }
  function renderBag() {
    $('.chests').innerHTML = me.chests.map((c) => {
      const r = rarity(c.rarity);
      return `<li class="chest" style="--r:${r.color}"><img src="${chestImg(c.rarity)}" alt="" />
        <b>${r.name}</b><button class="btn btn--small btn--primary" type="button" data-open="${c.id}">Open</button></li>`;
    }).join('');
    $('.bag__empty').hidden = me.chests.length > 0;
    const bal = Object.entries(me.balances).filter(([, n]) => n > 0);
    $('.balances').innerHTML = bal.length
      ? bal.map(([a, n]) => `<li><b>${amount(a, n)}</b><span>${a}</span></li>`).join('')
      : '<li class="muted">Nothing collected yet.</li>';
    $('.history').innerHTML = me.history.map((h) => `
      <li><img src="${chestImg(h.rarity, true)}" alt="" /><span>${rarity(h.rarity).name} chest</span>
        <b>${h.asset ? `+${amount(h.asset, h.amount)} ${h.asset}` : 'empty'}</b></li>`).join('');
    badge();
  }
  const badge = () => { const b = $('.badge'); b.hidden = !me.chests.length; b.textContent = me.chests.length; };
  $('.chests').addEventListener('click', (e) => {
    const id = e.target.closest('[data-open]')?.dataset.open;
    if (id !== undefined) openChest(+id);
  });

  // --- found popup (the server already put the chest in my inventory) ------------------------------
  function found(chest) {
    badge();
    const r = rarity(chest.rarity);
    $('.found').style.setProperty('--r', r.color);
    $('.found__img').src = chestImg(chest.rarity);
    $('.found__tag').textContent = r.name;
    $('.found__title').textContent = `You dug up ${/^[AEIOU]/.test(r.name) ? 'an' : 'a'} ${r.name} chest!`;
    $('.found').hidden = false;
    $('.found__ok').focus();
  }
  $('.found__ok').addEventListener('click', () => { $('.found').hidden = true; });
  $('.found__bag').addEventListener('click', () => { $('.found').hidden = true; show('bag'); });

  // --- opening: the server picks the reward out of the epoch pool ----------------------------------
  let opening = false;
  async function openChest(id) {
    const c = me.chests.find((x) => x.id === id);
    if (!c || opening) return;
    if (me.guest) return toast('Connect a wallet to open chests.');
    opening = true;
    const r = rarity(c.rarity);
    const m = $('.reveal');
    m.style.setProperty('--r', r.color);
    m.classList.remove('is-open');
    $('.reveal__img').src = chestImg(c.rarity);
    $('.reveal__tag').textContent = `${r.name} chest`;
    $('.reveal__title').textContent = 'Opening…';
    $('.reveal__usd').textContent = '';
    $('.reveal__ok').disabled = true;
    m.hidden = false;
    onOpen();
    // Shake for at least a second while the server rolls.
    const [res] = await Promise.all([api('/api/chest/open', { id }).catch((e) => ({ error: e.message })), new Promise((ok) => setTimeout(ok, 1100))]);
    opening = false;
    if (res.error) { m.hidden = true; toast(res.error); return; }
    setMe(res.me);
    m.classList.add('is-open');
    $('.reveal__img').src = chestImg(c.rarity, true);
    $('.reveal__title').textContent = res.reward ? `+${amount(res.reward.asset, res.reward.amount)} ${res.reward.asset}` : 'Empty: this epoch’s pool is spent';
    $('.reveal__usd').textContent = res.reward ? `≈ ${usd(res.reward.usd)}` : '';
    $('.reveal__ok').disabled = false;
    $('.reveal__ok').focus();
    renderBag();
  }
  $('.reveal__ok').addEventListener('click', () => { $('.reveal').hidden = true; });

  const tick = () => {
    $('.hud__epoch').textContent = epochLeft();
    $('.hud__sites').textContent = `${sites.left} / ${sites.total}`;
    $('.hud__online').textContent = live.online;
    badge();
    if (!$('.me').hidden) renderMe();
  };
  tick();
  setInterval(tick, 1000);
  return { found, renderBoard, renderMe, show, openChest, toast, buy };
}
