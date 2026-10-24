// The island simulation: time, residents, needs, weather effects on
// residents, injuries, money/inventory, news and save data.

import * as THREE from 'three';
import { Resident, newResidentData } from './resident.js';
import { think, isBedtime, bedtimeAtHome, backToBed } from './brain.js';
import { Social, emotionExpr } from './social.js';
import { FightManager } from './fight.js';
import { Problems } from './problems.js';
import { Dialogue } from './dialogue.js';
import { thinkIndoors } from './roomBrain.js';
import { SwimManager } from './swim.js';
import { Condo } from './condo.js';
import { updatePriorRelations, canRomance } from './relations.js';
import { Progress, residentPerks, updateCelebrities } from './progress.js';
import { Economy, VENUES } from './economy.js';
import { NightLife } from './night.js';
import { updateJobs, onDuty, jobOf, isOnShift } from './jobs.js';
import { preferredOutfit, updateOutfitPerception, selfMoodShift, updateMishaps, causeMishap, updateExposure, isUnderwear, embarrassingToWear, fixMishap, setOutfitPurpose, mustDryFirst, outfitPurpose, outfitMeta } from './outfits.js';
import { INJURIES, line, NAMES, foodById, FOODS, ITEMS } from './data.js';
import { Emitter, chance, clamp, damp, pick, rand } from '../core/util.js';

export const MINUTES_PER_SECOND = 1; // 1 real second = 1 game minute at 1x speed

export const DEFAULT_SETTINGS = {
  conflict: 'normal', // off | mild | normal | spicy
  romance: true,
  music: true,
  volume: 0.7,
  voiceVolume: 1,
  musicVolume: 0.8,
  ambientVolume: 1,
  follow: true,
  shadows: true,
  voice: 'speech', // speech | babble | off
  voiceScope: 'selected', // selected | near  (who uses text-to-speech; others babble)
  autoOutfits: true,
  underwearRate: 0.05, // chance a resident leaves home in underwear without noticing
  nightBrightness: 0.5, // 0 = dark nights, 1 = bright moonlight
  economy: 'normal', // relaxed | normal | tight (how much bills cost)
  nightMischief: true, // residents sometimes sneak out at night
  quality: 'high',
};

export class Sim extends Emitter {
  constructor(ctx) {
    super();
    Object.assign(this, ctx); // stage, island, weather, audio, library, registry, textures, effects
    this.scene = this.stage.scene;
    this.fx = this.effects;
    this.residents = [];
    this.clock = 7 * 60; // absolute game minutes (day 1, 7:00)
    this.realTime = 0;
    this.speed = 1;
    this.money = 300;
    this.inventory = { onigiri: 2, apple: 2, firstaid: 1, towel: 1 };
    this.newsLog = [];
    this.settings = { ...DEFAULT_SETTINGS };
    this.selected = null;
    this.social = new Social(this);
    this.fights = new FightManager(this);
    this.problems = new Problems(this);
    this.swim = new SwimManager(this);
    this.condo = new Condo(this);
    this.progress = new Progress(this);
    this.economy = new Economy(this);
    this.night = new NightLife(this);
    this.syncVenues();
    if (this.rooms) this.rooms.condo = this.condo;
    this.dialogue = new Dialogue(this);
    this.snowmen = [];
    this.lastDay = this.day;
    this.minuteAcc = 0;
    this.frustum = new THREE.Frustum();
    this._frustumM = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this.residentGroup = new THREE.Group();
    this.residentGroup.name = 'residents';
    this.scene.add(this.residentGroup);
  }

  get locations() { return this.island.locations; }
  get day() { return Math.floor(this.clock / 1440) + 1; }
  get minuteOfDay() { return this.clock % 1440; }

  byId(id) { return this.residents.find((r) => r.id === id) || null; }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /** Is (any part of) this resident inside the camera view? */
  inCameraView(res) {
    const h = res.headHeight || 1.6;
    this._sphere.center.set(res.x, res.group.position.y + h * 0.5, res.z);
    this._sphere.radius = h * 0.75 + 0.6;
    return this.frustum.intersectsSphere(this._sphere);
  }

  isNear(res) {
    const t = this.stage.controls.target;
    if (res.inside) return !!res.room && res.room === this.viewRoom;
    if (this.viewRoom) return false;
    return Math.hypot(res.x - t.x, res.z - t.z) < 26 && this.stage.camera.position.distanceTo(t) < 70;
  }

  // ------------------------------------------------------------------ residents
  async addResident(data, { announce = true } = {}) {
    const res = new Resident(this, data);
    this.residents.push(res);
    this.residentGroup.add(res.group);
    // everyone gets an apartment in the condo (old saves with houses move in too)
    data.houseIndex = null;
    this.condo.assign(res, data.condoUnit);
    const home = this.homeOf(res);
    if (data.insideState) {
      res.enter(data.insideState.loc, Math.max(1, data.insideState.until - this.clock));
    } else if (data.pos) {
      res.placeAt(data.pos[0], data.pos[1]);
      res.heading = data.pos[2] || 0;
    } else {
      res.placeAt(home.door[0], home.door[1]);
      res.heading = home.rot;
    }
    try {
      await res.buildAvatar();
    } catch (err) {
      console.error(err);
    }
    res.play('idle');
    res.refreshAttachments();
    res.setExpression(emotionExpr(res.mood()));
    if (announce) {
      this.news(`${data.name} moved to the island and into apartment #${this.condo.unitLabel(data.condoUnit)}! Welcome! 🏢`, '🏡');
      this.progress.add(30, 'new resident');
      res.say(`Hi! I'm ${data.name}! ${data.catchphrase}`, { emoji: '👋' });
      res.play('wave');
      res.setPlan([{ kind: 'anim', anim: 'wave', dur: 3, expr: { happy: 1 } }]);
    }
    this.emit('residents');
    return res;
  }

