// Comic-style visual effects: "POW!" text pops, hit sparks, dust puffs, hearts.
import * as THREE from 'three';
import { rand } from '../core/util.js';

function textTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 72px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 14;
  g.strokeStyle = '#2b1b10';
  g.strokeText(text, 128, 66);
  g.fillStyle = color;
  g.fillText(text, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 30 : 11;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'fx';
    scene.add(this.group);
    this.items = [];
    this.star = starTexture();
    this.dot = dotTexture();
    this.textCache = new Map();
  }

  add(obj) { this.group.add(obj); }

  text(pos, str, color = '#ffd23f', size = 0.9) {
    const key = `${str}|${color}`;
    if (!this.textCache.has(key)) this.textCache.set(key, textTexture(str, color));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.textCache.get(key), transparent: true, depthTest: false }));
    s.position.copy(pos);
    s.renderOrder = 999;
    this.group.add(s);
    this.items.push({ obj: s, life: 0.9, max: 0.9, kind: 'text', size, vel: new THREE.Vector3(0, 0.8, 0), rot: rand(-0.3, 0.3) });
  }

  burst(pos, color = '#fff2a8', n = 7, size = 0.22) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color, transparent: true, depthWrite: false }));
      s.position.copy(pos);
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(1.5, 3));
      this.group.add(s);
      this.items.push({ obj: s, life: 0.45, max: 0.45, kind: 'spark', size, vel: v });
    }
  }

  dust(pos, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: '#d9cbb0', transparent: true, depthWrite: false, opacity: 0.7 }));
      s.position.copy(pos).add(new THREE.Vector3(rand(-0.3, 0.3), 0.05, rand(-0.3, 0.3)));
      const v = new THREE.Vector3(rand(-1, 1), rand(0.2, 0.8), rand(-1, 1)).multiplyScalar(0.8);
      this.group.add(s);
      this.items.push({ obj: s, life: 0.9, max: 0.9, kind: 'dust', size: 0.35, vel: v });
    }
  }

  splash(pos, n = 10, parent = this.group) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: '#bfe0ff', transparent: true, depthWrite: false, opacity: 0.8 }));
      s.position.copy(pos);
      const v = new THREE.Vector3(rand(-1, 1), rand(1, 2.5), rand(-1, 1));
      parent.add(s);
      this.items.push({ obj: s, life: 0.7, max: 0.7, kind: 'drop', size: 0.08, vel: v, gravity: true });
    }
  }

  hearts(pos) { this.text(pos, '❤', '#ff5c8a', 0.5); }

  update(dt) {
    for (const it of this.items) {
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.obj.position.addScaledVector(it.vel, dt);
      if (it.gravity) it.vel.y -= 9 * dt;
      if (it.kind === 'text') {
        const pop = Math.min(1, (1 - k) * 6);
        it.obj.scale.set(it.size * 2 * pop, it.size * pop, 1);
        it.obj.material.rotation = it.rot;
        it.obj.material.opacity = Math.min(1, k * 3);
      } else if (it.kind === 'dust') {
        const s = it.size * (1.5 - k);
        it.obj.scale.set(s, s, 1);
        it.obj.material.opacity = k * 0.6;
        it.vel.multiplyScalar(0.95);
      } else {
        it.obj.scale.setScalar(it.size * (0.4 + k));
        it.obj.material.opacity = k;
      }
      if (it.life <= 0) { it.obj.removeFromParent(); it.obj.material.dispose(); }
    }
    this.items = this.items.filter((it) => it.life > 0);
  }
}
