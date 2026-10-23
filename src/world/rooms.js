// Room instances: interiors for every house plus the café, shop and clinic.
//
// All interiors live in one separate "interior" scene, each at its own
// offset, built as dollhouse cut-aways (open towards the camera). When a
// resident goes inside, their body moves into that room and they keep
// living there: sleeping in bed, lounging on the sofa, cooking, eating,
// chatting with visitors, working behind the counter…
// The player can look into any room and redecorate it.

import * as THREE from 'three';
import { bakeStatic } from '../engine/batch.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { stdMat } from '../engine/materials.js';
import { makeLabelTexture } from './props.js';
import { pick, rand, uid, clamp } from '../core/util.js';

export const ROOM_W = 8; // x extent
export const ROOM_D = 6; // z extent (open side at +z)
const WALL_H = 2.9;

export const DECOR_ITEMS = {
  none: { label: 'Nothing', icon: '▫️' },
  plant: { label: 'Potted plant', icon: '🪴' },
  lamp: { label: 'Floor lamp', icon: '💡' },
  piano: { label: 'Piano', icon: '🎹' },
  arcade: { label: 'Arcade machine', icon: '🕹️' },
  aquarium: { label: 'Aquarium', icon: '🐠' },
  teddy: { label: 'Giant teddy', icon: '🧸' },
  guitar: { label: 'Guitar', icon: '🎸' },
  trophy: { label: 'Trophy shelf', icon: '🏆' },
};

export const WALL_COLORS = ['#f6efe4', '#ffe3ec', '#e3f1ff', '#e9ffe3', '#fff4c9', '#efe3ff', '#d8d8d8', '#3b3f58'];
export const FLOOR_COLORS = ['#c89b6d', '#a5734c', '#e8d6b8', '#7a8a99', '#b8d4b0', '#f2c9d6', '#5b4636', '#ffffff'];
export const WOOD_COLORS = ['#b07a4f', '#8b5e3c', '#e0c49a', '#ffffff', '#3d3d3d', '#ff9fb2', '#7fb4e8'];

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Room layout definitions in room-local coordinates (origin = room centre on the floor, open side +z). */
const LAYOUTS = {
  home: {
    entry: [-3.2, 2.1, Math.PI / 2],
    spots: [
      { type: 'bed', x: -2.6, z: -1.35, rot: 0, anim: 'sleep' },
      { type: 'sofa', x: 0.75, z: -1.9, rot: 0, anim: 'sit' },
      { type: 'sofa', x: 1.65, z: -1.9, rot: 0, anim: 'sit' },
      { type: 'table', x: 2.25, z: 0.65, rot: Math.PI / 2, anim: 'eat' },
      { type: 'table', x: 3.35, z: 0.65, rot: -Math.PI / 2, anim: 'eat' },
      { type: 'kitchen', x: 3.2, z: -1.75, rot: Math.PI, anim: 'eatStand' },
      { type: 'books', x: -0.85, z: -2.0, rot: Math.PI, anim: 'think' },
      { type: 'closet', x: -3.0, z: 0.1, rot: -Math.PI / 2, anim: 'idleLook' },
      { type: 'floor', x: 0.4, z: 0.9, rot: 0, anim: 'sitGround' },
      { type: 'stand', x: -1.2, z: 1.4, rot: 0.4, anim: 'idle' },
    ],
    decorSlots: [[-3.5, -2.6], [3.6, 2.3], [-0.2, -2.65]],
  },
  cafe: {
    entry: [-3.4, 2.2, Math.PI / 2],
    spots: [
      { type: 'work', job: 'barista', x: 0, z: -2.35, rot: 0, anim: 'eatStand' },
      { type: 'work', job: 'chef', x: -1.25, z: -2.35, rot: 0, anim: 'eatStand' },
      { type: 'order', x: 0, z: -0.8, rot: Math.PI, anim: 'talk' },
      ...[[-2.5, 0.6], [0.4, 1.4], [2.7, 0.6]].flatMap(([x, z]) => [
        { type: 'table', x: x - 0.75, z, rot: Math.PI / 2, anim: 'eat' },
        { type: 'table', x: x + 0.75, z, rot: -Math.PI / 2, anim: 'eat' },
      ]),
      { type: 'stand', x: -3, z: -1, rot: 0.3, anim: 'idle' },
    ],
    decorSlots: [[-3.6, -2.6], [3.6, -2.6]],
  },
  shop: {
    entry: [-3.4, 2.2, Math.PI / 2],
    spots: [
      { type: 'work', job: 'clerk', x: 2.9, z: -0.6, rot: -Math.PI / 2, anim: 'idle' },
      { type: 'work', job: 'tailor', x: -1.6, z: 0.3, rot: 0.3, anim: 'think' },
      { type: 'browse', x: -2.4, z: -1.8, rot: Math.PI, anim: 'think' },
      { type: 'browse', x: -0.8, z: -1.8, rot: Math.PI, anim: 'idleLook' },
      { type: 'browse', x: 0.8, z: -1.8, rot: Math.PI, anim: 'think' },
      { type: 'mirror', x: -3.0, z: 0.6, rot: -Math.PI / 2, anim: 'shy' },
      { type: 'order', x: 1.9, z: -0.6, rot: Math.PI / 2, anim: 'talk' },
      { type: 'stand', x: 0, z: 1.0, rot: 0, anim: 'idleLook' },
    ],
    decorSlots: [[3.6, 2.4], [-3.6, -2.6]],
  },
  clinic: {
    entry: [-3.4, 2.2, Math.PI / 2],
    spots: [
      { type: 'work', job: 'doctor', x: 0.3, z: -0.4, rot: Math.PI / 2, anim: 'think' },
      { type: 'bed', x: -2.5, z: -1.4, rot: 0, anim: 'lieDown' },
      { type: 'bed', x: 2.7, z: -1.4, rot: 0, anim: 'lieDown' },
      { type: 'wait', x: -2.6, z: 1.6, rot: Math.PI / 2, anim: 'sit' },
      { type: 'wait', x: -1.8, z: 1.6, rot: Math.PI / 2, anim: 'sit' },
      { type: 'order', x: 1.3, z: -0.4, rot: -Math.PI / 2, anim: 'listen' },
    ],
    decorSlots: [[3.6, 2.4], [0, -2.65]],
  },

  // ---- condo
  lobby: {
    w: 10, d: 6,
    entry: [-4.3, 2.1, Math.PI / 2],
    links: { elevator: [2.6, -1.9, Math.PI], pool: [4.35, 0.6, -Math.PI / 2] },
    spots: [
      { type: 'sofa', x: -2.0, z: -1.75, rot: 0, anim: 'sit' },
      { type: 'sofa', x: -1.0, z: -1.75, rot: 0, anim: 'sit' },
      { type: 'mail', x: -4.0, z: -1.9, rot: Math.PI, anim: 'think' },
      { type: 'wait', x: 1.6, z: -1.4, rot: Math.PI, anim: 'idleLook' },
      { type: 'stand', x: 0.6, z: 1.2, rot: 0.2, anim: 'idle' },
      { type: 'stand', x: 2.6, z: 1.4, rot: -0.3, anim: 'idle' },
    ],
    decorSlots: [[-4.6, -2.65], [4.5, 2.5], [0.5, -2.65]],
  },
  hall: {
    w: 16, d: 4,
    entry: [-7.2, 0.8, Math.PI / 2],
    doors: [-3.6, 0, 3.6, 7.0],
    spots: [
      { type: 'chat', x: -5.0, z: 0.8, rot: 0.6, anim: 'idle' },
      { type: 'chat', x: -1.8, z: 0.9, rot: -0.5, anim: 'idle' },
      { type: 'chat', x: 1.8, z: 0.9, rot: 0.5, anim: 'idle' },
      { type: 'chat', x: 5.3, z: 0.8, rot: -0.6, anim: 'idle' },
      { type: 'window', x: 7.35, z: 0.9, rot: Math.PI / 2, anim: 'idleLook' },
      { type: 'bench', x: -5.6, z: -1.35, rot: 0, anim: 'sit' },
    ],
    decorSlots: [[-1.8, -1.7], [1.8, -1.7], [5.3, -1.7]],
  },
  pool: {
    w: 14, d: 10,
    entry: [-6.3, 4.0, Math.PI / 2],
    basin: { x0: -4.5, x1: 4.5, z0: -3.6, z1: 1.4 },
    waterY: -0.15,
    spots: [
      { type: 'work', job: 'poolguard', x: 5.9, z: -0.8, rot: -Math.PI / 2, anim: 'idleLook' },
      ...[-3, -1, 1, 3].map((x) => ({ type: 'lounge', x, z: 4.1, rot: 0, anim: 'lieDown' })),
      ...[-3.2, -0.6, 2.4].map((x) => ({ type: 'edge', x, z: 1.75, rot: Math.PI, anim: 'sitGround' })),
      { type: 'stand', x: -5.8, z: 2.0, rot: Math.PI / 2, anim: 'idle' },
      { type: 'stand', x: 5.8, z: 3.2, rot: -Math.PI / 2, anim: 'idleLook' },
    ],
    decorSlots: [[-6.4, -4.4], [6.4, -4.4], [6.4, 4.3]],
  },
};

