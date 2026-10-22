// A resident of the island: saved data + live avatar + movement + a simple
// step-by-step "plan" that the brain (brain.js) or an interaction fills.

import * as THREE from 'three';
import { Avatar } from '../characters/avatar.js';
import { AnimationPlayer, boneOverride } from '../characters/animation.js';
import { MOD_POSES } from '../characters/builtinAnims.js';
import { DOLL_DEFAULTS } from '../characters/rig.js';
import { makeUmbrella, makeHeadBandage, makePlaster, makeSling, makeDizzyStars } from '../world/props.js';
import { INJURIES, FOODS, CATCHPHRASES, line, DOLL_PALETTES } from './data.js';
import { angleDamp, clamp, pick, rand, uid, chance } from '../core/util.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export const RESIDENT_SCALE = 1.3;

export function randomTraits() {
  const r = () => Math.round(rand(0.05, 0.95) * 100) / 100;
  return { temper: r(), kindness: r(), sociability: r(), confidence: r(), energy: r(), quirk: r() };
}

export function randomDoll(gender) {
  return {
    ...DOLL_DEFAULTS,
    skin: pick(DOLL_PALETTES.skin),
    hair: pick(DOLL_PALETTES.hair),
    top: pick(DOLL_PALETTES.top),
    bottom: pick(DOLL_PALETTES.bottom),
    shoes: pick(DOLL_PALETTES.shoes),
    hairStyle: gender === 'f' ? pick(['long', 'bun', 'bob', 'short']) : gender === 'm' ? pick(['short', 'spiky', 'short', 'bald']) : pick(['short', 'bob', 'spiky', 'long']),
    bottomStyle: gender === 'f' ? pick(['skirt', 'pants', 'shorts']) : pick(['pants', 'shorts']),
    height: rand(0.92, 1.08),
    build: rand(0.9, 1.12),
  };
}

export function newResidentData(name, gender = pick(['m', 'f'])) {
  const foods = [...FOODS].sort(() => Math.random() - 0.5);
  return {
    id: uid('res'),
    name,
    gender,
    traits: randomTraits(),
    look: { kind: 'doll', doll: randomDoll(gender), assetId: null, variantId: null },
    outfit: null, // {assetId, variantId, parts}
    custom: { textures: {}, tints: {}, hidden: [] }, // per-resident overrides on top of variants
    scale: 1,
    favFood: foods[0].id,
    hatedFood: foods[1].id,
    catchphrase: pick(CATCHPHRASES),
    needs: { hunger: rand(60, 90), energy: rand(70, 100), fun: rand(50, 80), social: rand(40, 80) },
    happiness: 60,
    level: 1,
    xp: 0,
    injuries: [],
    wetness: 0,
    hasUmbrella: false,
    umbrellaColor: pick(['#4aa3df', '#e84a5f', '#ffd166', '#06d6a0', '#9b5de5']),
    relationships: {},
    problem: null,
    houseIndex: null,
    pos: null,
    soakedMinutes: 0,
    memories: [],
  };
}

export class Resident {
  constructor(sim, data) {
    this.sim = sim;
    this.d = data;
    this.group = new THREE.Group();
    this.group.name = `res_${data.name}`;
    this.group.userData.residentId = data.id;
    this.avatar = null;
    this.player = new AnimationPlayer(sim.registry);
    this.heading = rand(0, Math.PI * 2);
    this.path = [];
    this.moving = null;
    this.plan = [];
    this.step = null;
    this.engaged = null; // interaction or fight controlling this resident
    this.inside = null; // location key when indoors
    this.insideUntil = 0;
    this.bubble = null;
    this.emotion = { type: 'neutral', until: 0 };
    this.cooldowns = {};
    this.seat = null;
    this.attach = {};
    this.wanderTimer = 0;
    this.thinkTimer = rand(0, 2);
    this.slipCooldown = 0;
    this.sneezeTimer = rand(20, 60);
    // invisible hit volume for mouse picking
    this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.5, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.75;
    this.hit.userData.residentId = data.id;
    this.group.add(this.hit);
    // selection ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  get id() { return this.d.id; }
  get name() { return this.d.name; }
  get t() { return this.d.traits; }
  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }

  // ------------------------------------------------------------------ avatar
  async buildAvatar() {
    const sim = this.sim;
    const lib = sim.library;
    let avatar = null;
    const look = this.d.look;
    if (look.kind === 'vrm' && look.assetId && lib.get(look.assetId)) {
      try {
        avatar = await Avatar.fromVRM(await lib.getData(look.assetId));
      } catch (err) {
        console.warn('VRM failed, falling back to doll', err);
        sim.toast?.(`Could not load ${lib.displayName(look.assetId)}: ${err.message}`);
      }
    }
    if (!avatar) avatar = await Avatar.fromDoll(look.doll || DOLL_DEFAULTS);
    // outfit
    if (this.d.outfit?.assetId && lib.get(this.d.outfit.assetId)) {
      try {
        await avatar.wearOutfit(await lib.getData(this.d.outfit.assetId), this.d.outfit.parts, this.d.outfit.assetId);
      } catch (err) {
        console.warn('Outfit failed', err);
      }
    }
    // swap in
    if (this.avatar) this.avatar.dispose();
    this.avatar = avatar;
    // auto size: keep VRoid models around doll scale so the island reads well
    // Residents are a bit larger than life so they read well next to the buildings.
    let s = (this.d.scale || 1) * RESIDENT_SCALE;
    if (avatar.kind === 'vrm') s *= clamp(1.45 / avatar.height, 0.4, 1.4);
    avatar.root.scale.setScalar(s);
    this.displayScale = s;
    this.headHeight = avatar.height * s;
    this.hit.scale.y = Math.max(0.6, this.headHeight / 1.5);
    this.hit.position.y = this.headHeight / 2;
    this.group.add(avatar.root);
    await this.applyLook();
    avatar.setWetness(this.d.wetness);
    this.player.pose && avatar.applyPose(this.player.pose);
  }

  /** Merge character variant + outfit variant + per-resident overrides. */
  composeLook() {
    const lib = this.sim.library;
    const out = { textures: {}, tints: {}, hidden: [] };
    const addLook = (l, prefix = '') => {
      if (!l) return;
      for (const [k, v] of Object.entries(l.textures || {})) out.textures[prefix + k] = v;
      for (const [k, v] of Object.entries(l.tints || {})) out.tints[prefix + k] = v;
      for (const k of l.hidden || []) if (!out.hidden.includes(prefix + k)) out.hidden.push(prefix + k);
    };
    if (this.d.look.kind === 'vrm' && this.d.look.assetId && this.d.look.variantId) addLook(lib.variant(this.d.look.assetId, this.d.look.variantId));
    if (this.d.outfit?.assetId && this.d.outfit.variantId) addLook(lib.variant(this.d.outfit.assetId, this.d.outfit.variantId), 'outfit:');
    if (this.d.outfit?.hideBase) for (const k of this.d.outfit.hideBase) if (!out.hidden.includes(k)) out.hidden.push(k);
    addLook(this.d.custom);
    return out;
  }

  async applyLook() {
    if (!this.avatar) return;
    await this.avatar.applyLook(this.composeLook(), this.sim.textures);
  }

  // ------------------------------------------------------------------ relationships
  rel(otherId) {
    let r = this.d.relationships[otherId];
    if (!r) {
      r = { score: 0, crush: false, partner: false, ex: false, grudge: 0, fights: 0, met: false, last: 0 };
      this.d.relationships[otherId] = r;
    }
    return r;
  }

  relScore(otherId) { return this.d.relationships[otherId]?.score ?? 0; }

  changeRel(otherId, delta) {
    const r = this.rel(otherId);
    r.score = clamp(r.score + delta, -100, 100);
    r.met = true;
    return r;
  }

  relLabel(otherId) {
    const r = this.d.relationships[otherId];
    if (!r || !r.met) return { label: 'Stranger', icon: '❔' };
    if (r.partner) return { label: 'Sweetheart', icon: '💞' };
    const s = r.score;
    if (s <= -60) return { label: 'Enemy', icon: '😡' };
    if (s <= -25) return { label: 'Rival', icon: '😒' };
    if (s < 10) return { label: r.ex ? 'Ex' : 'Acquaintance', icon: r.ex ? '💔' : '🙂' };
    if (s < 45) return { label: r.crush ? 'Crush' : 'Friend', icon: r.crush ? '💗' : '😊' };
    if (s < 75) return { label: r.crush ? 'Crush' : 'Good Friend', icon: r.crush ? '💗' : '😄' };
    return { label: r.crush ? 'Crush' : 'Best Friend', icon: r.crush ? '💗' : '🤝' };
  }

