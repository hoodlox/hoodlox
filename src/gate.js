// Entry gate shown over the loading map. Connect an EVM wallet (it signs a one-time message, no
// transaction) or enter as a guest, then pick a hunter and a name. A wallet that already has a hunter,
// or a saved session, walks straight in.
// ?guest=1[&name=&hero=] enters as a guest at once, ?autoconnect=1[&name=&hero=] signs in with the
// page's wallet at once (both used by tools), ?fresh=1 forgets the saved session.
import { HERO_CARD, cardInner, installWaves } from './cards.js';
import { BRAND, HEROES, validName, short } from './game.js';
import { api, session, signIn, setMe } from './net.js';

const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

const MARKUP = `
<div class="gate">
  <section class="gate__card">
    <header class="gate__brand"><img class="brand__logo" src="/brand/logo-64.png" alt="" /><b>${BRAND}</b><small class="mono">Season 0 · <em>Free to play</em></small></header>
    <div class="gate__step gate__step--wallet">
      <h1 class="display">Dig. Open.<br />Earn.</h1>
      <p>Find crates buried in the valley, dig them up and open them for ETH, $HUNT and tokenized stocks on Robinhood Chain. Connect a wallet to hunt, or look around first.</p>
      <button class="btn btn--primary gate__connect" type="button">Connect wallet</button>
      <button class="btn gate__guest" type="button">Look around as a guest</button>
      <p class="gate__err" role="alert" hidden></p>
    </div>
    <div class="gate__step gate__step--agent" hidden>
      <p class="gate__who"></p>
      <h2 class="display">Choose your hunter</h2>
      <div class="heroes" role="radiogroup" aria-label="Hunter">
        ${HEROES.map((h) => `<button class="hero card" type="button" role="radio" aria-checked="false" data-hero="${h}" style="--c:${HERO_CARD[h].color}">${cardInner(h)}</button>`).join('')}
      </div>
      <label class="field">Agent name<input class="gate__name" type="text" maxlength="16" autocomplete="off" placeholder="2–16 characters" /></label>
      <p class="gate__err gate__err--name" role="alert" hidden></p>
      <button class="btn btn--primary gate__play" type="button" disabled>Loading map…</button>
      <button class="btn btn--ghost gate__back" type="button">Use another wallet</button>
    </div>
  </section>
</div>`;

export function createGate(q) {
  installWaves();
  const wrap = el(MARKUP);
  document.body.appendChild(wrap);
  document.body.classList.add('gated');
  const $ = (s) => wrap.querySelector(s);
  const err = (m, s = '.gate__err') => { $(s).textContent = m; $(s).hidden = !m; };
  let hero = HEROES.includes(q.get('hero')) ? q.get('hero') : HEROES[0], mapReady = false, pending = null, resolve;
  const result = new Promise((r) => { resolve = r; });
  const onReady = (fn) => (mapReady ? fn() : (pending = fn));

  const finish = (me) => onReady(() => {
    const agent = setMe(me); // the one shared object every UI reads (net.js live.me)
    wrap.remove();
    document.body.classList.remove('gated');
    resolve({ address: agent.id, agent });
  });
  const showPicker = (who) => {
    $('.gate__step--wallet').hidden = true;
    $('.gate__step--agent').hidden = false;
    $('.gate__who').textContent = who;
    $('.gate__name').focus();
  };

  const connect = async () => {
    err('');
    $('.gate__connect').disabled = true;
    try {
      const { address, me } = await signIn();
      if (me) return finish(me);
      showPicker(`Wallet ${short(address)}`);
    } catch (e) { err(e?.message ?? 'Connection was cancelled.'); } finally { $('.gate__connect').disabled = false; }
  };
  const guest = async () => {
    err('');
    try {
      session.use((await api('/api/auth/guest', {})).token);
      showPicker('Guest: you can walk around but not dig. Connect a wallet to hunt.');
    } catch (e) { err(e.message); }
  };
  $('.gate__connect').addEventListener('click', connect);
  $('.gate__guest').addEventListener('click', guest);
  $('.gate__back').addEventListener('click', () => { session.clear(); $('.gate__step--agent').hidden = true; $('.gate__step--wallet').hidden = false; });
  for (const b of wrap.querySelectorAll('.hero')) {
    // Preselect the hero picked on the landing page (?hero=).
    b.classList.toggle('is-on', b.dataset.hero === hero);
    b.setAttribute('aria-checked', b.dataset.hero === hero);
    b.addEventListener('click', () => {
      for (const o of wrap.querySelectorAll('.hero')) { o.classList.toggle('is-on', o === b); o.setAttribute('aria-checked', o === b); }
      hero = b.dataset.hero;
    });
  }
  const create = async () => {
    const name = $('.gate__name').value.trim();
    if (!validName(name)) { $('.gate__name').focus(); $('.gate__name').classList.add('is-bad'); return; }
    $('.gate__play').disabled = true;
    try { finish((await api('/api/player', { name, hero })).me); } catch (e) {
      err(e.message, '.gate__err--name');
      if (e.status === 409) $('.gate__name').classList.add('is-bad');
    } finally { $('.gate__play').disabled = !mapReady; }
  };
  $('.gate__play').addEventListener('click', create);
  $('.gate__name').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  $('.gate__name').addEventListener('input', () => { $('.gate__name').classList.remove('is-bad'); err('', '.gate__err--name'); });

  const ready = () => {
    mapReady = true;
    $('.gate__play').disabled = false;
    $('.gate__play').textContent = 'Play';
    if (pending) pending();
  };

  // Shortcuts for returning players and tools.
  (async () => {
    if (q.has('fresh')) session.clear();
    if (session.token) {
      try { const { me } = await api('/api/me'); if (me) return finish(me); } catch { session.clear(); }
    }
    const auto = async (enter) => {
      await enter();
      if (!$('.gate__step--agent').hidden && q.has('name')) { $('.gate__name').value = q.get('name'); await create(); }
    };
    if (q.has('autoconnect')) auto(connect);
    else if (q.has('guest')) auto(guest);
  })();

  return { result, ready };
}