export const ROOM_LABELS = { cafe: 'Café', shop: 'Shop', clinic: 'Clinic', condo: 'Condo lobby', condoPool: 'Condo pool' };
export const CONDO_UNITS_PER_FLOOR = 4;

export class Room {
  constructor(manager, key, kind, index, style) {
    this.manager = manager;
    this.key = key;
    this.kind = kind; // home | cafe | shop | clinic
    this.ox = index * 30; // offset along x in the interior scene
    this.group = new THREE.Group();
    this.group.position.set(this.ox, 0, 0);
    manager.scene.add(this.group);
    this.style = { wall: pick(WALL_COLORS.slice(0, 6)), floor: pick(FLOOR_COLORS.slice(0, 4)), wood: pick(WOOD_COLORS.slice(0, 3)), wallTex: null, floorTex: null, decor: ['plant', 'none', 'none'], ...(style || {}) };
    if (kind === 'cafe') Object.assign(this.style, { wall: '#fbe3c9', floor: '#8b5e3c', ...(style || {}) });
    if (kind === 'clinic') Object.assign(this.style, { wall: '#eef6fb', floor: '#d9e2ea', wood: '#ffffff', ...(style || {}) });
    if (kind === 'shop') Object.assign(this.style, { wall: '#e9f1f7', floor: '#e8d6b8', ...(style || {}) });
    if (kind === 'lobby') Object.assign(this.style, { wall: '#efe9f7', floor: '#cfc6b8', wood: '#7a6aa8', decor: ['plant', 'plant', 'lamp'], ...(style || {}) });
    if (kind === 'hall') Object.assign(this.style, { wall: '#f3eee6', floor: '#8a5a6b', wood: '#8b5e3c', decor: ['plant', 'none', 'plant'], ...(style || {}) });
    if (kind === 'pool') Object.assign(this.style, { wall: '#e8f6fb', floor: '#f2f7f9', wood: '#ffffff', decor: ['plant', 'plant', 'none'], ...(style || {}) });
    this.layout = LAYOUTS[kind];
    this.w = this.layout.w || ROOM_W;
    this.d = this.layout.d || ROOM_D;
    this.spots = this.layout.spots.map((s) => ({ ...s, id: uid('spot'), x: s.x + this.ox, z: s.z, room: this, occupant: null, ground: s.anim === 'sitGround' }));
    this.obstacles = [];
    this.platforms = [];
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0x9fd4ff });
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.3 });
    this.build();
  }

  get isRoom() { return true; }
  get bounds() { return { minX: this.ox - this.w / 2 + 0.25, maxX: this.ox + this.w / 2 - 0.25, minZ: -this.d / 2 + 0.25, maxZ: this.d / 2 - 0.2 }; }

  get center() { return new THREE.Vector3(this.ox, 1.1, 0.3); }
  get entry() { const [x, z, rot] = this.layout.entry; return [x + this.ox, z, rot]; }

  label(sim) {
    if (this.kind === 'home') {
      const owner = sim?.byId(this.key.slice(5));
      const unit = this.manager.condo?.unitOf(this.key.slice(5));
      if (unit != null) return owner ? `${owner.name}'s apartment (#${this.manager.condo.unitLabel(unit)})` : 'Apartment';
      return owner ? `${owner.name}'s house` : 'House';
    }
    if (this.kind === 'hall') return `Condo floor ${this.key.slice(5)}`;
    return ROOM_LABELS[this.key] || ROOM_LABELS[this.kind] || this.kind;
  }

  /** Pool water surface at x,z (null outside the pool). */
  waterAt(x, z) {
    const b = this.layout.basin;
    if (!b) return null;
    const lx = x - this.ox;
    return lx > b.x0 + 0.05 && lx < b.x1 - 0.05 && z > b.z0 + 0.05 && z < b.z1 - 0.05 ? this.layout.waterY : null;
  }

  shorePoint(nearX = null) {
    const b = this.layout.basin;
    if (!b) return { x: this.ox, z: 1, heading: Math.PI };
    const lx = nearX == null ? rand(b.x0 + 0.6, b.x1 - 0.6) : clamp(nearX - this.ox, b.x0 + 0.6, b.x1 - 0.6);
    return { x: this.ox + lx, z: b.z1 + 0.6, heading: Math.PI };
  }

  swimSpot() {
    const b = this.layout.basin;
    if (!b) return { x: this.ox, z: 0 };
    return { x: this.ox + rand(b.x0 + 0.8, b.x1 - 0.8), z: rand(b.z0 + 0.8, b.z1 - 0.8) };
  }

  /** Absolute position of a named link point (elevator, pool door…). */
  link(name) {
    const l = this.layout.links?.[name];
    return l ? { x: this.ox + l[0], z: l[1], rot: l[2] ?? 0 } : null;
  }

  /** Position in front of apartment door i (hallways). */
  doorSpot(i) {
    const x = this.layout.doors?.[i];
    return x == null ? null : { x: this.ox + x, z: -1.25, rot: Math.PI };
  }

  async build() {
    const g = this.group;
    // free the old furniture: geometry, plus materials / label textures made just for this room
    const keep = new Set([this.windowMat, this.lampMat]);
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse?.((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m || m.userData.shared || keep.has(m)) continue;
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    this.obstacles = [];
    this.platforms = [];
    const st = this.style;
    const wallMat = stdMat(st.wall, { roughness: 0.9, unique: true, snow: false });
    const floorMat = stdMat(st.floor, { roughness: 0.55, unique: true, snow: false });
    const wood = stdMat(st.wood, { roughness: 0.6, snow: false });
    const fabric = stdMat(this.kind === 'home' ? '#7fa7d9' : '#c95b5b', { roughness: 0.95, snow: false });
    const white = stdMat('#ffffff', { roughness: 0.5, snow: false });
    const dark = stdMat('#3a3a44', { roughness: 0.4, metalness: 0.3, snow: false });
    this.wallMat = wallMat;
    this.floorMat = floorMat;
    // shell: floor, back wall, side walls (front open)
    const W = this.w;
    const D = this.d;
    const basin = this.layout.basin;
    if (basin) {
      // floor with a hole for the pool
      const piece = (x0, x1, z0, z1) => {
        if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
        const f = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0), floorMat);
        f.position.set((x0 + x1) / 2, -0.1, (z0 + z1) / 2);
        f.receiveShadow = true;
        g.add(f);
      };
      piece(-W / 2, W / 2, -D / 2, basin.z0);
      piece(-W / 2, W / 2, basin.z1, D / 2);
      piece(-W / 2, basin.x0, basin.z0, basin.z1);
      piece(basin.x1, W / 2, basin.z0, basin.z1);
    } else {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, D), floorMat);
      floor.position.set(0, -0.1, 0);
      floor.receiveShadow = true;
      g.add(floor);
    }
    g.add(box(W + 0.3, WALL_H, 0.15, wallMat, 0, WALL_H / 2, -D / 2 - 0.07));
    g.add(box(0.15, WALL_H, D, wallMat, -W / 2 - 0.07, WALL_H / 2, 0));
    g.add(box(0.15, WALL_H, D, wallMat, W / 2 + 0.07, WALL_H / 2, 0));
    // skirting + window showing the weather outside
    g.add(box(W, 0.12, 0.05, wood, 0, 0.06, -D / 2 + 0.02));
    const winX = this.kind === 'hall' ? 4.5 : -1.6;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), this.windowMat);
    win.position.set(winX, 1.75, -D / 2 + 0.01);
    g.add(win, box(1.75, 0.08, 0.1, white, winX, 1.18, -D / 2 + 0.05), box(0.06, 1.1, 0.04, white, winX, 1.75, -D / 2 + 0.03));
    this.rainOverlay = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ map: rainTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.rainOverlay.position.set(winX, 1.75, -D / 2 + 0.02);
    g.add(this.rainOverlay);
    // door on the left wall near the front
    const [ex, ez] = this.layout.entry;
    g.add(box(0.06, 2.0, 1.0, this.kind === 'hall' ? dark : wood, -W / 2 + 0.02, 1.0, ez));
    // ceiling lamps
    const lampXs = W > 12 ? [-W / 4, W / 4] : [0];
    for (const lx of lampXs) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), this.lampMat);
      lamp.position.set(lx, WALL_H - 0.35, -0.5);
      g.add(lamp, cyl(0.01, 0.01, 0.35, dark, lx, WALL_H - 0.17, -0.5, 6));
    }
    void ex;

    const add = (obj, x, z, r = 0.5) => { obj.position.x += x; obj.position.z += z; g.add(obj); if (r > 0) this.obstacles.push({ x: this.ox + x, z, r, soft: true }); return obj; };
    const obstacleBox = (x, z, hw, hd) => {
      // approximate a rectangle with a row of circles
      const n = Math.max(1, Math.round(Math.max(hw, hd) / Math.min(hw, hd)));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        this.obstacles.push(hw > hd ? { x: this.ox + x + t * hw * 2 * 0.8, z, r: hd + 0.05, soft: true } : { x: this.ox + x, z: z + t * hd * 2 * 0.8, r: hw + 0.05, soft: true });
      }
    };

    if (this.kind === 'home') {
      // bed (walkable top so the sleeper lies on it)
      const bed = new THREE.Group();
      bed.add(box(1.3, 0.35, 2.1, wood, 0, 0.18, 0), box(1.25, 0.14, 2.0, white, 0, 0.42, 0.02), box(1.27, 0.16, 1.2, fabric, 0, 0.47, 0.42), box(1.0, 0.12, 0.35, white, 0, 0.53, -0.78), box(1.3, 0.9, 0.1, wood, 0, 0.45, -1.05));
      add(bed, -2.6, -1.85, 0);
      this.platforms.push({ x: this.ox - 2.6, z: -1.85, hw: 0.65, hd: 1.05, top: 0.47 });
      // sofa
      const sofa = new THREE.Group();
      sofa.add(box(2.1, 0.42, 0.85, fabric, 0, 0.21, 0), box(2.1, 0.55, 0.2, fabric, 0, 0.6, -0.33), box(0.2, 0.6, 0.85, fabric, -1.0, 0.3, 0), box(0.2, 0.6, 0.85, fabric, 1.0, 0.3, 0));
      add(sofa, 1.2, -2.35, 0);
      obstacleBox(1.2, -2.5, 1.05, 0.25);
      // coffee table + rug
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.4, 36), stdMat('#f2d0a4', { roughness: 1, snow: false }));
      rug.rotation.x = -Math.PI / 2; rug.position.set(0.8, 0.005, -0.5); rug.receiveShadow = true;
      g.add(rug);
      add(box(1.0, 0.35, 0.55, wood, 0, 0.18, 0), 1.2, -0.95, 0.45);
      // dining table
      const table = new THREE.Group();
      table.add(cyl(0.45, 0.45, 0.06, wood, 0, 0.75, 0, 20), cyl(0.06, 0.12, 0.72, wood, 0, 0.36, 0));
      table.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), stdMat('#ff8a5b', { snow: false })).translateY(0.85));
      add(table, 2.8, 0.65, 0.45);
      for (const dx of [-0.6, 0.6]) add(box(0.4, 0.45, 0.4, wood, 0, 0.22, 0), 2.8 + dx, 0.65, 0);
      // kitchen
      const kit = new THREE.Group();
      kit.add(box(1.6, 0.9, 0.6, white, 0, 0.45, 0), box(1.6, 0.05, 0.65, dark, 0, 0.92, 0), box(0.5, 0.04, 0.4, stdMat('#c0c0c0', { metalness: 0.7, roughness: 0.3, snow: false }), -0.3, 0.95, 0));
      kit.add(box(0.7, 1.8, 0.6, white, 1.1, 0.9, 0));
      add(kit, 3.0, -2.6, 0);
      obstacleBox(3.3, -2.6, 0.9, 0.35);
      // bookshelf
      const shelf = new THREE.Group();
      // a real open shelf (back, sides, boards) so books sit inside it instead of
      // sharing a face with a solid box (that flickered)
      shelf.add(box(1.2, 1.9, 0.04, wood, 0, 0.95, -0.155));
      shelf.add(box(0.05, 1.9, 0.35, wood, -0.575, 0.95, 0), box(0.05, 1.9, 0.35, wood, 0.575, 0.95, 0));
      for (let r = 0; r < 5; r++) shelf.add(box(1.1, 0.04, 0.33, wood, 0, 0.13 + r * 0.45, 0.005));
      const bookCols = ['#e05a4f', '#4fb3e8', '#ffd166', '#06d6a0', '#9b5de5'];
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
        const hgt = 0.26 + ((r * 7 + i * 3) % 4) * 0.025;
        shelf.add(box(0.12, hgt, 0.24, stdMat(bookCols[(r + i) % 5], { snow: false }), -0.43 + i * 0.17, 0.152 + r * 0.45 + hgt / 2, 0.01));
      }
      add(shelf, -0.85, -2.75, 0);
      obstacleBox(-0.85, -2.75, 0.6, 0.2);
      // wardrobe on the left wall
      add(box(0.6, 2.0, 1.4, wood, 0, 1.0, 0), -3.65, 0.1, 0);
      obstacleBox(-3.65, 0.1, 0.3, 0.7);
      // poster
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: makeLabelTexture('★', { w: 256, h: 320, font: 'bold 200px sans-serif', bg: '#ffd166', border: '#ff8a5b' }) }));
      poster.position.set(1.2, 1.8, -D / 2 + 0.02);
      g.add(poster);
    } else if (this.kind === 'cafe') {
      const counter = new THREE.Group();
      counter.add(box(3.4, 1.0, 0.7, wood, 0, 0.5, 0), box(3.5, 0.06, 0.8, dark, 0, 1.03, 0));
      counter.add(box(0.5, 0.5, 0.4, stdMat('#c0c0c0', { metalness: 0.8, roughness: 0.25, snow: false }), -1.1, 1.3, 0), box(0.2, 0.25, 0.2, white, 0.8, 1.18, 0));
      for (let i = 0; i < 4; i++) counter.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), stdMat(['#f2a7c3', '#ffd166', '#8b5e3c', '#ffffff'][i], { snow: false })).translateX(-0.2 + i * 0.25).translateY(1.12));
      add(counter, 0, -1.6, 0);
      obstacleBox(0, -1.6, 1.75, 0.38);
      g.add(box(4, 0.06, 0.4, wood, 0, 1.7, -D / 2 + 0.25));
      for (const [x, z] of [[-2.5, 0.6], [0.4, 1.4], [2.7, 0.6]]) {
        const t = new THREE.Group();
        t.add(cyl(0.45, 0.45, 0.05, white, 0, 0.75, 0, 20), cyl(0.05, 0.25, 0.73, dark, 0, 0.36, 0));
        t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), stdMat('#ffffff', { snow: false })).translateY(0.83));
        add(t, x, z, 0.5);
        for (const dx of [-0.6, 0.6]) add(box(0.4, 0.45, 0.4, wood, 0, 0.22, 0), x + dx, z, 0);
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshStandardMaterial({ map: makeLabelTexture('☕ MENU') }));
      sign.position.set(0, 2.25, -D / 2 + 0.02);
      g.add(sign);
    } else if (this.kind === 'shop') {
      for (const x of [-2.4, -0.8, 0.8]) {
        const rack = new THREE.Group();
        rack.add(box(1.3, 1.8, 0.4, wood, 0, 0.9, 0));
        const cols = ['#ff6b6b', '#5aa9e6', '#ffd166', '#06d6a0', '#f15bb5'];
        for (let i = 0; i < 5; i++) rack.add(box(0.2, 0.55, 0.05, stdMat(cols[(i + Math.round(x)) % 5 < 0 ? 0 : (i + Math.round(x + 3)) % 5], { snow: false }), -0.45 + i * 0.22, 1.25, 0.24));
        for (let i = 0; i < 4; i++) rack.add(box(0.22, 0.2, 0.25, stdMat(cols[i], { snow: false }), -0.4 + i * 0.27, 0.45, 0.1));
        add(rack, x, -2.65, 0);
        obstacleBox(x, -2.65, 0.65, 0.2);
      }
      const counter = new THREE.Group();
      counter.add(box(0.7, 1.0, 2.0, wood, 0, 0.5, 0), box(0.8, 0.05, 2.1, dark, 0, 1.02, 0), box(0.3, 0.25, 0.4, dark, 0, 1.17, -0.4));
      add(counter, 2.4, -0.6, 0);
      obstacleBox(2.4, -0.6, 0.35, 1.0);
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshStandardMaterial({ color: 0xdfefff, metalness: 0.9, roughness: 0.05 }));
      mirror.position.set(-W / 2 + 0.02, 1.1, 0.6);
      mirror.rotation.y = Math.PI / 2;
      g.add(mirror);
    } else if (this.kind === 'clinic') {
      for (const x of [-2.5, 2.7]) {
        const bed = new THREE.Group();
        bed.add(box(1.0, 0.5, 2.0, white, 0, 0.25, 0), box(0.95, 0.1, 1.9, stdMat('#bfe4ff', { snow: false }), 0, 0.53, 0), box(1.0, 0.8, 0.06, dark, 0, 0.6, -1.0));
        add(bed, x, -1.85, 0);
        this.platforms.push({ x: this.ox + x, z: -1.85, hw: 0.5, hd: 1.0, top: 0.55 });
      }
      const desk = new THREE.Group();
      desk.add(box(0.7, 0.85, 1.6, white, 0, 0.42, 0), box(0.75, 0.05, 1.65, stdMat('#e05a5a', { snow: false }), 0, 0.87, 0));
      add(desk, 0.8, -0.4, 0);
      obstacleBox(0.8, -0.4, 0.35, 0.8);
      for (const x of [-2.6, -1.8]) add(box(0.5, 0.45, 0.5, wood, 0, 0.22, 0), x, 1.6, 0);
      const cross = new THREE.Group();
      const red = stdMat('#e04848', { snow: false });
      cross.add(box(0.7, 0.22, 0.04, red, 0, 0, 0), box(0.22, 0.7, 0.04, red, 0, 0, 0));
      cross.position.set(0.3, 2.1, -D / 2 + 0.05);
      g.add(cross);
    } else if (this.kind === 'lobby') {
      const metal = stdMat('#b8bcc8', { metalness: 0.8, roughness: 0.25, snow: false });
      // mailboxes + little counter on the back-left
      const mail = new THREE.Group();
      mail.add(box(1.4, 1.5, 0.3, wood, 0, 0.75, 0));
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) mail.add(box(0.28, 0.3, 0.04, metal, -0.48 + c * 0.32, 0.45 + r * 0.38, 0.16));
      add(mail, -4.0, -2.75, 0);
      obstacleBox(-4.0, -2.75, 0.7, 0.2);
      // sofa
      const sofa = new THREE.Group();
      sofa.add(box(2.1, 0.42, 0.85, fabric, 0, 0.21, 0), box(2.1, 0.55, 0.2, fabric, 0, 0.6, -0.33), box(0.2, 0.6, 0.85, fabric, -1.0, 0.3, 0), box(0.2, 0.6, 0.85, fabric, 1.0, 0.3, 0));
      add(sofa, -1.5, -2.2, 0);
      obstacleBox(-1.5, -2.35, 1.05, 0.25);
      add(box(1.0, 0.35, 0.55, wood, 0, 0.18, 0), -1.5, -0.95, 0.45);
      // elevator on the back wall
      const lift = new THREE.Group();
      lift.add(box(1.5, 2.3, 0.12, metal, 0, 1.15, 0), box(0.04, 2.1, 0.14, dark, 0, 1.05, 0.02));
      const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshStandardMaterial({ map: makeLabelTexture('▲▼ LIFT', { w: 256, h: 96, font: 'bold 44px sans-serif' }) }));
      ls.position.set(0, 2.5, 0.07);
      lift.add(ls);
      lift.position.set(2.6, 0, -D / 2 + 0.07);
      g.add(lift);
      // glass door to the pool on the right wall
      const pd = new THREE.Group();
      pd.add(box(0.08, 2.1, 1.2, new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.7 }), 0, 1.05, 0));
      const psign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshStandardMaterial({ map: makeLabelTexture('🏊 POOL', { w: 256, h: 96, font: 'bold 44px sans-serif' }) }));
      psign.position.set(-0.06, 2.35, 0);
      psign.rotation.y = -Math.PI / 2;
      pd.add(psign);
      pd.position.set(W / 2 - 0.02, 0, 0.6);
      g.add(pd);
      const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 36), stdMat('#c9b8e8', { roughness: 1, snow: false }));
      rug.rotation.x = -Math.PI / 2; rug.position.set(-1.5, 0.005, -0.8); rug.receiveShadow = true;
      g.add(rug);
    } else if (this.kind === 'hall') {
      // carpet runner, elevator on the left wall, apartment doors with name plates
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 1.6), stdMat('#c94f5a', { roughness: 1, snow: false }));
      runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.005, 0.2); runner.receiveShadow = true;
      g.add(runner);
      const metal = stdMat('#b8bcc8', { metalness: 0.8, roughness: 0.25, snow: false });
      const lift = box(0.12, 2.3, 1.5, metal, -W / 2 + 0.07, 1.15, this.layout.entry[1]);
      g.add(lift);
      const floor = Number(this.key.slice(5)) || 1;
      const condo = this.manager.condo;
      (this.layout.doors || []).forEach((dx, i) => {
        const unit = (floor - 1) * CONDO_UNITS_PER_FLOOR + i;
        const owner = condo?.ownerOf(unit);
        const door = new THREE.Group();
        door.add(box(1.0, 2.1, 0.08, stdMat(['#7a4b33', '#4b6a8a', '#6a8a4b', '#8a4b6a'][i % 4], { roughness: 0.6, snow: false }), 0, 1.05, 0));
        door.add(box(1.2, 0.1, 0.12, white, 0, 2.15, 0));
        const knob = cyl(0.05, 0.05, 0.06, stdMat('#e8c34a', { metalness: 0.8, roughness: 0.3, snow: false }), 0.33, 1.0, 0.07, 8);
        knob.rotation.x = Math.PI / 2;
        door.add(knob);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshStandardMaterial({ map: makeLabelTexture(`${condo?.unitLabel(unit) || unit + 1}${owner ? ` ${owner}` : ''}`, { w: 384, h: 128, font: 'bold 46px "Trebuchet MS", sans-serif' }) }));
        plate.position.set(0, 2.45, 0.02);
        door.add(plate);
        door.position.set(dx, 0, -D / 2 + 0.06);
        g.add(door);
      });
      // bench near the elevator
      add(box(1.4, 0.45, 0.45, wood, 0, 0.22, 0), -5.6, -1.65, 0);
      obstacleBox(-5.6, -1.75, 0.7, 0.15);
    } else if (this.kind === 'pool') {
      const b = this.layout.basin;
      const tile = stdMat('#7fd0ea', { roughness: 0.35, snow: false });
      const edge = stdMat('#ffffff', { roughness: 0.5, snow: false });
      const bw = b.x1 - b.x0;
      const bd = b.z1 - b.z0;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      const depth = 1.5;
      g.add(box(bw, 0.1, bd, tile, cx, -depth, cz));
      g.add(box(bw, depth, 0.1, tile, cx, -depth / 2, b.z0), box(bw, depth, 0.1, tile, cx, -depth / 2, b.z1));
      g.add(box(0.1, depth, bd, tile, b.x0, -depth / 2, cz), box(0.1, depth, bd, tile, b.x1, -depth / 2, cz));
      // coping around the edge
      g.add(box(bw + 0.4, 0.06, 0.2, edge, cx, 0.03, b.z0 - 0.1), box(bw + 0.4, 0.06, 0.2, edge, cx, 0.03, b.z1 + 0.1));
      g.add(box(0.2, 0.06, bd, edge, b.x0 - 0.1, 0.03, cz), box(0.2, 0.06, bd, edge, b.x1 + 0.1, 0.03, cz));
      // water
      this.waterMat = new THREE.MeshStandardMaterial({ color: 0x3fb6e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, emissive: 0x0b4a66, emissiveIntensity: 0.4 });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd, 24, 12), this.waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(cx, this.layout.waterY, cz);
      this.water = water;
      g.add(water);
      // lane ropes
      for (const lz of [cz - bd / 4, cz + bd / 4]) {
        for (let i = 0; i < 18; i++) {
          const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stdMat(i % 2 ? '#e84a5f' : '#ffffff', { snow: false }));
          bead.position.set(b.x0 + 0.25 + (i * (bw - 0.5)) / 17, this.layout.waterY + 0.02, lz);
          g.add(bead);
        }
      }
      // lifeguard chair by the pool
      const chair = new THREE.Group();
      for (const [lx, lz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) chair.add(box(0.06, 1.2, 0.06, edge, lx, 0.6, lz));
      chair.add(box(0.7, 0.08, 0.7, edge, 0, 1.2, 0), box(0.7, 0.6, 0.08, stdMat('#e8453c', { snow: false }), 0, 1.5, 0.32));
      chair.position.set(6.35, 0, -0.8);
      chair.rotation.y = -Math.PI / 2;
      g.add(chair);
      this.obstacles.push({ x: this.ox + 6.35, z: -0.8, r: 0.45, soft: true });
      // loungers
      for (const x of [-3, -1, 1, 3]) {
        const l = new THREE.Group();
        l.add(box(0.7, 0.28, 1.9, edge, 0, 0.14, 0), box(0.68, 0.06, 1.85, stdMat('#ffd166', { snow: false }), 0, 0.3, 0), box(0.68, 0.5, 0.08, stdMat('#ffd166', { snow: false }), 0, 0.5, -0.8));
        l.position.set(x, 0, 3.6);
        g.add(l);
        this.platforms.push({ x: this.ox + x, z: 3.6, hw: 0.35, hd: 0.95, top: 0.3 });
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), new THREE.MeshStandardMaterial({ map: makeLabelTexture('🏊 NO RUNNING • NO DIVING', { w: 768, h: 128, font: 'bold 52px "Trebuchet MS", sans-serif' }) }));
      sign.position.set(2.5, 2.3, -D / 2 + 0.03);
      g.add(sign);
    }
    // decor slots
    (this.layout.decorSlots || []).forEach(([x, z], i) => {
      const item = this.style.decor?.[i];
      if (!item || item === 'none') return;
      const obj = makeDecor(item, wood);
      if (obj) add(obj, x, z, 0.35);
    });
    // textures
    const tex = this.manager.textures;
    if (tex) {
      for (const [key, mat, rep] of [['wallTex', wallMat, 3], ['floorTex', floorMat, 4]]) {
        if (st[key]) {
          try {
            const t = (await tex.get(st[key], { flipY: true, repeat: rep })).clone();
            t.needsUpdate = true;
            mat.map = t;
            mat.color.set('#ffffff');
            mat.needsUpdate = true;
          } catch (e) { /* missing texture */ }
        }
      }
    }
    // one mesh per material instead of hundreds of boxes
    if (this.water) this.water.userData.noBatch = true;
    this.rainOverlay.userData.noBatch = true;
    bakeStatic(g);
  }

  heightAt(x, z) {
    let h = 0;
    for (const p of this.platforms) if (Math.abs(x - p.x) <= p.hw && Math.abs(z - p.z) <= p.hd && p.top > h) h = p.top;
    return h;
  }

  freeSpot(type) {
    const list = this.spots.filter((s) => !s.occupant && (!type || s.type === type));
    return list.length ? pick(list) : null;
  }

  randomFloorPoint() {
    for (let i = 0; i < 20; i++) {
      const x = this.ox + rand(-this.w / 2 + 0.8, this.w / 2 - 0.8);
      const z = rand(-0.5, this.d / 2 - 0.7);
      if (this.waterAt(x, z) != null) continue;
      if (!this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.3)) return { x, z };
    }
    return { x: this.ox, z: 1.5 };
  }

  update(env) {
    // window shows the sky; rain streaks on the glass; lamps on at night
    this.windowMat.color.copy(env.sky);
    this.rainOverlay.material.opacity = env.rain * 0.8;
    if (this.rainOverlay.material.map) this.rainOverlay.material.map.offset.y = (performance.now() / 900) % 1;
    this.lampMat.emissiveIntensity = 0.3 + env.night * 2.2;
    if (this.water) {
      const t = performance.now() / 1000;
      this.waterMat.emissiveIntensity = 0.35 + Math.sin(t * 1.3) * 0.08;
      this.water.position.y = this.layout.waterY + Math.sin(t * 0.9) * 0.012;
    }
  }
}

function rainTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(220,235,255,0.8)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2, y + 10 + Math.random() * 10); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeDecor(item, wood) {
  const g = new THREE.Group();
  const m = (c, o = {}) => stdMat(c, { snow: false, ...o });
  switch (item) {
    case 'plant':
      g.add(cyl(0.22, 0.17, 0.4, m('#c96f4a'), 0, 0.2, 0));
      for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), m('#4c9a4f', { flat: true })); l.position.set(Math.cos(i) * 0.12, 0.6 + i * 0.12, Math.sin(i) * 0.12); g.add(l); }
      break;
    case 'lamp':
      g.add(cyl(0.2, 0.2, 0.04, m('#333'), 0, 0.02, 0), cyl(0.02, 0.02, 1.6, m('#333'), 0, 0.8, 0), cyl(0.18, 0.28, 0.35, new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd27a, emissiveIntensity: 0.8 }), 0, 1.65, 0));
      break;
    case 'piano':
      g.add(box(1.4, 1.0, 0.55, m('#1e1a1a', { roughness: 0.2 }), 0, 0.5, 0), box(1.3, 0.05, 0.25, m('#ffffff'), 0, 0.78, 0.3));
      break;
    case 'arcade':
      g.add(box(0.7, 1.7, 0.7, m('#5b3ac4'), 0, 0.85, 0), box(0.5, 0.4, 0.05, new THREE.MeshBasicMaterial({ color: 0x66ffcc }), 0, 1.3, 0.36));
      break;
    case 'aquarium':
      g.add(box(1.2, 0.6, 0.4, wood, 0, 0.3, 0), box(1.1, 0.6, 0.38, new THREE.MeshStandardMaterial({ color: 0x66c2ff, transparent: true, opacity: 0.5, roughness: 0.05 }), 0, 0.9, 0));
      for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), m(['#ff8a2a', '#ffd166', '#ff5c8a'][i])).translateX(-0.3 + i * 0.3).translateY(0.85 + i * 0.05));
      break;
    case 'teddy':
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 10), m('#b07a4f')).translateY(0.35), new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), m('#b07a4f')).translateY(0.85));
      break;
    case 'guitar':
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), m('#d98c3a')).translateY(0.3), box(0.06, 0.7, 0.04, m('#5a3a24'), 0, 0.75, 0));
      g.rotation.z = 0.2;
      break;
    case 'trophy':
      g.add(box(0.8, 1.2, 0.35, wood, 0, 0.6, 0), cyl(0.1, 0.06, 0.25, m('#e8c34a', { metalness: 0.9, roughness: 0.2 }), -0.2, 1.33, 0), cyl(0.08, 0.05, 0.2, m('#c0c0c0', { metalness: 0.9, roughness: 0.2 }), 0.2, 1.3, 0));
      break;
    default:
      return null;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Holds the interior scene, its lights and all rooms. */
