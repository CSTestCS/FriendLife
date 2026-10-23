// The island: terrain, water, paths, buildings, locations residents can go
// to, seats, obstacles for steering, and player-placed decorations.

import * as THREE from 'three';
import { stdMat, patchWeather } from '../engine/materials.js';
import {
  makeHouse, makeShop, makeCafe, makeClinic, makeTree, makeBench, makeLamp, makeRock, makeFlowerBed,
  makeFountain, makeBeachUmbrella, makePier, makeStage, makeFence, BUILD_CATALOG, nightMaterials, makeLabelTexture, makeCondo,
} from './props.js';
import { rand, uid } from '../core/util.js';

export const ISLAND_RADIUS = 44;
export const WATER_Y = -0.55;
export const MAX_HOUSES = 10; // later residents move into the condo
const SWIM_DEPTH = -0.95; // terrain below this is deep enough to swim
const STAGE_ROT = Math.atan2(6, -12); // front of the stage faces the plaza

function fract(x) { return x - Math.floor(x); }
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function hash2(x, z) { return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v * (1 - u) + (d - b) * u * v;
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const n = vnoise(x * 0.08, z * 0.08) * 2.5 - 1.25;
  const edge = ISLAND_RADIUS + n;
  if (r < edge - 6) return 0;
  if (r < edge) return -(((r - (edge - 6)) / 6) ** 2) * 0.9;
  return -0.9 - (r - edge) * 0.35;
}

const HOUSE_COLORS = [
  ['#f4e7d3', '#c4574a'], ['#e3f0ff', '#4a78c4'], ['#fff1c9', '#e08d3c'], ['#e9ffe3', '#5aa35a'],
  ['#ffe3ef', '#c45a8a'], ['#efe3ff', '#7a5ac4'], ['#fff', '#3c3c3c'], ['#e3fffb', '#3aa39a'],
  ['#ffe9d6', '#a35a3a'], ['#f2f2f2', '#c4a24a'], ['#ffd9d9', '#a33a3a'], ['#d9f2ff', '#3a6aa3'],
];

