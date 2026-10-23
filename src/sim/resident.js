// A resident of the island: saved data + live avatar + movement + a simple
// step-by-step "plan" that the brain (brain.js) or an interaction fills.

import * as THREE from 'three';
import { Avatar } from '../characters/avatar.js';
import { AnimationPlayer, boneOverride } from '../characters/animation.js';
import { MOD_POSES } from '../characters/builtinAnims.js';
import { DOLL_DEFAULTS } from '../characters/rig.js';
import { makeUmbrella, makeHeadBandage, makePlaster, makeSling, makeDizzyStars } from '../world/props.js';
import { INJURIES, FOODS, CATCHPHRASES, line, DOLL_PALETTES } from './data.js';
import { angleDamp, clamp, pick, rand, uid, chance, damp } from '../core/util.js';
import { defaultVoice, normVoice, stylizeLine } from '../engine/voice.js';
import { mishapLook } from './outfits.js';
import { priorLabel } from './relations.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export const RESIDENT_SCALE = 1.3;
const _e = new THREE.Euler();
// poses where the feet are not standing on the ground: no foot IK / head tracking
const SWIM_ANIM = { walk: 'swim', walkHappy: 'swim', walkSad: 'swim', run: 'swim', limp: 'swim', idle: 'tread', idleLook: 'tread', wait: 'tread' };
const WATER_OK = new Set(['swim', 'tread', 'float', 'struggle']);
const NO_IK = new Set(['sit', 'sitGround', 'lieDown', 'sleep', 'knockdown', 'getUp', 'tackle', 'eat', 'swim', 'tread', 'float', 'struggle']);

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
    voice: defaultVoice(gender),
    sayName: '',
    outfits: [], // personal alternate outfits (extra VRM models / looks unique to this resident)
    wearing: -1, // -1 = main look, otherwise index into outfits
    autoOutfits: true,
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
    data.voice = normVoice(data.voice); // upgrade voices from older saves
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
  get homeKey() { return `home:${this.d.id}`; }
  get x() { return this.group.position.x; }
  get z() { return this.group.position.z; }

  // ------------------------------------------------------------------ avatar
  /**
   * The appearance currently worn: the resident's main look (stored on d) or one of
   * their personal alternate outfits. Both have {look, outfit, custom}.
   */
  appearance() {
    const o = this.d.wearing >= 0 ? this.d.outfits?.[this.d.wearing] : null;
    if (o) {
      o.custom ||= { textures: {}, tints: {}, hidden: [] };
      return o;
    }
    return this.d;
  }

  async buildAvatar() {
    const sim = this.sim;
    const lib = sim.library;
    const ap = this.appearance();
    const look = ap.look || this.d.look;
    const key = JSON.stringify([look, ap.outfit || null, this.d.scale]);
    this.avatarCache ||= new Map();
    let avatar = this.avatarCache.get(key) || null;
    if (avatar) this.avatarCache.delete(key);
    if (!avatar) {
      if (look.kind === 'vrm' && look.assetId && lib.get(look.assetId)) {
        try {
          avatar = await Avatar.fromVRM(await lib.getData(look.assetId));
        } catch (err) {
          console.warn('VRM failed, falling back to doll', err);
          sim.toast?.(`Could not load ${lib.displayName(look.assetId)}: ${err.message}`);
        }
      }
      if (!avatar) avatar = await Avatar.fromDoll(look.doll || this.d.look.doll || DOLL_DEFAULTS);
      // overlay outfit (clothing parts from another VRM)
      if (ap.outfit?.assetId && lib.get(ap.outfit.assetId)) {
        try {
          await avatar.wearOutfit(await lib.getData(ap.outfit.assetId), ap.outfit.parts, ap.outfit.assetId);
        } catch (err) {
          console.warn('Outfit failed', err);
        }
      }
    }
    // swap in; keep the previous body cached so switching outfits back is instant
    if (this.avatar && this.avatar !== avatar) {
      this.avatar.root.removeFromParent();
      this.avatarCache.set(this.avatarKey, this.avatar);
      while (this.avatarCache.size > 3) {
        const [oldKey, old] = this.avatarCache.entries().next().value;
        this.avatarCache.delete(oldKey);
        old.dispose();
      }
    }
    this.avatar = avatar;
    this.avatarKey = key;
    // Residents are a bit larger than life so they read well next to the buildings;
    // VRoid models are normalised to roughly the same height.
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

  /** Merge character variant + outfit variant + per-resident overrides (of the worn appearance). */
  composeLook({ mishap = true } = {}) {
    const lib = this.sim.library;
    const ap = this.appearance();
    const look = ap.look || this.d.look;
    const out = { textures: {}, tints: {}, hidden: [], thin: [], mishapHide: [] };
    const addLook = (l, prefix = '') => {
      if (!l) return;
      for (const [k, v] of Object.entries(l.textures || {})) out.textures[prefix + k] = v;
      for (const [k, v] of Object.entries(l.tints || {})) out.tints[prefix + k] = v;
      for (const k of l.hidden || []) if (!out.hidden.includes(prefix + k)) out.hidden.push(prefix + k);
      for (const k of l.thin || []) if (!out.thin.includes(prefix + k)) out.thin.push(prefix + k);
      for (const k of l.mishapHide || []) if (!out.mishapHide.includes(prefix + k)) out.mishapHide.push(prefix + k);
    };
    if (look.kind === 'vrm' && look.assetId && look.variantId) addLook(lib.variant(look.assetId, look.variantId));
    if (ap.outfit?.assetId && ap.outfit.variantId) addLook(lib.variant(ap.outfit.assetId, ap.outfit.variantId), 'outfit:');
    if (ap.outfit?.hideBase) for (const k of ap.outfit.hideBase) if (!out.hidden.includes(k)) out.hidden.push(k);
    addLook(ap.custom);
    return mishap ? mishapLook(this, this.avatar, out) : out;
  }

  disposeAvatars() {
    for (const a of this.avatarCache?.values() || []) a.dispose();
    this.avatarCache?.clear();
    this.avatar?.dispose();
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
    const prior = priorLabel(this, otherId);
    const base = this._relLabel(otherId);
    // family / rivalry / romance history comes first ("Sibling · Good Friend")
    return prior ? { label: base.label === prior.label ? prior.label : `${prior.label} · ${base.label}`, icon: prior.icon } : base;
  }

  _relLabel(otherId) {
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
  /** text may be a string or {text, say} (say = pronunciation for the voice). */
  say(text, opts = {}) {
    let spoken = null;
    if (text && typeof text === 'object') { spoken = text.say; text = text.text; }
    text = String(text ?? '');
    // verbal tics / stutter from the voice settings (only for real lines, not reactions)
    if (text.length > 3 && opts.style !== false) {
      const styled = stylizeLine(text, this.d.voice);
      if (styled !== text) { spoken = null; text = styled; }
    }
    this.bubble = { text, emoji: opts.emoji || '', kind: opts.kind || 'speech', until: this.sim.realTime + (opts.dur || Math.min(5, 1.6 + text.length * 0.05)) };
    if (opts.talk !== false && this.avatar && text) {
      this.avatar.talking = true;
      this.talkUntil = this.sim.realTime + Math.min(3, 0.6 + text.length * 0.05);
    }
    if (opts.sound !== false && text) this.sim.speak(this, spoken || text);
  }

  emote(emoji, dur = 2) {
    this.bubble = { text: '', emoji, kind: 'emote', until: this.sim.realTime + dur };
  }

  play(anim, opts) {
    // in deep water every ground animation becomes a swimming one
    if (this.inWater) anim = SWIM_ANIM[anim] || (WATER_OK.has(anim) ? anim : 'tread');
    this.player.play(anim, opts);
  }

  _waterChanged(wasIn) {
    const sim = this.sim;
    if (this.inWater) {
      this.d.wetness = 1;
      this.d.swimWet = true;
      if (this.avatar) this.avatar.setWetness(1);
      const pos = new THREE.Vector3(this.x, this.groundY + 0.1, this.z);
      sim.effects.splash(pos, 10, this.room ? sim.rooms.fx : undefined);
      if (sim.isNear(this)) sim.audio.splash?.();
    }
    // swap to the matching animation right away
    const a = this.player.action;
    if (a) this.play(wasIn ? (a === 'swim' ? 'walk' : 'idle') : a, { fade: 0.25 });
  }

  setExpression(map) {
    if (!this.avatar) return;
    this.avatar.clearExpressions();
    for (const [k, v] of Object.entries(map || {})) this.avatar.setExpression(k, v);
  }

  faceTo(x, z) {
    this.targetHeading = Math.atan2(x - this.x, z - this.z);
  }

  /** Move to x,z on the ground. snap=false lets the height ease (stepping onto platforms). */
  placeAt(x, z, snap = true) {
    // deep water (sea or pool): float at the surface and swim
    const water = this.space.waterAt?.(x, z) ?? null;
    const wasIn = this.inWater;
    this.inWater = water != null;
    this.groundY = this.inWater ? water - 0.06 : this.space.heightAt(x, z);
    if (this.inWater !== wasIn) this._waterChanged(wasIn);
    this.group.position.x = x;
    this.group.position.z = z;
    if (snap || Math.abs(this.group.position.y - this.groundY) > 1.2) this.group.position.y = this.groundY;
  }

  /** Keep residents out of buildings, trees, benches and other solid props. */
  pushOutOfObstacles(destX, destZ) {
    const obs = this.space.obstacles;
    let x = this.x, z = this.z;
    for (const o of obs) {
      const r = o.r + 0.18;
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= r || d < 1e-4) continue;
      if (destX !== undefined && Math.hypot(destX - o.x, destZ - o.z) < r) continue; // going into it on purpose (door, seat)
      x = o.x + (dx / d) * r;
      z = o.z + (dz / d) * r;
    }
    if (x !== this.x || z !== this.z) this.placeAt(x, z, false);
  }

  stopMoving() {
    this.moving = null;
    this.path = [];
  }

  /** Walk (or run) to a point, avoiding buildings. Returns a promise-like flag object. */
  moveTo(x, z, opts = {}) {
    this.leaveSeat();
    let path = this.space.isRoom ? gridPath(this.space, this.x, this.z, x, z) : planPath(this.x, this.z, x, z, this.space.obstacles);
    // the pier: get on and off at the beach end instead of wading round it
    const isl = this.space.isRoom ? null : this.space;
    if (isl?.overWater) {
      const fromPier = isl.overWater(this.x, this.z);
      const toPier = isl.overWater(x, z);
      if (fromPier !== toPier) {
        const [near, on] = isl.pierWaypoints();
        if (near && fromPier) path = [{ x: on.x, z: on.z }, { x: near.x, z: near.z }, ...planPath(near.x, near.z, x, z, isl.obstacles)];
        else if (near) path = [...planPath(this.x, this.z, near.x, near.z, isl.obstacles), { x: on.x, z: on.z }, { x, z }];
      }
    }
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
    if (this.inWater) return (this.moving?.run ? 1.5 : 0.9) * (this.displayScale || 1) ** 0.5;
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

  /** Where this resident is: the island, or the room instance they are inside. */
  get space() {
    return (this.inside && this.room) || this.sim.island;
  }

  /**
   * Go inside a location. Rooms nested in other rooms (condo lobby → hallway →
   * apartment) are walked through one by one: the resident steps into the
   * outermost room and the room brain follows `route` to the target.
   */
  enter(locKey, minutes) {
    const rooms = this.sim.rooms;
    const chain = rooms?.chain(locKey) || [locKey];
    if (chain.length > 1) {
      const at = this.inside ? chain.indexOf(this.inside) : -1;
      if (this.inside && at < 0) {
        // somewhere else indoors: head out first, then in
        this.route = { keys: chain, minutes };
        this.leaving = true;
        this.insideUntil = Infinity;
        return;
      }
      if (at < 0) this._enterRoom(chain[0], Infinity);
      const rest = chain.slice(Math.max(at, 0) + 1);
      this.route = rest.length ? { keys: rest, minutes } : null;
      this.leaving = false;
      if (!rest.length) this.insideUntil = this.sim.clock + minutes;
      return;
    }
    this.route = null;
    this.leaving = false;
    this._enterRoom(locKey, minutes);
  }

  _enterRoom(locKey, minutes, at = null) {
    this.leaveSeat();
    this.stopMoving();
    this.inside = locKey;
    this.insideUntil = this.sim.clock + minutes;
    this.bubble = null;
    this.room = this.sim.rooms?.get(locKey) || null;
    if (this.room) {
      // step into the room instance
      this.sim.rooms.residentGroup.add(this.group);
      const [ex, ez, er] = this.room.entry;
      const x = at?.x ?? ex;
      const z = at?.z ?? ez;
      const rot = at?.rot ?? er;
      this.placeAt(x, z);
      this.heading = rot;
      this.targetHeading = rot;
      this.group.visible = true;
      this.play('idle');
    } else this.group.visible = false;
  }

  /** Walk-through step: go into a room that opens off the current one. */
  goInto(key) {
    if (!this.inside || this.sim.rooms?.parentOf(key) !== this.inside) return;
    this._enterRoom(key, Infinity);
    this.sim.emit('resident', this);
  }

  /** Leave the current room into its parent room, or outside if it has none. */
  stepOut() {
    const rooms = this.sim.rooms;
    const parent = rooms?.parentOf(this.inside);
    if (parent) {
      const at = rooms.doorIn(this.inside);
      this._enterRoom(parent, Infinity, at ? { x: at.x, z: at.z, rot: (at.rot ?? 0) + Math.PI } : null);
      return;
    }
    // out of the building
    const route = this.route;
    const cb = this.onExit;
    this.route = null;
    this.onExit = null;
    this.exit();
    if (route) {
      // only came out to go somewhere else indoors
      const target = route.keys[route.keys.length - 1];
      const door = this.sim.locationDoor(target, this);
      if (door) this.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: target, minutes: route.minutes, onExit: cb }]);
      return;
    }
    if (cb) cb();
  }

  exit() {
    if (!this.inside) return;
    this.leaveSeat();
    this.stopMoving();
    this.plan = [];
    this.step = null;
    this.working = false;
    this.leaving = false;
    const loc = this.sim.locationDoor(this.inside, this);
    this.inside = null;
    this.room = null;
    this.sim.residentGroup.add(this.group);
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

    // indoors: time to leave? (nested rooms are walked out of by the room brain)
    if (this.inside) {
      if (!this.engaged && sim.clock >= this.insideUntil) {
        if (this.inside === this.homeKey && this.room && (this.sleeping || this.morningPending || this.activity === 'sleep' || this.errand)) {
          // never head out still half asleep / mid-change: finish getting ready first
          if (this.sleeping && !(this.wakeAt <= sim.clock)) this.wakeAt = sim.clock;
          if (this.activity === 'sleep' && !this.sleeping) this.morningPending = true;
          this.insideUntil = sim.clock + 20;
        } else if (this.room && sim.rooms?.parentOf(this.inside)) {
          this.leaving = true;
          this.insideUntil = Infinity;
        } else {
          const cb = this.onExit;
          this.onExit = null;
          this.route = null;
          this.exit();
          if (cb) cb();
        }
      }
    }

    if (!this.inside || this.room) {
      // run plan (the brain or the room brain fills it)
      if (!this.engaged && !this.ko) this._runPlan(dt);
      this._move(dt);
    }

    // heading smoothing
    if (this.targetHeading !== undefined) this.heading = angleDamp(this.heading, this.targetHeading, 8, dt);
    this.group.rotation.y = this.heading;

    // talking mouth timeout
    if (this.avatar.talking && sim.realTime > (this.talkUntil || 0)) this.avatar.talking = false;
    if (this.bubble && sim.realTime > this.bubble.until) this.bubble = null;

    // ease height when stepping onto/off platforms
    if (this.groundY === undefined) this.groundY = this.group.position.y;
    this.group.position.y = damp(this.group.position.y, this.groundY, 16, dt);
    // only residents the camera can actually see are rendered and fully animated
    // (the scene being shown: the island, or the room being looked into)
    if (this.inView) {
      const pose = this.player.update(dt);
      this._applyLookAt(pose, dt);
      this.avatar.applyPose(pose);
      const ik = !this.seat && !this.ko && !NO_IK.has(this.player.action) && sim.settings.ik !== false;
      this.avatar.solveFootIK((x, z) => this.space.heightAt(x, z), this.group.position.y, ik, dt);
      this.avatar.update(dt);
      this._updateAttachments(dt);
    } else {
      // keep animation time (and end-of-clip callbacks) going, skip posing / IK / spring bones
      this.player.update(dt);
      for (const o of Object.values(this.attach)) if (o.visible) o.visible = false;
    }
  }

  _runPlan(dt) {
    if (!this.step) {
      if (!this.plan.length) return;
      const st = this.plan.shift();
      this.step = st;
      st.t = 0;
      this._startStep(st);
      // a step can replace the plan (e.g. moving into another room)
      if (this.step !== st) return;
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
      if (this.step === s) this.step = null;
      if (s.then) s.then();
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
        this.play(s.anim || seat.anim || (seat.ground ? 'sitGround' : 'sit'));
        if (s.expr) this.setExpression(s.expr);
        if (s.say) this.say(s.say, { emoji: s.emoji });
        else if (s.emoji) this.emote(s.emoji, 2.5);
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
    this.placeAt(nx, nz, false);
    this.pushOutOfObstacles(m.x, m.z);
    this.targetHeading = Math.atan2(dx, dz);
    const anim = this.moveAnim();
    this.play(anim, { speed: anim === 'walk' || anim === 'walkHappy' ? speed / 1.3 : 1 });
    // slipping on a wet island while running
    this.slipCooldown -= dt;
    if (m.run && !this.inside && !this.inWater && this.sim.weather.wetness > 0.55 && this.slipCooldown <= 0 && !this.engaged) {
      this.slipCooldown = 3;
      if (chance(0.025 * this.sim.weather.wetness * (this.sim.settings.conflict === 'off' ? 0.3 : 1))) this.sim.slip(this);
    }
  }

  // ------------------------------------------------------------------ look-at (head IK)
  lookTarget() {
    const e = this.engaged;
    let other = null;
    if (e?.isFight) other = e.f?.get(this)?.target || null;
    else if (e && (e.a === this || e.b === this)) other = e.a === this ? e.b : e.a;
    if (other && !other.inside) return _p.set(other.x, other.group.position.y + (other.headHeight || 1.4) * 0.9, other.z);
    if (this.lookAtCamUntil > this.sim.realTime) return this.sim.stage.camera.position;
    return null;
  }

  _applyLookAt(pose, dt) {
    const t = NO_IK.has(this.player.action) || this.ko ? null : this.lookTarget();
    let yaw = 0, pitch = 0;
    if (t) {
      const dx = t.x - this.x, dz = t.z - this.z;
      const dy = t.y - (this.group.position.y + (this.headHeight || 1.4) * 0.9);
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      yaw = Math.atan2(lx, lz);
      if (Math.abs(yaw) > 1.7) yaw = 0; // behind us: don't twist the neck
      yaw = clamp(yaw, -1.1, 1.1);
      pitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.45);
    }
    this.lookYaw = damp(this.lookYaw || 0, yaw, 6, dt);
    this.lookPitch = damp(this.lookPitch || 0, pitch, 6, dt);
    if (Math.abs(this.lookYaw) + Math.abs(this.lookPitch) < 0.002) return;
    _e.set(this.lookPitch * 0.6, this.lookYaw * 0.6, 0, 'YXZ');
    pose.rot.head.multiply(_q.setFromEuler(_e));
    _e.set(this.lookPitch * 0.4, this.lookYaw * 0.4, 0, 'YXZ');
    pose.rot.neck.multiply(_q.setFromEuler(_e));
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
    // keep accessories in the same scene as the body (island or interior)
    const fx = this.room ? sim.rooms.fx : sim.fx.group;
    for (const obj of Object.values(this.attach)) if (obj.parent !== fx) fx.add(obj);
    const a = this.avatar;
    const vis = this.group.visible;
    // umbrella while it rains (not while fighting/KO)
    const wantUmbrella = this.d.hasUmbrella && (sim.weather.raining || sim.weather.snowing) && !this.inside && !this.inWater && !this.engaged?.isFight && !this.ko && !this.seat;
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
    const until = Number.isFinite(this.insideUntil) ? this.insideUntil : this.sim.clock + 20;
    d.insideState = this.inside ? { loc: this.route ? this.route.keys[this.route.keys.length - 1] : this.inside, until } : null;
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

// --------------------------------------------------------------------------
// Grid A* for room interiors (furniture makes long walls of obstacles that the
// simple detour planner can't route around).

export function gridPath(room, ax, az, bx, bz) {
  const cell = 0.25;
  const b = room.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / cell);
  const rows = Math.ceil((b.maxZ - b.minZ) / cell);
  const toCell = (x, z) => [clamp(Math.floor((x - b.minX) / cell), 0, cols - 1), clamp(Math.floor((z - b.minZ) / cell), 0, rows - 1)];
  const center = (cx, cz) => [b.minX + (cx + 0.5) * cell, b.minZ + (cz + 0.5) * cell];
  const blocked = new Uint8Array(cols * rows);
  for (let cz = 0; cz < rows; cz++) {
    for (let cx = 0; cx < cols; cx++) {
      const [x, z] = center(cx, cz);
      for (const o of room.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.22) { blocked[cz * cols + cx] = 1; break; }
    }
  }
  const [sx, sz] = toCell(ax, az);
  const [ex, ez] = toCell(bx, bz);
  blocked[sz * cols + sx] = 0;
  blocked[ez * cols + ex] = 0;
  const free = (x, z, w) => w || !(x >= 0 && z >= 0 && x < cols && z < rows && blocked[z * cols + x] === 0) ? false : true;
  // A*
  const start = sz * cols + sx;
  const goal = ez * cols + ex;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const open = [start];
  const inOpen = new Uint8Array(cols * rows);
  g[start] = 0;
  inOpen[start] = 1;
  const hfn = (i) => Math.hypot((i % cols) - ex, Math.floor(i / cols) - ez);
  let found = false;
  let guard = 0;
  while (open.length && guard++ < 5000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (g[open[i]] + hfn(open[i]) < g[open[bi]] + hfn(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === goal) { found = true; break; }
    const cx = cur % cols, cz = Math.floor(cur / cols);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!free(nx, nz)) continue;
        if (dx && dz && (!free(cx + dx, cz) || !free(cx, cz + dz))) continue; // no corner cutting
        const ni = nz * cols + nx;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          if (!inOpen[ni]) { open.push(ni); inOpen[ni] = 1; }
        }
      }
    }
  }
  if (!found) return [{ x: bx, z: bz }];
  const cells = [];
  for (let i = goal; i !== -1; i = came[i]) cells.unshift(i);
  // string-pull: keep only the corners we can't see past
  const pts = cells.map((i) => center(i % cols, Math.floor(i / cols)));
  const clear = (p, q) => {
    const steps = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const [cx, cz] = toCell(p[0] + ((q[0] - p[0]) * s) / steps, p[1] + ((q[1] - p[1]) * s) / steps);
      if (blocked[cz * cols + cx]) return false;
    }
    return true;
  };
  const out = [];
  let anchor = [ax, az];
  for (let i = 1; i < pts.length; i++) {
    if (!clear(anchor, pts[i])) { out.push({ x: pts[i - 1][0], z: pts[i - 1][1] }); anchor = pts[i - 1]; }
  }
  out.push({ x: bx, z: bz });
  return out;
}
