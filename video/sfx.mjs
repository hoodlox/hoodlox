// Synthesised sound effects for the intro (no samples, no licences): each returns a Float32Array at
// RATE. mixCues() lays them on one track and writes a 16-bit WAV.
import { writeFileSync } from 'node:fs';

export const RATE = 44100;
const buf = (s) => new Float32Array(Math.ceil(s * RATE));
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const env = (i, n, a, r) => { const t = i / RATE, T = n / RATE; return Math.min(1, t / a) * Math.max(0, Math.min(1, (T - t) / r)); };

// State-variable filter, cutoff can change per sample.
function svf() {
  let lp = 0, bp = 0;
  return (x, fc, q = 0.7) => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, RATE / 6) / RATE);
    lp += f * bp; const hp = x - lp - q * bp; bp += f * hp;
    return { lp, bp, hp };
  };
}
const tone = (out, at, f0, f1, dur, vol, shape = 'sine', decay = 6) => {
  let ph = 0; const n = Math.floor(dur * RATE), o = Math.floor(at * RATE);
  for (let i = 0; i < n && o + i < out.length; i++) {
    const f = f0 * Math.pow(f1 / f0, i / n); ph += (2 * Math.PI * f) / RATE;
    let s = Math.sin(ph);
    if (shape === 'square') s = Math.sign(s) * 0.6 + Math.sin(ph * 3) * 0.15;
    if (shape === 'tri') s = (2 / Math.PI) * Math.asin(Math.sin(ph));
    out[o + i] += s * vol * Math.exp((-decay * i) / n) * Math.min(1, i / (0.002 * RATE));
  }
};
const bell = (out, at, f, dur, vol) => [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([m, a]) => tone(out, at, f * m, f * m, dur / Math.sqrt(m), vol * a, 'sine', 5));

