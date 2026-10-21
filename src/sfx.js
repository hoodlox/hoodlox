// Tiny synthesized sound effects (Web Audio, no files): footsteps, jump, land, digging scrapes,
// a chime when a chest is found and coins when one opens. update() follows the hero's animation state.
// Plus a looping background track. Audio starts on the first key or tap (browser autoplay rules).
// M toggles mute for both.
const KEY = 'treasurehunt.muted';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export function createSfx() {
  let ctx = null, master = null, noise = null, muted = read();
  // Background music: "Treasure Hunter" by TAD (CC0, opengameart.org/content/treasure-hunter).
  const music = new Audio('/audio/treasure_hunter.mp3');
  music.loop = true;
  music.volume = 0.22;
  const start = () => {
    if (!muted) music.play().catch(() => {});
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 s of white noise, reused
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  };
  for (const ev of ['keydown', 'pointerdown']) addEventListener(ev, start, { once: true });

  // Filtered noise burst: the basis of steps, scrapes and thuds.
  const burst = ({ freq = 900, q = 1, dur = 0.08, gain = 0.4, type = 'bandpass', delay = 0 }) => {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.8, dur + 0.05);
  };
  const tone = ({ from, to = from, dur = 0.15, gain = 0.2, type = 'sine', delay = 0 }) => {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const fx = {
    step: (run) => burst({ freq: 380 + Math.random() * 160, q: 0.9, dur: run ? 0.06 : 0.08, gain: run ? 0.35 : 0.28, type: 'lowpass' }),
    jump: () => { tone({ from: 220, to: 520, dur: 0.18, gain: 0.12, type: 'triangle' }); burst({ freq: 1200, dur: 0.12, gain: 0.12 }); },
    land: () => burst({ freq: 220, q: 0.7, dur: 0.14, gain: 0.5, type: 'lowpass' }),
    dig: () => { burst({ freq: 1400 + Math.random() * 500, q: 2, dur: 0.18, gain: 0.3 }); burst({ freq: 260, dur: 0.12, gain: 0.35, type: 'lowpass', delay: 0.12 }); },
    found: () => [523, 659, 784, 1047].forEach((f, i) => tone({ from: f, dur: 0.35, gain: 0.14, type: 'triangle', delay: i * 0.09 })),
    coins: () => { for (let i = 0; i < 9; i++) tone({ from: 1800 + Math.random() * 1400, dur: 0.12, gain: 0.07, type: 'square', delay: i * 0.05 + Math.random() * 0.03 }); },
  };

  const setMuted = (m) => {
    muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ }
    if (master) master.gain.value = m ? 0 : 0.5;
    if (m) music.pause(); else music.play().catch(() => {});
  };
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) setMuted(!muted); });

  // Footsteps and dig strokes follow the animation state; jump/land fire on its edges.
  let prev = 'idle', timer = 0;
  function update(dt, state) {
    if (state === 'jump' && prev !== 'jump') fx.jump();
    if (prev === 'jump' && state !== 'jump') fx.land();
    const every = { walk: 0.48, run: 0.3, dig: 0.65 }[state];
    if (every) {
      if ((timer -= dt) <= 0) { timer = every; state === 'dig' ? fx.dig() : fx.step(state === 'run'); }
    } else timer = 0.05; // first step lands right after starting to move
    prev = state;
  }
  return { ...fx, update, setMuted, get muted() { return muted; } };
}
