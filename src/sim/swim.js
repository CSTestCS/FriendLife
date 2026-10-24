// Swimming at the beach (and the condo pool), getting into trouble in the
// water, and rescues. An on-duty lifeguard reacts at once; otherwise a brave
// bystander may help, the player can throw a life ring or shout for help, or
// the waves eventually wash the poor swimmer ashore (hurt and shaken).

import * as THREE from 'three';
import { chance, clamp, pick, rand } from '../core/util.js';
import { jobOf } from './jobs.js';
import { residentPerks } from './progress.js';

const GUARD_JOB = { beach: 'lifeguard', pool: 'poolguard' };
const GIVE_UP = 45; // seconds (at 1x) before the waves wash a struggling swimmer ashore

export class SwimManager {
  constructor(sim) {
    this.sim = sim;
    this.cases = [];
  }

  placeOf(res) { return res.room?.kind === 'pool' ? 'pool' : 'beach'; }
  spaceOf(res) { return res.room?.kind === 'pool' ? res.room : this.sim.island; }

  /** The lifeguard working at this place right now, if any. */
  guardOnDuty(place, space) {
    const job = GUARD_JOB[place];
    return this.sim.residents.find((r) => r.d.job?.id === job && r.working && !r.ko && r.space === space && !(r.engaged && !r.engaged.isRescue) && !this.cases.some((c) => c.victim === r)) || null;
  }

  canSwim(res) {
    const sim = this.sim;
    if ((res.d.waterFear || 0) > sim.clock) return false;
    if (res.d.injuries.some((i) => i.type === 'brokenArm' || i.type === 'waterlogged')) return false;
    return res.d.needs.energy > 25;
  }

  /** Plan a swim in the sea (or in the pool room the resident is in). */
  planSwim(res) {
    const sim = this.sim;
    const space = res.room?.kind === 'pool' ? res.room : sim.island;
    const shore = space.shorePoint(res.room ? res.x : null);
    const spots = [space.swimSpot(), space.swimSpot(), space.swimSpot()];
    const n = res.d.needs;
    res.setPlan([
      { kind: 'walk', x: shore.x, z: shore.z },
      { kind: 'call', fn: () => { res.activity = 'swim'; } },
      { kind: 'anim', anim: 'stretch', dur: 2.5, heading: shore.heading, say: pick(['Swim time!', 'Last one in is a rotten egg!', 'The water looks great!', 'Cannonball!']), emoji: '🏊' },
      { kind: 'walk', x: spots[0].x, z: spots[0].z },
      { kind: 'anim', anim: chance(0.5) ? 'float' : 'tread', dur: rand(6, 12), expr: { relaxed: 0.8 } },
      { kind: 'walk', x: spots[1].x, z: spots[1].z },
      { kind: 'anim', anim: 'tread', dur: rand(4, 8), expr: { happy: 0.7 } },
      { kind: 'walk', x: spots[2].x, z: spots[2].z },
      { kind: 'walk', x: shore.x, z: shore.z },
      { kind: 'call', fn: () => {
        res.activity = null;
        n.fun = clamp(n.fun + 25, 0, 100);
        n.energy = clamp(n.energy - 8, 0, 100);
        res.emote('😄', 2);
      } },
    ]);
  }

  /** Per game minute: swimmers can get into trouble. */
  perMinute(min) {
    const sim = this.sim;
    const w = sim.weather;
    for (const r of sim.residents) {
      if (!r.inWater || r.engaged || r.ko || this.cases.some((c) => c.victim === r || c.rescuer === r)) continue;
      const place = this.placeOf(r);
      let risk = 0.0016 * (1 + (1 - r.t.energy) * 0.6 + (r.d.needs.energy < 30 ? 2 : 0) + r.painLevel / 10 + (r.d.needs.hunger > 92 ? 1 : 0)) * residentPerks(r.d.level).swimRisk;
      if (place === 'beach') risk *= 1 + (w.stormy ? 5 : 0) + (w.raining ? 1.5 : 0) + (w.p?.wind || 0) * 2;
      else risk *= 0.45;
      const guard = this.guardOnDuty(place, this.spaceOf(r));
      if (guard) {
        risk *= 0.5; // they keep an eye out and warn people
        if (chance(0.01 * min)) guard.say(pick(['No running near the water!', 'Stay where I can see you!', 'Careful out there!', 'Don\'t swim too far!']), { emoji: '📣' });
      }
      if (chance(risk * min)) this.distress(r);
    }
  }