export const SFX = {
  whoosh(dur = 0.5, up = true) {
    const o = buf(dur), f = svf();
    for (let i = 0; i < o.length; i++) { const p = i / o.length; o[i] = f(rnd(), up ? 300 + 5000 * p * p : 5000 - 4600 * p, 0.6).bp * Math.sin(Math.PI * p) ** 1.5 * 0.9; }
    return o;
  },
  swish() { return SFX.whoosh(0.28, true); },
  pop(pitch = 1) { const o = buf(0.14); tone(o, 0, 950 * pitch, 260 * pitch, 0.12, 0.6, 'sine', 4); return o; },
  click() { const o = buf(0.05); for (let i = 0; i < 90; i++) o[i] = rnd() * (1 - i / 90) * 0.5; tone(o, 0, 2400, 1800, 0.04, 0.25); return o; },
  key() { const o = buf(0.09); const f = svf(); for (let i = 0; i < 600; i++) o[i] = f(rnd(), 2500).bp * (1 - i / 600) * 0.9; tone(o, 0.002, 520, 380, 0.06, 0.3, 'tri'); return o; },
  boom() {
    const o = buf(1.6), f = svf();
    tone(o, 0, 120, 38, 1.4, 0.95, 'sine', 3.5);
    for (let i = 0; i < o.length; i++) o[i] += f(rnd(), 900 - 700 * (i / o.length)).lp * Math.exp(-i / (0.18 * RATE)) * 1.4;
    return o;
  },
  riser(dur = 1.8) {
    const o = buf(dur), f = svf();
    for (let i = 0; i < o.length; i++) { const p = i / o.length; o[i] = f(rnd(), 400 + 7000 * p * p, 0.4).bp * p * p * 0.7; }
    tone(o, 0, 180, 900, dur, 0.18, 'tri', 0);
    for (let i = 0; i < o.length; i++) o[i] *= Math.min(1, (o.length - i) / (0.03 * RATE));
    return o;
  },
  coin() { const o = buf(0.5); tone(o, 0, 988, 988, 0.08, 0.32, 'square', 1); tone(o, 0.075, 1319, 1319, 0.4, 0.32, 'square', 5); return o; },
  sparkle(dur = 0.8, n = 14) { const o = buf(dur + 0.4); for (let k = 0; k < n; k++) bell(o, (k / n) * dur, 1800 + ((rnd() + 1) / 2) * 3600, 0.35, 0.09); return o; },
  ding(pitch = 1) { const o = buf(1.4); bell(o, 0, 660 * pitch, 1.3, 0.35); return o; },
  fanfare() {
    const o = buf(2.6);
    [523, 659, 784, 1047].forEach((f, i) => { bell(o, i * 0.11, f, 1.6, 0.28); tone(o, i * 0.11, f, f, 0.5, 0.12, 'square', 3); });
    [1047, 1319, 1568].forEach((f) => tone(o, 0.5, f, f, 1.8, 0.1, 'tri', 2.5));
    const s = SFX.sparkle(1.4, 20); for (let i = 0; i < s.length && i + 0.45 * RATE < o.length; i++) o[i + Math.floor(0.45 * RATE)] += s[i] * 0.8;
    return o;
  },
  dig() {
    const o = buf(1.3), f = svf();
    for (const at of [0, 0.42, 0.84]) {
      const s = Math.floor(at * RATE);
      for (let i = 0; i < 0.22 * RATE; i++) o[s + i] += f(rnd(), 700).lp * Math.exp(-i / (0.05 * RATE)) * 2.2;
      tone(o, at, 140, 60, 0.18, 0.5, 'sine', 4);
      for (let i = 0; i < 0.12 * RATE; i++) o[s + 900 + i] += rnd() * 0.18 * Math.exp(-i / (0.03 * RATE)); // grit
    }
    return o;
  },
  tick() { const o = buf(0.06); tone(o, 0, 3200, 3000, 0.03, 0.25); for (let i = 0; i < 60; i++) o[i] += rnd() * 0.3 * (1 - i / 60); return o; },
  stamp() { const o = buf(0.5), f = svf(); tone(o, 0, 160, 50, 0.3, 0.8, 'sine', 5); for (let i = 0; i < 0.15 * RATE; i++) o[i] += f(rnd(), 1500).lp * Math.exp(-i / (0.03 * RATE)) * 1.5; return o; },
  lock() { const o = buf(0.3); for (const at of [0, 0.09]) { const s = Math.floor(at * RATE); for (let i = 0; i < 300; i++) o[s + i] += rnd() * (1 - i / 300) * 0.6; tone(o, at, 1800, 1500, 0.08, 0.25, 'square', 6); } return o; },
  creak() {
    const o = buf(0.7), f = svf(); let ph = 0;
    for (let i = 0; i < o.length; i++) { const p = i / o.length; ph += (2 * Math.PI * (110 + 60 * Math.sin(p * 9) + 40 * p)) / RATE; o[i] = f((ph % (2 * Math.PI)) / Math.PI - 1, 1400, 0.3).bp * Math.sin(Math.PI * p) * 0.5; }
    return o;
  },
  chest() { const o = buf(2.0); const c = SFX.creak(); o.set(c); const s = SFX.sparkle(0.9, 16); for (let i = 0; i < s.length && i + 0.35 * RATE < o.length; i++) o[i + Math.floor(0.35 * RATE)] += s[i]; return o; },
  kaching() { const o = buf(1.4); const c = SFX.coin(); o.set(c); bell(o, 0.12, 1568, 1.1, 0.3); bell(o, 0.12, 2093, 1.0, 0.18); return o; },
  poof() { const o = buf(0.45), f = svf(); for (let i = 0; i < o.length; i++) { const p = i / o.length; o[i] = f(rnd(), 2500 - 2000 * p).lp * Math.exp(-p * 6) * 1.1; } return o; },
  levelup() { const o = buf(1.2); [392, 523, 659, 784].forEach((fr, i) => tone(o, i * 0.08, fr, fr, 0.35, 0.22, 'square', 3)); bell(o, 0.32, 1047, 0.8, 0.25); return o; },
};

// cues: [{ t, name, vol, arg }] → mono 16-bit WAV of `seconds`.
export function mixCues(cues, seconds, file) {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  for (const c of cues) {
    const s = SFX[c.name](...(c.args ?? [])), o = Math.floor(c.t * RATE), v = c.vol ?? 1;
    for (let i = 0; i < s.length && o + i < out.length; i++) if (o + i >= 0) out[o + i] += s[i] * v;
  }
  const data = Buffer.alloc(out.length * 2);
  for (let i = 0; i < out.length; i++) data.writeInt16LE(Math.round(Math.tanh(out[i] * 0.9) * 32000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}