export class RoomManager {
  constructor(renderer, textures) {
    this.textures = textures;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a2633');
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.hemi = new THREE.HemisphereLight(0xfff6e8, 0x6b5a4a, 1.1);
    this.scene.add(this.hemi);
    this.light = new THREE.DirectionalLight(0xfff1dd, 1.6);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    const c = this.light.shadow.camera;
    c.left = -6; c.right = 6; c.top = 6; c.bottom = -6; c.near = 0.5; c.far = 30;
    this.light.shadow.bias = -0.0005;
    this.scene.add(this.light, this.light.target);
    this.residentGroup = new THREE.Group();
    this.scene.add(this.residentGroup);
    this.fx = new THREE.Group();
    this.scene.add(this.fx);
    this.rooms = new Map();
    this.nextIndex = 0;
    this.styles = {};
  }

  kindOf(key) {
    if (key.startsWith('home:')) return 'home';
    if (key === 'condo') return 'lobby';
    if (key === 'condoPool') return 'pool';
    if (key.startsWith('hall:')) return 'hall';
    return LAYOUTS[key] && !['lobby', 'hall', 'pool'].includes(key) ? key : null;
  }

  /** The room you step into when leaving this one (null = outside on the island). */
  parentOf(key) {
    if (!key) return null;
    if (key === 'condoPool' || key.startsWith('hall:')) return 'condo';
    if (key.startsWith('home:')) {
      const unit = this.condo?.unitOf(key.slice(5));
      return unit != null ? `hall:${this.condo.floorOf(unit)}` : null;
    }
    return null;
  }