  async rebuildAvatar(res) {
    await res.buildAvatar();
    res.refreshAttachments();
    res.setExpression(emotionExpr(res.mood()));
  }

  /** Switch a resident into one of their personal outfits (-1 = main look). */
  async changeOutfit(res, index, { quiet = false, purpose, force = false } = {}) {
    if (index >= (res.d.outfits?.length || 0)) index = -1;
    if (res.d.wearing === index && res.avatar) {
      if (purpose !== undefined) setOutfitPurpose(res, index, purpose);
      return;
    }
    // wet swimwear / underwear: towel off first (stripping to underwear is fine)
    if (!force && res.avatar && mustDryFirst(res, index)) {
      this.waitToDry(res, index, { quiet, purpose });
      return;
    }
    res.pendingChange = null;
    res.dryingOff = false;
    res.d.wearing = index;
    setOutfitPurpose(res, index, purpose ?? null);
    // fresh clothes fix a wardrobe mishap
    if (res.d.mishap) {
      res.d.mishap = null;
      if (res.d.problem?.type === 'mishap') { res.d.problem = null; this.emit('problem', res); }
    }
    await res.buildAvatar();
    res.refreshAttachments();
    res.setExpression(emotionExpr(res.mood()));
    if (!res.inside) {
      const p = new THREE.Vector3(res.x, res.group.position.y + (res.headHeight || 1.4) * 0.6, res.z);
      this.effects.burst(p, '#ffe6f7', 10, 0.3);
      if (!quiet) res.say(index >= 0 ? `Time for my ${res.d.outfits[index].name}!` : 'Back to my usual look!', { emoji: '✨' });
      if (this.isNear(res)) this.audio.pop();
    }
    this.emit('resident', res);
  }

  /** Which personal outfit fits the moment (see outfits.js for the conditions). */
  preferredOutfit(res) { return preferredOutfit(res, this); }

  /**
   * Change clothes. Only call this when the resident is standing at their own
   * wardrobe (closet spot at home). index = a specific outfit, otherwise the
   * one that fits ctx ({activity, outside}). Fresh clothes also fix a mishap.
   */
  dressAtWardrobe(res, { index = null, ctx = {}, quiet = true, avoidEmbarrassing = false } = {}) {
    if (res.d.mishap && !res.d.mishap.owned) { res.d.mishap = null; if (res.d.problem?.type === 'mishap') { res.d.problem = null; this.emit('problem', res); } res.applyLook(); }
    if (!res.d.outfits?.length || !res.avatar) return null;
    let want = index ?? preferredOutfit(res, this, ctx);
    if (avoidEmbarrassing && index == null && (want === res.d.wearing || embarrassingToWear(res, want))) {
      // anything that isn't embarrassing to be seen in
      const ok = [-1, ...res.d.outfits.map((_, i) => i)].filter((i) => i !== res.d.wearing && !embarrassingToWear(res, i));
      if (ok.length) want = ok[Math.floor(Math.random() * ok.length)];
      else {
        res.say('I have nothing decent to wear... I\'m staying in.', { emoji: '😣' });
        res.insideUntil = Math.max(res.insideUntil, this.clock + 90);
        return null;
      }
    }
    // what they're dressing for (remembered while the outfit stays on)
    const purpose = index != null ? null : ctx.activity || (!ctx.outside && res.inside === res.homeKey ? 'home' : null);
    if (want === res.d.wearing) { if (purpose) setOutfitPurpose(res, want, purpose); return null; }
    if (res.changing) { res.redress = { index: want, quiet, purpose }; return null; }
    res.changing = true;
    return this.changeOutfit(res, want, { quiet, purpose }).finally(() => {
      res.changing = false;
      const again = res.redress;
      res.redress = null;
      if (again && again.index !== res.d.wearing) this.changeOutfit(res, again.index, { quiet: again.quiet, purpose: again.purpose });
    });
  }

  /** Mend a wardrobe mishap (tailor, sewing kit). */
  fixMishapFor(res) { fixMishap(this, res, true); }

  /**
   * Seen in something embarrassing: cover up. At night in what they sleep in,
   * that means going back to bed, not getting dressed for the day.
   */
  coverUp(res) {
    if (this.inSleepwearAtNight(res)) return backToBed(res, this);
    return this.goChange(res, { avoidEmbarrassing: true, say: false });
  }

  inSleepwearAtNight(res) {
    if (!isBedtime(res, this) || res.nightOut) return false;
    const why = outfitPurpose(res, { anywhere: true });
    return why === 'sleep' || why === 'home' || !!outfitMeta(res, res.d.wearing ?? -1)?.tags?.includes('sleep');
  }

  /** At home when their time is up: at night they stay in and go to bed instead. Returns true if so. */
  stayInForBed(res) {
    if (res.inside !== res.homeKey || res.nightOut || res.sleeping || res.errand) return false;
    if (!isBedtime(res, this) || (jobOf(res) && isOnShift(res, this))) return false;
    if (res.route) return false; // only passing through
    bedtimeAtHome(res, this);
    return true;
  }

  /**
   * Wet in swimwear / underwear: they can't put clothes on until they've dried
   * (they wait at home; stripping to underwear is still fine). The change
   * happens by itself once they're dry (see perMinute).
   */
  waitToDry(res, index, opts) {
    const first = !res.pendingChange;
    res.pendingChange = { index, ...opts };
    res.dryingOff = true;
    if (first) res.say(pick(['Still dripping... I\'ll get dressed once I\'m dry.', 'Can\'t put clothes on wet. Drying off first!', '*waits to dry off*']), { emoji: '💧', sound: false });
  }

