// Low-poly prop and building factories. Every material comes from stdMat so
// it reacts to rain (wet sheen, streaks) and snow.

import * as THREE from 'three';
import { stdMat } from '../engine/materials.js';

export const nightMaterials = {
  window: new THREE.MeshStandardMaterial({ color: 0x9ec9e8, emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.15, metalness: 0.1 }),
  bulb: new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 0.2, roughness: 0.4 }),
};

export function shadowAll(obj, cast = true, receive = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, mat, seg = 12, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

export function makeLabelTexture(text, { bg = '#fff8e8', fg = '#5a3b2e', w = 512, h = 128, font = 'bold 64px "Trebuchet MS", sans-serif', border = '#e0b17a' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  const r = 28;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = border;
  g.stroke();
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4, w - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sign(text, width = 2, opts) {
  const tex = makeLabelTexture(text, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  return m;
}

export const surfaceMaterials = {
  wall: stdMat('#f4e7d3', { roughness: 0.9, porosity: 0.3, unique: true }),
  roof: stdMat('#c4574a', { roughness: 0.7, porosity: 0.25, unique: true }),
};

export function makeHouse({ wall = '#f4e7d3', roof = '#c4574a', door = '#7a4b33', name = '' } = {}) {
  const g = new THREE.Group();
  const wallMat = stdMat(wall, { roughness: 0.9, porosity: 0.3 });
  const roofMat = stdMat(roof, { roughness: 0.7, porosity: 0.25 });
  const trim = stdMat('#ffffff', { roughness: 0.6 });
  g.add(box(3.2, 2.4, 3.0, wallMat, 0, 1.2, 0));
  const r = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.7, 4, 1), roofMat);
  r.position.y = 3.25;
  r.rotation.y = Math.PI / 4;
  r.scale.set(1, 1, 0.95);
  g.add(r);
  g.add(box(0.4, 1.0, 0.4, stdMat('#8d8d8d', { roughness: 0.9 }), 0.8, 3.6, -0.5));
  g.add(box(0.85, 1.55, 0.08, stdMat(door, { roughness: 0.6 }), 0, 0.78, 1.52));
  const knob = cyl(0.05, 0.05, 0.05, stdMat('#e8c34a', { metalness: 0.8, roughness: 0.3 }), 8, 0.28, 0.8, 1.57);
  knob.rotation.x = Math.PI / 2;
  g.add(knob);
  for (const x of [-1.05, 1.05]) {
    g.add(box(0.75, 0.7, 0.06, nightMaterials.window, x, 1.45, 1.52));
    g.add(box(0.85, 0.08, 0.1, trim, x, 1.06, 1.54));
  }
  g.add(box(0.7, 0.7, 0.06, nightMaterials.window, -1.62, 1.45, 0).rotateY(Math.PI / 2));
  g.add(box(0.7, 0.7, 0.06, nightMaterials.window, 1.62, 1.45, 0).rotateY(Math.PI / 2));
  // step
  g.add(box(1.2, 0.12, 0.5, stdMat('#b9b2a6', { roughness: 0.9 }), 0, 0.06, 1.75));
  // mailbox
  g.add(cyl(0.04, 0.04, 0.9, stdMat('#6d4c3d'), 6, 1.35, 0.45, 2.1));
  g.add(box(0.3, 0.22, 0.4, stdMat('#d94f4f', { roughness: 0.5 }), 1.35, 0.95, 2.1));
  if (name) {
    const s = sign(name, 1.3, { font: 'bold 54px "Trebuchet MS", sans-serif' });
    s.position.set(0, 2.02, 1.54);
    g.add(s);
    g.userData.nameSign = s;
  }
  shadowAll(g);
  return g;
}

export function makeShop({ name = 'SHOP', wall = '#e9f1f7', roof = '#4b7bd1', awning = ['#4b7bd1', '#ffffff'] } = {}) {
  const g = new THREE.Group();
  const wallMat = stdMat(wall, { roughness: 0.85, porosity: 0.3 });
  g.add(box(5.4, 3.2, 4.2, wallMat, 0, 1.6, 0));
  g.add(box(5.8, 0.35, 4.6, stdMat(roof, { roughness: 0.7 }), 0, 3.35, 0));
  // big front window + door
  g.add(box(1.9, 1.5, 0.06, nightMaterials.window, -1.5, 1.35, 2.12));
  g.add(box(1.9, 1.5, 0.06, nightMaterials.window, 1.5, 1.35, 2.12));
  g.add(box(1.0, 2.0, 0.08, stdMat('#6a4632', { roughness: 0.6 }), 0, 1.0, 2.12));
  // striped awning
  for (let i = 0; i < 8; i++) {
    const m = box(0.7, 0.06, 1.2, stdMat(awning[i % 2], { roughness: 0.75, porosity: 0.5 }), -2.45 + i * 0.7, 2.55, 2.6);
    m.rotation.x = 0.35;
    g.add(m);
  }
  const s = sign(name, 3.2);
  s.position.set(0, 3.0, 2.13);
  g.add(s);
  shadowAll(g);
  return g;
}

/** Condo tower with an entrance canopy and a glass pool annex on its right side. */
export function makeCondo() {
  const g = new THREE.Group();
  const wall = stdMat('#e9e2f2', { roughness: 0.85, porosity: 0.3 });
  const band = stdMat('#7a6aa8', { roughness: 0.7 });
  const trim = stdMat('#ffffff', { roughness: 0.6 });
  const floors = 4;
  const fh = 2.3;
  g.add(box(7, floors * fh, 5.6, wall, 0, (floors * fh) / 2, 0));
  g.add(box(7.4, 0.4, 6, band, 0, floors * fh + 0.2, 0));
  for (let f = 0; f < floors; f++) {
    const y = f * fh + 1.35;
    if (f > 0) g.add(box(7.1, 0.12, 5.7, band, 0, f * fh, 0));
    for (const x of [-2.4, -0.8, 0.8, 2.4]) {
      if (f === 0 && Math.abs(x) < 1) continue;
      g.add(box(1.0, 1.0, 0.06, nightMaterials.window, x, y, 2.82));
      g.add(box(1.1, 0.08, 0.12, trim, x, y - 0.55, 2.86));
      g.add(box(1.0, 1.0, 0.06, nightMaterials.window, x, y, -2.82));
    }
    for (const z of [-1.4, 1.4]) {
      g.add(box(0.06, 1.0, 1.0, nightMaterials.window, -3.52, y, z));
      // little balconies on the left side
      if (f > 0) g.add(box(0.5, 0.08, 1.3, trim, -3.75, y - 0.55, z), box(0.04, 0.5, 1.3, trim, -3.98, y - 0.3, z));
    }
  }
  // entrance
  g.add(box(1.6, 2.1, 0.08, stdMat('#9fd4ff', { roughness: 0.1, metalness: 0.2 }), 0, 1.05, 2.84));
  g.add(box(0.06, 2.1, 0.1, trim, 0, 1.05, 2.9));
  g.add(box(2.6, 0.15, 1.4, band, 0, 2.5, 3.5));
  for (const x of [-1.2, 1.2]) g.add(cyl(0.05, 0.05, 2.5, trim, 8, x, 1.25, 4.1));
  g.add(box(2.8, 0.12, 1.6, stdMat('#b9b2a6', { roughness: 0.9 }), 0, 0.06, 3.6));
  const s = sign('🏢 CONDO', 3.0);
  s.position.set(0, 2.95, 2.84);
  g.add(s);
  // pool annex (glass roof, blue glow)
  const annex = new THREE.Group();
  annex.add(box(4.2, 2.4, 4.6, stdMat('#f4f1ea', { roughness: 0.8, porosity: 0.3 }), 0, 1.2, 0));
  annex.add(box(4.0, 0.08, 4.4, stdMat('#bfe8ff', { roughness: 0.05, metalness: 0.1 }), 0, 2.45, 0));
  annex.add(box(3.6, 1.0, 0.06, stdMat('#5ec4f2', { roughness: 0.1, emissive: '#2a8fc4' }), 0, 1.4, 2.32));
  const ps = sign('🏊 POOL', 2.0);
  ps.position.set(0, 2.15, 2.33);
  annex.add(ps);
  annex.position.set(5.6, 0, 0.3);
  g.add(annex);
  shadowAll(g);
  return g;
}

export function makeClinic() {
  const g = makeShop({ name: '✚ CLINIC', wall: '#ffffff', roof: '#e05b5b', awning: ['#ffffff', '#e05b5b'] });
  const cross = new THREE.Group();
  const red = stdMat('#e04848', { roughness: 0.5 });
  cross.add(box(0.9, 0.3, 0.12, red), box(0.3, 0.9, 0.12, red));
  cross.position.set(0, 4.1, 0);
  const pole = box(0.12, 0.8, 0.12, stdMat('#ffffff'), 0, 3.6, 0);
  g.add(cross, pole);
  shadowAll(g);
  return g;
}

export function makeCafe() {
  const g = makeShop({ name: '☕ CAFÉ', wall: '#fbe3c9', roof: '#8b5a3c', awning: ['#2f8f6b', '#fff6e0'] });
  // outdoor tables
  for (const [x, z] of [[-1.8, 4.2], [1.8, 4.2]]) {
    const t = makeParasolTable();
    t.position.set(x, 0, z);
    g.add(t);
  }
  return g;
}

export function makeParasolTable() {
  const g = new THREE.Group();
  const wood = stdMat('#a0714f', { roughness: 0.7, porosity: 0.5 });
  g.add(cyl(0.55, 0.55, 0.06, stdMat('#f5f5f5', { roughness: 0.4 }), 18, 0, 0.75, 0));
  g.add(cyl(0.05, 0.05, 0.75, wood, 8, 0, 0.37, 0));
  g.add(cyl(0.035, 0.035, 2.3, stdMat('#dddddd', { metalness: 0.5, roughness: 0.4 }), 6, 0, 1.15, 0));
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.5, 8, 1, true), stdMat('#e35d5d', { roughness: 0.7, porosity: 0.5 }));
  top.material.side = THREE.DoubleSide;
  top.position.y = 2.25;
  g.add(top);
  shadowAll(g);
  return g;
}