  partnerId() {
    for (const [id, r] of Object.entries(this.d.relationships)) if (r.partner) return id;
    return null;
  }

  // ------------------------------------------------------------------ status
  get available() {
    return !this.engaged && !this.inside && !this.ko && this.sim.residents.includes(this);
  }

  get outside() { return !this.inside; }

  hasEffect(effect) { return this.d.injuries.some((i) => INJURIES[i.type]?.effect === effect); }

  get injured() { return this.d.injuries.length > 0; }

  get painLevel() {
    let p = 0;
    for (const i of this.d.injuries) p += (INJURIES[i.type]?.pain || 5) * (i.treated ? 0.4 : 1);
    return p;
  }

  get health() { return clamp(100 - this.painLevel * 2.2, 0, 100); }

  get canFight() { return !this.hasEffect('sling') && this.health > 25; }

  mood() {
    if (this.emotion.until > this.sim.clock && this.emotion.type !== 'neutral') return this.emotion.type;
    const h = this.d.happiness;
    if (h > 70) return 'happy';
    if (h < 30) return 'sad';
    return 'neutral';
  }

  moodIcon() {
    return { happy: '😊', sad: '😢', angry: '😠', love: '😍', shy: '😳', scared: '😨', neutral: '🙂', hurt: '🤕', smug: '😏' }[this.mood()] || '🙂';
  }

  setEmotion(type, minutes = 30) {
    this.emotion = { type, until: this.sim.clock + minutes };
  }

  addMemory(text) {
    this.d.memories.unshift({ text, at: this.sim.clock });
    this.d.memories.length = Math.min(this.d.memories.length, 12);
  }

