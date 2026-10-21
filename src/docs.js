// Field Manual: fills the live numbers (mode, epoch, pool, tools, addresses) from the game API and
// highlights the chapter being read. Shared rules come from game.js so the manual matches the game.
import { RARITIES, TOOLS, TOKEN, TOKEN_SUPPLY, HEROES, amount, usd, countdown, rarityMix, portrait } from './game.js';
import { HERO_CARD } from './cards.js';

const $ = (s) => document.querySelector(s);
const set = (s, v) => { const n = $(s); if (n) n.textContent = v; };
const TIER = { common: 1, uncommon: 2.5, rare: 6, epic: 15, legendary: 40 }; // mirrors server/rules.js
const totalWeight = RARITIES.reduce((a, r) => a + r.weight, 0);

// Hunters strip.
$('.heroes').innerHTML = HEROES.map((h) => `<figure><img src="${portrait(h)}" alt="" loading="lazy" style="background:${HERO_CARD[h].color}22" /><figcaption>${HERO_CARD[h].name}</figcaption></figure>`).join('');

// Static tables first, live values fill in after.
function rarityRows(crates, poolUsd) {
  // Expected mix for this many crates (same split the server uses, ties aside), then each rarity's
  // value share of the pool.
  const mix = {};
  if (crates) for (const r of rarityMix(crates, () => 0.5)) mix[r] = (mix[r] ?? 0) + 1;
  const weight = Object.entries(mix).reduce((a, [r, n]) => a + n * TIER[r], 0);
  $('.js-rarity').innerHTML = RARITIES.map((r) => `
    <tr><td><span class="dot" style="background:${r.color}"></span>${r.name}</td>
      <td class="num-cell">${Math.round((r.weight / totalWeight) * 100)}%</td>
      <td class="num-cell">×${TIER[r.id]}</td>
      <td class="num-cell">${poolUsd && weight ? usd((poolUsd * TIER[r.id]) / weight) : '—'}</td></tr>`).join('');
}
function toolCards(tools) {
  $('.js-tools').innerHTML = tools.map((t) => `<div class="tool"><b>${t.name}</b>
    <p class="t">${t.seconds}<small>sec</small></p>
    <span>${t.price ? `${amount(TOKEN, t.price)} $${TOKEN} · ${((t.price / TOKEN_SUPPLY) * 100).toFixed(1)}% supply` : 'Free for every hunter'}</span></div>`).join('');
}
rarityRows(0, 0);
toolCards(TOOLS);

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
async function live() {
  const [config, epoch] = await Promise.all([fetch('/api/config').then((r) => r.json()), fetch('/api/epoch').then((r) => r.json())]);
  const pool = epoch.pool.reduce((a, p) => a + p.usd, 0);
  set('.js-mode', config.demo ? 'Demo' : 'Live');
  $('.js-modenote').textContent = config.demo
    ? 'Demo mode: $HUNT is simulated and redeem is off until the token and vault go live. Everything else works as described.'
    : 'Live: rewards are real and redeem to your wallet.';
  set('.js-epoch', `#${epoch.epoch}`);
  set('.js-crates', epoch.crates.length);
  set('.js-pool', usd(pool));
  set('.js-online', epoch.online);
  const tick = () => set('.js-ends', countdown(epoch.endsAt - Date.now()));
  tick();
  setInterval(tick, 1000);
  rarityRows(epoch.crates.length, pool);
  set('.js-valhead', `Worth about (${epoch.crates.length} crates)`);
  toolCards(config.tools);
  $('.js-poolrows').innerHTML = epoch.pool.map((p) => `
    <tr><td>${p.asset === 'HUNT' ? '$HUNT' : p.asset}</td>
      <td class="num-cell">${p.asset === 'Stocks' ? `${usd(p.funded)} budget` : amount(p.asset, p.funded)}</td>
      <td class="num-cell">${usd(p.usd)}</td><td class="num-cell">${usd(p.leftUsd)}</td></tr>`).join('');
  set('.js-minhold', config.minHold ? `${amount(TOKEN, config.minHold)} $HUNT` : 'none');
  const link = (a) => `<a href="${config.explorer}/address/${a}" target="_blank" rel="noopener"><code>${short(a)}</code></a>`;
  $('.js-hunt').innerHTML = config.huntToken ? link(config.huntToken) : 'Announced at launch';
  $('.js-vault').innerHTML = config.vault ? link(config.vault) : 'Announced at launch';
  $('.js-tokenline').textContent = config.huntToken ? '' : 'The token has not launched yet. Its address will appear here and in chapter 13.';
  set('.js-chain', config.chainId);
}
live().catch(() => { $('.js-modenote').textContent = 'Live numbers are unavailable right now.'; });

// Chapter highlight while scrolling.
const links = new Map([...document.querySelectorAll('.toc a')].map((a) => [a.getAttribute('href').slice(1), a]));
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of links.values()) a.classList.remove('is-on');
    links.get(e.target.id)?.classList.add('is-on');
  }
}, { rootMargin: '-90px 0px -75% 0px' }); // a thin band just under the sticky header
for (const id of links.keys()) { const s = document.getElementById(id); if (s) seen.observe(s); }
// On phones the chapter list starts closed.
if (matchMedia('(max-width: 900px)').matches) $('.toc__drawer').open = false;
