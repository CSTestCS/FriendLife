// Fist fights and brawls.
//
// A fight starts between two residents (usually escalating from an
// argument, insult, prank or jealousy). Friends watching may jump in and
// turn it into a brawl; kind bystanders may try to break it up; the player
// can intervene. Hits can cause injuries (black eyes, broken noses,
// sprains, concussions, broken arms). The aftermath leaves grudges, news
// headlines and problems for the player to sort out.

import * as THREE from 'three';
import { chance, clamp, pick, rand, weightedPick } from '../core/util.js';
import { line, INJURIES } from './data.js';
import { emotionExpr } from './social.js';

const MOVES = {
  jab: { anim: 'jab', hitAt: 0.13, dmg: [5, 8], reach: 1.05, injuries: { bruise: 0.08, blackEye: 0.05, cutLip: 0.05 } },
  punch: { anim: 'punch', hitAt: 0.2, dmg: [9, 14], reach: 1.1, injuries: { bruise: 0.1, blackEye: 0.07, cutLip: 0.06, brokenNose: 0.03, concussion: 0.015 } },
  kick: { anim: 'kick', hitAt: 0.3, dmg: [11, 17], reach: 1.25, injuries: { bruise: 0.15, sprain: 0.03, brokenArm: 0.015 } },
  shove: { anim: 'shove', hitAt: 0.27, dmg: [3, 5], reach: 1.0, knock: 0.8, fall: 0.3, injuries: { bruise: 0.05 } },
  tackle: { anim: 'tackle', hitAt: 0.42, dmg: [12, 16], reach: 1.5, knock: 0.6, fall: 0.55, injuries: { bruise: 0.15 } },
};
const FALL_INJURIES = { bruise: 0.2, concussion: 0.08, sprain: 0.05, brokenArm: 0.035 };
const INTENSITY = { off: 0, mild: 0, normal: 1, spicy: 1.6 };

const _v = new THREE.Vector3();

export class Fight {
  constructor(sim, a, b, reason) {
    this.sim = sim;
    this.isFight = true;
    this.keepAnim = true;
    this.reason = reason;
    this.t = 0;
    this.done = false;
    this.f = new Map();
    this.sides = [[], []];
    this.events = [];
    this.injuriesCaused = [];
    this.spectators = new Set();
    this.checkTimer = 1.5;
    this.instigator = a;
    this.center = new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    this.join(a, 0);
    this.join(b, 1);
  }

  join(res, side) {
    res.clearPlan();
    res.leaveSeat();
    if (res.engaged && res.engaged !== this) res.engaged.finish?.(true);
    res.engaged = this;
    const hpMax = 60 + res.t.confidence * 30 + res.t.energy * 15 - res.painLevel;
    this.f.set(res, { side, hp: hpMax, hpMax, cd: rand(0.3, 1.0), action: null, down: false, ko: false, fled: false, downT: 0, hits: 0, landed: 0 });
    this.sides[side].push(res);
    res.play('guard');
    res.setExpression({ angry: 1 });
    res.say(line('fightStart'), { emoji: '💢' });
  }

  fighters() { return [...this.f.keys()]; }

  active(res) {
    const s = this.f.get(res);
    return s && !s.ko && !s.fled && !s.out;
  }

  opponentsOf(res) {
    const side = this.f.get(res).side;
    return this.sides[1 - side].filter((r) => this.active(r));
  }