export function makeTree(kind = 'round', scale = 1) {
  const g = new THREE.Group();
  const trunkMat = stdMat('#7a5236', { roughness: 0.95, porosity: 0.5 });
  if (kind === 'palm') {
    const segs = 6;
    let y = 0;
    for (let i = 0; i < segs; i++) {
      const s = cyl(0.13 - i * 0.012, 0.16 - i * 0.012, 0.6, trunkMat, 7, i * 0.07, y + 0.3, 0);
      s.rotation.z = -0.08;
      g.add(s);
      y += 0.57;
    }
    const leafMat = stdMat('#3f9b4b', { roughness: 0.7, porosity: 0.3 });
    for (let i = 0; i < 7; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.0, 4, 1), leafMat);
      leaf.geometry.translate(0, 1.0, 0);
      leaf.scale.set(1, 1, 0.25);
      leaf.position.set(0.42, y, 0);
      leaf.rotation.set(0, (i / 7) * Math.PI * 2, 1.25);
      leaf.rotation.order = 'YXZ';
      g.add(leaf);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), stdMat('#6b4a2b')).translateX(0.42).translateY(y - 0.15));
  } else if (kind === 'pine') {
    g.add(cyl(0.15, 0.2, 1.0, trunkMat, 7, 0, 0.5, 0));
    const leafMat = stdMat('#2f6d45', { roughness: 0.8, flat: true });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.3 - i * 0.32, 1.5, 8), leafMat);
      c.position.y = 1.4 + i * 0.85;
      g.add(c);
    }
  } else if (kind === 'bush') {
    const leafMat = stdMat('#4c9a4f', { roughness: 0.8, flat: true });
    for (const [x, y, z, r] of [[0, 0.35, 0, 0.5], [0.4, 0.3, 0.1, 0.38], [-0.38, 0.28, -0.05, 0.4]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
      b.position.set(x, y, z);
      g.add(b);
    }
  } else {
    g.add(cyl(0.16, 0.22, 1.6, trunkMat, 7, 0, 0.8, 0));
    const leafMat = stdMat(kind === 'blossom' ? '#f2a7c3' : '#5fae4f', { roughness: 0.8, flat: true });
    for (const [x, y, z, r] of [[0, 2.3, 0, 1.15], [0.6, 1.95, 0.2, 0.75], [-0.55, 2.0, -0.2, 0.8], [0.1, 2.9, -0.1, 0.7]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMat);
      b.position.set(x, y, z);
      g.add(b);
    }
  }
  g.scale.setScalar(scale);
  shadowAll(g);
  return g;
}