  /** Rooms to pass through to reach key from outside, e.g. ['condo', 'hall:2', 'home:x']. */
  chain(key) {
    const out = [key];
    let p = this.parentOf(key);
    while (p && out.length < 6) { out.unshift(p); p = this.parentOf(p); }
    return out;
  }

  /** Where in its parent room the way into key is ({x, z, rot}, absolute). */
  doorIn(key) {
    const parent = this.parentOf(key);
    if (!parent) return null;
    const room = this.get(parent);
    if (!room) return null;
    if (key === 'condoPool') return room.link('pool');
    if (key.startsWith('hall:')) return room.link('elevator');
    const unit = this.condo?.unitOf(key.slice(5));
    return unit != null ? room.doorSpot(unit % CONDO_UNITS_PER_FLOOR) : null;
  }

  /** Get (creating on demand) the room instance for a location key. */
  get(key) {
    if (!key) return null;
    if (this.rooms.has(key)) return this.rooms.get(key);
    const kind = this.kindOf(key);
    if (!kind) return null;
    const room = new Room(this, key, kind, this.nextIndex++, this.styles[key]);
    this.rooms.set(key, room);
    return room;
  }

  remove(key) {
    const r = this.rooms.get(key);
    if (!r) return;
    this.scene.remove(r.group);
    this.rooms.delete(key);
    delete this.styles[key];
  }