  distress(r) {
    const sim = this.sim;
    if (this.cases.some((c) => c.victim === r)) return null;
    sim.social.cancelFor(r);
    r.clearPlan();
    r.activity = 'swim';
    const c = { kind: 'rescue', isRescue: true, victim: r, a: r, b: null, rescuer: null, phase: 'struggle', t: 0, place: this.placeOf(r), space: this.spaceOf(r), finish: () => {} };
    r.engaged = c;
    r.play('struggle');
    r.setExpression({ surprised: 1 });
    r.setEmotion('scared', 60);
    r.say(pick(['Help! *glub*', 'I... can\'t... *glub*', 'Cramp! HELP!', 'Somebody! *splash*']), { emoji: '🆘' });
    this.cases.push(c);
    sim.problems.offer(r, 'drowning', {});
    sim.alert(`🆘 ${r.name} is in trouble in the water!`, () => sim.select(r), 'problem');
    sim.news(`${r.name} got into trouble while swimming!`, '🆘');
    for (const o of sim.residents) if (o !== r && o.space === c.space && !o.engaged && sim.dist(o, r) < 25) o.emote('😱', 2.5);
    return c;
  }

  /** Player shouted for help: send the nearest willing resident. */
  callForHelp(victim) {
    const c = this.cases.find((x) => x.victim === victim);
    if (!c) return false;
    if (c.rescuer || c.ring) return true;
    const cand = this.helpers(c, 60, 0);
    if (!cand.length) return false;
    this.dispatch(c, cand[0], false);
    return true;
  }

  helpers(c, range, bravery) {
    const v = c.victim;
    return this.sim.residents
      .filter((o) => o !== v && !o.engaged && !o.ko && o.space === c.space && !this.cases.some((x) => x.victim === o) && this.sim.dist(o, v) < range
        && !o.d.injuries.some((i) => i.type === 'brokenArm') && o.t.confidence + o.t.kindness * 0.5 >= bravery)
      .sort((a, b) => this.sim.dist(a, v) - this.sim.dist(b, v));
  }

  /** mode 'ring': the player throws a life ring. Otherwise rescuer swims out. */
  rescue(victim, rescuer, mode) {
    const c = this.cases.find((x) => x.victim === victim);
    if (!c) return false;
    if (mode === 'ring') {
      if (c.ring) return true;
      const ring = makeLifeRing();
      ring.position.set(victim.x, victim.groundY + 0.05, victim.z);
      (victim.room ? this.sim.rooms.fx : this.sim.fx.group).add(ring);
      c.ring = ring;
      c.phase = 'ring';
      this.sim.effects.splash(ring.position.clone(), 12, victim.room ? this.sim.rooms.fx : undefined);
      victim.say('A ring! *cough*', { emoji: '🛟' });
      const shore = c.space.shorePoint(victim.room ? victim.x : victim.x);
      victim.play('float');
      victim.moveTo(shore.x, shore.z, { speed: 0.7, anim: 'float' });
      return true;
    }
    if (rescuer) this.dispatch(c, rescuer, false);
    return true;
  }