  /** Would the resident wear something else for this? (outfit index or null) */
  outfitFor(res, ctx) {
    if (!res.d.outfits?.length) return null;
    const want = preferredOutfit(res, this, { outside: true, ...ctx });
    return want === res.d.wearing ? null : want;
  }

  /**
   * Go home to the wardrobe and change. after() runs once they're back
   * outside (e.g. carry on to the beach). Returns false if they can't.
   */
  goChange(res, { index = null, activity, after = null, say = true, stay = false, avoidEmbarrassing = false } = {}) {
    if (res.engaged || res.ko || res.inWater) return false;
    // stripping down to underwear works anywhere — no wardrobe needed
    const target = index ?? (avoidEmbarrassing ? null : preferredOutfit(res, this, { outside: !stay, activity: activity ?? res.activity }));
    if (target != null && target !== res.d.wearing && isUnderwear(res, target)) {
      if (activity !== undefined) res.activity = activity;
      res.lastDressTrip = this.clock;
      this.changeOutfit(res, target, { quiet: true, purpose: activity ?? res.activity ?? null }).then(() => after?.());
      return true;
    }
    if (!this.homeOf(res)) return false;
    const home = res.homeKey;
    res.errand = { kind: 'dress', index, activity, after, leave: !stay, avoidEmbarrassing };
    if (activity !== undefined) res.activity = activity;
    res.lastDressTrip = this.clock;
    if (res.inside === home) { res.clearPlan(); return true; }
    if (say && !res.inside) res.say(pick(['Be right back, gotta change!', 'Time to get changed!', 'Wrong outfit for this... home first!', 'Let me grab something else to wear.']), { emoji: '👕' });
    res.clearPlan();
    if (res.inside && this.rooms && (this.rooms.parentOf(res.inside) || this.rooms.chain(home).length > 1)) {
      res.enter(home, 20); // walks out / through the condo
      res.onExit = after;
      return true;
    }
    if (res.inside) res.exit();
    const door = this.locationDoor(home, res);
    if (!door) { res.errand = null; return false; }
    res.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: home, minutes: 20, onExit: after }]);
    return true;
  }

  /**
   * Before an activity: if they'd wear something else for it (swimwear,
   * work clothes…), go change first and then do it. Returns true if they went.
   */
  dressFirst(res, activity, after, bother = 1) {
    if (this.settings.autoOutfits === false || res.d.autoOutfits === false) return false;
    if (this.outfitFor(res, { activity }) == null || !chance(bother)) return false;
    return this.goChange(res, { activity, after });
  }

  /** Old name kept for callers: change only if already at the wardrobe at home. */
  autoDress(res, opts = {}) {
    if (res.inside === res.homeKey && res.seat?.type === 'closet') return this.dressAtWardrobe(res, opts);
    return null;
  }

  removeResident(res) {
    this.social.cancelFor(res);
    const f = this.fights.fightOf(res);
    if (f) f.end(-1, 'player');
    if (res.inside) res.exit();
    res.leaveSeat();
    res.disposeAttachments();
    this.rooms?.remove(`home:${res.id}`);
    if (this.viewRoom?.key === `home:${res.id}`) this.emit('viewRoom', null);
    res.disposeAvatars();
    this.residentGroup.remove(res.group);
    this.residents = this.residents.filter((r) => r !== res);
    this.island.releaseHouse(res.id);
    this.condo.release(res);
    for (const r of this.residents) {
      delete r.d.relationships[res.id];
      if (r.d.problem?.other === res.id) r.d.problem = null;
    }
    if (this.selected === res) this.select(null);
    this.news(`${res.name} moved away from the island. 👋`, '🧳');
    this.emit('residents');
  }

  /** Move a new random resident in (used by tests / quick fill). */
  addRandomResident(opts) { return this.addResident(newResidentData(this.randomName()), opts); }

  randomName() {
    const used = new Set(this.residents.map((r) => r.name));
    const free = NAMES.filter((n) => !used.has(n));
    return free.length ? pick(free) : `Resident ${this.residents.length + 1}`;
  }

  // ------------------------------------------------------------------ UI hooks
  select(res) {
    if (this.selected) this.selected.ring.visible = false;
    this.selected = res;
    if (res) {
      res.ring.visible = true;
      this.focusOn(res);
    }
    this.emit('select', res);
  }

  focusOn(res) {
    if (!res) return;
    this.followTarget = res;
    // residents who are indoors are shown in their room instance
    if (res.inside && res.room) this.emit('viewRoom', res.inside);
    else if (!res.inside && this.viewRoom) this.emit('viewRoom', null);
  }

  /** Show the venues the island owns, hide the empty lots. */
  syncVenues() {
    for (const k of Object.keys(VENUES)) this.island.setVenueOpen?.(k, this.economy.owned.has(k));
  }

  /** Where a resident lives: their house slot, or the condo entrance. {door:[x,z], rot, condo} */
  homeOf(res) {
    const h = this.island.houseOf(res.id);
    if (h) return h;
    const c = this.locations.condo;
    if (this.condo.unitOf(res.id) != null && c) return { door: c.door, rot: c.rotY ?? 0, condo: true };
    return null;
  }

  placeName(loc) {
    if (!loc) return 'Outside';
    if (loc.startsWith('home:')) {
      const owner = this.byId(loc.slice(5));
      if (owner && this.condo.unitOf(owner.id) != null) return `${owner.name}'s apartment`;
      return owner ? `${owner.name}'s house` : 'home';
    }
    if (loc.startsWith('hall:')) return `Condo floor ${loc.slice(5)}`;
    if (loc === 'condo') return 'Condo lobby';
    if (loc === 'condoPool') return 'Condo pool';
    return this.locations[loc]?.label || loc;
  }

  news(text, icon = '📰') {
    const item = { text, icon, day: this.day, time: this.minuteOfDay };
    this.newsLog.unshift(item);
    if (this.newsLog.length > 150) this.newsLog.length = 150;
    this.emit('news', item);
  }

  /** Voice output for something a resident says. */
  speak(res, text) {
    const mode = this.settings.voice;
    if (mode === 'off' || !this.isNear(res) || this.speed > 4) return;
    const now = this.realTime;
    if ((res.lastVoice || 0) > now - 0.4 / Math.max(1, this.speed)) return;
    res.lastVoice = now;
    const tts = mode === 'speech' && (this.settings.voiceScope === 'near' || this.selected === res);
    const vol = this.selected === res ? 1 : 0.55;
    this.voice?.speak(text, res.d.voice || {}, { mode: tts ? 'speech' : 'babble', volume: vol, mood: res.mood(), key: res.id });
  }

  alert(text, onClick, kind = 'info') { this.emit('alert', { text, onClick, kind }); }
  toast(text) { this.emit('toast', text); }

  // ------------------------------------------------------------------ player actions
  hasItem(id) { return (this.inventory[id] || 0) > 0; }

  useItem(id) {
    if (!this.hasItem(id)) return false;
    this.inventory[id]--;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    this.emit('inventory');
    return true;
  }

  /** Current price (10% off while a shop clerk is on duty). */
  price(item) {
    return Math.ceil(item.price * (onDuty(this, 'clerk') ? 0.9 : 1) * (1 - this.progress.discount));
  }

  buy(id) {
    const item = foodById(id) || ITEMS.find((i) => i.id === id);
    if (!item || !this.progress.isAvailable('items', id)) return false;
    const price = this.price(item);
    if (this.money < price) return false;
    this.money -= price;
    this.economy.paid(price, 'shopping');
    this.inventory[id] = (this.inventory[id] || 0) + 1;
    this.audio.pop();
    this.emit('inventory');
    return true;
  }

  feed(res, food, consumed = false) {
    if (!consumed && !this.useItem(food.id)) return `You have no ${food.name}.`;
    const n = res.d.needs;
    n.hunger = clamp(n.hunger + 45, 0, 100);
    let msg;
    res.suspendPlan();
    if (food.id === res.d.favFood) {
      res.d.happiness = clamp(res.d.happiness + 25, 0, 100);
      this.gainXp(res, 30);
      res.setPlan([{ kind: 'anim', anim: 'eatStand', dur: 2.5, expr: { happy: 1 }, emoji: food.icon }, { kind: 'anim', anim: 'cheer', dur: 2.5, say: `${food.name}! My FAVORITE!`, emoji: '😍', expr: { happy: 1 } }]);
      msg = `${res.name} LOVES ${food.icon} ${food.name}! It's their favorite!`;
      this.progress.add(8, 'favourite food');
      this.audio.levelUp();
    } else if (food.id === res.d.hatedFood) {
      res.d.happiness = clamp(res.d.happiness - 12, 0, 100);
      res.setPlan([{ kind: 'anim', anim: 'eatStand', dur: 2, expr: { sad: 0.5 }, emoji: food.icon }, { kind: 'anim', anim: 'angry', dur: 2.5, say: 'Blegh! I HATE this!', emoji: '🤢', expr: { angry: 1 } }]);
      msg = `${res.name} hates ${food.icon} ${food.name}... Now you know!`;
      this.audio.sad();
    } else {
      res.d.happiness = clamp(res.d.happiness + 8, 0, 100);
      this.gainXp(res, 10);
      res.setPlan([{ kind: 'anim', anim: 'eatStand', dur: 2.5, expr: { happy: 0.8 }, emoji: food.icon }, { kind: 'anim', anim: 'idle', dur: 1.5, say: 'Yum! Thanks!', emoji: '😋', expr: { happy: 0.7 } }]);
      msg = `${res.name} enjoyed the ${food.icon} ${food.name}.`;
      this.audio.chime();
    }
    res.knownFood = res.knownFood || {};
    res.knownFood[food.id] = true;
    this.emit('resident', res);
    return msg;
  }

  talkTo(res) {
    if (res.inside && res.room !== this.viewRoom) return `${res.name} is inside (${this.placeName(res.inside)}).`;
    if (res.engaged) return `${res.name} is busy right now.`;
    res.suspendPlan();
    this.stage.camera.getWorldPosition(new THREE.Vector3());
    const cam = this.stage.camera.position;
    const m = res.mood();
    const dl = this.dialogue;
    const w = this.weather;
    const other = this.residents.find((o) => o !== res && res.relScore(o.id) > 20) || this.residents.find((o) => o !== res) || res;
    const text = res.d.injuries.length ? line('hurt')
      : res.d.wetness > 0.6 ? line('soaked')
        : res.d.needs.hunger < 30 ? dl.line('hungry', { a: res })
          : res.d.needs.energy < 25 ? dl.line('sleepy', { a: res })
            : m === 'sad' ? dl.line('sad', { a: res })
              : chance(0.25) && (w.raining || w.snowing || w.type === 'sunny') ? dl.line(w.stormy ? 'weatherStorm' : w.raining ? 'weatherRain' : w.snowing ? 'weatherSnow' : 'weatherSun', { a: res })
                : chance(0.15) ? res.d.catchphrase
                  : m === 'happy' && chance(0.4) ? dl.line('happy', { a: res })
                    : dl.chat(res, other)[0];
    res.setPlan([{ kind: 'anim', anim: m === 'sad' ? 'sulk' : 'wave', dur: 4, faceX: cam.x, faceZ: cam.z, say: text, expr: emotionExpr(m) }]);
    res.d.needs.social = clamp(res.d.needs.social + 10, 0, 100);
    res.lookAtCamUntil = this.realTime + 5;
    return null;
  }

  comfort(res) {
    res.d.happiness = clamp(res.d.happiness + 6, 0, 100);
    res.say('Thanks... ♪', { emoji: '🥲' });
    return `You cheered ${res.name} up a little.`;
  }

  treat(res) {
    for (const i of res.d.injuries) {
      i.treated = true;
      i.remaining *= 0.5;
    }
    res.d.happiness = clamp(res.d.happiness + 8, 0, 100);
    res.say('Thank you! That feels better.', { emoji: '🩹' });
    this.emit('resident', res);
  }

  clinicTreat(res) {
    const doc = onDuty(this, 'doctor') ? 0.5 : 1; // a doctor on duty heals much better
    for (const i of res.d.injuries) {
      i.treated = true;
      i.remaining *= (INJURIES[i.type]?.severity >= 3 ? 0.6 : INJURIES[i.type]?.severity >= 2 ? 0.4 : 0.2) * doc;
    }
    res.d.injuries = res.d.injuries.filter((i) => i.remaining > 30);
    res.refreshAttachments();
    res.say('The doctor patched me up!', { emoji: '🏥' });
    this.economy.living(res, 'clinic');
    this.emit('resident', res);
  }

  giveUmbrella(res) {
    if (!this.useItem('umbrella')) return 'You need an umbrella from the shop.';
    res.d.hasUmbrella = true;
    res.say('An umbrella! Thank you!', { emoji: '☂️' });
    this.gainXp(res, 15);
    return `${res.name} now has an umbrella.`;
  }

  giveTowel(res) {
    if (!this.useItem('towel')) return 'You need a towel from the shop.';
    res.d.wetness = 0;
    res.d.soakedMinutes = 0;
    res.avatar?.setWetness(0);
    res.say('So fluffy and dry!', { emoji: '🧺' });
    return `${res.name} is dry now.`;
  }

  giveGift(res) {
    if (!this.useItem('gift')) return 'You need a gift box from the shop.';
    res.d.happiness = clamp(res.d.happiness + 20, 0, 100);
    this.gainXp(res, 25);
    res.clearPlan();
    res.setPlan([{ kind: 'anim', anim: 'cheer', dur: 3, say: 'For me?! Yay!', emoji: '🎁', expr: { happy: 1 } }]);
    this.progress.add(5, 'gift');
    return `${res.name} loved the gift!`;
  }

  /** Places a resident can be teleported to: [key, label]. */
  teleportTargets(res) {
    const out = [[res.homeKey, '🏠 Their apartment'], ['plaza', '⛲ Plaza'], ['beach', '🏖️ Beach'], ['park', '🌳 Park'], ['stage', '🎤 Stage'], ['pier', '🎣 Pier'],
      ['cafe', '☕ Café (inside)'], ['shop', '👕 Shop (inside)'], ['clinic', '🏥 Clinic (inside)'], ['condo', '🏢 Condo lobby'], ['condoPool', '🏊 Condo pool']];
    for (const [k, l] of Object.entries(this.locations)) if (l.venue && !l.locked) out.push([k, `📍 ${l.label}`]);
    return out.filter(([k]) => k && (this.locations[k] || this.rooms?.kindOf(k)));
  }

  /**
   * Teleport: instantly put a (stuck) resident somewhere, dropping whatever
   * they were doing. Rooms (café, apartments, condo…) put them inside.
   */
  teleport(res, key) {
    this.social.cancelFor(res);
    const f = this.fights.fightOf(res);
    if (f) f.end(-1, 'player');
    res.engaged = null;
    res.leaveSeat();
    res.clearPlan();
    Object.assign(res, { suspended: null, route: null, leaving: false, errand: null, nightOut: null, onExit: null, pendingChange: null, dryingOff: false });
    if (res.inside) res.exit();
    const room = this.rooms?.kindOf(key) ? this.rooms.get(key) : null;
    if (room) {
      res._enterRoom(key, 60);
    } else {
      const l = this.locations[key];
      if (!l) return false;
      const p = { x: l.x + rand(-1.5, 1.5), z: l.z + rand(-1.5, 1.5) };
      res.placeAt(p.x, p.z);
      res.pushOutOfObstacles?.(p.x, p.z);
    }
    res.thinkTimer = 0.5;
    res.say('Whoa! How did I get here?!', { emoji: '✨', sound: false });
    this.effects?.burst?.(new THREE.Vector3(res.x, res.group.position.y + 1, res.z), '#c9f0ff', 12, 0.3);
    if (this.selected === res) this.focusOn(res);
    this.emit('resident', res);
    return true;
  }

  /** Send a resident somewhere (e.g. clinic) and keep them inside for a while. */
  sendTo(res, loc, minutes, onExit) {
    const door = this.locationDoor(loc, res);
    if (!door) return;
    if (res.engaged) { this.social.cancelFor(res); }
    const go = () => {
      const d = this.locationDoor(loc, res) || door;
      res.clearPlan();
      res.setPlan([{ kind: 'walk', x: d[0], z: d[1] }, { kind: 'enter', loc, minutes, onExit }]);
    };
    if (res.inside) res.headOut(go);
    else go();
  }

  /** Have resident a go to b and start an interaction (retries if b is busy). */
  goInteract(a, b, kind, opts = {}) {
    opts = { force: true, ...opts };
    if (!a || !b) return;
    // out through the building first (unless they're in the same room)
    if (a.inside && a.inside !== b.inside && !a.headOut(() => this.goInteract(a, b, kind, opts))) return;
    a.clearPlan();
    const attempt = (tries) => {
      if (!this.residents.includes(a) || !this.residents.includes(b)) return;
      if (a.engaged) { if (tries > 0) setTimeout(() => attempt(tries - 1), 4000); return; }
      if (b.available) {
        this.social.start(a, b, kind, opts);
      } else if (tries > 0) {
        if (b.inside) {
          const door = this.locationDoor(b.inside, b);
          if (door) a.setPlan([{ kind: 'walk', x: door[0] + rand(-1, 1), z: door[1] + rand(0.5, 1.5) }, { kind: 'wait', dur: 6 }]);
        }
        setTimeout(() => attempt(tries - 1), 5000);
      }
    };
    attempt(12);
  }

  locationDoor(loc, res) {
    if (!loc) return null;
    // rooms inside the condo are reached through its front door
    const top = this.rooms?.chain(loc)?.[0];
    if (top && top !== loc) return this.locationDoor(top, res);
    if (loc.startsWith('home:')) {
      const owner = this.byId(loc.slice(5));
      const h = owner ? this.homeOf(owner) : null;
      return h ? [h.door[0], h.door[1], h.rot] : null;
    }
    const l = this.locations[loc];
    if (!l) return null;
    return [l.door?.[0] ?? l.x, l.door?.[1] ?? l.z, l.rotY ?? 0];
  }

  slip(res) {
    res.clearPlan();
    res.ko = true;
    res.say(line('slip'), { emoji: '💦' });
    res.play('knockdown', { restart: true, onEnd: () => res.play('lieDown') });
    setTimeout(() => {
      this.effects.splash(new THREE.Vector3(res.x, res.group.position.y + 0.1, res.z), 14);
      if (this.isNear(res)) this.audio.thud();
    }, 400);
    if (chance(0.5)) {
      const type = chance(0.2) ? 'sprain' : 'bruise';
      res.addInjury(type);
      this.news(`${res.name} slipped on the wet ground and got a ${INJURIES[type].label.toLowerCase()}!`, '💦');
    }
    res.d.wetness = clamp(res.d.wetness + 0.3);
    this.witness(res, '😮');
    this.fights.recover(res, rand(1.5, 2.5), false);
  }

  witness(res, emoji, fn) {
    for (const w of this.residents) {
      if (w === res || w.inside || w.engaged || this.dist(w, res) > 10) continue;
      w.emote(emoji, 2);
      fn?.(w);
    }
  }

  gainXp(res, amount) {
    res.d.xp += amount;
    // each level takes a bit longer than the last
    while (res.d.xp >= this.xpForLevel(res.d.level)) {
      res.d.xp -= this.xpForLevel(res.d.level);
      res.d.level += 1;
      const coins = 50 + res.d.level * 10;
      this.economy.earn(coins, 'level-ups');
      const unlock = res.d.level === 5 ? ' They can now throw house parties! 🎉' : res.d.level === 8 ? ' They\'re now an island celebrity! 🌟' : '';
      this.news(`${res.name} reached level ${res.d.level}! (+${coins} 🪙)${unlock}`, '⭐');
      this.progress.add(20, 'resident level');
      this.alert(`⭐ ${res.name} leveled up!`, () => this.select(res), 'level');
      if (this.isNear(res)) this.audio.levelUp();
      if (!res.engaged && !res.inside) res.setPlan([{ kind: 'anim', anim: 'cheer', dur: 3, emoji: '⭐', expr: { happy: 1 } }]);
    }
  }

  xpForLevel(level) { return 100 + (level - 1) * 40; }

  buildSnowman(res, x, z) {
    if (this.weather.snowCover < 0.25 || this.snowmen.length >= 4 || this.island.isBlocked(x, z, 0.3)) return;
    const p = this.island.placeProp('snowman', x, z, rand(0, 6));
    if (p) {
      p.temporary = true;
      this.snowmen.push(p.id);
      this.news(`${res.name} built a snowman! ⛄`, '⛄');
    }
  }

  // ------------------------------------------------------------------ main loop
  /** Every frame (even paused): which residents the camera sees; the rest aren't rendered. */
  updateVisibility() {
    const cam = this.stage.camera;
    cam.updateMatrixWorld();
    this._frustumM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._frustumM);
    for (const r of this.residents) {
      if (!r.avatar) continue;
      const inScene = r.inside ? !!r.room && this.viewRoom === r.room : !this.viewRoom;
      const inView = inScene && this.inCameraView(r);
      if (inView && !r.inView) {
        // coming into view: pose them right away (matters while paused)
        const pose = r.player.update(0);
        r.avatar.applyPose(pose);
        r.avatar.update(0);
      }
      r.inView = inView;
      r.camDist = inView ? cam.position.distanceTo(r.group.position) : Infinity;
      if (r.avatar.root.visible !== inView) r.avatar.root.visible = inView;
    }
  }

  update(dtReal) {
    this.updateVisibility();
    const dt = Math.min(dtReal, 0.1) * this.speed;
    if (dt <= 0) return;
    this.realTime += dt;
    const gameMin = dt * MINUTES_PER_SECOND;
    this.clock += gameMin;

    // daily rollover
    if (this.day !== this.lastDay) {
      this.lastDay = this.day;
      const allowance = 15 + this.progress.allowanceBonus;
      this.economy.earn(allowance, 'allowance');
      this.news(`Good morning! Day ${this.day} begins. Daily island allowance: +${allowance} 🪙`, '🌅');
      this.economy.newDay();
      this.progress.add(25, 'new day');
      this.emit('day', this.day);
    }

    this.minuteAcc += gameMin;
    if (this.minuteAcc >= 1) {
      this.perMinute(this.minuteAcc);
      this.minuteAcc = 0;
    }

    for (const r of this.residents) {
      if (!r.engaged && !r.ko) {
        r.thinkTimer -= dt;
        if (r.thinkTimer <= 0) {
          r.thinkTimer = rand(0.3, 1.2);
          if (!r.inside) think(r, this);
          else if (r.room) thinkIndoors(r, this, r.room);
        }
      }
    }
    this.social.update(dt);
    this.fights.update(dt);
    this.swim.update(dt);
    for (const r of this.residents) r.update(dt, gameMin);
    this.separate();

    // camera follows the selected resident
    if (this.settings.follow && this.followTarget && (this.followTarget.inside ? this.followTarget.room === this.viewRoom : !this.viewRoom) && this.residents.includes(this.followTarget)) {
      const t = this.stage.controls.target;
      const fx = this.followTarget.x, fz = this.followTarget.z;
      const nx = damp(t.x, fx, 3, dtReal), nz = damp(t.z, fz, 3, dtReal);
      const ny = damp(t.y, this.followTarget.group.position.y + 0.8, 3, dtReal);
      const dx = nx - t.x, dy = ny - t.y, dz = nz - t.z;
      t.set(nx, ny, nz);
      this.stage.camera.position.x += dx;
      this.stage.camera.position.y += dy;
      this.stage.camera.position.z += dz;
    }
  }

  perMinute(min) {
    if (this._romanceCleanup) {
      // romance is between men and women only
      this._romanceCleanup = false;
      for (const a of this.residents) for (const [id, r] of Object.entries(a.d.relationships)) {
        const b = this.byId(id);
        if (b && !canRomance(a, b)) { r.crush = false; r.partner = false; }
      }
    }
    const w = this.weather;
    for (const r of this.residents) {
      const d = r.d;
      const n = d.needs;
      const asleep = r.inside && r.inside.startsWith('home:') && r.sleeping;
      n.hunger = clamp(n.hunger - min * 0.055, 0, 100);
      n.energy = clamp(n.energy + min * (asleep ? 0.22 : r.inside ? 0.05 : -0.045 * (0.7 + r.t.energy * 0.6)), 0, 100);
      n.fun = clamp(n.fun - min * 0.05, 0, 100);
      n.social = clamp(n.social - min * 0.05 * (0.5 + r.t.sociability), 0, 100);

      // wetness: rain soaks you unless indoors or carrying an umbrella
      if (r.inWater) d.wetness = 1;
      if (d.swimWet && d.wetness < 0.2) d.swimWet = false;
      const exposed = !r.inside && (w.raining || w.snowing);
      if (exposed) {
        const rate = (w.p.rain * 0.06 + w.p.snow * 0.015) * (d.hasUmbrella && !r.engaged?.isFight && !r.ko ? 0.12 : 1);
        d.wetness = clamp(d.wetness + rate * min);
        if (r.ko) d.wetness = clamp(d.wetness + w.p.rain * 0.1 * min);
      } else {
        // hair and clothes take a while to dry (indoors a bit faster, in the sun too)
        const dry = r.inside ? 0.011 : w.type === 'sunny' ? 0.008 : 0.004;
        d.wetness = clamp(d.wetness - dry * min);
      }
      if (d.wetness > 0.7 && !d.swimWet) {
        d.soakedMinutes += min;
        if (d.soakedMinutes > 90 && chance(0.002 * min) && !d.injuries.some((i) => i.type === 'cold')) {
          r.addInjury('cold');
          this.news(`${r.name} caught a cold from being soaked too long. 🤧`, '🤧');
        }
        if (!r.inside && chance(0.01 * min)) r.say(line('soaked'), { emoji: '💦', sound: false });
      } else d.soakedMinutes = Math.max(0, d.soakedMinutes - min * 2);
      if (r.avatar) r.avatar.setWetness(d.wetness);

      // injuries heal over time
      for (const i of d.injuries) i.remaining -= min * (i.treated ? 2 : 1) * (r.inside ? 1.3 : 1);
      const healed = d.injuries.filter((i) => i.remaining <= 0);
      if (healed.length) {
        d.injuries = d.injuries.filter((i) => i.remaining > 0);
        r.refreshAttachments();
        for (const h of healed) if (INJURIES[h.type].severity >= 2) this.news(`${r.name} recovered from their ${INJURIES[h.type].label.toLowerCase()}.`, '💪');
      }
      if (r.hasEffect('sneeze') && !r.inside && chance(0.03 * min)) r.say(line('sneeze'), { emoji: '🤧' });

      // grudges fade
      for (const rel of Object.values(d.relationships)) rel.grudge = Math.max(0, rel.grudge - min * 0.015);

      // happiness drifts toward a target based on how life is going
      let target = 50 + (n.hunger - 50) * 0.18 + (n.fun - 50) * 0.18 + (n.social - 50) * 0.15 + (n.energy - 50) * 0.1;
      target -= r.painLevel * 0.9 + d.wetness * 14 * (d.swimWet ? 0.1 : 1);
      target += selfMoodShift(r);
      if (r.partnerId()) target += 8;
      target += residentPerks(d.level).mood;
      const emo = r.mood();
      if (emo === 'love') target += 15;
      if (emo === 'sad') target -= 10;
      if (emo === 'angry') target -= 6;
      if (w.type === 'sunny' && !r.inside) target += 4;
      d.happiness = clamp(d.happiness + (clamp(target, 0, 100) - d.happiness) * 0.01 * min, 0, 100);
      if (d.happiness > 75) this.gainXp(r, 0.04 * min);

      // keep faces in sync with mood when idle
      if (!r.engaged && !r.ko && r.avatar && chance(0.02 * min)) r.setExpression(emotionExpr(r.mood()));
    }
    // residents change into outfits that fit the situation on their own
    this.outfitTimer = (this.outfitTimer || 0) - min;
    if (this.outfitTimer <= 0 && this.settings.autoOutfits) {
      this.outfitTimer = 6;
      for (const r of this.residents) {
        if (r.d.autoOutfits === false || !r.d.outfits?.length || r.engaged || r.ko || r.inWater || r.errand || r.sleeping || r.morningPending) continue;
        if ((r.d.manualUntil || 0) > this.clock || r.d.mishap?.owned) continue;
        if (r.inside === r.homeKey) {
          // at home: wander over to the wardrobe when what they wear doesn't fit any more
          if (!r.route && !r.leaving && preferredOutfit(r, this) !== r.d.wearing) r.errand = { kind: 'dress', index: null, leave: false };
        } else if (!r.inside && !r.moving && !r.seat && !r.working && !r.activity && this.clock - (r.lastDressTrip ?? -1e9) > 90) {
          // out and about in the "wrong" clothes (rain started, still in swimwear…): sometimes go home to change
          if (this.outfitFor(r, {}) != null && chance(0.3)) this.goChange(r, {});
        }
      }
    }
    this.swim.perMinute(min);
    updateOutfitPerception(this, min);
    updateExposure(this, min);
    updatePriorRelations(this, min);
    updateCelebrities(this, min);
    updateMishaps(this, min);
    // dried off: now they can get dressed
    for (const r of this.residents) {
      const pc = r.pendingChange;
      if (!pc) continue;
      if (r.d.wearing === pc.index) { r.pendingChange = null; r.dryingOff = false; continue; }
      if (!mustDryFirst(r, pc.index) && !r.engaged && !r.changing) {
        r.pendingChange = null;
        r.dryingOff = false;
        if (!r.inside || r.inside === r.homeKey) this.changeOutfit(r, pc.index, { quiet: pc.quiet, purpose: pc.purpose });
      }
    }
    this.night.update(min);
    for (const r of this.residents) {
      if (!r.inside && !r.engaged && !r.inWater && !r.d.mishap && chance(0.00008 * min)) causeMishap(this, r, chance(0.6) ? 'seam' : 'stain');
    }
    // jobs: wages, promotions, perks
    updateJobs(this, min);
    const barista = this.residents.find((r) => r.working && r.d.job?.id === 'barista');
    const doctorIn = onDuty(this, 'doctor');
    for (const r of this.residents) {
      if (r.inside === 'cafe' && barista && barista !== r) {
        r.d.happiness = clamp(r.d.happiness + 0.06 * min, 0, 100);
        if (chance(0.02 * min)) { r.changeRel(barista.id, 1); barista.changeRel(r.id, 1); }
      }
      if (r.inside === 'clinic' && doctorIn && r.d.job?.id !== 'doctor') for (const i of r.d.injuries) i.remaining -= min * 2;
    }
    // melt snowmen
    if (this.snowmen.length && this.weather.snowCover < 0.1) {
      for (const id of this.snowmen) this.island.removeProp(id);
      this.snowmen = [];
    }
    this.problems.update(min);
  }

  separate() {
    const rs = this.residents;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.seat || a.ko || (a.inside && !a.room)) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.seat || b.ko || (a.inside || null) !== (b.inside || null)) continue;
        if (a.engaged && a.engaged === b.engaged) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 0.55;
        if (d < min && d > 1e-4) {
          const push = (min - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          if (!a.engaged?.isFight) a.placeAt(a.x - ux * push, a.z - uz * push, false);
          if (!b.engaged?.isFight) b.placeAt(b.x + ux * push, b.z + uz * push, false);
        }
      }
    }
  }

  // ------------------------------------------------------------------ save / load
  serialize() {
    return {
      version: 1,
      clock: this.clock,
      money: this.money,
      progress: this.progress.serialize(),
      economy: this.economy.serialize(),
      night: this.night.serialize(),
      inventory: this.inventory,
      news: this.newsLog.slice(0, 80),
      settings: this.settings,
      weather: this.weather.serialize(),
      residents: this.residents.map((r) => r.serialize()),
      props: this.island.serializeProps().filter((p) => !this.snowmen.includes(p.id)),
      anims: this.registry.serialize(),
      dialogue: this.dialogue.serialize(),
      rooms: this.rooms?.serialize() || {},
      surfaces: this.surfaces || {},
    };
  }

  async restore(data) {
    this.clock = data.clock ?? this.clock;
    this.lastDay = this.day;
    this.money = data.money ?? 300;
    this.progress.restore(data.progress);
    this.economy.restore(data.economy);
    this.night.restore(data.night);
    this._romanceCleanup = true;
    this.syncVenues();
    this.inventory = data.inventory || {};
    this.newsLog = data.news || [];
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    this.weather.restore(data.weather);
    this.registry.restore(data.anims);
    this.dialogue.restore(data.dialogue);
    this.rooms?.restore(data.rooms);
    for (const p of data.props || []) this.island.placeProp(p.type, p.x, p.z, p.rot, p.id);
    this.surfaces = data.surfaces || {};
    for (const rd of data.residents || []) {
      // tolerate saves from older versions
      const def = newResidentData(rd.name, rd.gender);
      await this.addResident({ ...def, ...rd, needs: { ...def.needs, ...rd.needs }, custom: rd.custom || def.custom }, { announce: false });
    }
  }
}

export { newResidentData, FOODS };