export function makeBench() {
  const g = new THREE.Group();
  const wood = stdMat('#b07a4f', { roughness: 0.65, porosity: 0.55 });
  const metal = stdMat('#3d3d3d', { roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 3; i++) g.add(box(1.6, 0.05, 0.12, wood, 0, 0.45, -0.14 + i * 0.14));
  for (let i = 0; i < 2; i++) {
    const b = box(1.6, 0.1, 0.04, wood, 0, 0.7 + i * 0.15, -0.26);
    b.rotation.x = -0.15;
    g.add(b);
  }
  for (const x of [-0.7, 0.7]) {
    g.add(box(0.06, 0.45, 0.4, metal, x, 0.22, 0));
    g.add(box(0.06, 0.45, 0.06, metal, x, 0.68, -0.25));
  }
  shadowAll(g);
  return g;
}

export function makeLamp() {
  const g = new THREE.Group();
  const metal = stdMat('#2f3640', { roughness: 0.35, metalness: 0.7 });
  g.add(cyl(0.06, 0.09, 3.2, metal, 8, 0, 1.6, 0));
  g.add(cyl(0.18, 0.22, 0.15, metal, 8, 0, 0.07, 0));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), nightMaterials.bulb);
  bulb.position.y = 3.3;
  g.add(bulb);
  g.add(cyl(0.05, 0.25, 0.15, metal, 8, 0, 3.5, 0));
  shadowAll(g);
  bulb.castShadow = false;
  return g;
}