  addInjury(type) {
    const def = INJURIES[type];
    if (!def) return null;
    const existing = this.d.injuries.find((i) => i.type === type);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, def.heal);
      existing.treated = false;
      return existing;
    }
    const inj = { type, remaining: def.heal, treated: false, at: this.sim.clock };
    this.d.injuries.push(inj);
    this.refreshAttachments();
    return inj;
  }

  healAll() {
    this.d.injuries = [];
    this.refreshAttachments();
  }

  // ------------------------------------------------------------------ actions
  say(text, opts = {}) {
    this.bubble = { text, emoji: opts.emoji || '', kind: opts.kind || 'speech', until: this.sim.realTime + (opts.dur || Math.min(5, 1.6 + text.length * 0.05)) };
    if (opts.talk !== false && this.avatar) {
      this.avatar.talking = true;
      this.talkUntil = this.sim.realTime + Math.min(2.5, 0.6 + text.length * 0.05);
    }
    if (opts.sound !== false && this.sim.isNear(this)) this.sim.audio.talk();
  }

  emote(emoji, dur = 2) {
    this.bubble = { text: '', emoji, kind: 'emote', until: this.sim.realTime + dur };
  }

  play(anim, opts) { this.player.play(anim, opts); }

  setExpression(map) {
    if (!this.avatar) return;
    this.avatar.clearExpressions();
    for (const [k, v] of Object.entries(map || {})) this.avatar.setExpression(k, v);
  }

  faceTo(x, z) {
    this.targetHeading = Math.atan2(x - this.x, z - this.z);
  }

  placeAt(x, z) {
    this.group.position.set(x, this.sim.island.heightAt(x, z), z);
  }

  stopMoving() {
    this.moving = null;
    this.path = [];
  }

  /** Walk (or run) to a point, avoiding buildings. Returns a promise-like flag object. */
  moveTo(x, z, opts = {}) {
    this.leaveSeat();
    const path = planPath(this.x, this.z, x, z, this.sim.island.obstacles);
    this.path = path;
    this.moving = { x, z, run: !!opts.run, stopDist: opts.stopDist ?? 0.15, onArrive: opts.onArrive || null, anim: opts.anim || null, speed: opts.speed || null, done: false };
    return this.moving;
  }

  moveAnim() {
    if (this.moving?.anim) return this.moving.anim;
    if (this.hasEffect('limp')) return 'limp';
    if (this.moving?.run) return 'run';
    if (this.hasEffect('dizzy')) return 'walkSad';
    const m = this.mood();
    if (m === 'sad' || this.d.happiness < 25) return 'walkSad';
    if (m === 'happy' && this.t.energy > 0.6) return 'walkHappy';
    return 'walk';
  }

  moveSpeed() {
    if (this.moving?.speed) return this.moving.speed;
    let s = this.moving?.run ? 3.4 : 1.15 + this.t.energy * 0.35;
    if (this.hasEffect('limp')) s = 0.55;
    if (this.d.happiness < 25 && !this.moving?.run) s *= 0.8;
    return s * (this.displayScale || 1) ** 0.5;
  }

  leaveSeat() {
    if (this.seat) {
      if (this.seat.occupant === this.id) this.seat.occupant = null;
      this.seat = null;
    }
  }

  enter(locKey, minutes) {
    this.leaveSeat();
    this.stopMoving();
    this.inside = locKey;
    this.insideUntil = this.sim.clock + minutes;
    this.group.visible = false;
    this.bubble = null;
  }

  exit() {
    if (!this.inside) return;
    const loc = this.sim.locationDoor(this.inside, this);
    this.inside = null;
    this.group.visible = true;
    if (loc) {
      this.placeAt(loc[0], loc[1]);
      this.heading = loc[2] ?? this.heading;
    }
  }

  setPlan(steps) {
    this.plan = steps.filter(Boolean);
    this.step = null;
  }

  clearPlan() {
    this.plan = [];
    this.step = null;
    this.stopMoving();
  }

  // ------------------------------------------------------------------ per frame
  update(dt, gameMin) {
    const sim = this.sim;
    if (!this.avatar) return;

    // indoors: just wait
    if (this.inside) {
      if (!this.engaged && sim.clock >= this.insideUntil) {
        const cb = this.onExit;
        this.onExit = null;
        this.exit();
        if (cb) cb();
      }
    }

    if (!this.inside) {
      // run plan / brain
      if (!this.engaged && !this.ko) this._runPlan(dt);
      this._move(dt);
    }

    // heading smoothing
    if (this.targetHeading !== undefined) this.heading = angleDamp(this.heading, this.targetHeading, 8, dt);
    this.group.rotation.y = this.heading;

    // talking mouth timeout
    if (this.avatar.talking && sim.realTime > (this.talkUntil || 0)) this.avatar.talking = false;
    if (this.bubble && sim.realTime > this.bubble.until) this.bubble = null;

    // animation (skip the expensive part when hidden indoors)
    if (!this.inside) {
      const pose = this.player.update(dt);
      this.avatar.applyPose(pose);
      this.avatar.update(dt);
      this._updateAttachments(dt);
    }
  }

  _runPlan(dt) {
    if (!this.step) {
      if (!this.plan.length) return;
      this.step = this.plan.shift();
      this.step.t = 0;
      this._startStep(this.step);
    }
    const s = this.step;
    s.t += dt;
    let done = false;
    switch (s.kind) {
      case 'walk':
        done = !this.moving || this.moving.done;
        break;
      case 'anim':
        done = s.t >= s.dur;
        if (s.loopSay && s.t > (s.nextSay || 0)) { s.nextSay = s.t + rand(2.5, 5); this.say(s.loopSay(), { emoji: s.emoji }); }
        break;
      case 'sit':
        done = s.t >= s.dur || !this.seat;
        break;
      case 'wait':
        done = s.t >= s.dur;
        break;
      default:
        done = true;
    }
    if (done) {
      if (s.kind === 'sit') { this.leaveSeat(); this.play('idle'); }
      if (s.then) s.then();
      this.step = null;
    }
  }

  _startStep(s) {
    switch (s.kind) {
      case 'walk':
        this.moveTo(s.x, s.z, { run: s.run, stopDist: s.stopDist, anim: s.anim });
        break;
      case 'anim':
        this.stopMoving();
        if (s.faceX !== undefined) this.faceTo(s.faceX, s.faceZ);
        if (s.heading !== undefined) this.targetHeading = s.heading;
        this.play(s.anim, { loop: s.loop });
        if (s.expr) this.setExpression(s.expr);
        if (s.say) this.say(s.say, { emoji: s.emoji });
        else if (s.emoji) this.emote(s.emoji, Math.min(s.dur, 3));
        break;
      case 'sit': {
        const seat = s.seat;
        if (seat.occupant && seat.occupant !== this.id) { s.dur = 0; break; }
        seat.occupant = this.id;
        this.seat = seat;
        this.placeAt(seat.x, seat.z);
        this.heading = seat.rot;
        this.targetHeading = seat.rot;
        this.play(s.anim || (seat.ground ? 'sitGround' : 'sit'));
        if (s.expr) this.setExpression(s.expr);
        break;
      }
      case 'enter':
        this.enter(s.loc, s.minutes);
        this.onExit = s.onExit || null;
        break;
      case 'call':
        s.fn?.();
        break;
      case 'wait':
        this.stopMoving();
        this.play(s.anim || 'idle');
        break;
      default:
        break;
    }
  }

  _move(dt) {
    const m = this.moving;
    if (!m || m.done) return;
    const target = this.path[0] || { x: m.x, z: m.z };
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);
    const last = this.path.length <= 1;
    const stop = last ? m.stopDist : 0.4;
    if (dist <= stop) {
      if (this.path.length) this.path.shift();
      if (last) {
        m.done = true;
        this.moving = null;
        if (!this.engaged || this.engaged.keepAnim !== true) this.play('idle');
        if (m.onArrive) m.onArrive();
        return;
      }
      return;
    }
    const speed = this.moveSpeed();
    const step = Math.min(dist, speed * dt);
    const nx = this.x + (dx / dist) * step;
    const nz = this.z + (dz / dist) * step;
    this.group.position.set(nx, this.sim.island.heightAt(nx, nz), nz);
    this.targetHeading = Math.atan2(dx, dz);
    const anim = this.moveAnim();
    this.play(anim, { speed: anim === 'walk' || anim === 'walkHappy' ? speed / 1.3 : 1 });
    // slipping on a wet island while running
    this.slipCooldown -= dt;
    if (m.run && this.sim.weather.wetness > 0.55 && this.slipCooldown <= 0 && !this.engaged) {
      this.slipCooldown = 3;
      if (chance(0.025 * this.sim.weather.wetness * (this.sim.settings.conflict === 'off' ? 0.3 : 1))) this.sim.slip(this);
    }
  }

  // ------------------------------------------------------------------ attachments
  refreshAttachments() {
    const want = new Set();
    for (const i of this.d.injuries) {
      const def = INJURIES[i.type];
      if (def?.visual) want.add(def.visual);
      if (def?.effect === 'dizzy') want.add('dizzy');
    }
    for (const key of ['plaster', 'headBandage', 'sling', 'dizzy']) {
      if (want.has(key) && !this.attach[key]) {
        const obj = key === 'plaster' ? makePlaster() : key === 'headBandage' ? makeHeadBandage() : key === 'sling' ? makeSling() : makeDizzyStars();
        this.sim.fx.add(obj);
        this.attach[key] = obj;
      } else if (!want.has(key) && this.attach[key]) {
        this.attach[key].removeFromParent();
        delete this.attach[key];
      }
    }
    this.player.setModifier('sling', this.hasEffect('sling') ? boneOverride(MOD_POSES.sling) : null);
  }

  _updateAttachments(dt) {
    const sim = this.sim;
    const a = this.avatar;
    const vis = this.group.visible;
    // umbrella while it rains (not while fighting/KO)
    const wantUmbrella = this.d.hasUmbrella && (sim.weather.raining || sim.weather.snowing) && !this.inside && !this.engaged?.isFight && !this.ko && !this.seat;
    if (wantUmbrella && !this.attach.umbrella) {
      this.attach.umbrella = makeUmbrella(this.d.umbrellaColor);
      sim.fx.add(this.attach.umbrella);
      this.player.setModifier('umbrella', boneOverride(MOD_POSES.umbrella));
    } else if (!wantUmbrella && this.attach.umbrella) {
      this.attach.umbrella.removeFromParent();
      delete this.attach.umbrella;
      this.player.setModifier('umbrella', null);
    }
    const s = this.displayScale || 1;
    const h = a.height * s;
    const isDoll = a.kind === 'doll';
    const headC = isDoll ? 0.123 * h : 0.07 * h;
    const headR = isDoll ? 0.145 * h : 0.075 * h;
    if (this.attach.umbrella) {
      a.getBoneWorld('rightHand', _p, _q);
      const u = this.attach.umbrella;
      u.visible = vis;
      u.position.copy(_p);
      u.quaternion.setFromAxisAngle(UP, this.heading);
      u.rotateX(-0.12);
      u.scale.setScalar(Math.max(0.75, h / 1.9));
      u.position.y -= 0.05;
    }
    if (this.attach.headBandage || this.attach.plaster || this.attach.dizzy) {
      a.getBoneWorld('head', _p, _q);
      _v.set(0, headC, 0).applyQuaternion(_q).add(_p);
      if (this.attach.headBandage) {
        const b = this.attach.headBandage;
        b.visible = vis;
        b.position.copy(_v).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(_q), headR * 0.35);
        b.quaternion.copy(_q);
        b.scale.setScalar(headR / 0.2 * 1.02);
      }
      if (this.attach.plaster) {
        const p = this.attach.plaster;
        p.visible = vis;
        p.position.copy(_v).add(new THREE.Vector3(headR * 0.38, -headR * 0.2, headR * 0.93).applyQuaternion(_q));
        p.quaternion.copy(_q);
        p.rotateY(0.35);
        p.scale.setScalar(headR / 0.2);
      }
      if (this.attach.dizzy) {
        const d = this.attach.dizzy;
        d.visible = vis;
        d.position.copy(_v).y += headR * 1.3;
        d.rotation.y += dt * 4;
        d.scale.setScalar(headR / 0.2);
      }
    }
    if (this.attach.sling) {
      a.getBoneWorld('leftLowerArm', _p, _q);
      const sl = this.attach.sling;
      sl.visible = vis;
      a.getBoneWorld('leftHand', _v, null);
      sl.position.copy(_p).lerp(_v, 0.5);
      sl.lookAt(_v);
      sl.rotateY(Math.PI / 2);
      sl.scale.setScalar(h / 1.38);
    }
  }

  disposeAttachments() {
    for (const k of Object.keys(this.attach)) { this.attach[k].removeFromParent(); delete this.attach[k]; }
  }

  serialize() {
    const d = this.d;
    d.pos = this.inside ? null : [this.x, this.z, this.heading];
    d.insideState = this.inside ? { loc: this.inside, until: this.insideUntil } : null;
    return JSON.parse(JSON.stringify(d));
  }
}