  dispatch(c, rescuer, isGuard) {
    const sim = this.sim;
    if (rescuer.engaged && !rescuer.engaged.isRescue) rescuer.engaged.finish?.(true);
    sim.social.cancelFor(rescuer);
    if (rescuer.inside && rescuer.room !== c.space) return;
    rescuer.clearPlan();
    rescuer.leaveSeat();
    rescuer.engaged = c;
    c.rescuer = rescuer;
    c.b = rescuer;
    c.isGuard = isGuard;
    c.phase = 'approach';
    c.approachT = 0;
    rescuer.say(isGuard ? pick(['Hang on! I\'m coming!', 'Lifeguard on the way!', 'Stay calm, I\'ve got you!']) : pick(['I\'ll save you!', 'Hold on!!', 'I\'m coming!']), { emoji: isGuard ? '🛟' : '💪' });
    rescuer.moveTo(c.victim.x, c.victim.z, { run: true, stopDist: 0.8 });
  }

  update(dt) {
    if (!this.cases.length) return;
    const sim = this.sim;
    for (const c of [...this.cases]) {
      const v = c.victim;
      if (!sim.residents.includes(v)) { this.close(c); continue; }
      c.t += dt;
      if (c.phase === 'struggle') {
        if (v.player.action !== 'struggle') v.play('struggle');
        if (chance(dt * 0.4)) v.say(pick(['Help!', '*glub glub*', 'HELP!', '*splash*']), { emoji: '🆘', sound: chance(0.5) });
        // the lifeguard reacts immediately; bystanders take a moment to work up the courage
        const guard = this.guardOnDuty(c.place, c.space);
        if (guard && c.t > 0.8) this.dispatch(c, guard, true);
        else if (c.t > 6 && !c.askedBystanders) {
          c.askedBystanders = true;
          const brave = this.helpers(c, 30, 0.75).filter((o) => chance(0.55));
          if (brave.length) this.dispatch(c, brave[0], false);
        }
        if (c.phase === 'struggle' && c.t > GIVE_UP) this.washAshore(c);
      } else if (c.phase === 'approach') {
        const r = c.rescuer;
        c.approachT += dt;
        if (!sim.residents.includes(r) || r.ko) { c.phase = 'struggle'; c.rescuer = null; continue; }
        if (!v.player.action?.startsWith('str')) v.play('struggle');
        const d = sim.dist(r, v);
        if (d < 1.0) this.startTow(c);
        else if (!r.moving || c.approachT % 1 < dt) r.moveTo(v.x, v.z, { run: true, stopDist: 0.8 });
        if (c.approachT > 50) this.washAshore(c);
      } else if (c.phase === 'tow') {
        const r = c.rescuer;
        // the victim floats along behind the rescuer
        const h = r.heading;
        v.placeAt(r.x - Math.sin(h) * 0.75, r.z - Math.cos(h) * 0.75, false);
        v.heading = h;
        v.targetHeading = h;
        if (!r.moving || r.moving.done) this.finishRescue(c);
        if (c.t > 120) this.finishRescue(c);
      } else if (c.phase === 'ring') {
        if (c.ring) {
          c.ring.position.set(v.x, (v.inWater ? v.groundY : v.group.position.y) + 0.12, v.z);
          c.ring.rotation.z += dt * 0.5;
        }
        if (!v.moving || v.moving.done) this.finishRescue(c);
      }
    }
  }

  startTow(c) {
    const r = c.rescuer;
    const v = c.victim;
    c.phase = 'tow';
    v.stopMoving();
    v.play('float');
    v.say(pick(['*cough* thank you...', '*gasp*', 'You came!']), { emoji: '🥹' });
    const shore = c.space.shorePoint(c.space === this.sim.island ? v.x : v.x);
    c.shore = shore;
    r.moveTo(shore.x, shore.z, { speed: 1.0 * (r.displayScale || 1) ** 0.5 });
  }

