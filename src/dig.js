// Buried crates and digging, driven by the server. Every 2-hour epoch the server buries 20–30 crates
// (positions only; rarities stay secret) and clears whatever was left of the last epoch. Each crate
// is a plain chest half sunk in the grass with a few faint motes. Digging claims the crate on the
// server (nobody else can dig it meanwhile), waits the tool's time, and the server then reveals the
// rarity and puts the chest in the inventory.
import * as THREE from 'three';
import { makeChest } from './chest.js';
import { tool, CRATES_MAX } from './game.js';
import { api, setMe } from './net.js';

const MOTES = 7;          // per site
const REACH = 260;        // cm: how close the hero must stand to dig
const CHEST_SCALE = 55;   // chest model is ~1.2 units tall → ~65 cm
const BURY = 38;          // cm sunk below the grass: a bit more than half the chest

function moteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,190,1)');
  g.addColorStop(0.35, 'rgba(255,214,120,.55)');
  g.addColorStop(1, 'rgba(255,200,90,0)');
  const ctx = c.getContext('2d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
// Small deterministic jitter per crate so markers and motes do not look stamped.
const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function createDigSites(scene, groundAt) {
  const sites = Array.from({ length: CRATES_MAX }, (_, id) => ({ id, live: false, at: null, motes: [] }));
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(CRATES_MAX * MOTES * 3).fill(-1e7);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: moteTexture(), size: 14, sizeAttenuation: true, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  scene.add(points);

  // The visible marker: a plain wooden chest half sunk into the ground at a slight tilt.
  const seat = (s) => {
    if (!s.mark) return;
    s.mark.visible = s.live;
    if (!s.at) return;
    s.mark.position.set(s.at.x, s.at.y - BURY, s.at.z);
    s.mark.rotation.set((hash(s.key) - 0.5) * 0.35, hash(s.key + 1) * Math.PI * 2, (hash(s.key + 2) - 0.5) * 0.35);
  };
  const ready = Promise.all(sites.map(async (s) => {
    const c = await makeChest('common', 'TreasureChest_WoodSilver');
    c.obj.scale.setScalar(CHEST_SCALE);
    s.mark = c.obj;
    scene.add(s.mark);
    seat(s);
  }));

  let epoch = null, total = 0;
  // A new epoch from the server: clear every crate and bury the new set.
  function setEpoch(ep) {
    epoch = ep.epoch;
    total = ep.crates.length;
    for (const s of sites) {
      const c = ep.crates[s.id];
      s.claimedBy = null;
      s.key = ep.epoch * 64 + s.id;
      const y = c ? groundAt(c.x, c.z) : null;
      s.at = c && y !== null ? new THREE.Vector3(c.x, y, c.z) : null;
      s.live = !!s.at;
      s.motes = Array.from({ length: MOTES }, (_, k) => ({
        dx: (hash(s.key * 9 + k) - 0.5) * 70, dz: (hash(s.key * 7 + k) - 0.5) * 70, phase: hash(s.key * 5 + k), speed: 0.12 + hash(s.key * 3 + k) * 0.1,
      }));
      seat(s);
    }
  }
  // Who is digging what, and what is gone, as of the last sync.
  function applySync(sync) {
    if (sync.epoch !== epoch) return;
    const dug = new Set(sync.dug);
    for (const s of sites) {
      if (s.live && dug.has(s.id)) { s.live = false; seat(s); }
      s.claimedBy = sync.claims[s.id] ?? null;
    }
  }

  let t = 0;
  function update(dt) {
    t += dt;
    for (const s of sites) {
      s.motes.forEach((m, k) => {
        const i = (s.id * MOTES + k) * 3;
        if (!s.live) { pos[i + 1] = -1e7; return; } // park hidden motes far below the map
        const life = (t * m.speed + m.phase) % 1;  // each mote rises ~90 cm, then starts over
        pos[i] = s.at.x + m.dx + Math.sin((t + m.phase * 9) * 1.3) * 8;
        pos[i + 1] = s.at.y + 10 + life * 90;
        pos[i + 2] = s.at.z + m.dz + Math.cos((t + m.phase * 7) * 1.1) * 8;
      });
    }
    geo.attributes.position.needsUpdate = true;
  }
  const nearest = (p) => {
    let best = null, bd = REACH;
    for (const s of sites) if (s.live) { const d = Math.hypot(s.at.x - p.x, s.at.z - p.z); if (d < bd) { bd = d; best = s; } }
    return best;
  };
  const consume = (s) => { s.live = false; s.claimedBy = null; seat(s); };
  return {
    sites, setEpoch, applySync, update, nearest, consume, points, ready,
    get epoch() { return epoch; },
    get total() { return total; },
    get left() { return sites.filter((s) => s.live).length; },
  };
}

// The dig flow: Dig button / E near a crate → server claim → timed dig → server reveals the chest →
// it rises out of the ground → onFound(chest). Guests see why they cannot dig.
export function createDigging({ scene, player, sites, agent, onFound, onError = () => {} }) {
  const ui = document.getElementById('dig');
  const btn = ui.querySelector('.dig__btn');
  const bar = ui.querySelector('.dig__bar');
  const fill = ui.querySelector('.dig__fill');
  const label = ui.querySelector('.dig__label');
  const cancel = ui.querySelector('.dig__cancel');
  let job = null;          // { site, epoch, left, total, finishing }
  let starting = false;
  let rising = [];         // chests coming out of the ground
  let near = null;

  const start = async () => {
    if (job || starting || !near || agent.guest || near.claimedBy) return;
    starting = true;
    const site = near;
    try {
      const res = await api('/api/dig/start', { epoch: sites.epoch, i: site.id });
      job = { site, epoch: sites.epoch, left: res.seconds, total: res.seconds };
      player.setBusy('dig');
      player.obj.rotation.y = Math.atan2(site.at.x - player.obj.position.x, site.at.z - player.obj.position.z);
    } catch (e) { onError(e.message); } finally { starting = false; }
  };
  const stop = (tell = true) => {
    if (job && tell) api('/api/dig/cancel', { epoch: job.epoch, i: job.site.id }).catch(() => {});
    job = null;
    player.setBusy(null);
  };
  btn.addEventListener('click', start);
  cancel.addEventListener('click', () => stop());
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyE' && !document.body.classList.contains('dash-open')) start();
    if (e.code === 'Escape' && job) stop();
  });

  // The local timer has run out: ask the server to finish (it re-checks the time; retry briefly to
  // ride out clock skew).
  async function finish(j) {
    for (let i = 0; i < 6; i++) {
      try {
        const res = await api('/api/dig/finish', { epoch: j.epoch, i: j.site.id });
        setMe(res.me);
        sites.consume(j.site);
        stop(false);
        const chest = await makeChest(res.chest.rarity);
        chest.obj.scale.setScalar(CHEST_SCALE);
        chest.obj.position.set(j.site.at.x, j.site.at.y - 60, j.site.at.z);
        chest.obj.rotation.y = Math.atan2(player.obj.position.x - j.site.at.x, player.obj.position.z - j.site.at.z);
        scene.add(chest.obj);
        rising.push({ chest, t: 0 });
        onFound(res.chest);
        return;
      } catch (e) {
        if (e.status !== 409 || i === 5) { stop(false); onError(e.message); return; }
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  function update(dt) {
    // The epoch rolled over mid-dig: that crate was cleared, so the dig ends empty-handed.
    if (job && (job.epoch !== sites.epoch || !job.site.live)) stop(false);
    near = job ? job.site : sites.nearest(player.obj.position);
    if (job && !job.finishing) {
      if (player.wantsMove) stop(); // walking off cancels the dig
      else if ((job.left -= dt) <= 0) { job.finishing = true; finish(job); }
    }
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s) % 60).padStart(2, '0')}`;
    const taken = !job && near?.claimedBy && near.claimedBy !== agent.name ? near.claimedBy : null;
    btn.hidden = !near || !!job;
    btn.disabled = !!taken || agent.guest;
    bar.hidden = !job;
    cancel.hidden = !job;
    if (job) {
      fill.style.width = `${(1 - Math.max(0, job.left) / job.total) * 100}%`;
      label.textContent = job.finishing ? 'Opening the ground…' : `Digging with ${tool(agent.equipped).name} · ${fmt(Math.max(0, job.left))}`;
    } else if (agent.guest && near) btn.textContent = 'Enter a wallet address to dig';
    else if (taken) btn.textContent = `${taken} is digging here`;
    else if (near) btn.textContent = `Dig here · ${fmt(tool(agent.equipped).seconds / (+new URLSearchParams(location.search).get('fastdig') || 1))} (E)`;
    // Chests rise for 1 s, hold, then sink back after 4 s (the real one is in the inventory).
    rising = rising.filter((r) => {
      r.t += dt;
      const y0 = r.chest.obj.userData.y0 ??= r.chest.obj.position.y;
      const up = Math.min(1, r.t) * 60 - Math.max(0, r.t - 4) * 120;
      r.chest.obj.position.y = y0 + up;
      if (r.t > 1.2) r.chest.open();
      r.chest.update(dt);
      if (r.t > 5) { r.chest.obj.removeFromParent(); return false; }
      return true;
    });
  }
  return { update, get digging() { return !!job; } };
}
