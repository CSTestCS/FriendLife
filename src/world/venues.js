// Outdoor venues on the land the old house plots used to take up (everyone
// lives in the condo now): a basketball court, a playground, a picnic lawn,
// a hot spring, a campfire circle, a stargazing lookout and a food truck.
// Each registers a location with "spots" (where to stand / sit and what to do).

import * as THREE from 'three';
import { stdMat } from '../engine/materials.js';
import { shadowAll, makePicnicTable, makeLabelTexture, makeTree, makeLamp, makeFlowerBed, makeBench, nightMaterials } from './props.js';
import { uid } from '../core/util.js';

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };
const cyl = (rt, rb, h, mat, seg = 12, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); return m; };
const signMesh = (text, w = 1.6) => new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: makeLabelTexture(text, { w: 512, h: 128, font: 'bold 52px "Trebuchet MS", sans-serif' }) }));

function makeCourt() {
  const g = new THREE.Group();
  const floor = box(9, 0.06, 7, stdMat('#c86b3c', { roughness: 0.8, puddles: true }), 0, 0.03, 0);
  floor.receiveShadow = true;
  g.add(floor);
  const line = stdMat('#ffffff', { roughness: 0.7 });
  g.add(box(9, 0.07, 0.06, line, 0, 0.04, 0), box(0.06, 0.07, 7, line, -4.47, 0.04, 0), box(0.06, 0.07, 7, line, 4.47, 0.04, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 6, 32), line);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
  g.add(ring);
  // hoops at both ends
  for (const side of [-1, 1]) {
    const pole = cyl(0.07, 0.07, 3, stdMat('#555b66', { metalness: 0.5, roughness: 0.4 }), 10, side * 4.2, 1.5, 0);
    const board = box(0.08, 0.9, 1.4, stdMat('#ffffff', { roughness: 0.5 }), side * 3.95, 2.9, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 20), stdMat('#ff6b2d', { roughness: 0.5 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(side * 3.65, 2.6, 0);
    g.add(pole, board, rim);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), stdMat('#e07b22', { roughness: 0.7 }));
  ball.position.set(-1.5, 0.13, 3.2);
  g.add(ball);
  shadowAll(g);
  return g;
}

function makePlayground() {
  const g = new THREE.Group();
  const sand = box(8, 0.05, 6, stdMat('#ecd9a6', { roughness: 1, puddles: true }), 0, 0.025, 0);
  sand.receiveShadow = true;
  g.add(sand);
  const red = stdMat('#e85d4a', { roughness: 0.6 });
  const blue = stdMat('#4a90e2', { roughness: 0.6 });
  const yellow = stdMat('#ffd166', { roughness: 0.6 });
  const metal = stdMat('#8a929c', { metalness: 0.6, roughness: 0.4 });
  // swing set (two swings)
  const sw = new THREE.Group();
  for (const x of [-1.4, 1.4]) {
    const l1 = cyl(0.05, 0.05, 2.6, red, 8, x, 1.25, -0.6); l1.rotation.x = 0.25;
    const l2 = cyl(0.05, 0.05, 2.6, red, 8, x, 1.25, 0.6); l2.rotation.x = -0.25;
    sw.add(l1, l2);
  }
  sw.add(cyl(0.05, 0.05, 2.9, metal, 8, 0, 2.5, 0).rotateZ(Math.PI / 2));
  for (const x of [-0.6, 0.6]) {
    sw.add(cyl(0.012, 0.012, 1.95, metal, 4, x - 0.18, 1.5, 0), cyl(0.012, 0.012, 1.95, metal, 4, x + 0.18, 1.5, 0));
    sw.add(box(0.5, 0.05, 0.22, blue, x, 0.52, 0));
  }
  sw.position.set(-2, 0, -1);
  g.add(sw);
  // slide
  const sl = new THREE.Group();
  sl.add(box(0.9, 0.1, 0.9, yellow, 0, 1.4, 0));
  for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) sl.add(cyl(0.05, 0.05, 1.4, metal, 6, x, 0.7, z));
  const ramp = box(0.7, 0.06, 2.4, red, 0, 0.75, 1.5); ramp.rotation.x = 0.62;
  sl.add(ramp);
  for (let i = 0; i < 4; i++) sl.add(box(0.6, 0.05, 0.12, metal, 0, 0.3 + i * 0.32, -0.6 - i * 0.05));
  sl.position.set(2.2, 0, -0.8);
  g.add(sl);
  // see-saw
  const ss = new THREE.Group();
  ss.add(cyl(0.12, 0.18, 0.4, metal, 8, 0, 0.2, 0));
  const plank = box(2.6, 0.08, 0.3, blue, 0, 0.42, 0); plank.rotation.z = 0.12;
  ss.add(plank);
  ss.position.set(0, 0, 2);
  g.add(ss);
  shadowAll(g);
  return g;
}

