// In-game HUD: top bar, leaderboard (top profit), my stats, the tool shop, the inventory (chests and
// rewards), the "chest found" popup and the chest opening reveal. State comes from the server
// (net.js live); every action is a server call that returns the updated hunter.
import { BRAND, TOKEN, TOOLS, tool, rarity, amount, TOKEN_SUPPLY, countdown, usd, short, metres, clock, portrait } from './game.js';
import { api, live, setMe, buyTool, paymentFor } from './net.js';
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

<div class="sense" data-level="cold" role="status" aria-label="Treasure sense"><i></i><span>Treasure sense</span><b class="sense__label">Cold</b></div>
<ol class="finds" aria-label="Latest finds"></ol>

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
    <div class="modal__actions"><a class="btn reveal__share" target="_blank" rel="noopener" hidden>Share on X</a><button class="btn btn--primary reveal__ok" type="button" disabled>Collect</button></div>
  </div>
</div>
</div>`;

export function createHUD({ me, sites, player, onOpen = () => {}, onDash = () => {} }) {
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
  let paying = null, pay = null; // pay: what to send for a live purchase while we wait for its hash
  function renderShop() {
    $('.shop__balance').textContent = me.guest ? 'Enter a wallet address to buy tools.' : `Balance: ${tok(me.tokens)}`;
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
    }).join('') + (pay ? `<li class="shop__pay">
        <b>Buy ${tool(pay.tool).name}</b>
        <span>1. From your wallet <code>${short(pay.from)}</code>, send exactly <code>${tok(pay.amount)}</code> to the game vault on Robinhood Chain:</span>
        <code class="shop__vault">${pay.to}</code>
        <span>2. Paste the transaction hash:</span>
        <input class="shop__hash" type="text" spellcheck="false" placeholder="0x…" />
        <div class="shop__payBtns"><button class="btn btn--small btn--primary" type="button" data-paid${paying ? ' disabled' : ''}>${paying ? 'Checking…' : 'Confirm payment'}</button>
        <button class="btn btn--small" type="button" data-cancelpay>Cancel</button></div>
      </li>` : '');
  }
  // Demo mode buys straight away. Live: show where to send the $HOODL, then check the pasted hash.
  async function buy(id) {
    if (!live.config?.demo) {
      try { pay = { tool: id, ...(await paymentFor(id)) }; } catch (e) { toast(e.message); }
      return show('shop');
    }
    paying = id;
    renderShop();
    try { await buyTool(id); toast(`${tool(id).name} equipped.`); } catch (e) { toast(e.message); } finally { paying = null; renderShop(); }
  }
  async function confirmPay() {
    const hash = $('.shop__hash').value.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return toast('Paste the 0x… transaction hash of your transfer.');
    paying = pay.tool;
    renderShop();
    try { await buyTool(pay.tool, hash); toast(`${tool(pay.tool).name} equipped.`); pay = null; } catch (e) { toast(e.message); } finally { paying = null; renderShop(); }
  }
  async function equip(id) {
    try { setMe((await api('/api/shop/equip', { tool: id })).me); } catch (e) { toast(e.message); }
    renderShop();
  }
  $('.shop__list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]')?.dataset.buy, q = e.target.closest('[data-equip]')?.dataset.equip;
    if (b) buy(b); else if (q) equip(q);
    else if (e.target.closest('[data-paid]')) confirmPay();
    else if (e.target.closest('[data-cancelpay]')) { pay = null; renderShop(); }
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
    if (me.guest) return toast('Enter a wallet address to open chests.');
    opening = true;
    const r = rarity(c.rarity);
    const m = $('.reveal');
    m.style.setProperty('--r', r.color);
    m.classList.remove('is-open');
    $('.reveal__img').src = chestImg(c.rarity);
    $('.reveal__tag').textContent = `${r.name} chest`;
    $('.reveal__title').textContent = 'Opening…';
    $('.reveal__usd').textContent = '';
    $('.reveal__share').hidden = true;
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
    if (res.reward) {
      const text = `I just dug up ${/^[AEIOU]/.test(r.name) ? 'an' : 'a'} ${r.name} chest in Hoodlox and won ${usd(res.reward.usd)} in ${res.reward.asset} ⛏️\n\nHold $${TOKEN}, dig crates, claim to your wallet 👇`;
      $('.reveal__share').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://play.hoodlox.fun')}`;
      $('.reveal__share').hidden = false;
    }
    $('.reveal__ok').disabled = false;
    $('.reveal__ok').focus();
    renderBag();
  }
  $('.reveal__ok').addEventListener('click', () => { $('.reveal').hidden = true; });

  // --- treasure sense: how close the nearest buried crate is, never which way ------------------------
  const SENSE = [[800, 'Burning', 'burning'], [2000, 'Hot', 'hot'], [4500, 'Warm', 'warm'], [Infinity, 'Cold', 'cold']]; // cm
  const sense = () => {
    const p = player.obj.position;
    let d = Infinity;
    for (const s of sites.sites) if (s.live) d = Math.min(d, Math.hypot(s.at.x - p.x, s.at.z - p.z));
    const [, label, level] = Number.isFinite(d) ? SENSE.find(([max]) => d < max) : [0, 'All dug · new crates soon', 'none'];
    $('.sense').dataset.level = level;
    $('.sense__label').textContent = label;
  };
  if (player) setInterval(sense, 250);

  // --- live finds feed: the latest chests anyone opened -------------------------------------------
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'now' : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`; };
  function finds(list) {
    const html = list.filter((f) => Date.now() - f.at < 3 * 3600_000).slice(0, 4).map((f) => `
      <li style="--r:${rarity(f.rarity).color}"><img src="${chestImg(f.rarity, true)}" alt="" />
        <span><b>${f.name}</b> · ${rarity(f.rarity).name} · <em>${usd(f.usd)} ${f.asset}</em></span><small>${ago(f.at)}</small></li>`).join('');
    if (html !== $('.finds').dataset.html) { $('.finds').dataset.html = html; $('.finds').innerHTML = html; } // no re-slide when nothing changed
  }

  // --- epoch: the countdown turns red in the last 5 minutes, with one warning -----------------------
  let warned = null;
  const tick = () => {
    $('.hud__epoch').textContent = epochLeft();
    $('.hud__sites').textContent = `${sites.left} / ${sites.total}`;
    $('.hud__online').textContent = live.online;
    const left = (live.epoch?.endsAt ?? 0) - (Date.now() + live.skew), ending = left > 0 && left < 300_000;
    $('.hud__epoch').parentElement.classList.toggle('is-ending', ending);
    if (ending && warned !== live.epoch.epoch) { warned = live.epoch.epoch; toast('5 minutes left in this epoch. Digs still running when it ends come up empty.'); }
    badge();
    if (!$('.me').hidden) renderMe();
  };
  tick();
  setInterval(tick, 1000);
  return { found, finds, renderBoard, renderMe, show, openChest, toast, buy };
}
