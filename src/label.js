// Floating name tag: a canvas drawn once onto a sprite. Caller parents it to a character.
import * as THREE from 'three';

export function makeLabel(text, { color = '#fff', me = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(c.width - 16, ctx.measureText(text).width + 56);
  ctx.fillStyle = me ? 'rgba(243,195,90,.92)' : 'rgba(0,0,0,.55)';
  ctx.beginPath(); ctx.roundRect(c.width / 2 - w / 2, 20, w, 88, 28); ctx.fill();
  ctx.fillStyle = me ? '#1a1206' : color;
  ctx.fillText(text, c.width / 2, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.renderOrder = 10;
  return sprite;
}

// Parent the label above a character's head. The character is scaled to cm, so the label is sized in
// the character's own units (height = how tall the model is in its file).
export function attachLabel(obj, text, height, opts) {
  const l = makeLabel(text, opts);
  l.scale.set(height * 1.25, height * 0.31, 1);
  l.position.y = height * 1.22;
  obj.add(l);
  return l;
}