export function makeRock(scale = 1) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), stdMat('#8f8a85', { roughness: 0.9, flat: true, porosity: 0.4 }));
  m.scale.set(1.2 * scale, 0.7 * scale, 1 * scale);
  m.position.y = 0.25 * scale;
  m.rotation.y = Math.random() * 6;
  const g = new THREE.Group();
  g.add(m);
  shadowAll(g);
  return g;
}

export function makeFlowerBed() {
  const g = new THREE.Group();
  g.add(box(1.6, 0.25, 0.8, stdMat('#8a6248', { roughness: 0.9 }), 0, 0.12, 0));
  g.add(box(1.45, 0.05, 0.65, stdMat('#4a3527', { roughness: 1 }), 0, 0.26, 0));
  const colors = ['#ff6b8b', '#ffd34d', '#ffffff', '#b07cff', '#ff8f40'];
  const stem = stdMat('#3e8d3e');
  for (let i = 0; i < 14; i++) {
    const x = -0.6 + (i % 7) * 0.2;
    const z = i < 7 ? -0.15 : 0.15;
    g.add(cyl(0.015, 0.015, 0.25, stem, 4, x, 0.38, z));
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), stdMat(colors[i % colors.length], { roughness: 0.6 }));
    f.position.set(x, 0.52, z);
    g.add(f);
  }
  shadowAll(g);
  return g;
}