function makeHotSpring() {
  const g = new THREE.Group();
  const stone = stdMat('#8d8a84', { roughness: 0.95, puddles: true });
  // ring of rocks around the bath
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 + (i % 3) * 0.08, 0), stone);
    r.position.set(Math.cos(a) * 2.6, 0.22, Math.sin(a) * 2.1);
    r.rotation.set(i, i * 2, 0);
    g.add(r);
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), stdMat('#7fc8d6', { roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, puddles: false, snow: false, unique: true }));
  water.scale.set(2.45, 1.95, 1);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  water.userData.noBatch = true;
  g.add(water);
  g.userData.water = water;
  // steam puffs
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false });
  const steam = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), steamMat);
    p.position.set(Math.cos(i) * 1.2, 0.8 + (i % 3) * 0.3, Math.sin(i * 1.7) * 0.9);
    steam.add(p);
  }
  steam.userData.noBatch = true;
  g.add(steam);
  g.userData.steam = steam;
  // little wooden sign and bamboo screen behind
  const s = signMesh('♨️ HOT SPRING', 1.6); s.position.set(0, 1.5, -3.05); s.userData.noBatch = true;
  g.add(s);
  const bamboo = stdMat('#9bb35a', { roughness: 0.8 });
  for (let i = 0; i < 14; i++) g.add(cyl(0.05, 0.05, 2.2, bamboo, 6, -3.2 + i * 0.5, 1.1, -3.2));
  shadowAll(g);
  water.castShadow = false;
  return g;
}

function makeCampfire() {
  const g = new THREE.Group();
  const stone = stdMat('#7d7a74', { roughness: 0.95 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), stone).translateX(Math.cos(a) * 0.55).translateZ(Math.sin(a) * 0.55).translateY(0.1));
  }
  const wood = stdMat('#6d4c3d', { roughness: 0.9 });
  for (let i = 0; i < 4; i++) { const l = cyl(0.06, 0.06, 0.8, wood, 6, 0, 0.12, 0); l.rotation.set(Math.PI / 2, 0, (i / 4) * Math.PI); g.add(l); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9 }));
  flame.position.y = 0.45;
  flame.userData.noBatch = true;
  g.add(flame);
  const light = new THREE.PointLight(0xff9a3c, 0, 9, 1.6);
  light.position.y = 0.9;
  g.add(light);
  g.userData.flame = flame;
  g.userData.light = light;
  // log benches around the fire
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const log = cyl(0.2, 0.2, 1.4, wood, 8, Math.cos(a) * 2, 0.2, Math.sin(a) * 2);
    log.rotation.set(Math.PI / 2, 0, 0);
    log.rotation.z = 0;
    log.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -a);
    g.add(log);
  }
  shadowAll(g);
  flame.castShadow = false;
  return g;
}

function makeLookout() {
  const g = new THREE.Group();
  const wood = stdMat('#a0784f', { roughness: 0.8 });
  g.add(box(4, 0.25, 3, wood, 0, 0.12, 0));
  for (const x of [-1.9, 1.9]) g.add(box(0.08, 0.8, 3, wood, x, 0.6, 0));
  g.add(box(4, 0.8, 0.08, wood, 0, 0.6, -1.46));
  // telescope on a tripod
  const metal = stdMat('#3e4c66', { metalness: 0.6, roughness: 0.35 });
  const t = new THREE.Group();
  for (let i = 0; i < 3; i++) { const leg = cyl(0.025, 0.025, 1.1, metal, 6, 0, 0.55, 0); leg.rotation.set(0.25 * Math.cos(i * 2.1), 0, 0.25 * Math.sin(i * 2.1)); t.add(leg); }
  const tube = cyl(0.08, 0.11, 0.9, metal, 12, 0, 1.2, 0); tube.rotation.x = -1.0;
  t.add(tube);
  t.position.set(0.8, 0.25, -0.8);
  g.add(t);
  const s = signMesh('🔭 STARGAZING', 1.6); s.position.set(0, 1.25, -1.5); s.userData.noBatch = true;
  g.add(s);
  shadowAll(g);
  return g;
}