  update(dt) {
    if (this.done) return;
    const sim = this.sim;
    this.t += dt;
    for (const [res, s] of this.f) {
      if (!this.active(res)) continue;
      if (!sim.residents.includes(res)) { s.out = true; continue; }
      this.updateFighter(res, s, dt);
    }
    // spectators, peacekeepers and people joining in
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 2;
      this.checkBystanders();
    }
    // end conditions
    const alive = [0, 1].map((i) => this.sides[i].filter((r) => this.active(r)).length);
    if (alive[0] === 0 || alive[1] === 0) this.end(alive[0] === 0 ? 1 : alive[1] === 0 ? 0 : -1, 'decided');
    else if (this.t > 40) this.end(-1, 'exhausted');
  }

  updateFighter(res, s, dt) {
    const sim = this.sim;
    // knocked down (temporary)
    if (s.down) {
      s.downT -= dt;
      if (s.downT <= 0 && !s.gettingUp) {
        s.gettingUp = true;
        res.play('getUp', { restart: true, onEnd: () => { s.down = false; s.gettingUp = false; res.play('guard'); } });
      }
      return;
    }
    const opps = this.opponentsOf(res);
    if (!opps.length) return;
    let target = s.target && this.active(s.target) ? s.target : null;
    if (!target) {
      target = opps.reduce((best, o) => (!best || sim.dist(res, o) < sim.dist(res, best) ? o : best), null);
      s.target = target;
    }
    res.faceTo(target.x, target.z);

    // flee when beaten and timid
    if (s.hp < s.hpMax * 0.3 && res.t.confidence < 0.45 && !s.action && chance(dt * 0.35)) {
      s.fled = true;
      res.engaged = null;
      res.say(pick(['I\'m outta here!', 'Waaah!', 'Leave me alone!']), { emoji: '💨' });
      res.setExpression({ sad: 1, surprised: 0.4 });
      const home = sim.island.houseOf(res.id);
      if (home) res.setPlan([{ kind: 'walk', x: home.door[0], z: home.door[1], run: true }, { kind: 'enter', loc: `home:${res.id}`, minutes: rand(60, 120) }]);
      this.events.push(`${res.name} ran away`);
      return;
    }

    const scale = Math.max(res.displayScale || 1, target.displayScale || 1);
    const range = 0.85 * scale;
    const dist = sim.dist(res, target);
    if (s.action) {
      s.action.t += dt;
      const mv = MOVES[s.action.type];
      if (mv && !s.action.resolved && s.action.t >= mv.hitAt) {
        s.action.resolved = true;
        if (sim.dist(res, target) < mv.reach * scale + 0.25) this.resolveHit(res, target, s.action.type);
        else if (chance(0.5)) res.say(line('fightMiss'), { sound: false });
      }
      if (s.action.t >= s.action.dur) {
        s.action = null;
        res.play('guard');
        s.cd = rand(0.45, 1.2) * (1.3 - res.t.energy * 0.5) * (1 + res.painLevel / 60);
      }
      return;
    }
    // footwork
    if (dist > range + 0.15) {
      const sp = dist > 2.2 ? 3 : 1.4;
      const step = Math.min(dist - range, sp * dt);
      _v.set(target.x - res.x, 0, target.z - res.z).normalize().multiplyScalar(step);
      res.placeAt(res.x + _v.x, res.z + _v.z);
      res.play(dist > 2.2 ? 'run' : 'guard');
    } else if (dist < range - 0.2) {
      _v.set(res.x - target.x, 0, res.z - target.z).normalize().multiplyScalar(dt * 0.8);
      res.placeAt(res.x + _v.x, res.z + _v.z);
    } else {
      // circle a little
      const side = Math.sin(this.t * 0.7 + (s.side ? 2 : 0)) * 0.25 * dt;
      _v.set(target.z - res.z, 0, -(target.x - res.x)).normalize().multiplyScalar(side);
      res.placeAt(res.x + _v.x, res.z + _v.z);
      if (res.player.action !== 'guard') res.play('guard');
    }
    s.cd -= dt;
    if (s.cd <= 0 && dist < range + 0.45) {
      const limp = res.hasEffect('limp');
      const type = weightedPick([
        ['jab', 3], ['punch', 3 + res.t.confidence * 2], ['kick', limp ? 0 : 1.5 + res.t.energy],
        ['shove', 1 + (1 - res.t.temper)], ['tackle', res.t.temper > 0.6 && !limp ? 0.8 : 0], ['taunt', res.t.confidence > 0.6 ? 0.6 : 0],
      ]);
      if (type === 'taunt') {
        res.play('taunt', { restart: true });
        res.say(pick(['Is that all?', 'Come on!', 'Hah!']), { emoji: '😏' });
        s.action = { type: 'taunt', t: 0, dur: 1.2 };
        return;
      }
      res.play(MOVES[type].anim, { restart: true, fade: 0.08 });
      const clip = sim.registry.resolve(MOVES[type].anim);
      s.action = { type, t: 0, dur: clip?.duration || 0.6, resolved: false };
      if (sim.isNear(res)) sim.audio.whoosh();
    }
  }

  resolveHit(att, def, type) {
    const sim = this.sim;
    const sd = this.f.get(def);
    const sa = this.f.get(att);
    const mv = MOVES[type];
    if (!sd || sd.ko || sd.down) return;
    const fx = sim.effects;
    def.avatar.getBoneWorld(type === 'kick' ? 'spine' : 'head', _v, null);
    const hitPos = _v.clone();
    // defence
    const busy = sd.action && sd.action.type !== 'hurt';
    const dodge = busy ? 0.05 : 0.12 + def.t.energy * 0.15 - def.painLevel / 200 - (def.hasEffect('limp') ? 0.1 : 0);
    const block = busy ? 0.05 : 0.15 + def.t.confidence * 0.12;
    const roll = Math.random();
    if (roll < dodge) {
      def.play('dodge', { restart: true, fade: 0.06 });
      sd.action = { type: 'hurt', t: 0, dur: 0.5 };
      if (chance(0.6)) att.say(line('fightMiss'), { sound: false });
      fx.text(hitPos.clone().add(new THREE.Vector3(0, 0.3, 0)), 'MISS', '#bfe6ff', 0.6);
      return;
    }
    let dmg = rand(mv.dmg[0], mv.dmg[1]) * (0.85 + att.t.confidence * 0.3) * (1 - att.painLevel / 120);
    if (roll < dodge + block && type !== 'tackle') {
      dmg *= 0.25;
      def.play('block', { restart: true, fade: 0.05 });
      sd.action = { type: 'hurt', t: 0, dur: 0.45 };
      fx.burst(hitPos, '#ffffff', 4, 0.15);
      if (sim.isNear(def)) sim.audio.hit(false);
      sd.hp -= dmg;
      return;
    }
    sd.hp -= dmg;
    sd.hits++;
    sa.landed++;
    fx.burst(hitPos, '#fff2a8', 8, 0.25);
    fx.text(hitPos.clone().add(new THREE.Vector3(0, 0.35, 0)), line('fightHit'), pick(['#ffd23f', '#ff7b54', '#ff4f79']), 0.85);
    if (sim.isNear(def)) {
      sim.audio.hit(dmg > 11);
      sim.stage.addShake(dmg > 11 ? 0.25 : 0.12);
    }
    // knockback
    const knock = (mv.knock || 0.25) * (dmg / 12);
    _v.set(def.x - att.x, 0, def.z - att.z).normalize();
    def.placeAt(def.x + _v.x * knock, def.z + _v.z * knock);
    def.setExpression({ angry: 0.5, sad: 0.6, surprised: 0.3 });
    // injuries
    const mult = INTENSITY[sim.settings.conflict] ?? 1;
    this.rollInjuries(def, mv.injuries, mult);
    // knocked down?
    if (sd.hp <= 0) {
      this.knockOut(def, sd);
      return;
    }
    const falls = chance((mv.fall || 0) + (dmg > 14 ? 0.15 : 0));
    if (falls) {
      sd.down = true;
      sd.downT = rand(1.2, 2.5);
      sd.action = null;
      def.play('knockdown', { restart: true, fade: 0.05, onEnd: () => def.play('lieDown') });
      setTimeout(() => { fx.dust(new THREE.Vector3(def.x, def.group.position.y, def.z)); if (sim.isNear(def)) sim.audio.thud(); }, 450);
      this.rollInjuries(def, FALL_INJURIES, mult * 0.6);
      return;
    }
    def.play('hurt', { restart: true, fade: 0.05 });
    sd.action = { type: 'hurt', t: 0, dur: 0.55 };
  }

  rollInjuries(res, table, mult) {
    if (!mult) return;
    for (const [type, p] of Object.entries(table)) {
      if (res.d.injuries.some((i) => i.type === type)) continue;
      if (chance(p * mult)) {
        res.addInjury(type);
        const def = INJURIES[type];
        res.say(`${def.icon} ${line('hurt')}`, { emoji: '' });
        this.injuriesCaused.push({ res, type });
        if (def.effect === 'sling') {
          // can't keep fighting with a broken arm
          const s = this.f.get(res);
          if (s) s.hp = Math.min(s.hp, 1);
        }
        return; // one new injury per hit at most
      }
    }
  }

  knockOut(res, s) {
    s.ko = true;
    s.down = true;
    s.action = null;
    res.play('knockdown', { restart: true, fade: 0.05, onEnd: () => res.play('lieDown') });
    res.setExpression({ sad: 1, surprised: 0.3 });
    setTimeout(() => {
      this.sim.effects.dust(new THREE.Vector3(res.x, res.group.position.y, res.z), 12);
      if (this.sim.isNear(res)) this.sim.audio.thud();
    }, 450);
    res.emote('💫', 4);
    res.ko = true;
    this.events.push(`${res.name} got knocked out`);
    const mult = INTENSITY[this.sim.settings.conflict] ?? 1;
    this.rollInjuries(res, FALL_INJURIES, mult);
  }

  checkBystanders() {
    const sim = this.sim;
    const fighters = this.fighters();
    for (const w of sim.residents) {
      if (this.f.has(w) || w.inside || w.ko) continue;
      const d = Math.hypot(w.x - this.center.x, w.z - this.center.z);
      if (d > 16) continue;
      if (w.engaged && w.engaged !== this.spectatorTag) continue;
      // best friend or partner of a fighter, with a temper: jump in!
      if (sim.settings.conflict !== 'mild' && w.canFight && this.sides[0].length + this.sides[1].length < 6) {
        for (const r of fighters) {
          if (!this.active(r)) continue;
          const rel = w.rel(r.id);
          if ((rel.score > 60 || rel.partner) && w.t.temper > 0.55 && chance(0.12 * (INTENSITY[sim.settings.conflict] || 1))) {
            this.spectators.delete(w);
            w.engaged = null;
            this.join(w, this.f.get(r).side);
            w.say(`Leave ${r.name} alone!`, { emoji: '💢' });
            sim.news(`${w.name} jumped in to help ${r.name}! It's a brawl!`, '🥊');
            this.events.push(`${w.name} joined in`);
            return;
          }
        }
      }
      // peacekeeper
      if (w.t.kindness > 0.65 && w.t.confidence > 0.45 && !this.peacekeeper && this.t > 4 && chance(0.12)) {
        this.peacekeeper = w;
        this.spectators.delete(w);
        w.clearPlan();
        w.engaged = null;
        w.say(line('stopFight'), { emoji: '✋' });
        w.setPlan([{ kind: 'walk', x: this.center.x + 0.6, z: this.center.z + 0.6, run: true }, { kind: 'call', fn: () => { if (!this.done && chance(0.65)) this.end(-1, 'brokenUp', w); } }, { kind: 'anim', anim: 'argue', dur: 2, expr: { angry: 0.4 } }]);
        continue;
      }
      // just watch
      if (!this.spectators.has(w) && !w.engaged) {
        this.spectators.add(w);
        w.clearPlan();
        const friendOf = fighters.find((r) => w.relScore(r.id) > 40);
        const ang = Math.atan2(w.x - this.center.x, w.z - this.center.z);
        const rr = rand(3.2, 4.5);
        w.setPlan([
          { kind: 'walk', x: this.center.x + Math.sin(ang) * rr, z: this.center.z + Math.cos(ang) * rr },
          { kind: 'anim', anim: 'shocked', dur: 1.2, faceX: this.center.x, faceZ: this.center.z, expr: { surprised: 1 }, emoji: '😱' },
          { kind: 'anim', anim: friendOf ? (w.t.temper > 0.5 ? 'cheer' : 'cry') : chance(0.5) ? 'cheer' : 'idle', dur: 40, faceX: this.center.x, faceZ: this.center.z, expr: friendOf ? { sad: 0.4, angry: 0.4 } : { surprised: 0.5 }, loopSay: () => pick(friendOf ? [`Get up, ${friendOf.name}!`, 'Stop!!', 'No!'] : ['Fight! Fight!', 'Whoa!', 'Ooooh!', 'Someone stop them!']) },
        ]);
      }
    }
  }

  /** winnerSide: 0/1 or -1 (nobody). */
  end(winnerSide, how, by = null) {
    if (this.done) return;
    this.done = true;
    const sim = this.sim;
    const all = this.fighters();
    const winners = winnerSide >= 0 ? this.sides[winnerSide] : [];
    const losers = winnerSide >= 0 ? this.sides[1 - winnerSide] : [];
    // relationships and grudges across sides
    for (const a of this.sides[0]) {
      for (const b of this.sides[1]) {
        const mild = how === 'player';
        a.changeRel(b.id, -(mild ? rand(6, 10) : rand(15, 28)));
        b.changeRel(a.id, -(mild ? rand(6, 10) : rand(15, 28)));
        a.rel(b.id).grudge = clamp(a.rel(b.id).grudge + (mild ? 15 : 35), 0, 100);
        b.rel(a.id).grudge = clamp(b.rel(a.id).grudge + (mild ? 15 : 35), 0, 100);
        a.rel(b.id).fights++;
        b.rel(a.id).fights++;
        // fighting your sweetheart is a relationship killer
        if (a.rel(b.id).partner && chance(0.6)) sim.social.breakUp(a, b, true);
      }
    }
    // bystanders lose respect for the instigator if they like the victims
    for (const w of this.spectators) {
      for (const r of all) {
        if (r !== this.instigator && w.relScore(r.id) > 30) w.changeRel(this.instigator.id, -6);
      }
    }
    // release everyone
    for (const res of all) {
      const s = this.f.get(res);
      if (res.engaged === this) res.engaged = null;
      if (s.fled) continue;
      if (s.ko || s.down) {
        res.ko = true;
        sim.fights.recover(res, s.ko ? rand(8, 14) : rand(1, 2), losers.includes(res));
        continue;
      }
      res.stopMoving();
      if (winners.includes(res)) {
        res.play('victory');
        res.say(line('victory'), { emoji: '😤' });
        res.setExpression({ happy: 0.5, angry: 0.4 });
        if (res.t.kindness > 0.6) {
          res.setEmotion('sad', 120);
          res.d.happiness = clamp(res.d.happiness - 10, 0, 100);
          sim.problems.offer(res, 'makeUp', { other: losers[0]?.id });
        } else {
          res.setEmotion('smug', 120);
          res.d.happiness = clamp(res.d.happiness + 4, 0, 100);
        }
        res.setPlan([{ kind: 'anim', anim: 'victory', dur: 3 }, { kind: 'call', fn: () => res.setExpression(emotionExpr(res.mood())) }]);
      } else {
        res.play('angry');
        res.say(how === 'player' ? 'Hmph! Fine!' : how === 'brokenUp' ? 'This isn\'t over!' : 'I\'m too tired...', { emoji: '💢' });
        res.setEmotion('angry', 90);
        res.setPlan([{ kind: 'anim', anim: how === 'exhausted' ? 'dizzy' : 'angry', dur: 2.5, expr: { angry: 0.8 } }]);
      }
      res.d.needs.energy = clamp(res.d.needs.energy - 20, 0, 100);
    }
    for (const r of losers) {
      r.d.happiness = clamp(r.d.happiness - 25, 0, 100);
      r.setEmotion(r.t.temper > 0.6 ? 'angry' : 'sad', 240);
      r.addMemory(`Lost a fight against ${winners.map((w) => w.name).join(' & ')}`);
    }
    for (const w of winners) w.addMemory(`Won a fight against ${losers.map((l) => l.name).join(' & ')}`);
    // spectators go back to life
    for (const w of this.spectators) if (!w.engaged) { w.clearPlan(); w.play('idle'); w.setExpression({}); }
    // headline
    const names = (arr) => arr.map((r) => r.name).join(' & ');
    let text;
    if (how === 'player') text = `You broke up a fight between ${names(this.sides[0])} and ${names(this.sides[1])}.`;
    else if (how === 'brokenUp') text = `${by?.name || 'Someone'} broke up a fight between ${names(this.sides[0])} and ${names(this.sides[1])}.`;
    else if (how === 'exhausted') text = `${names(this.sides[0])} and ${names(this.sides[1])} fought until they were too tired to continue.`;
    else text = `${names(winners)} beat ${names(losers)} in a fight${this.reason ? ` (it started with ${this.reason === 'argument' ? 'an argument' : this.reason === 'insult' ? 'an insult' : this.reason === 'jealousy' ? 'jealousy' : this.reason === 'prank' ? 'a prank' : this.reason === 'revenge' ? 'a revenge plot' : 'bad blood'})` : ''}.`;
    const inj = this.injuriesCaused.map(({ res, type }) => `${res.name}: ${INJURIES[type].label}`);
    if (inj.length) text += ` Injuries — ${inj.join(', ')}.`;
    sim.news(text, '🥊');
    // problems for losers
    for (const r of losers) {
      if (r.d.injuries.length && chance(0.5)) sim.problems.offer(r, 'hurt', {});
      else if (r.t.temper > 0.6) sim.problems.offer(r, 'revenge', { other: winners[0]?.id });
      else sim.problems.offer(r, 'makeUp', { other: winners[0]?.id });
    }
    if (winnerSide < 0) for (const r of all) if (chance(0.3)) sim.problems.offer(r, 'makeUp', { other: (this.sides[0].includes(r) ? this.sides[1] : this.sides[0])[0]?.id });
    sim.fights.onEnded(this);
  }
}

