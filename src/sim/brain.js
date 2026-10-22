// Autonomous behaviour: when a resident has nothing planned, pick the next
// thing to do based on time of day, needs, injuries, weather and mood.

import { chance, clamp, pick, rand, weightedPick } from '../core/util.js';
import { line, INJURIES } from './data.js';

export function think(res, sim) {
  if (res.plan.length || res.step || res.engaged || res.inside || res.ko || res.moving) return;
  const hour = sim.minuteOfDay / 60;
  const d = res.d;
  const n = d.needs;
  const w = sim.weather;
  const island = sim.island;
  const home = island.houseOf(res.id);

  // --- night: go home and sleep
  const bedtime = 22 + (res.t.energy - 0.5) * 2;
  if (hour >= bedtime || hour < 6 || n.energy < 12) {
    if (home) {
      const wake = 6.5 + rand(0, 1.5);
      let minutes = hour >= 12 ? (24 - hour + wake) * 60 : (wake - hour) * 60;
      if (n.energy < 12 && hour > 6 && hour < bedtime) minutes = 120;
      res.setPlan([
        { kind: 'walk', x: home.door[0], z: home.door[1] },
        { kind: 'call', fn: () => res.say(line('sleepy'), { emoji: '💤', sound: false }) },
        { kind: 'enter', loc: `home:${res.id}`, minutes: Math.max(30, minutes), onExit: () => { n.energy = 100; } },
      ]);
      res.sleeping = true;
      return;
    }
  }
  res.sleeping = false;

  // --- badly hurt or sick: clinic
  const severe = d.injuries.some((i) => !i.treated && (INJURIES[i.type]?.severity ?? 1) >= 2);
  if (severe && sim.locations.clinic && chance(0.8)) {
    const c = sim.locations.clinic;
    res.setPlan([
      { kind: 'call', fn: () => res.say(line('hurt'), { emoji: '🏥' }) },
      { kind: 'walk', x: c.door[0], z: c.door[1] },
      { kind: 'enter', loc: 'clinic', minutes: rand(60, 120), onExit: () => sim.clinicTreat(res) },
    ]);
    return;
  }

  // --- hungry: café
  if (n.hunger < 35) {
    const c = sim.locations.cafe;
    const seat = !w.raining && chance(0.4) ? island.freeSeat('cafe') : null;
    if (seat) {
      res.setPlan([
        { kind: 'walk', x: seat.x, z: seat.z },
        { kind: 'sit', seat, dur: rand(25, 40), anim: 'eat', expr: { happy: 0.6 } },
        { kind: 'call', fn: () => { n.hunger = clamp(n.hunger + 70, 0, 100); res.emote('😋', 2); } },
      ]);
    } else {
      res.setPlan([
        { kind: 'walk', x: c.door[0], z: c.door[1] },
        { kind: 'enter', loc: 'cafe', minutes: rand(30, 50), onExit: () => { n.hunger = 100; n.social = clamp(n.social + 10, 0, 100); } },
      ]);
    }
    return;
  }

  // --- caught in rain without umbrella
  if ((w.raining || w.snowing) && !d.hasUmbrella) {
    const p = w.stormy ? 0.85 : 0.55 + w.p.rain * 0.3 - res.t.quirk * 0.4;
    if (chance(p) && home) {
      res.setPlan([
        { kind: 'call', fn: () => res.say(line(w.snowing ? 'snow' : w.stormy ? 'storm' : 'soaked'), { emoji: w.snowing ? '❄️' : '💦' }) },
        { kind: 'walk', x: home.door[0], z: home.door[1], run: true },
        { kind: 'enter', loc: `home:${res.id}`, minutes: rand(60, 150) },
      ]);
      return;
    }
    // quirky ones dance in the rain
    if (res.t.quirk > 0.6 && chance(0.4)) {
      res.setPlan([{ kind: 'anim', anim: 'dance', dur: rand(8, 14), expr: { happy: 1 }, say: line('rain'), emoji: '☔' }]);
      return;
    }
  }

  // --- want company
  const lonely = n.social < 50 || chance(0.35 + res.t.sociability * 0.35);
  if (lonely && sim.social.trySocialize(res)) return;

  // --- grudge: maybe go looking for trouble
  if (sim.settings.conflict !== 'off') {
    for (const [oid, r] of Object.entries(d.relationships)) {
      if (r.grudge > 50 && res.t.temper > 0.55 && chance(0.04 + r.grudge / 800)) {
        const other = sim.byId(oid);
        if (other?.available && sim.dist(res, other) < 30) {
          sim.social.start(res, other, chance(0.5) ? 'argue' : 'insult');
          return;
        }
      }
    }
  }

  // --- fun stuff
  const choices = [
    ['wander', 3],
    ['bench', 2 + (1 - res.t.energy) * 2],
    ['beach', w.raining ? 0.3 : 2],
    ['sea', 1.2],
    ['dance', 1 + res.t.energy * 2 + res.t.quirk],
    ['exercise', res.t.energy * 2],
    ['shop', 0.8],
    ['cafeTerrace', w.raining ? 0 : 1],
    ['pier', 0.8],
    ['think', res.t.quirk + 0.3],
    ['snowman', w.snowCover > 0.35 && sim.snowmen.length < 4 ? 1.5 : 0],
    ['emote', sim.registry.emotes.size ? 1.5 : 0],
  ];
  const what = weightedPick(choices);
  const happyExpr = { happy: 0.5 + res.t.energy * 0.3 };
  switch (what) {
    case 'bench': {
      const seat = island.freeSeat(chance(0.5) ? 'park' : null);
      if (seat) {
        res.setPlan([
          { kind: 'walk', x: seat.x, z: seat.z },
          { kind: 'sit', seat, dur: rand(15, 35), expr: { relaxed: 0.6 } },
        ]);
        n.fun = clamp(n.fun + 6, 0, 100);
        return;
      }
      break;
    }
    case 'beach': {
      const seat = island.freeSeat('beach');
      const b = sim.locations.beach;
      if (seat) {
        res.setPlan([{ kind: 'walk', x: seat.x, z: seat.z }, { kind: 'sit', seat, dur: rand(20, 40), anim: 'sitGround', expr: { relaxed: 0.8 } }]);
      } else {
        const x = b.x + rand(-6, 6), z = b.z + rand(-1.5, 1.5);
        res.setPlan([{ kind: 'walk', x, z }, { kind: 'anim', anim: 'idleLook', dur: rand(8, 14), heading: 0, expr: { relaxed: 0.6 } }]);
      }
      n.fun = clamp(n.fun + 10, 0, 100);
      return;
    }
    case 'sea': {
      const spot = pick(island.lookouts);
      if (spot) {
        res.setPlan([{ kind: 'walk', x: spot.x, z: spot.z }, { kind: 'anim', anim: 'idleLook', dur: rand(8, 15), heading: spot.rot, expr: { relaxed: 0.5 } }]);
        return;
      }
      break;
    }
    case 'dance': {
      const s = sim.locations.stage;
      res.setPlan([
        { kind: 'walk', x: s.x + rand(-1.3, 1.3), z: s.z + rand(-0.6, 0.6) },
        { kind: 'anim', anim: 'dance', dur: rand(10, 18), heading: 0.3 + Math.PI, expr: { happy: 1 }, say: line('dance'), emoji: '🎵' },
      ]);
      n.fun = clamp(n.fun + 18, 0, 100);
      return;
    }
    case 'exercise': {
      const p = island.randomPoint(6, 20);
      res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'anim', anim: 'exercise', dur: rand(8, 14), expr: { happy: 0.4 }, emoji: '💪' }]);
      n.fun = clamp(n.fun + 8, 0, 100);
      return;
    }
    case 'shop': {
      const s = sim.locations.shop;
      res.setPlan([{ kind: 'walk', x: s.door[0], z: s.door[1] }, { kind: 'enter', loc: 'shop', minutes: rand(20, 40), onExit: () => { n.fun = clamp(n.fun + 15, 0, 100); } }]);
      return;
    }
    case 'cafeTerrace': {
      const seat = island.freeSeat('cafe');
      if (seat) {
        res.setPlan([{ kind: 'walk', x: seat.x, z: seat.z }, { kind: 'sit', seat, dur: rand(15, 30), anim: 'sit', expr: { relaxed: 0.5 } }]);
        return;
      }
      break;
    }
    case 'pier': {
      const p = sim.locations.pier;
      res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'anim', anim: 'idleLook', dur: rand(10, 18), heading: p.rotY, expr: { relaxed: 0.6 } }]);
      return;
    }
    case 'think': {
      res.setPlan([{ kind: 'anim', anim: 'think', dur: rand(5, 9), emoji: '💭' }]);
      return;
    }
    case 'snowman': {
      const p = island.randomPoint(8, 22);
      res.setPlan([
        { kind: 'walk', x: p.x, z: p.z },
        { kind: 'anim', anim: 'eatStand', dur: 6, say: line('snow'), emoji: '⛄', expr: happyExpr },
        { kind: 'call', fn: () => sim.buildSnowman(res, p.x + 0.8, p.z) },
      ]);
      return;
    }
    case 'emote': {
      const id = sim.registry.randomEmote();
      if (id) {
        res.setPlan([{ kind: 'anim', anim: id, dur: Math.max(4, sim.registry.custom.get(id)?.duration || 4), expr: happyExpr }]);
        return;
      }
      break;
    }
    default:
      break;
  }
  const p = island.randomPoint(3, 36);
  res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'wait', dur: rand(2, 6), anim: chance(0.4) ? 'idleLook' : 'idle' }]);
}
