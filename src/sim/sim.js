// The island simulation: time, residents, needs, weather effects on
// residents, injuries, money/inventory, news and save data.

import * as THREE from 'three';
import { Resident, newResidentData } from './resident.js';
import { think } from './brain.js';
import { Social, emotionExpr } from './social.js';
import { FightManager } from './fight.js';
import { Problems } from './problems.js';
import { INJURIES, line, NAMES, foodById, FOODS, ITEMS } from './data.js';
import { Emitter, chance, clamp, damp, pick, rand } from '../core/util.js';

export const MINUTES_PER_SECOND = 1; // 1 real second = 1 game minute at 1x speed

export const DEFAULT_SETTINGS = {
  conflict: 'normal', // off | mild | normal | spicy
  romance: true,
  music: true,
  volume: 0.7,
  follow: true,
  shadows: true,
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
    this.snowmen = [];
    this.lastDay = this.day;
    this.minuteAcc = 0;
    this.residentGroup = new THREE.Group();
    this.residentGroup.name = 'residents';
    this.scene.add(this.residentGroup);
  }

  get locations() { return this.island.locations; }
  get day() { return Math.floor(this.clock / 1440) + 1; }
  get minuteOfDay() { return this.clock % 1440; }

  byId(id) { return this.residents.find((r) => r.id === id) || null; }
  dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  isNear(res) {
    const t = this.stage.controls.target;
    return !res.inside && Math.hypot(res.x - t.x, res.z - t.z) < 26 && this.stage.camera.position.distanceTo(t) < 70;
  }

  // ------------------------------------------------------------------ residents
  async addResident(data, { announce = true } = {}) {
    const res = new Resident(this, data);
    this.residents.push(res);
    this.residentGroup.add(res.group);
    const slot = this.island.assignHouse(res.id, data.name, data.houseIndex);
    data.houseIndex = slot.index;
    if (data.insideState) {
      res.enter(data.insideState.loc, Math.max(1, data.insideState.until - this.clock));
    } else if (data.pos) {
      res.placeAt(data.pos[0], data.pos[1]);
      res.heading = data.pos[2] || 0;
    } else {
      res.placeAt(slot.door[0], slot.door[1]);
      res.heading = slot.rot;
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
      this.news(`${data.name} moved to the island! Welcome! 🏡`, '🏡');
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

  removeResident(res) {
    this.social.cancelFor(res);
    const f = this.fights.fightOf(res);
    if (f) f.end(-1, 'player');
    res.leaveSeat();
    res.disposeAttachments();
    res.avatar?.dispose();
    this.residentGroup.remove(res.group);
    this.residents = this.residents.filter((r) => r !== res);
    this.island.releaseHouse(res.id);
    for (const r of this.residents) {
      delete r.d.relationships[res.id];
      if (r.d.problem?.other === res.id) r.d.problem = null;
    }
    if (this.selected === res) this.select(null);
    this.news(`${res.name} moved away from the island. 👋`, '🧳');
    this.emit('residents');
  }

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
    if (res.inside) this.toast?.(`${res.name} is inside (${this.placeName(res.inside)}).`);
  }

  placeName(loc) {
    if (!loc) return 'Outside';
    if (loc.startsWith('home:')) {
      const owner = this.byId(loc.slice(5));
      return owner ? `${owner.name}'s house` : 'home';
    }
    return this.locations[loc]?.label || loc;
  }

  news(text, icon = '📰') {
    const item = { text, icon, day: this.day, time: this.minuteOfDay };
    this.newsLog.unshift(item);
    if (this.newsLog.length > 150) this.newsLog.length = 150;
    this.emit('news', item);
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

  buy(id) {
    const item = foodById(id) || ITEMS.find((i) => i.id === id);
    if (!item) return false;
    if (this.money < item.price) return false;
    this.money -= item.price;
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
    res.clearPlan();
    if (food.id === res.d.favFood) {
      res.d.happiness = clamp(res.d.happiness + 25, 0, 100);
      this.gainXp(res, 30);
      res.setPlan([{ kind: 'anim', anim: 'eatStand', dur: 2.5, expr: { happy: 1 }, emoji: food.icon }, { kind: 'anim', anim: 'cheer', dur: 2.5, say: `${food.name}! My FAVORITE!`, emoji: '😍', expr: { happy: 1 } }]);
      msg = `${res.name} LOVES ${food.icon} ${food.name}! It's their favorite!`;
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
    if (res.inside) return `${res.name} is inside.`;
    if (res.engaged) return `${res.name} is busy right now.`;
    res.clearPlan();
    this.stage.camera.getWorldPosition(new THREE.Vector3());
    const cam = this.stage.camera.position;
    const m = res.mood();
    const text = res.d.injuries.length ? line('hurt') : res.d.wetness > 0.6 ? line('soaked') : res.d.needs.hunger < 30 ? line('hungry') : m === 'sad' ? line('sad') : m === 'happy' ? line('happy') : pick([...['chat', 'chat', 'happy'].map((k) => line(k)), res.d.catchphrase]);
    res.setPlan([{ kind: 'anim', anim: m === 'sad' ? 'sulk' : 'wave', dur: 3, faceX: cam.x, faceZ: cam.z, say: text, expr: emotionExpr(m) }]);
    res.d.needs.social = clamp(res.d.needs.social + 10, 0, 100);
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
    for (const i of res.d.injuries) {
      i.treated = true;
      i.remaining *= INJURIES[i.type]?.severity >= 3 ? 0.6 : INJURIES[i.type]?.severity >= 2 ? 0.4 : 0.2;
    }
    res.d.injuries = res.d.injuries.filter((i) => i.remaining > 30);
    res.refreshAttachments();
    res.say('The doctor patched me up!', { emoji: '🏥' });
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
    return `${res.name} loved the gift!`;
  }

  /** Send a resident somewhere (e.g. clinic) and keep them inside for a while. */
  sendTo(res, loc, minutes, onExit) {
    const door = this.locationDoor(loc, res);
    if (!door) return;
    if (res.engaged) { this.social.cancelFor(res); }
    if (res.inside) res.exit();
    res.clearPlan();
    res.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc, minutes, onExit }]);
  }

  /** Have resident a go to b and start an interaction (retries if b is busy). */
  goInteract(a, b, kind, opts = {}) {
    if (!a || !b) return;
    if (a.inside) a.exit();
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
    if (loc.startsWith('home:')) {
      const h = this.island.houseOf(loc.slice(5));
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
    while (res.d.xp >= 100) {
      res.d.xp -= 100;
      res.d.level += 1;
      const coins = 50 + res.d.level * 10;
      this.money += coins;
      this.news(`${res.name} reached level ${res.d.level}! (+${coins} 🪙)`, '⭐');
      this.alert(`⭐ ${res.name} leveled up!`, () => this.select(res), 'level');
      if (this.isNear(res)) this.audio.levelUp();
      if (!res.engaged && !res.inside) res.setPlan([{ kind: 'anim', anim: 'cheer', dur: 3, emoji: '⭐', expr: { happy: 1 } }]);
    }
  }

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
  update(dtReal) {
    const dt = Math.min(dtReal, 0.1) * this.speed;
    if (dt <= 0) return;
    this.realTime += dt;
    const gameMin = dt * MINUTES_PER_SECOND;
    this.clock += gameMin;

    // daily rollover
    if (this.day !== this.lastDay) {
      this.lastDay = this.day;
      this.money += 40;
      this.news(`Good morning! Day ${this.day} begins. Daily island allowance: +40 🪙`, '🌅');
      this.emit('day', this.day);
    }

    this.minuteAcc += gameMin;
    if (this.minuteAcc >= 1) {
      this.perMinute(this.minuteAcc);
      this.minuteAcc = 0;
    }

    for (const r of this.residents) {
      if (!r.engaged && !r.ko && !r.inside) {
        r.thinkTimer -= dt;
        if (r.thinkTimer <= 0) {
          r.thinkTimer = rand(0.3, 1.2);
          think(r, this);
        }
      }
    }
    this.social.update(dt);
    this.fights.update(dt);
    for (const r of this.residents) r.update(dt, gameMin);
    this.separate();

    // camera follows the selected resident
    if (this.settings.follow && this.followTarget && !this.followTarget.inside && this.residents.includes(this.followTarget)) {
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
      const exposed = !r.inside && (w.raining || w.snowing);
      if (exposed) {
        const rate = (w.p.rain * 0.06 + w.p.snow * 0.015) * (d.hasUmbrella && !r.engaged?.isFight && !r.ko ? 0.12 : 1);
        d.wetness = clamp(d.wetness + rate * min);
        if (r.ko) d.wetness = clamp(d.wetness + w.p.rain * 0.1 * min);
      } else {
        const dry = r.inside ? 0.025 : w.type === 'sunny' ? 0.012 : 0.005;
        d.wetness = clamp(d.wetness - dry * min);
      }
      if (d.wetness > 0.7) {
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
      target -= r.painLevel * 0.9 + d.wetness * 14;
      if (r.partnerId()) target += 8;
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
      if (a.inside || a.seat || a.ko) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.inside || b.seat || b.ko) continue;
        if (a.engaged && a.engaged === b.engaged) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = 0.55;
        if (d < min && d > 1e-4) {
          const push = (min - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          if (!a.engaged?.isFight) a.placeAt(a.x - ux * push, a.z - uz * push);
          if (!b.engaged?.isFight) b.placeAt(b.x + ux * push, b.z + uz * push);
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
      inventory: this.inventory,
      news: this.newsLog.slice(0, 80),
      settings: this.settings,
      weather: this.weather.serialize(),
      residents: this.residents.map((r) => r.serialize()),
      props: this.island.serializeProps().filter((p) => !this.snowmen.includes(p.id)),
      anims: this.registry.serialize(),
      surfaces: this.surfaces || {},
    };
  }

  async restore(data) {
    this.clock = data.clock ?? this.clock;
    this.lastDay = this.day;
    this.money = data.money ?? 300;
    this.inventory = data.inventory || {};
    this.newsLog = data.news || [];
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    this.weather.restore(data.weather);
    this.registry.restore(data.anims);
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