export class FightManager {
  constructor(sim) {
    this.sim = sim;
    this.active = [];
    this.recovering = [];
    this.total = 0;
  }

  start(a, b, reason = '') {
    const sim = this.sim;
    if (!a || !b || a.ko || b.ko || a.inside || b.inside) return null;
    if ((sim.settings.conflict === 'off' || sim.settings.conflict === 'mild')) return null;
    if (this.active.some((f) => f.f.has(a) || f.f.has(b))) return null;
    sim.social.cancelFor(a);
    sim.social.cancelFor(b);
    const f = new Fight(sim, a, b, reason);
    this.active.push(f);
    this.total++;
    sim.alert(`🥊 ${a.name} and ${b.name} are fighting!`, () => sim.focusOn(a));
    return f;
  }

  update(dt) {
    for (const f of this.active) f.update(dt);
    this.active = this.active.filter((f) => !f.done);
    for (const r of this.recovering) {
      r.t -= dt;
      if (r.t <= 0 && !r.started) {
        r.started = true;
        const res = r.res;
        res.play('getUp', {
          restart: true,
          onEnd: () => {
            res.ko = false;
            res.play('idle');
            const hurt = res.d.injuries.length > 0;
            const plan = [];
            if (r.lost) plan.push({ kind: 'anim', anim: res.t.temper > 0.6 ? 'angry' : 'cry', dur: 3, say: line('defeat'), expr: res.t.temper > 0.6 ? { angry: 1 } : { sad: 1 } });
            if (hurt && res.hasEffect('dizzy')) plan.push({ kind: 'anim', anim: 'dizzy', dur: 3 });
            res.setPlan(plan);
          },
        });
      }
    }
    // safety net: if a custom (looping) getUp animation never "ends", stand up anyway
    for (const r of this.recovering) {
      if (r.started && r.res.ko && r.t < -4) { r.res.ko = false; r.res.play('idle'); }
    }
    this.recovering = this.recovering.filter((r) => !(r.started && !r.res.ko));
  }

  recover(res, seconds, lost) {
    this.recovering.push({ res, t: seconds, lost, started: false });
  }

  stop(fight) {
    if (fight && !fight.done) fight.end(-1, 'player');
  }

  fightOf(res) { return this.active.find((f) => f.f.has(res)) || null; }

  onEnded(f) {
    this.sim.emit('fightEnded', f);
  }
}