export function makeFence() {
  const g = new THREE.Group();
  const wood = stdMat('#f1ece2', { roughness: 0.8, porosity: 0.4 });
  for (let i = 0; i < 5; i++) {
    g.add(box(0.1, 0.8, 0.06, wood, -0.8 + i * 0.4, 0.4, 0));
  }
  g.add(box(1.8, 0.08, 0.05, wood, 0, 0.55, 0.04));
  g.add(box(1.8, 0.08, 0.05, wood, 0, 0.25, 0.04));
  shadowAll(g);
  return g;
}

export function makeFountain() {
  const g = new THREE.Group();
  const stone = stdMat('#cfc6b8', { roughness: 0.8, porosity: 0.35 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.6, 32, 1, true), stone);
  basin.material.side = THREE.DoubleSide;
  basin.position.y = 0.3;
  g.add(basin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.16, 8, 40), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.6;
  g.add(rim);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), stdMat('#5cb6d6', { roughness: 0.05, metalness: 0.1, puddles: true, porosity: 0, snow: false, unique: true }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.45;
  g.add(water);
  g.add(cyl(0.35, 0.5, 1.6, stone, 16, 0, 0.8, 0));
  g.add(cyl(1.0, 0.6, 0.25, stone, 20, 0, 1.6, 0));
  g.add(cyl(0.2, 0.25, 0.7, stone, 12, 0, 2.0, 0));
  const spray = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, roughness: 0.05 }));
  spray.position.y = 2.45;
  spray.scale.set(1, 0.6, 1);
  g.add(spray);
  g.userData.spray = spray;
  shadowAll(g);
  water.castShadow = false;
  return g;
}

export function makeBeachUmbrella(color = '#ff7a59') {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.04, 2.4, stdMat('#eeeeee', { metalness: 0.3 }), 6, 0, 1.2, 0));
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 10, 1, true), stdMat(color, { roughness: 0.7, porosity: 0.5 }));
  top.material.side = THREE.DoubleSide;
  top.position.y = 2.3;
  g.add(top);
  const towel = box(0.8, 0.02, 1.7, stdMat('#ffffff', { roughness: 0.9, porosity: 0.7 }), 0.6, 0.02, 0.4);
  g.add(towel);
  shadowAll(g);
  return g;
}

export function makePicnicTable() {
  const g = new THREE.Group();
  const wood = stdMat('#9c6b45', { roughness: 0.7, porosity: 0.55 });
  g.add(box(1.8, 0.08, 0.9, wood, 0, 0.75, 0));
  for (const z of [-0.75, 0.75]) g.add(box(1.8, 0.06, 0.3, wood, 0, 0.45, z));
  for (const x of [-0.7, 0.7]) {
    const l = box(0.08, 0.9, 1.8, wood, x, 0.4, 0);
    l.scale.z = 0.95;
    g.add(l);
  }
  shadowAll(g);
  return g;
}

export function makeSnowman() {
  const g = new THREE.Group();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf6f9ff, roughness: 0.9 });
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), snow); b1.position.y = 0.45;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), snow); b2.position.y = 1.1;
  const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), snow); b3.position.y = 1.55;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xff8a2a }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.55, 0.3);
  g.add(b1, b2, b3, nose);
  shadowAll(g);
  return g;
}

export function makeStage() {
  const g = new THREE.Group();
  g.add(box(4.5, 0.4, 3, stdMat('#8b5e3c', { roughness: 0.6, porosity: 0.5 }), 0, 0.2, 0));
  // front step so residents can climb up
  g.add(box(1.8, 0.2, 0.55, stdMat('#7a5134', { roughness: 0.6, porosity: 0.5 }), 0, 0.1, 1.77));
  const pole = stdMat('#4d4d4d', { metalness: 0.6, roughness: 0.4 });
  for (const x of [-2.1, 2.1]) g.add(cyl(0.06, 0.06, 3, pole, 6, x, 1.9, -1.3));
  g.add(box(4.4, 0.15, 0.15, pole, 0, 3.4, -1.3));
  const bulbs = [];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), nightMaterials.bulb);
    b.position.set(-1.9 + i * 0.54, 3.25, -1.3);
    bulbs.push(b);
    g.add(b);
  }
  shadowAll(g);
  return g;
}

