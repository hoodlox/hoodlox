// Random walk on the meadow shared by animals and other players: rest a while, pick a reachable
// target a few metres away, walk there facing the way, repeat. Ground comes from groundProbe().
import * as THREE from 'three';

export class Wanderer {
  // play(name) switches the owner's animation: 'idle' | 'walk' (the owner may map 'idle' to eating etc.)
  constructor({ obj, groundAt, rnd, speed, play, facing = 0 }) {
    Object.assign(this, { obj, groundAt, rnd, speed, play, facing });
    this.rest(0.5 + rnd() * 3);
  }
  rest(seconds) { this.target = null; this.timer = seconds; this.play('idle'); }
  pickTarget() {
    const p = this.obj.position;
    for (let i = 0; i < 12; i++) {
      const a = this.rnd() * Math.PI * 2, r = 400 + this.rnd() * 2500;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const y = this.groundAt(x, z);
      if (y !== null && Math.abs(y - p.y) < 300) { this.target = new THREE.Vector3(x, y, z); this.play('walk'); return; }
    }
    this.rest(1);
  }
  update(dt) {
    if (!this.target) {
      if ((this.timer -= dt) <= 0) this.pickTarget();
      return;
    }
    const p = this.obj.position;
    const dx = this.target.x - p.x, dz = this.target.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 30) return this.rest(2 + this.rnd() * 5);
    const step = Math.min(this.speed * dt, dist);
    const nx = p.x + (dx / dist) * step, nz = p.z + (dz / dist) * step;
    const y = this.groundAt(nx, nz);
    if (y === null || Math.abs(y - p.y) > 150) return this.rest(0.5); // walked off the meadow or into a ledge
    p.set(nx, y, nz);
    const want = Math.atan2(dx, dz) + this.facing;
    let d = want - this.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.obj.rotation.y += d * Math.min(1, dt * 6);
  }
}

// Random walkable spot inside bounds, or null after 200 misses.
export function randomSpot(groundAt, bounds, rnd) {
  const size = bounds.getSize(new THREE.Vector3());
  for (let tries = 0; tries < 200; tries++) {
    const x = bounds.min.x + rnd() * size.x, z = bounds.min.z + rnd() * size.z;
    const y = groundAt(x, z);
    if (y !== null) return new THREE.Vector3(x, y, z);
  }
  return null;
}

export { seeded } from './game.js'; // shared with the server