// --------------------------------------------------------------------------
// Simple obstacle-avoiding path planner: straight line with detours around
// any circular obstacle that blocks it.

function segCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return null;
  let t = ((cx - ax) * dx + (cz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  const px = ax + dx * t, pz = az + dz * t;
  const d = Math.hypot(px - cx, pz - cz);
  return d < r ? { t, px, pz, d } : null;
}

export function planPath(ax, az, bx, bz, obstacles, depth = 0) {
  if (depth > 4) return [{ x: bx, z: bz }];
  let best = null;
  for (const o of obstacles) {
    const r = o.r + (o.soft ? 0.25 : 0.5);
    // ignore obstacles we start in or end in (doors, seats)
    if (Math.hypot(ax - o.x, az - o.z) < r || Math.hypot(bx - o.x, bz - o.z) < r) continue;
    const hit = segCircle(ax, az, bx, bz, o.x, o.z, r);
    if (hit && (!best || hit.t < best.hit.t)) best = { o, hit, r };
  }
  if (!best) return [{ x: bx, z: bz }];
  const { o, hit, r } = best;
  let nx = hit.px - o.x, nz = hit.pz - o.z;
  let nl = Math.hypot(nx, nz);
  if (nl < 1e-3) { nx = -(bz - az); nz = bx - ax; nl = Math.hypot(nx, nz); }
  const wx = o.x + (nx / nl) * (r + 0.6);
  const wz = o.z + (nz / nl) * (r + 0.6);
  return [...planPath(ax, az, wx, wz, obstacles, depth + 1), ...planPath(wx, wz, bx, bz, obstacles, depth + 1)];
}