function makeFoodTruck() {
  const g = new THREE.Group();
  const body = stdMat('#ff8fab', { roughness: 0.5 });
  const white = stdMat('#ffffff', { roughness: 0.5 });
  const dark = stdMat('#333844', { roughness: 0.4, metalness: 0.3 });
  g.add(box(3.6, 1.8, 1.9, body, 0, 1.25, 0));
  g.add(box(1.1, 1.3, 1.9, white, 2.3, 1.0, 0));
  g.add(box(2.2, 0.8, 0.05, nightMaterials.window, -0.3, 1.45, 0.96));
  g.add(box(2.4, 0.08, 0.5, white, -0.3, 0.95, 1.15));
  for (const [x, z] of [[-1.2, -0.95], [-1.2, 0.95], [1.8, -0.95], [1.8, 0.95]]) { const w = cyl(0.32, 0.32, 0.22, dark, 14, x, 0.32, z); w.rotation.x = Math.PI / 2; g.add(w); }
  const s = signMesh('🌮 SNACKS', 1.8); s.position.set(-0.3, 2.35, 0.96); s.userData.noBatch = true;
  g.add(s);
  shadowAll(g);
  return g;
}

/**
 * Put the venues on the island. Returns the objects that animate (hot spring
 * steam, campfire) so Island.update can drive them.
 */
