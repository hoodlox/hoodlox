// Landing page content: hunter card fan, chest rarity rail, drop odds and the tool shop, all read from
// game.js so the page and the game never disagree on numbers.
import { TOOLS, RARITIES, TOKEN, TOKEN_SUPPLY, amount, usd } from './game.js';
import { HERO_CARD, cardInner, installWaves } from './cards.js';

const $ = (s) => document.querySelector(s);
const chestImg = (id, open = false) => `/scenes/chests/icons/${id}-${open ? 'open' : 'closed'}.png`;

installWaves();

// ── hunter fan ───────────────────────────────────────────────────────────
// Middle cards sit highest and in front; the outer ones tilt out and drop.
const HUNTERS = Object.keys(HERO_CARD);
const fan = $('.fan');
const mid = (HUNTERS.length - 1) / 2;
fan.innerHTML = HUNTERS.map((hero, i) => {
  const o = i - mid;
  const play = `/play?hero=${hero}`;
  return `<a class="card" role="listitem" data-i="${i}" href="${play}" style="--c:${HERO_CARD[hero].color};--x:${o * 74}%;--y:${Math.abs(o) ** 1.6 * 34}px;--r:${o * 7}deg;--z:${10 - Math.round(Math.abs(o) * 2)}">
    ${cardInner(hero)}
  </a>`;
}).join('');

// ── chest rail ───────────────────────────────────────────────────────────
const total = RARITIES.reduce((a, r) => a + r.weight, 0);
const odds = (r) => `${((r.weight / total) * 100).toFixed(0)}%`;
const rail = $('.rail');
rail.innerHTML = [...RARITIES].reverse().map((r) => `
  <article class="slide" role="listitem" style="--c:${r.color}">
    <img src="${chestImg(r.id, r.id === 'legendary' || r.id === 'epic')}" alt="" loading="lazy" />
    <div class="slide__text"><div><small>Chest™</small><h3 class="display">${r.name}</h3></div><span class="slide__odds">${odds(r)}</span></div>
  </article>`).join('');
const count = $('.js-count');
const step = () => rail.querySelector('.slide').getBoundingClientRect().width + 16;
$('.js-prev').addEventListener('click', () => rail.scrollBy({ left: -step(), behavior: 'smooth' }));
$('.js-next').addEventListener('click', () => rail.scrollBy({ left: step(), behavior: 'smooth' }));
rail.addEventListener('scroll', () => { count.textContent = String(Math.round(rail.scrollLeft / step()) + 1).padStart(2, '0'); }, { passive: true });

// ── drop odds ────────────────────────────────────────────────────────────
$('.odds').innerHTML = RARITIES.map((r) => `
  <li style="--c:${r.color}"><img src="${chestImg(r.id)}" alt="" loading="lazy" /><div><b>${r.name}</b><span>${odds(r)} of digs</span></div></li>`).join('');

// ── tools ────────────────────────────────────────────────────────────────
const slowest = Math.max(...TOOLS.map((t) => t.seconds));
$('.tools').innerHTML = TOOLS.map((t, i) => {
  const time = t.seconds >= 60 ? [t.seconds / 60, 'min'] : [t.seconds, 'sec'];
  const top = i === TOOLS.length - 1;
  return `<article class="tool${top ? ' tool--top' : ''}">
    ${top ? '<span class="tool__badge">Fastest</span>' : ''}
    <p class="tool__time display">${time[0]}<small>${time[1]}</small></p>
    <h3>${t.name}</h3>
    <p>per chest</p>
    <div class="bar" aria-hidden="true"><i style="width:${(slowest / t.seconds / (slowest / TOOLS.at(-1).seconds)) * 100}%"></i></div>
    <p class="tool__price">${t.price ? `${(t.price / TOKEN_SUPPLY * 100).toFixed(1)}% supply · ${amount(TOKEN, t.price)} $${TOKEN}` : 'Free for every hunter'}</p>
  </article>`;
}).join('');

// Live numbers: this epoch's pool and who is in the valley right now.
fetch('/api/epoch').then((r) => r.json()).then((ep) => {
  $('.js-balance').textContent = `${usd(ep.pool.reduce((a, p) => a + p.usd, 0))} pool`;
  $('.js-online').textContent = `${ep.online} hunter${ep.online === 1 ? '' : 's'} in the valley · ${ep.crates.length} crates buried`;
}).catch(() => {});