export function makePier(length = 10) {
  const g = new THREE.Group();
  const wood = stdMat('#a77b55', { roughness: 0.75, porosity: 0.55, puddles: true });
  for (let i = 0; i < length * 2; i++) g.add(box(2.2, 0.08, 0.42, wood, 0, 0.35, i * 0.5));
  const post = stdMat('#6b4a33', { roughness: 0.9 });
  for (let i = 0; i <= length; i += 2) for (const x of [-1.05, 1.05]) g.add(cyl(0.1, 0.1, 2.4, post, 6, x, -0.6, i));
  shadowAll(g);
  return g;
}

// ---------------------------------------------------------------------
// Little character accessories (umbrella, bandages, sling, dizzy stars)

export function makeUmbrella(color = '#4aa3df') {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.32), stdMat(color, { roughness: 0.35, porosity: 0.1, unique: true, snow: true }));
  canopy.material.side = THREE.DoubleSide;
  canopy.position.y = 0.55;
  canopy.scale.y = 0.75;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.3 }));
  shaft.position.y = 0.32;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a3a24 }));
  handle.position.y = -0.18;
  handle.rotation.z = Math.PI;
  g.add(canopy, shaft, handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

const bandageMat = new THREE.MeshStandardMaterial({ color: 0xfaf3ea, roughness: 0.9 });
export function makeHeadBandage(r = 0.2) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 24), bandageMat);
  m.rotation.x = Math.PI / 2 - 0.25;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makePlaster() {
  const g = new THREE.Group();
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.005), new THREE.MeshStandardMaterial({ color: 0xe8c6a0, roughness: 0.8 }));
  const b = a.clone();
  a.rotation.z = 0.6;
  b.rotation.z = -0.6;
  g.add(a, b);
  return g;
}

export function makeSling() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeDizzyStars() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mat);
    const a = (i / 4) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
    g.add(s);
  }
  return g;
}

export const BUILD_CATALOG = [
  { type: 'tree', label: 'Tree', icon: '🌳', radius: 0.8, make: () => makeTree('round') },
  { type: 'blossom', label: 'Blossom', icon: '🌸', radius: 0.8, make: () => makeTree('blossom') },
  { type: 'pine', label: 'Pine', icon: '🌲', radius: 0.8, make: () => makeTree('pine') },
  { type: 'palm', label: 'Palm', icon: '🌴', radius: 0.5, make: () => makeTree('palm') },
  { type: 'bush', label: 'Bush', icon: '🌿', radius: 0.6, make: () => makeTree('bush') },
  { type: 'flowers', label: 'Flowers', icon: '🌷', radius: 0.8, make: makeFlowerBed },
  { type: 'bench', label: 'Bench', icon: '🪑', radius: 0.8, make: makeBench, seats: [[-0.4, 0.25], [0.4, 0.25]] },
  { type: 'lamp', label: 'Lamp', icon: '💡', radius: 0.3, make: makeLamp },
  { type: 'rock', label: 'Rock', icon: '🪨', radius: 0.7, make: () => makeRock(1) },
  { type: 'fence', label: 'Fence', icon: '🚧', radius: 0.5, make: makeFence },
  { type: 'picnic', label: 'Picnic Table', icon: '🧺', radius: 1.1, make: makePicnicTable, seats: [[0, 0.8, Math.PI], [0, -0.8, 0]] },
  { type: 'parasol', label: 'Parasol', icon: '⛱️', radius: 0.7, make: () => makeBeachUmbrella('#5bc0eb') },
  { type: 'snowman', label: 'Snowman', icon: '⛄', radius: 0.5, make: makeSnowman },
];