  finishRescue(c) {
    const sim = this.sim;
    const v = c.victim;
    const r = c.rescuer;
    this.close(c);
    v.stopMoving();
    v.activity = null;
    // a moment on the sand to recover
    v.ko = true;
    v.play('lieDown');
    v.setExpression({ sad: 0.4 });
    sim.fights.recover(v, rand(3, 5), false);
    if (c.t > 25 && chance(0.5)) v.addInjury('waterlogged');
    v.setEmotion('scared', 60);
    v.d.waterFear = sim.clock + rand(6, 20) * 60;
    if (v.d.problem?.type === 'drowning') { v.d.problem = null; sim.emit('problem', v); }
    if (r) {
      r.play('point');
      r.say(c.isGuard ? pick(['You\'re safe now. Breathe!', 'All part of the job!', 'Stay out of the deep end for a bit, okay?']) : pick(['Phew! You okay?', 'That was scary!', 'Don\'t scare me like that!']), { emoji: '🛟' });
      v.changeRel(r.id, 22);
      r.changeRel(v.id, 8);
      v.addMemory(`${r.name} saved me from drowning`);
      r.addMemory(`Saved ${v.name} from drowning`);
      sim.gainXp(r, 35);
      sim.social.maybeCrush(v, r);
      if (c.isGuard) {
        const tip = Math.round(rand(20, 45));
        sim.economy.earn(tip, "tips");
        if (r.d.job) r.d.job.xp = (r.d.job.xp || 0) + 120;
        sim.news(`Lifeguard ${r.name} rescued ${v.name}! The island tipped +${tip} 🪙`, '🛟');
        sim.progress?.add(30, 'rescue');
      } else { sim.news(`${r.name} bravely swam out and saved ${v.name}!`, '💪'); sim.progress?.add(25, 'rescue'); }
      setTimeout(() => { if (sim.residents.includes(r) && !r.engaged) r.setPlan([{ kind: 'anim', anim: 'idle', dur: 2 }]); }, 2000);
    } else {
      sim.news(`${v.name} grabbed your life ring and made it back to shore. Phew!`, '🛟');
      sim.progress?.add(25, 'rescue');
    }
    v.say('*cough cough* ...I\'m okay.', { emoji: '💦' });
  }

  washAshore(c) {
    const sim = this.sim;
    const v = c.victim;
    const r = c.rescuer;
    this.close(c);
    if (r) { r.stopMoving(); r.say('I... couldn\'t reach them!', { emoji: '😰' }); }
    const shore = c.space.shorePoint(v.x);
    v.stopMoving();
    v.placeAt(shore.x + rand(-0.5, 0.5), shore.z);
    v.activity = null;
    v.ko = true;
    v.play('lieDown');
    v.setExpression({ sad: 1 });
    sim.fights.recover(v, rand(8, 12), false);
    v.addInjury('waterlogged');
    v.d.happiness = clamp(v.d.happiness - 15, 0, 100);
    v.setEmotion('sad', 120);
    v.d.waterFear = sim.clock + 3 * 24 * 60;
    v.addMemory('Nearly drowned. Nobody came...');
    if (v.d.problem?.type === 'drowning') { v.d.problem = null; sim.emit('problem', v); }
    const need = c.place === 'pool' ? 'a pool lifeguard' : 'a lifeguard';
    sim.news(`${v.name} nearly drowned and washed up ${c.place === 'pool' ? 'at the edge of the pool' : 'on the beach'}. Nobody came to help... the island needs ${need}!`, '🌊');
    sim.alert(`🌊 ${v.name} washed ashore. Hire ${need} (💼 Jobs)!`, () => sim.select(v), 'problem');
    sim.effects.splash(new THREE.Vector3(v.x, v.group.position.y + 0.2, v.z), 16, v.room ? sim.rooms.fx : undefined);
  }

  close(c) {
    this.cases = this.cases.filter((x) => x !== c);
    if (c.ring) { c.ring.removeFromParent(); c.ring = null; }
    if (c.victim.engaged === c) c.victim.engaged = null;
    if (c.rescuer?.engaged === c) c.rescuer.engaged = null;
  }

  caseOf(res) { return this.cases.find((c) => c.victim === res || c.rescuer === res) || null; }
}

function makeLifeRing() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 10, 12, Math.PI / 2), i % 2 ? white : red);
    seg.rotation.z = (i * Math.PI) / 2;
    g.add(seg);
  }
  g.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(g);
  return holder;
}

export { jobOf };
