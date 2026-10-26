// Hunter dashboard: the lobby shown after picking a hunter and before entering the arena, and again
// from the HUD (button or H). Sections: overview (hunter card, level, stats, epoch strip), rewards
// (balances + redeem), pool & epoch, leaderboard, inventory and shop shortcuts. Data comes from the
// server through net.js `live`.
import './dashboard.css';
import { BRAND, TOKEN, RARITIES, TOOLS, tool, rarity, amount, usd, short, metres, clock, levelOf, portrait, PRICES } from './game.js';
import { HERO_CARD, cardInner } from './cards.js';
import { api, live, setMe } from './net.js';
import { chestImg, epochLeft } from './hud.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const POOL_COLORS = { ETH: '#7b5cff', USDG: '#3fa9f5', [TOKEN]: '#f07850', Stocks: '#2f9e6a' };
const face = (hero) => `--p:url(${portrait(hero)});--c:${HERO_CARD[hero].color}`;
const SECTIONS = [
  ['overview', 'Overview'], ['rewards', 'Rewards'], ['pool', 'Pool & Epoch'],
  ['leaderboard', 'Leaderboard'], ['inventory', 'Inventory'], ['shop', 'Shop'],
];

export function createDashboard({ me, sites, hud }) {
  const guest = me.guest;
  const address = me.id;
  const hc = HERO_CARD[me.hero];
  const wrap = el(`
<div class="dash" role="dialog" aria-modal="true" aria-label="Hunter dashboard">
  <aside class="dash__side">
    <a class="dash__brand" href="/"><img class="brand__logo" src="/brand/logo-64.png" alt="" /><b>${BRAND}</b></a>
    <nav class="dash__nav">${SECTIONS.map(([id, label], i) => `<button type="button" class="dash__tab${i ? '' : ' is-on'}" data-tab="${id}">${label}</button>`).join('')}</nav>
    <div class="dash__me">
      <span class="face" style="${face(me.hero)}"></span>
      <div><b>${me.name}</b><span class="mono">${guest ? 'Guest' : short(address)}</span></div>
    </div>
  </aside>

  <main class="dash__main">
    <header class="dash__top">
      <div class="dash__epoch mono"><span class="live"></span>Epoch <b class="js-epoch"></b> · ends in <b class="js-ends"></b></div>
      <div class="dash__pill mono"><span class="coin"></span><span class="js-hunt"></span> $${TOKEN}</div>
      <button class="dash__enter" type="button">Enter arena <span aria-hidden="true">→</span></button>
    </header>

    <!-- overview -->
    <section class="dash__sec" data-sec="overview">
      <div class="ov">
        <div class="card ov__card" style="--c:${hc.color};--name:54px">${cardInner(me.hero)}</div>
        <div class="ov__info">
          <p class="eyebrow mono">${hc.side} · ${hc.name}</p>
          <h1 class="display ov__name">${me.name}</h1>
          <div class="lvl">
            <div class="lvl__head mono"><span>Level <b class="js-level"></b></span><span class="js-xp"></span></div>
            <div class="lvl__bar"><i class="js-xpbar"></i></div>
          </div>
          <dl class="kpis">
            <div><dt>Rank</dt><dd class="js-rank"></dd></div>
            <div><dt>Total profit</dt><dd class="js-profit"></dd></div>
            <div><dt>Chests found</dt><dd class="js-found"></dd></div>
            <div><dt>Unopened</dt><dd class="js-unopened"></dd></div>
            <div><dt>Tool</dt><dd class="js-tool"></dd></div>
            <div><dt>Dig time</dt><dd class="js-digtime"></dd></div>
            <div><dt>Distance</dt><dd class="js-distance"></dd></div>
            <div><dt>Time played</dt><dd class="js-time"></dd></div>
          </dl>
        </div>
      </div>
      <div class="strip">
        <div class="tile tile--lime"><p class="mono">Reward pool</p><b class="display js-pool"></b><span class="mono js-epochline"></span></div>
        <div class="tile"><p class="mono">Crates left this epoch</p><b class="display js-buried"></b><span class="mono">new set every 2 hours</span></div>
        <div class="tile"><p class="mono">Ready to redeem</p><b class="display js-redeemable"></b><button class="link js-goto" data-goto="rewards" type="button">Redeem →</button></div>
        <div class="tile"><p class="mono">Hunters online</p><b class="display js-online">1</b><button class="link js-goto" data-goto="leaderboard" type="button">Leaderboard →</button></div>
      </div>
    </section>

    <!-- rewards -->
    <section class="dash__sec" data-sec="rewards" hidden>
      <div class="sec__head"><h2 class="display">Rewards</h2><p class="mono">What your opened chests paid. Redeem sends it all to your wallet.</p></div>
      <div class="rw">
        <div class="rw__total tile tile--lime">
          <p class="mono">Redeemable now</p>
          <b class="display js-redeemable"></b>
          <button class="btn-lime js-redeem" type="button">Redeem to wallet</button>
          <p class="mono rw__note js-redeemnote"></p>
          <p class="mono rw__to js-payto"></p>
        </div>
        <ul class="rw__bal js-balances"></ul>
      </div>
      <div class="cols">
        <div><h3 class="display h3">Recent chests</h3><ol class="list js-history"></ol></div>
        <div><h3 class="display h3">Redeemed</h3><ol class="list js-claimed"></ol></div>
      </div>
    </section>

    <!-- pool & epoch -->
    <section class="dash__sec" data-sec="pool" hidden>
      <div class="sec__head"><h2 class="display">Pool &amp; Epoch</h2><p class="mono">Every epoch refills the pool from creator fees and tool sales. Chests pay out of it.</p></div>
      <div class="pool">
        <div class="tile tile--lime pool__big"><p class="mono">Epoch <span class="js-epoch"></span> pool</p><b class="display js-pool"></b>
          <div class="mix js-mix"></div><ul class="mix__legend mono js-legend"></ul></div>
        <div class="tile pool__time"><p class="mono">Ends in</p><b class="display js-ends"></b>
          <div class="lvl__bar"><i class="js-epochbar"></i></div><span class="mono js-epochline"></span></div>
      </div>
      <h3 class="display h3">Drop odds</h3>
      <ul class="odds">${RARITIES.map((r) => `<li style="--r:${r.color}"><img src="${chestImg(r.id)}" alt="" /><b>${r.name}</b><span class="mono">${r.weight}%</span></li>`).join('')}</ul>
    </section>

    <!-- leaderboard -->
    <section class="dash__sec" data-sec="leaderboard" hidden>
      <div class="sec__head"><h2 class="display">Leaderboard</h2><p class="mono">Top hunters by total profit this season.</p></div>
      <div class="podium js-podium"></div>
      <ol class="lb js-lb"></ol>
    </section>

    <!-- inventory -->
    <section class="dash__sec" data-sec="inventory" hidden>
      <div class="sec__head"><h2 class="display">Inventory</h2><p class="mono">Unopened chests. Open them here or in the arena.</p></div>
      <ul class="inv js-inv"></ul>
      <p class="empty mono js-invempty">No chests yet. Enter the arena and look for chests sunk halfway into the grass.</p>
    </section>

    <!-- shop -->
    <section class="dash__sec" data-sec="shop" hidden>
      <div class="sec__head"><h2 class="display">Shop</h2><p class="mono">Faster tools dig the same chests in less time.</p></div>
      <div class="shop js-shop"></div>
    </section>
  </main>
</div>`);
  document.body.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const $$ = (s) => [...wrap.querySelectorAll(s)];
  const set = (s, v) => { for (const n of $$(s)) n.textContent = v; };

  // ── navigation ──
  let tab = 'overview';
  const go = (id) => {
    tab = id;
    for (const b of $$('.dash__tab')) b.classList.toggle('is-on', b.dataset.tab === id);
    for (const s of $$('.dash__sec')) s.hidden = s.dataset.sec !== id;
    render();
    $('.dash__main').scrollTop = 0;
  };
  for (const b of $$('.dash__tab')) b.addEventListener('click', () => go(b.dataset.tab));
  for (const b of $$('.js-goto')) b.addEventListener('click', () => go(b.dataset.goto));

  // ── open / close ──
  let onEnter = () => {};
  const open = () => { wrap.hidden = false; document.body.classList.add('dash-open'); render(); $('.dash__enter').focus(); };
  const close = () => { wrap.hidden = true; document.body.classList.remove('dash-open'); onEnter(); onEnter = () => {}; };
  $('.dash__enter').addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyH') (wrap.hidden ? open : close)();
    else if (e.code === 'Escape' && !wrap.hidden) close();
  });

  // ── render ──
  const price = (a) => PRICES[a] ?? 0; // display only; the server values every payout
  const balanceUsd = () => Object.entries(me.balances).reduce((a, [k, n]) => a + n * price(k), 0);
  const poolRows = () => live.epoch?.pool ?? [];
  const poolTotal = () => poolRows().reduce((a, p) => a + p.usd, 0);
  const poolLeft = () => poolRows().reduce((a, p) => a + p.leftUsd, 0);
  function render() {
    const lv = levelOf(me);
    const t = tool(me.equipped);
    const left = epochLeft();
    const n = live.epoch ? `#${live.epoch.epoch}` : '—';
    set('.js-epoch', n);
    set('.js-ends', left);
    set('.js-hunt', me.tokens === null ? '—' : amount(TOKEN, me.tokens));
    set('.js-level', lv.level);
    set('.js-xp', `${lv.xp} / ${lv.next} chests to level ${lv.level + 1}`);
    $('.js-xpbar').style.width = `${(lv.xp / lv.next) * 100}%`;
    set('.js-rank', me.rank ? `#${me.rank}` : 'Guest');
    set('.js-profit', usd(me.profit));
    set('.js-found', me.treasures);
    set('.js-unopened', me.chests.length);
    set('.js-tool', t.name);
    set('.js-digtime', `${t.seconds} s`);
    set('.js-distance', metres(me.distance ?? 0));
    set('.js-time', clock(me.seconds ?? 0));
    set('.js-pool', usd(poolTotal()));
    set('.js-epochline', `${usd(poolLeft())} left · epoch ${n} · ${left}`);
    set('.js-buried', `${sites.left} / ${sites.total}`);
    set('.js-redeemable', usd(balanceUsd()));
    set('.js-online', live.online);
    const span = live.epoch ? live.epoch.endsAt - live.epoch.startedAt : 1;
    $('.js-epochbar').style.width = live.epoch ? `${Math.min(100, (1 - (live.epoch.endsAt - Date.now() - live.skew) / span) * 100)}%` : '0';
    if (tab === 'rewards') renderRewards();
    if (tab === 'pool') renderPool();
    if (tab === 'leaderboard') renderBoard();
    if (tab === 'inventory') renderInv();
    if (tab === 'shop') renderShop();
  }

  let redeeming = false;
  function renderRewards() {
    const bal = Object.entries(me.balances).filter(([, n]) => n > 0);
    const ready = bal.filter(([a]) => me.payable?.[a]);
    $('.js-balances').innerHTML = bal.length
      ? bal.map(([a, n]) => `<li><span class="asset">${a}${me.payable?.[a] ? '' : ' · held'}</span><b class="mono">${amount(a, n)}</b><span class="mono muted">${usd(n * price(a))}</span></li>`).join('')
      : '<li class="muted mono">Nothing yet. Open a chest to fill this up.</li>';
    // Where redeems go: the address the hunter entered with.
    const to = $('.js-payto');
    if (guest) to.innerHTML = '';
    else if (to.dataset.id !== me.id) {
      to.dataset.id = me.id;
      to.innerHTML = `Paid to <b>${short(me.id)}</b> <button class="link js-copyto" type="button">Copy</button> <a class="link" href="${live.config?.explorer ?? 'https://robinhoodchain.blockscout.com'}/address/${me.id}" target="_blank" rel="noopener">Blockscout ↗</a>`;
    }
    $('.js-redeem').disabled = guest || !ready.length || redeeming;
    $('.js-redeem').textContent = redeeming ? 'Sending…' : 'Redeem to wallet';
    if (!redeeming) {
      $('.js-redeemnote').textContent = guest ? 'Enter a wallet address to redeem.'
        : bal.length && !ready.length ? 'These assets pay out once the vault holds them.'
        : ready.length ? 'Sent straight to your wallet, one transaction per asset.' : 'Open chests to earn something to redeem.';
    }
    $('.js-history').innerHTML = me.history.slice(0, 8).map((h) => `
      <li><img src="${chestImg(h.rarity, true)}" alt="" /><span>${rarity(h.rarity).name} chest</span><b class="mono">${h.asset ? `+${amount(h.asset, h.amount)} ${h.asset}` : 'empty'}</b></li>`).join('')
      || '<li class="muted mono">No chests opened yet.</li>';
    const explorer = (hash) => `${live.config?.explorer}/tx/${hash}`;
    $('.js-claimed').innerHTML = me.claimed.slice(0, 8).map((c) => `
      <li><span class="tick">${c.status === 'sent' ? '✓' : '…'}</span><span>${c.items.map((i) => `${amount(i.asset, i.amount)} ${i.asset}`).join(' + ')}
        ${c.signature ? `<a class="link" href="${explorer(c.signature)}" target="_blank" rel="noopener">tx</a>` : `<span class="muted">${c.status}</span>`}</span><b class="mono">${usd(c.usd)}</b></li>`).join('')
      || '<li class="muted mono">Nothing redeemed yet.</li>';
  }
  $('.js-payto').addEventListener('click', async (e) => {
    if (!e.target.closest('.js-copyto')) return;
    try { await navigator.clipboard.writeText(me.id); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = me.id; }
    setTimeout(() => { e.target.textContent = 'Copy'; }, 1800);
  });
  $('.js-redeem').addEventListener('click', async () => {
    redeeming = true;
    renderRewards();
    try {
      const res = await api('/api/redeem', {});
      setMe(res.me);
      $('.js-redeemnote').textContent = res.payout.status === 'sent' ? `Sent ${usd(res.payout.usd)} to your wallet.` : `Queued ${usd(res.payout.usd)}; it will be sent shortly.`;
    } catch (e) { $('.js-redeemnote').textContent = e.message; }
    redeeming = false;
    render();
  });

  function renderPool() {
    const rows = poolRows(), total = poolTotal() || 1;
    $('.js-mix').innerHTML = rows.map((p) => `<i style="flex:${p.usd};background:${POOL_COLORS[p.asset] ?? '#888'}"></i>`).join('');
    $('.js-legend').innerHTML = rows.map((p) => `<li><span class="sw" style="background:${POOL_COLORS[p.asset] ?? '#888'}"></span>${p.asset}<b>${p.asset === 'Stocks' ? usd(p.funded) : `${amount(p.asset, p.funded)} · ${usd(p.usd)}`}</b><em>${((p.usd / total) * 100).toFixed(0)}% · ${usd(p.leftUsd)} left</em></li>`).join('');
  }

  function renderBoard() {
    const all = live.board;
    $('.js-podium').innerHTML = all.slice(0, 3).map((p, i) => `
      <div class="pod pod--${i + 1}${p.me ? ' is-me' : ''}" style="--c:${HERO_CARD[p.hero].color}">
        <span class="pod__rank display">${i + 1}</span><span class="face face--lg" style="${face(p.hero)}"></span>
        <b>${p.name}</b><span class="mono">${usd(p.profit)}</span></div>`).join('');
    $('.js-lb').innerHTML = all.slice(3).map((p, i) => `
      <li class="${p.me ? 'is-me' : ''}"><b class="mono rk">${i + 4}</b><span class="face" style="${face(p.hero)}"></span>
        <span class="who"><b>${p.name}</b><span class="mono">${HERO_CARD[p.hero].name} · Lv ${p.level}</span></span>
        <span class="mono num">${p.treasures} chests</span><b class="mono num">${usd(p.profit)}</b></li>`).join('');
  }

  function renderInv() {
    $('.js-inv').innerHTML = me.chests.map((c) => `
      <li style="--r:${rarity(c.rarity).color}"><img src="${chestImg(c.rarity)}" alt="" /><b>${rarity(c.rarity).name}</b>
        <button class="btn-lime btn-sm" type="button" data-open="${c.id}"${guest ? ' disabled' : ''}>Open</button></li>`).join('');
    $('.js-invempty').hidden = me.chests.length > 0;
  }
  $('.js-inv').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-open]')?.dataset.open;
    if (id !== undefined) { await hud.openChest(+id); render(); }
  });

  function renderShop() {
    $('.js-shop').innerHTML = TOOLS.map((t) => {
      const owned = me.tools.includes(t.id), on = me.equipped === t.id;
      return `<div class="tool tile${on ? ' is-on' : ''}"><b class="display tool__t">${t.seconds}<small>s</small></b><b>${t.name}</b>
        <span class="mono muted">${t.price ? `${amount(TOKEN, t.price)} $${TOKEN}` : 'Free starter'}</span>
        ${on ? '<span class="mono tag">Equipped</span>' : owned ? `<button class="btn-ghost btn-sm" data-equip="${t.id}" type="button">Equip</button>`
          : `<button class="btn-lime btn-sm" data-buy="${t.id}" type="button"${guest || (me.tokens ?? 0) < t.price ? ' disabled' : ''}>Buy</button>`}</div>`;
    }).join('');
  }
  $('.js-shop').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-buy]')?.dataset.buy, q = e.target.closest('[data-equip]')?.dataset.equip;
    if (b && !live.config?.demo) { close(); return hud.buy(b); } // live: the HUD shop shows how to pay
    if (b) { e.target.disabled = true; e.target.textContent = 'Paying…'; await hud.buy(b); }
    else if (q) { try { setMe((await api('/api/shop/equip', { tool: q })).me); } catch (err) { hud.toast(err.message); } }
    render();
  });

  setInterval(() => { if (!wrap.hidden) render(); }, 1000);
  wrap.hidden = true;
  return {
    open, close, go,
    // Resolves when the player presses Enter arena.
    enter() { open(); return new Promise((r) => { onEnter = r; }); },
    get isOpen() { return !wrap.hidden; },
  };
}