export class Island {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Island';
    scene.add(this.group);
    this.locations = {};
    this.obstacles = [];
    this.seats = [];
    this.houses = []; // slots
    this.props = []; // player placed
    this.time = 0;
    this.surfaceMats = {};
    this._build();
  }

  _build() {
    // ---- terrain ----
    const size = 120;
    const seg = 160;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const grass = new THREE.Color('#7cc46a');
    const grass2 = new THREE.Color('#5fae55');
    const sand = new THREE.Color('#ecd9a6');
    const wetSand = new THREE.Color('#c9b07a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const r = Math.hypot(x, z);
      const n = vnoise(x * 0.3, z * 0.3);
      c.copy(grass).lerp(grass2, n);
      const sandStart = ISLAND_RADIUS - 9 + vnoise(x * 0.1, z * 0.1) * 2;
      if (r > sandStart) c.lerp(sand, Math.min(1, (r - sandStart) / 2.5));
      if (h < -0.6) c.lerp(wetSand, Math.min(1, (-0.6 - h) * 2));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    patchWeather(groundMat, { porosity: 0.4, puddles: true, snow: true });
    this.surfaceMats.ground = groundMat;
    const ground = new THREE.Mesh(geo, groundMat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.ground = ground;
    this.group.add(ground);

    // ---- water ----
    const waterMat = new THREE.MeshStandardMaterial({ color: '#2f9fc4', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.88 });
    patchWeather(waterMat, { porosity: 0.0, puddles: true, snow: false, local: { value: 0.6 } });
    waterMat.onBeforeCompile = ((prev) => (shader, r) => {
      prev(shader, r);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.y += sin(position.x * 0.25 + uTimeW * 1.1) * 0.08 + cos(position.z * 0.21 + uTimeW * 0.9) * 0.08;`
      ).replace('#include <common>', '#include <common>\nuniform float uTimeW;');
      shader.uniforms.uTimeW = shader.uniforms.uTime;
    })(waterMat.onBeforeCompile);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 80, 80), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.55;
    water.receiveShadow = true;
    this.group.add(water);
    this.water = water;

    // ---- plaza ----
    const plazaMat = stdMat('#d8cbb6', { roughness: 0.8, porosity: 0.45, puddles: true, unique: true });
    this.surfaceMats.path = plazaMat;
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(8, 48), plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    this.group.add(plaza);
    const fountain = makeFountain();
    this.group.add(fountain);
    this.fountain = fountain;
    this.addObstacle(0, 0, 3.0);
    this.addLocation('plaza', { pos: [0, 5.5], radius: 4, label: 'Plaza', outdoor: true });

    // stage for dancing
    const stage = makeStage();
    stage.position.set(-6, 0, 12);
    stage.rotation.y = STAGE_ROT;
    this.group.add(stage);
    // The stage is a walkable platform (0.4 m) with a 0.2 m step in front; only its poles block.
    this.addPlatform(-6, 12, STAGE_ROT, 2.25, 1.5, 0.4);
    this.addPlatform(-6, 12, STAGE_ROT, 0.9, 0.28, 0.2, 0, 1.77);
    for (const lx of [-2.1, 2.1]) {
      const p = this.localToWorld(-6, 12, STAGE_ROT, lx, -1.3);
      this.addObstacle(p.x, p.z, 0.25);
    }
    const entry = this.localToWorld(-6, 12, STAGE_ROT, 0, 2.6);
    this.addLocation('stage', { pos: [-6, 12], radius: 1.5, label: 'Stage', outdoor: true, entry: [entry.x, entry.z], y: 0.4, rotY: STAGE_ROT });

    // ---- buildings around the plaza ----
    const placeBuilding = (key, obj, x, z, rotY, label, depth, radius) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = rotY;
      this.group.add(obj);
      const fwd = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
      const door = new THREE.Vector3(x, 0, z).addScaledVector(fwd, depth / 2 + 1.4);
      this.addObstacle(x, z, radius);
      this.addLocation(key, { pos: [door.x, door.z], door: [door.x, door.z], radius: 0.6, label, indoor: true, building: obj, rotY });
      return obj;
    };
    placeBuilding('cafe', makeCafe(), 17, 2, -Math.PI / 2, 'Café', 4.2, 3.1);
    placeBuilding('shop', makeShop({ name: '👕 SHOP' }), -17, 2, Math.PI / 2, 'Shop', 4.2, 3.1);
    placeBuilding('clinic', makeClinic(), -14, -13, Math.PI / 4, 'Clinic', 4.2, 3.1);
    // cafe terrace seats (tables are in front of door)
    const cafe = this.locations.cafe.building;
    for (const [lx, lz] of [[-1.8, 4.2], [1.8, 4.2]]) {
      const p = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), cafe.rotation.y).add(cafe.position);
      this.addObstacle(p.x, p.z, 0.7, { soft: true });
      for (const a of [0, Math.PI]) {
        const sp = new THREE.Vector3(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95);
        sp.applyAxisAngle(new THREE.Vector3(0, 1, 0), cafe.rotation.y);
        this.seats.push({ id: uid('seat'), x: p.x + sp.x, z: p.z + sp.z, rot: Math.atan2(-sp.x, -sp.z), area: 'cafe', table: true, occupant: null });
      }
    }

    // ---- house slots: arc behind the plaza ----
    for (let i = 0; i < 16; i++) {
      const ring = i < 9 ? 0 : 1;
      const idx = ring === 0 ? i : i - 9;
      const count = ring === 0 ? 9 : 7;
      const radius = ring === 0 ? 24 : 33;
      const a0 = -Math.PI * 0.93, a1 = -Math.PI * 0.07;
      const a = a0 + (a1 - a0) * (count === 1 ? 0.5 : idx / (count - 1));
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      if (Math.hypot(x - -14, z - -13) < 7) continue; // keep clear of clinic
      const rot = Math.atan2(-x, -z); // face plaza
      if (ring === 1 && Math.abs(x) < 1) {
        // the middle of the back row is reserved for the condo tower
        this.condoSlot = { x, z, rot };
        continue;
      }
      this.houses.push({ index: this.houses.length, x, z, rot, owner: null, obj: null });
    }

    // condo (shown once the island has more residents than houses)
    {
      const c = this.condoSlot;
      const fwd = new THREE.Vector3(Math.sin(c.rot), 0, Math.cos(c.rot));
      const right = new THREE.Vector3(Math.cos(c.rot), 0, -Math.sin(c.rot));
      const door = new THREE.Vector3(c.x, 0, c.z).addScaledVector(fwd, 4.7);
      const annex = new THREE.Vector3(c.x, 0, c.z).addScaledVector(right, 5.6);
      this.condoObstacles = [{ x: c.x, z: c.z, r: 4.0 }, { x: annex.x, z: annex.z, r: 2.7 }];
      this.condoReserve = this.condoObstacles.map((o) => this.addObstacle(o.x, o.z, o.r + 1.5));
      this.addLocation('condo', { pos: [door.x, door.z], door: [door.x, door.z], radius: 0.6, label: 'Condo', indoor: true, rotY: c.rot });
    }

    // ---- paths from plaza to places ----
    const pathTo = (x, z, w = 1.8) => {
      const len = Math.hypot(x, z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), plazaMat);
      // plane lies along its local Y; lay it flat and point it from the plaza to (x, z)
      m.rotation.set(-Math.PI / 2, 0, Math.atan2(x, z));
      m.position.set(x / 2, 0.015, z / 2);
      m.receiveShadow = true;
      this.group.add(m);
    };
    pathTo(this.locations.cafe.door[0], this.locations.cafe.door[1]);
    pathTo(this.locations.shop.door[0], this.locations.shop.door[1]);
    pathTo(this.locations.clinic.door[0], this.locations.clinic.door[1]);
    pathTo(0, 36, 2.2);
    pathTo(0, -24, 2.2);

    // ---- park (south-east) ----
    const park = { x: 14, z: 18 };
    this.addLocation('park', { pos: [park.x, park.z], radius: 5, label: 'Park', outdoor: true });
    for (const [dx, dz, k] of [[-4, -3, 'round'], [4, -2, 'blossom'], [-3, 4, 'blossom'], [5, 5, 'round'], [0, 7, 'pine'], [8, 1, 'round']]) {
      this.addStatic(makeTree(k, rand(0.9, 1.2)), park.x + dx, park.z + dz, rand(0, 6), 0.7);
    }
    for (const [dx, dz, r] of [[-1.5, -1, 0.4], [2, 1.5, -2.4], [-2.5, 2.5, 2.2]]) this.addBench(park.x + dx, park.z + dz, r, 'park');
    this.addStatic(makeFlowerBed(), park.x + 1, park.z - 4, 0.2, 0.8);
    this.addStatic(makeFlowerBed(), park.x - 5, park.z + 0.5, 1.4, 0.8);

    // ---- plaza benches & lamps ----
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.addBench(Math.cos(a) * 6.5, Math.sin(a) * 6.5, Math.atan2(-Math.cos(a), -Math.sin(a)) , 'plaza');
      this.addStatic(makeLamp(), Math.cos(a + 0.35) * 7.6, Math.sin(a + 0.35) * 7.6, 0, 0.25);
    }
    for (const [x, z] of [[8, -10], [-8, -10], [10, 28], [-10, 28], [24, 12], [-24, 12]]) this.addStatic(makeLamp(), x, z, 0, 0.25);

    // ---- beach (south) ----
    this.addLocation('beach', { pos: [0, ISLAND_RADIUS - 5], radius: 6, label: 'Beach', outdoor: true });
    for (const [x, c] of [[-7, '#ff7a59'], [6, '#5bc0eb'], [14, '#ffd166']]) {
      const u = makeBeachUmbrella(c);
      const z = Math.sqrt(Math.max(0, (ISLAND_RADIUS - 5) ** 2 - x * x));
      this.addStatic(u, x, z, rand(0, 6), 0.3);
      this.seats.push({ id: uid('seat'), x: x + 0.6, z: z + 0.4, rot: Math.PI, area: 'beach', ground: true, occupant: null });
    }
    // lifeguard tower looking out over the swimming area
    {
      const t = new THREE.Group();
      const white = stdMat('#ffffff', { roughness: 0.6 });
      const red = stdMat('#e8453c', { roughness: 0.6 });
      for (const [lx, lz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), white);
        leg.position.set(lx, 0.8, lz);
        t.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), white);
      deck.position.y = 1.6;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.12), red);
      seat.position.set(0, 1.95, -0.45);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 4), red);
      roof.position.y = 2.95;
      roof.rotation.y = Math.PI / 4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), white);
      pole.position.set(0.5, 2.25, -0.5);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.3), new THREE.MeshStandardMaterial({ map: makeLabelTexture('🛟 LIFEGUARD', { w: 512, h: 128 }) }));
      sign.position.set(0, 1.35, 0.62);
      t.add(deck, seat, roof, pole, sign);
      t.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.addStatic(t, 1.5, 40.2, 0, 0.75);
      this.lifeguardPost = { x: 1.5, z: 41.3, rot: 0 };
    }
    const pier = makePier(10);
    pier.position.set(-14, 0, Math.sqrt(ISLAND_RADIUS ** 2 - 14 * 14) - 4);
    pier.rotation.y = -0.3;
    this.group.add(pier);
    const pierEnd = new THREE.Vector3(0, 0, 9).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.3).add(pier.position);
    this.addLocation('pier', { pos: [pierEnd.x, pierEnd.z], radius: 0.6, label: 'Pier', outdoor: true, y: 0.4, rotY: -0.3 });
    this.pierInfo = { start: pier.position.clone(), end: pierEnd, rot: -0.3 };
    {
      const c = this.localToWorld(pier.position.x, pier.position.z, -0.3, 0, 4.85);
      this.addPlatform(c.x, c.z, -0.3, 1.1, 5.15, 0.39);
    }

    // palms and scattered trees around the coast
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(ISLAND_RADIUS - 8, ISLAND_RADIUS - 3);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isBlocked(x, z, 2.5)) continue;
      this.addStatic(makeTree('palm', rand(0.9, 1.3)), x, z, rand(0, 6), 0.4);
    }
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(12, ISLAND_RADIUS - 10);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isBlocked(x, z, 3.5) || Math.abs(x) < 2 || (z < -18 && z > -38)) continue;
      const kind = Math.random() < 0.3 ? 'bush' : Math.random() < 0.5 ? 'round' : 'pine';
      this.addStatic(makeTree(kind, rand(0.8, 1.3)), x, z, rand(0, 6), kind === 'bush' ? 0.6 : 0.7);
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(ISLAND_RADIUS - 6, ISLAND_RADIUS - 1);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (this.isBlocked(x, z, 2)) continue;
      const rock = makeRock(rand(0.6, 1.4));
      this.addStatic(rock, x, z, 0, 0.6);
      rock.position.y = terrainHeight(x, z);
    }
    // fence along the park edge
    for (let i = 0; i < 4; i++) this.addStatic(makeFence(), 22 + i * 1.8 * 0, 12 + i * 1.8, Math.PI / 2, 0.3);

    // lookout spots (sea view) for wandering
    this.lookouts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = ISLAND_RADIUS - 5.5;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.isBlocked(x, z, 1)) this.lookouts.push({ x, z, rot: Math.atan2(x, z) });
    }
    for (const o of this.condoReserve) this.obstacles.splice(this.obstacles.indexOf(o), 1);
    this.condoReserve = [];
  }

  /** Show / hide the condo tower (only there while someone lives in it). */
  showCondo(on) {
    if (!!this.condoShown === !!on) return;
    this.condoShown = !!on;
    const c = this.condoSlot;
    if (on) {
      if (!this.condoObj) {
        this.condoObj = makeCondo();
        this.condoObj.position.set(c.x, 0, c.z);
        this.condoObj.rotation.y = c.rot;
      }
      this.group.add(this.condoObj);
      this.locations.condo.building = this.condoObj;
      this.condoActive = this.condoObstacles.map((o) => this.addObstacle(o.x, o.z, o.r));
    } else {
      if (this.condoObj) this.group.remove(this.condoObj);
      for (const o of this.condoActive || []) { const i = this.obstacles.indexOf(o); if (i >= 0) this.obstacles.splice(i, 1); }
      this.condoActive = [];
      this.locations.condo.building = null;
    }
  }

  /** Walkable box top (stage, pier, steps…). Rotated rectangle with half sizes hw/hd. */
  addPlatform(x, z, rot, hw, hd, top, lx = 0, lz = 0) {
    const c = lx || lz ? this.localToWorld(x, z, rot, lx, lz) : { x, z };
    const p = { x: c.x, z: c.z, rot, hw, hd, top };
    (this.platforms ||= []).push(p);
    return p;
  }

  /** A random standing spot on the stage plus the walk-in point. */
  stageSpot() {
    const s = this.locations.stage;
    const p = this.localToWorld(s.x, s.z, s.rotY, rand(-1.5, 1.5), rand(-0.9, 0.6));
    return { x: p.x, z: p.z, entry: s.entry, heading: s.rotY };
  }

  localToWorld(x, z, rot, lx, lz) {
    const c = Math.cos(rot), s = Math.sin(rot);
    return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
  }

  addLocation(key, data) {
    this.locations[key] = { key, ...data, x: data.pos[0], z: data.pos[1] };
  }

  addObstacle(x, z, r, extra = {}) {
    const o = { x, z, r, ...extra };
    this.obstacles.push(o);
    return o;
  }

  isBlocked(x, z, pad = 0) {
    for (const o of this.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    return false;
  }

  addStatic(obj, x, z, rot = 0, radius = 0.5) {
    obj.position.set(x, obj.position.y + terrainHeight(x, z), z);
    obj.rotation.y = rot;
    this.group.add(obj);
    if (radius > 0) this.addObstacle(x, z, radius, { soft: true });
    return obj;
  }

  addBench(x, z, rot, area) {
    const b = makeBench();
    this.addStatic(b, x, z, rot, 0.6);
    const seats = [];
    for (const lx of [-0.4, 0.4]) {
      const p = new THREE.Vector3(lx, 0, 0.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const s = { id: uid('seat'), x: x + p.x, z: z + p.z, rot, area, occupant: null };
      this.seats.push(s);
      seats.push(s);
    }
    return { obj: b, seats };
  }

  // ---- houses ----
  /** Give a resident a house. Returns null once MAX_HOUSES are taken (they get a condo unit instead). */
  assignHouse(residentId, name, preferIndex = null) {
    const taken = this.houses.filter((h) => h.owner && h.owner !== residentId).length;
    if (taken >= MAX_HOUSES && !this.houses.some((h) => h.owner === residentId)) return null;
    let slot = preferIndex != null ? this.houses[preferIndex] : null;
    if (!slot || (slot.owner && slot.owner !== residentId)) slot = this.houses.find((h) => !h.owner);
    if (!slot) return null;
    slot.owner = residentId;
    if (slot.obj) { this.group.remove(slot.obj); }
    const [wall, roof] = HOUSE_COLORS[slot.index % HOUSE_COLORS.length];
    const obj = makeHouse({ wall, roof, name });
    obj.position.set(slot.x, 0, slot.z);
    obj.rotation.y = slot.rot;
    this.group.add(obj);
    slot.obj = obj;
    if (!slot.obstacle) slot.obstacle = this.addObstacle(slot.x, slot.z, 2.3);
    const fwd = new THREE.Vector3(Math.sin(slot.rot), 0, Math.cos(slot.rot));
    const door = new THREE.Vector3(slot.x, 0, slot.z).addScaledVector(fwd, 2.9);
    slot.door = [door.x, door.z];
    return slot;
  }

  renameHouse(slot, name) {
    if (!slot?.obj) return;
    const s = slot.obj.userData.nameSign;
    if (s) {
      s.material.map?.dispose();
      s.material.map = makeLabelTexture(name, { font: 'bold 54px "Trebuchet MS", sans-serif' });
      s.material.needsUpdate = true;
    }
  }

  releaseHouse(residentId) {
    for (const h of this.houses) {
      if (h.owner === residentId) {
        h.owner = null;
        if (h.obj) { this.group.remove(h.obj); h.obj = null; }
        if (h.obstacle) { this.obstacles.splice(this.obstacles.indexOf(h.obstacle), 1); h.obstacle = null; }
      }
    }
  }

  houseOf(residentId) { return this.houses.find((h) => h.owner === residentId) || null; }

  // ---- player decorations (build mode) ----
  placeProp(type, x, z, rot = 0, id = null) {
    const def = BUILD_CATALOG.find((d) => d.type === type);
    if (!def) return null;
    const obj = def.make();
    obj.position.set(x, terrainHeight(x, z), z);
    obj.rotation.y = rot;
    this.group.add(obj);
    const prop = { id: id || uid('prop'), type, x, z, rot, obj, obstacle: this.addObstacle(x, z, def.radius, { soft: true }), seats: [] };
    obj.userData.propId = prop.id;
    obj.traverse((o) => { o.userData.propId = prop.id; });
    for (const s of def.seats || []) {
      const p = new THREE.Vector3(s[0], 0, s[1]).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const seat = { id: uid('seat'), x: x + p.x, z: z + p.z, rot: rot + (s[2] || 0), area: 'decor', occupant: null };
      this.seats.push(seat);
      prop.seats.push(seat);
    }
    this.props.push(prop);
    return prop;
  }

  removeProp(id) {
    const i = this.props.findIndex((p) => p.id === id);
    if (i < 0) return;
    const p = this.props[i];
    this.group.remove(p.obj);
    const oi = this.obstacles.indexOf(p.obstacle);
    if (oi >= 0) this.obstacles.splice(oi, 1);
    for (const s of p.seats) {
      const si = this.seats.indexOf(s);
      if (si >= 0) this.seats.splice(si, 1);
    }
    this.props.splice(i, 1);
  }

  serializeProps() {
    return this.props.map(({ id, type, x, z, rot }) => ({ id, type, x, z, rot }));
  }

  // ---- surface textures (player can re-skin ground/paths/walls/roofs) ----
  setSurfaceTexture(surface, texture) {
    const mats = {
      ground: [this.surfaceMats.ground],
      path: [this.surfaceMats.path],
    }[surface] || [];
    for (const m of mats) {
      m.map = texture || null;
      if (texture) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(surface === 'ground' ? 40 : 6, surface === 'ground' ? 40 : 6);
      }
      m.needsUpdate = true;
    }
  }

  freeSeat(area) {
    const list = this.seats.filter((s) => !s.occupant && (!area || s.area === area));
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  randomPoint(minR = 4, maxR = ISLAND_RADIUS - 8) {
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(minR, maxR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.isBlocked(x, z, 1)) return { x, z };
    }
    return { x: 0, z: 6 };
  }

  // ---- water (swimming) ----
  /** Water surface height where it is deep enough to swim, else null. */
  waterAt(x, z) {
    if (terrainHeight(x, z) >= SWIM_DEPTH || this.onPlatform(x, z)) return null; // the pier stands over the water
    return WATER_Y;
  }

  onPlatform(x, z) {
    for (const p of this.platforms || []) {
      const dx = x - p.x, dz = z - p.z;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      if (Math.abs(dx * c - dz * s) <= p.hw && Math.abs(dx * s + dz * c) <= p.hd) return true;
    }
    return false;
  }

  /** A walkable platform that stands over the sea (the pier). */
  overWater(x, z) {
    return this.onPlatform(x, z) && terrainHeight(x, z) < -0.45;
  }

  /** Walk onto the pier from the beach end (so nobody swims round to the tip). */
  pierWaypoints() {
    const pi = this.pierInfo;
    if (!pi) return [];
    const near = this.localToWorld(pi.start.x, pi.start.z, pi.rot, 0, -0.6);
    const on = this.localToWorld(pi.start.x, pi.start.z, pi.rot, 0, 1.2);
    return [near, on];
  }

  /** A spot on the beach right at the water's edge. */
  shorePoint(nearX = null) {
    const x = nearX != null ? clampN(nearX, -7, 11) : rand(-6, 10);
    let z = 32;
    while (z < 60 && terrainHeight(x, z) > -0.4) z += 0.25;
    return { x, z: z - 0.9, heading: 0 };
  }

  /** A random point in the swimming area off the beach. */
  swimSpot() {
    for (let i = 0; i < 20; i++) {
      const x = rand(-7, 11);
      let z = 38;
      while (z < 60 && terrainHeight(x, z) > -1.25) z += 0.25;
      z += rand(0.3, 4.5);
      if (this.waterAt(x, z) != null) return { x, z };
    }
    return { x: 2, z: 47 };
  }

  heightAt(x, z) {
    let h = Math.max(terrainHeight(x, z), -0.5);
    for (const p of this.platforms || []) {
      const dx = x - p.x, dz = z - p.z;
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd && p.top > h) h = p.top;
    }
    return h;
  }

  update(dt, light) {
    this.time += dt;
    // night lights
    nightMaterials.window.emissiveIntensity = light.night * 1.6;
    nightMaterials.bulb.emissiveIntensity = 0.2 + light.night * 2.5;
    if (this.fountain?.userData.spray) {
      const s = this.fountain.userData.spray;
      s.scale.y = 0.6 + Math.sin(this.time * 6) * 0.08;
    }
  }
}