  setStyle(key, patch) {
    const room = this.get(key);
    Object.assign(room.style, patch);
    this.styles[key] = { ...room.style };
    return room.build();
  }

  focus(room) {
    // only the room being looked at is drawn
    for (const r of this.rooms.values()) r.group.visible = r === room;
    this.light.position.set(room.ox + 3, 7, 6);
    this.light.target.position.set(room.ox, 0, 0);
    const c = this.light.shadow.camera;
    const half = Math.max(6, room.w / 2 + 1.5, room.d / 2 + 1.5);
    if (c.right !== half) { c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.updateProjectionMatrix(); }
  }

  /** Rebuild hallway(s) so door plates show who lives there. */
  refreshHalls() {
    for (const r of this.rooms.values()) if (r.kind === 'hall') r.build();
  }

  update(env) {
    for (const r of this.rooms.values()) r.update(env);
    this.hemi.intensity = 0.7 + (1 - env.night) * 0.6;
    this.light.intensity = 0.6 + (1 - env.night) * 1.2 * (1 - env.cloud * 0.5);
    this.scene.environmentIntensity = 0.25 + (1 - env.night) * 0.2;
  }

  serialize() {
    const out = {};
    for (const [k, r] of this.rooms) out[k] = { ...r.style };
    return { ...this.styles, ...out };
  }

  restore(d) { this.styles = { ...(d || {}) }; }
}

export { clamp };
