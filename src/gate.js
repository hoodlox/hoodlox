// Entry gate shown over the loading map: pick a hunter, a name and type the wallet address rewards are
// paid to. No wallet connection and no signature. An address that already has a hunter, or a saved
// session, walks straight in. Guests skip the address and can only look around.
// ?address=0x…&name=&hero= enters at once, ?guest=1[&name=&hero=] enters as a guest at once (both
// used by tools), ?fresh=1 forgets the saved session.
import { HERO_CARD, cardInner, installWaves } from './cards.js';
import { BRAND, HEROES, validName } from './game.js';
import { api, session, enterWith, setMe } from './net.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const validAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);

const MARKUP = `
<div class="gate">
  <section class="gate__card">
    <header class="gate__brand"><img class="brand__logo" src="/brand/logo-64.png" alt="" /><b>${BRAND}</b><small class="mono">Season 0 · <em>Free to play</em></small></header>
    <h2 class="display">Choose your hunter</h2>
    <div class="heroes" role="radiogroup" aria-label="Hunter">
      ${HEROES.map((h) => `<button class="hero card" type="button" role="radio" aria-checked="false" data-hero="${h}" style="--c:${HERO_CARD[h].color}">${cardInner(h)}</button>`).join('')}
    </div>
    <label class="field">Hunter name<input class="gate__name" type="text" maxlength="16" autocomplete="off" placeholder="2–16 characters" /></label>
    <label class="field">Your wallet address · rewards are sent here<input class="gate__addr" type="text" maxlength="42" autocomplete="off" spellcheck="false" placeholder="0x…" /></label>
    <p class="gate__how">No wallet connection and nothing to sign. Rewards collect in the game pool and are sent to this address on Robinhood Chain when you redeem.</p>
    <p class="gate__err" role="alert" hidden></p>
    <button class="btn btn--primary gate__play" type="button" disabled>Loading map…</button>
    <button class="btn btn--ghost gate__guest" type="button">Look around as a guest</button>
  </section>
</div>`;

export function createGate(q) {
  installWaves();
  const wrap = el(MARKUP);
  document.body.appendChild(wrap);
  document.body.classList.add('gated');
  const $ = (s) => wrap.querySelector(s);
  const err = (m) => { $('.gate__err').textContent = m; $('.gate__err').hidden = !m; };
  const bad = (s) => { $(s).classList.add('is-bad'); $(s).focus(); };
  let hero = HEROES.includes(q.get('hero')) ? q.get('hero') : HEROES[0], mapReady = false, pending = null, busy = false, resolve;
  const result = new Promise((r) => { resolve = r; });
  const onReady = (fn) => (mapReady ? fn() : (pending = fn));

  const finish = (me) => onReady(() => {
    const agent = setMe(me); // the one shared object every UI reads (net.js live.me)
    wrap.remove();
    document.body.classList.remove('gated');
    resolve({ address: agent.id, agent });
  });

  for (const b of wrap.querySelectorAll('.hero')) {
    // Preselect the hero picked on the landing page (?hero=).
    b.classList.toggle('is-on', b.dataset.hero === hero);
    b.setAttribute('aria-checked', b.dataset.hero === hero);
    b.addEventListener('click', () => {
      for (const o of wrap.querySelectorAll('.hero')) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-checked', o === b); }
      hero = b.dataset.hero;
    });
  }

  // Holder: address first (a returning address keeps its hunter), then a new hunter if there is none.
  // Guest: a throwaway session and a hunter that can only walk.
  const enter = async (asGuest) => {
    if (busy) return;
    err('');
    const name = $('.gate__name').value.trim(), address = $('.gate__addr').value.trim();
    if (!asGuest && !validAddress(address)) { err('Enter your wallet address: 0x followed by 40 letters and numbers.'); return bad('.gate__addr'); }
    busy = true; $('.gate__play').disabled = true;
    try {
      if (asGuest) session.use((await api('/api/auth/guest', {})).token);
      else { const { me } = await enterWith(address); if (me) return finish(me); }
      if (!validName(name)) { err('Pick a name for your hunter: 2–16 letters or numbers.'); return bad('.gate__name'); }
      finish((await api('/api/player', { name, hero })).me);
    } catch (e) {
      err(e.message);
      if (e.status === 409) bad('.gate__name');
      if (e.status === 400 || e.status === 403) bad('.gate__addr');
    } finally { busy = false; $('.gate__play').disabled = !mapReady; }
  };
  $('.gate__play').addEventListener('click', () => enter(false));
  $('.gate__guest').addEventListener('click', () => enter(true));
  for (const s of ['.gate__name', '.gate__addr']) {
    $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(false); });
    $(s).addEventListener('input', () => { $(s).classList.remove('is-bad'); err(''); });
  }

  const ready = () => {
    mapReady = true;
    $('.gate__play').disabled = busy;
    $('.gate__play').textContent = 'Play';
    if (pending) pending();
  };

  // Shortcuts for returning players and tools.
  (async () => {
    if (q.has('fresh')) session.clear();
    if (session.token) {
      try { const { me } = await api('/api/me'); if (me) return finish(me); } catch { session.clear(); }
    }
    if (q.has('name')) $('.gate__name').value = q.get('name');
    if (q.has('address')) { $('.gate__addr').value = q.get('address'); enter(false); }
    else if (q.has('guest')) enter(true);
  })();

  return { result, ready };
}