export function placeVenues(island) {
  const anim = {};
  const add = (key, obj, x, z, rot, label, spots, extra = {}) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    island.group.add(obj);
    const abs = spots.map((s) => {
      const p = island.localToWorld(x, z, rot, s.x, s.z);
      return { id: uid('spot'), type: s.type, x: p.x, z: p.z, rot: rot + (s.rot ?? 0), occupant: null, anim: s.anim };
    });
    island.addLocation(key, { pos: [x, z], radius: extra.radius || 3, label, outdoor: true, venue: true, spots: abs, rotY: rot, obj, ...extra });
    return abs;
  };

  // basketball court (west)
  add('court', makeCourt(), -24, -7, Math.PI / 2, 'Basketball Court', [
    { type: 'shoot', x: 0, z: -2.6, rot: -Math.PI / 2 }, { type: 'shoot', x: 1, z: 2.4, rot: Math.PI / 2 },
    { type: 'shoot', x: -1.2, z: -1.2, rot: -Math.PI / 2 }, { type: 'shoot', x: 1.3, z: 1.0, rot: Math.PI / 2 },
    { type: 'watch', x: 4.3, z: -1.5, rot: Math.PI }, { type: 'watch', x: 4.3, z: 1.5, rot: Math.PI },
  ], { radius: 4.5 });
  island.addObstacle(-24, -11.2, 0.3); island.addObstacle(-24, -2.8, 0.3); // hoop poles
  island.addBench(-28.4, -8.5, Math.PI / 2, 'court');
  island.addBench(-28.4, -5.5, Math.PI / 2, 'court');

  // playground (north-west, between clinic and condo)
  add('playground', makePlayground(), -10, -24, 0.35, 'Playground', [
    { type: 'swing', x: -2.6, z: -1, anim: 'sit' }, { type: 'swing', x: -1.4, z: -1, anim: 'sit' },
    { type: 'slide', x: 2.2, z: 1.6 }, { type: 'seesaw', x: -1.1, z: 2 }, { type: 'seesaw', x: 1.1, z: 2 },
    { type: 'sand', x: -0.5, z: 0.3, anim: 'sitGround' },
  ], { radius: 4 });
  island.addObstacle(-12.2, -25, 0.6); island.addObstacle(-7.8, -24.5, 0.7);

  // picnic lawn (north-east)
  {
    const x = 11, z = -22;
    island.addLocation('picnic', { pos: [x, z], radius: 4, label: 'Picnic Lawn', outdoor: true, venue: true, spots: [], rotY: 0 });
    for (const [dx, dz, r] of [[-2.2, 0, 0.2], [2.4, -0.6, -0.3]]) {
      const t = makePicnicTable();
      island.addStatic(t, x + dx, z + dz, r, 1.1);
      for (const [lx, lz, lr] of [[0, 0.8, Math.PI], [0, -0.8, 0]]) {
        const p = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
        island.seats.push({ id: uid('seat'), x: x + dx + p.x, z: z + dz + p.z, rot: r + lr, area: 'picnic', table: true, occupant: null });
      }
    }
    for (const [dx, dz] of [[-5, -3], [5, 3], [0, -5]]) island.addStatic(makeTree('blossom', 1.1), x + dx, z + dz, dx, 0.7);
    island.addStatic(makeFlowerBed(), x, z + 3.5, 0.3, 0.8);
    // a blanket on the grass
    const blanket = box(2, 0.02, 1.6, stdMat('#e05a5a', { roughness: 1 }), 0, 0.02, 0);
    blanket.receiveShadow = true;
    island.addStatic(blanket, x + 0.2, z + 2, 0.4, 0);
    island.locations.picnic.spots.push(...[[-0.4, 0], [0.4, 0.2]].map(([lx, lz]) => {
      const p = island.localToWorld(x + 0.2, z + 2, 0.4, lx, lz);
      return { id: uid('spot'), type: 'blanket', x: p.x, z: p.z, rot: 0.4, occupant: null, anim: 'sitGround' };
    }));
  }

  // hot spring (east)
  {
    const spots = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spots.push({ type: 'soak', x: Math.cos(a) * 1.5, z: Math.sin(a) * 1.15, rot: -a - Math.PI / 2, anim: 'sitGround' });
    }
    const obj = makeHotSpring();
    add('onsen', obj, 25, -15, -Math.PI / 2 + 0.4, 'Hot Spring', spots, { radius: 3.2, water: true });
    anim.onsen = obj;
  }

  // campfire circle (north-west woods)
  {
    const spots = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spots.push({ type: 'fire', x: Math.cos(a) * 1.7, z: Math.sin(a) * 1.7, rot: Math.atan2(-Math.cos(a), -Math.sin(a)), anim: 'sitGround' });
    }
    const obj = makeCampfire();
    add('campfire', obj, -24, -20, 0, 'Campfire', spots, { radius: 3 });
    anim.campfire = obj;
    island.addObstacle(-24, -20, 0.8);
    for (const [dx, dz, k] of [[-4, -3, 'pine'], [3.5, -3.5, 'pine'], [-4.5, 2.5, 'pine'], [0, -5, 'round']]) island.addStatic(makeTree(k, 1.2), -24 + dx, -20 + dz, dx, 0.7);
  }

  // stargazing lookout (north-east coast)
  add('lookout', makeLookout(), 22, -31, -0.6, 'Stargazing Lookout', [
    { type: 'scope', x: 0.8, z: -0.4, rot: Math.PI }, { type: 'sky', x: -0.8, z: 0.2, rot: Math.PI, anim: 'sitGround' }, { type: 'sky', x: 0, z: 0.6, rot: Math.PI, anim: 'sitGround' },
  ], { radius: 2.5, y: 0.25 });
  island.addPlatform(22, -31, -0.6, 2, 1.5, 0.25);

  // food truck (north of the plaza)
  add('foodtruck', makeFoodTruck(), 9, -12, -0.5, 'Food Truck', [
    { type: 'order', x: -0.3, z: 1.8, rot: Math.PI }, { type: 'order', x: 0.8, z: 2.2, rot: Math.PI },
  ], { radius: 2 });
  island.addObstacle(9, -12, 2.0);
  for (const [x, z] of [[-18, -20], [16, -26], [20, -12], [-20, -4]]) island.addStatic(makeLamp(), x, z, 0, 0.25);
  island.addBench(5.5, -15.5, 2.6, 'plaza');

  return anim;
}

/** Steam drifting off the hot spring; the campfire flickers (and lights up at night). */
export function animateVenues(anim, t, night) {
  const st = anim.onsen?.userData.steam;
  if (st) st.children.forEach((p, i) => { p.position.y = 0.8 + ((t * 0.25 + i * 0.37) % 1.2); p.scale.setScalar(0.6 + ((t * 0.25 + i * 0.37) % 1.2) * 0.6); });
  const f = anim.campfire?.userData;
  if (f?.flame) {
    const lit = night > 0.15;
    f.flame.visible = lit;
    f.flame.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 9) * 0.15, 1 + Math.cos(t * 11) * 0.08);
    f.light.intensity = lit ? 6 + Math.sin(t * 17) * 1.2 : 0;
  }
}

export { makeBench };
