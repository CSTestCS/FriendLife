// Autonomous behaviour: when a resident has nothing planned, pick the next
// thing to do based on time of day, needs, injuries, weather and mood.

import { chance, clamp, pick, rand, weightedPick } from '../core/util.js';
import { line, INJURIES } from './data.js';
import { jobOf, isOnShift, planOutdoorWork } from './jobs.js';
import { causeMishap } from './outfits.js';
import { residentPerks } from './progress.js';
import { activityChoices, planActivity } from './activities.js';

function swimWeight(res, sim) {
  const w = sim.weather;
  const hour = sim.minuteOfDay / 60;
  if (!sim.swim.canSwim(res) || w.stormy || w.snowing || hour < 7 || hour > 20) return 0;
  let wt = (w.raining ? 0.2 : w.type === 'sunny' ? 2.2 : 1) * (0.6 + res.t.energy);
  if (sim.swim.guardOnDuty('beach', sim.island)) wt *= 1.5; // people feel safer with a lifeguard watching
  if (res.d.outfits?.some((o) => o.tags?.includes('swim')) || res.d.mainOutfit?.tags?.includes('swim')) wt *= 1.4;
  return wt;
}

/** Is it this resident's bedtime? (night owls stay up a bit later) */
export function isBedtime(res, sim) {
  const hour = sim.minuteOfDay / 60;
  const bedtime = 22 + (res.t.energy - 0.5) * 2;
  return hour >= bedtime || hour < 6;
}

/** Minutes of sleep from now until their alarm. */
export function sleepMinutes(res, sim) {
  const hour = sim.minuteOfDay / 60;
  const wake = 6.5 + rand(0, 1.5);
  let minutes = hour >= 12 ? (24 - hour + wake) * 60 : (wake - hour) * 60;
  if (res.d.needs.energy < 12 && hour > 6 && hour < 21) minutes = 120;
  return Math.max(30, minutes);
}

/**
 * Already at home when it gets late: stay in and go to bed (bedtime routine,
 * sleepwear and all) instead of heading out into the night.
 */
export function bedtimeAtHome(res, sim) {
  const minutes = sleepMinutes(res, sim);
  res.sleeping = true;
  res.bedtimeDone = false;
  res.wakeAt = sim.clock + minutes;
  res.insideUntil = sim.clock + minutes + 45;
  res.leaving = false;
  res.route = null;
  res.activity = null;
}

/** Caught out at night in sleepwear: no point getting dressed, just go back to bed. */
export function backToBed(res, sim) {
  if (res.inside === res.homeKey) { res.clearPlan(); bedtimeAtHome(res, sim); return true; }
  const door = sim.locationDoor(res.homeKey, res);
  if (!door) return false;
  const go = () => {
    const d = sim.locationDoor(res.homeKey, res) || door;
    res.clearPlan();
    res.setPlan([
      { kind: 'walk', x: d[0], z: d[1], run: true },
      // once they're through the door, the apartment puts them to bed (see thinkIndoors)
      { kind: 'enter', loc: res.homeKey, minutes: 600 },
    ]);
  };
  if (res.inside) res.headOut(go); else go();
  res.nightOut = null;
  return true;
}

const INTENT_LABELS = {"wander": "Going for a wander", "bench": "Sitting on a bench", "beach": "Relaxing at the beach", "swim": "Going swimming", "sea": "Looking out at the sea", "dance": "Dancing on the stage", "exercise": "Exercising", "shop": "Going shopping", "cafeTerrace": "Sitting at the café terrace", "pier": "Hanging out on the pier", "think": "Lost in thought", "snowman": "Building a snowman", "emote": "Busting a move", "visit": "Visiting a friend", "home": "Heading home", "pool": "Going to the condo pool", "hallway": "Hanging out in the hallway", "party": "Throwing a party", "class": "Going to class", "hoops": "Shooting hoops", "playground": "Playing at the playground", "picnic": "Having a picnic", "onsen": "Soaking in the hot spring", "campfire": "Sitting by the campfire", "lookout": "Going to the stargazing lookout", "snack": "Grabbing a snack", "jog": "Going for a jog", "kite": "Flying a kite", "selfie": "Taking selfies", "yoga": "Doing yoga", "sandcastle": "Building a sandcastle", "peoplewatch": "People-watching"};
const INTENT_ICONS = {"swim": "🏊", "dance": "💃", "exercise": "💪", "shop": "🛍️", "beach": "🏖️", "hoops": "🏀", "playground": "🛝", "picnic": "🧺", "onsen": "♨️", "campfire": "🔥", "lookout": "🔭", "snack": "🌮", "jog": "🏃", "kite": "🪁", "selfie": "📸", "yoga": "🧘", "sandcastle": "🏰", "party": "🎉", "class": "📚", "visit": "🚪", "home": "🏠", "pool": "🏊", "pier": "🎣"};

export function think(res, sim) {
  if (res.plan.length || res.step || res.engaged || res.inside || res.ko || res.moving) return;
  // pick up what they were doing before being interrupted
  if (res.suspended && res.resumePlan()) return;
  // on the way to the wardrobe but got side-tracked: carry on home
  if (res.errand?.kind === 'dress') {
    const door = sim.locationDoor(res.homeKey, res);
    if (door) {
      res.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: res.homeKey, minutes: 20, onExit: res.errand.after }]);
      return;
    }
    res.errand = null;
  }
  if (res.activity && res.activity !== 'work' && !res.inWater) res.activity = null;
  const hour = sim.minuteOfDay / 60;
  const d = res.d;
  const n = d.needs;
  const w = sim.weather;
  const island = sim.island;
  const home = sim.homeOf(res);

  const onClock = !!jobOf(res) && isOnShift(res, sim);
  // --- night: go home and sleep (not while on the clock — early shifts start before dawn)
  if (!onClock && (isBedtime(res, sim) || n.energy < 12) && !res.nightOut) {
    if (home) {
      res.setIntent('Going home to sleep', '💤');
      const minutes = sleepMinutes(res, sim);
      res.setPlan([
        { kind: 'walk', x: home.door[0], z: home.door[1] },
        { kind: 'call', fn: () => res.say(line('sleepy'), { emoji: '💤', sound: false }) },
        // + time for the morning routine (it ends the stay early when it's done)
        { kind: 'enter', loc: `home:${res.id}`, minutes: minutes + 45, onExit: () => { n.energy = 100; } },
        { kind: 'call', fn: () => { res.wakeAt = sim.clock + minutes; } },
      ]);
      res.sleeping = true;
      res.bedtimeDone = false;
      res.wakeAt = sim.clock + 1e6; // set properly once they're inside
      return;
    }
  }
  res.sleeping = false;
  // --- out at night (sneaking out for mischief): see night.js
  if (res.nightOut && sim.night?.think(res)) return;

  // --- badly hurt or sick: clinic
  const severe = d.injuries.some((i) => !i.treated && (INJURIES[i.type]?.severity ?? 1) >= 2);
  if (severe && sim.locations.clinic && chance(0.8)) {
    res.setIntent('Going to the clinic to get patched up', '🏥');
    const c = sim.locations.clinic;
    res.setPlan([
      { kind: 'call', fn: () => res.say(line('hurt'), { emoji: '🏥' }) },
      { kind: 'walk', x: c.door[0], z: c.door[1] },
      { kind: 'enter', loc: 'clinic', minutes: rand(60, 120), onExit: () => sim.clinicTreat(res) },
    ]);
    return;
  }

  // --- work shift
  // on the clock means working — snacks and breaks happen at work
  const job = jobOf(res);
  if (job && onClock) {
    res.setIntent(`Heading to work`, '💼');
    // work clothes come from the wardrobe at home (once per shift)
    if (res.workDressDay !== sim.day) {
      res.workDressDay = sim.day;
      if (sim.dressFirst(res, 'work', null)) return;
    }
    if (job.indoor) {
      const door = sim.locationDoor(job.place, res);
      const minutes = Math.max(20, job.end * 60 - sim.minuteOfDay);
      if (door) {
        res.setPlan([
          { kind: 'call', fn: () => { res.activity = 'work'; if (chance(0.3)) res.say(`Off to work! ${job.icon}`, { emoji: '💼' }); } },
          { kind: 'walk', x: door[0], z: door[1] },
          { kind: 'enter', loc: job.place, minutes, onExit: () => { res.activity = null; } },
        ]);
        return;
      }
    }
    if (!job.indoor && planOutdoorWork(res, sim)) {
      res.activity = 'work';
      return;
    }
  }

  // --- hungry: café
  if (n.hunger < 35) {
    res.setIntent('Getting something to eat', '🍽️');
    const c = sim.locations.cafe;
    const seat = !w.raining && chance(0.4) ? island.freeSeat('cafe') : null;
    if (seat) {
      res.setPlan([
        { kind: 'walk', x: seat.x, z: seat.z },
        { kind: 'sit', seat, dur: rand(25, 40), anim: 'eat', expr: { happy: 0.6 } },
        { kind: 'call', fn: () => { n.hunger = clamp(n.hunger + 70, 0, 100); res.emote('😋', 2); sim.economy.living(res, 'terrace'); if (chance(0.02)) causeMishap(sim, res, 'stain'); } },
      ]);
    } else {
      res.setPlan([
        { kind: 'walk', x: c.door[0], z: c.door[1] },
        { kind: 'enter', loc: 'cafe', minutes: rand(30, 50), onExit: () => { n.hunger = 100; n.social = clamp(n.social + 10, 0, 100); sim.economy.living(res, 'cafe'); } },
      ]);
    }
    return;
  }

  // --- caught in rain without umbrella
  if ((w.raining || w.snowing) && !d.hasUmbrella) {
    const p = w.stormy ? 0.85 : 0.55 + w.p.rain * 0.3 - res.t.quirk * 0.4;
    if (chance(p) && home) {
      res.setIntent('Getting out of the rain', '☔');
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
  if (lonely && sim.social.trySocialize(res)) { res.setIntent('Going to talk to someone', '💬'); return; }

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
    ['swim', swimWeight(res, sim)],
    ['sea', 1.2],
    ['dance', 1 + res.t.energy * 2 + res.t.quirk],
    ['exercise', res.t.energy * 2],
    ['shop', 0.8],
    ['cafeTerrace', w.raining ? 0 : 1],
    ['pier', 0.8],
    ['think', res.t.quirk + 0.3],
    ['snowman', w.snowCover > 0.35 && sim.snowmen.length < 4 ? 1.5 : 0],
    ['emote', sim.registry.emotes.size ? 1.5 : 0],
    ['visit', 1.5 + res.t.sociability],
    ['home', 0.5 + (1 - res.t.sociability) * 0.7],
    ['pool', sim.condo.active && sim.swim.canSwim(res) ? (w.raining || w.snowing ? 2 : 0.6) + (sim.condo.unitOf(res.id) != null ? 0.6 : 0) : 0],
    ['hallway', sim.condo.unitOf(res.id) != null ? 0.5 + res.t.sociability : 0],
    ['party', residentPerks(d.level).parties && home && hour >= 16 && hour < 21 && (d.lastParty ?? -1e9) < sim.clock - 24 * 60 ? 0.8 + res.t.sociability : 0],
    ['class', sim.residents.some((t) => t.working && t.d.job?.id === 'teacher' && !t.inside) ? 1.2 + res.t.quirk : 0],
    ...activityChoices(res, sim),
  ];
  const what = weightedPick(choices);
  res.setIntent(INTENT_LABELS[what] || 'Taking it easy', INTENT_ICONS[what] || '💭');
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
    case 'swim': {
      // swimwear first (from the wardrobe at home), then the beach
      if (!sim.dressFirst(res, 'swim', () => sim.swim.planSwim(res))) sim.swim.planSwim(res);
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
      if (sim.dressFirst(res, 'dance', null, 0.5)) return;
      const spot = island.stageSpot();
      res.setPlan([
        { kind: 'walk', x: spot.entry[0], z: spot.entry[1] },
        { kind: 'walk', x: spot.x, z: spot.z },
        { kind: 'call', fn: () => { res.activity = 'dance'; } },
        { kind: 'anim', anim: 'dance', dur: rand(10, 18), heading: spot.heading, expr: { happy: 1 }, say: line('dance'), emoji: '🎵' },
        { kind: 'call', fn: () => { res.activity = null; } },
      ]);
      n.fun = clamp(n.fun + 18, 0, 100);
      return;
    }
    case 'exercise': {
      if (sim.dressFirst(res, 'exercise', null, 0.5)) return;
      const p = island.randomPoint(6, 20);
      res.setPlan([
        { kind: 'walk', x: p.x, z: p.z },
        { kind: 'call', fn: () => { res.activity = 'exercise'; } },
        { kind: 'anim', anim: 'exercise', dur: rand(8, 14), expr: { happy: 0.4 }, emoji: '💪' },
        { kind: 'call', fn: () => { if (chance(0.02)) causeMishap(sim, res, 'seam'); res.activity = null; } },
      ]);
      n.fun = clamp(n.fun + 8, 0, 100);
      return;
    }
    case 'shop': {
      const s = sim.locations.shop;
      res.setPlan([{ kind: 'walk', x: s.door[0], z: s.door[1] }, { kind: 'enter', loc: 'shop', minutes: rand(20, 40), onExit: () => { n.fun = clamp(n.fun + 15, 0, 100); if (chance(0.5)) sim.economy.living(res, 'shop'); } }]);
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
    case 'visit': {
      // drop by a friend's place if they're home
      const friends = sim.residents.filter((o) => o !== res && o.inside === `home:${o.id}` && !o.sleeping && res.relScore(o.id) > 20);
      if (friends.length) {
        const f = friends[Math.floor(Math.random() * friends.length)];
        const h = sim.homeOf(f);
        if (h) {
          res.setPlan([
            { kind: 'walk', x: h.door[0], z: h.door[1] },
            { kind: 'call', fn: () => res.say(`Knock knock, ${f.name}!`, { emoji: '🚪' }) },
            { kind: 'enter', loc: `home:${f.id}`, minutes: rand(40, 90), onExit: () => { res.changeRel(f.id, 4); f.changeRel(res.id, 4); } },
          ]);
          return;
        }
      }
      break;
    }
    case 'home': {
      if (home) {
        res.setPlan([{ kind: 'walk', x: home.door[0], z: home.door[1] }, { kind: 'enter', loc: `home:${res.id}`, minutes: rand(40, 100) }]);
        return;
      }
      break;
    }
    case 'pool': {
      const door = sim.locationDoor('condoPool', res);
      if (door && sim.dressFirst(res, 'swim', () => { const d = sim.locationDoor('condoPool', res); if (d) res.setPlan([{ kind: 'walk', x: d[0], z: d[1] }, { kind: 'enter', loc: 'condoPool', minutes: rand(30, 60), onExit: () => { res.activity = null; } }]); })) return;
      if (door) {
        res.setPlan([
          { kind: 'call', fn: () => { if (chance(0.4)) res.say('Pool day! 🏊', { emoji: '🏊' }); } },
          { kind: 'walk', x: door[0], z: door[1] },
          { kind: 'enter', loc: 'condoPool', minutes: rand(30, 60), onExit: () => { res.activity = null; n.fun = clamp(n.fun + 15, 0, 100); } },
        ]);
        return;
      }
      break;
    }
    case 'hallway': {
      const unit = sim.condo.unitOf(res.id);
      const door = sim.locationDoor('condo', res);
      if (unit != null && door) {
        res.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: `hall:${sim.condo.floorOf(unit)}`, minutes: rand(15, 30), onExit: () => { n.social = clamp(n.social + 8, 0, 100); } }]);
        return;
      }
      break;
    }
    case 'party': {
      // level 5+: throw a house party and invite friends over
      d.lastParty = sim.clock;
      res.setPlan([
        { kind: 'call', fn: () => res.say('Party at my place! 🎉', { emoji: '🎉' }) },
        { kind: 'walk', x: home.door[0], z: home.door[1] },
        { kind: 'enter', loc: res.homeKey, minutes: rand(70, 110), onExit: () => { n.fun = clamp(n.fun + 25, 0, 100); } },
        { kind: 'call', fn: () => {
          const guests = sim.residents.filter((o) => o !== res && !o.inside && !o.engaged && !o.ko && !o.sleeping && res.relScore(o.id) > 10 && !(jobOf(o) && isOnShift(o, sim))).sort(() => Math.random() - 0.5).slice(0, 4);
          for (const g of guests) {
            const door = sim.locationDoor(res.homeKey, g);
            if (!door) continue;
            g.clearPlan();
            g.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: res.homeKey, minutes: rand(50, 90), onExit: () => { g.d.needs.fun = clamp(g.d.needs.fun + 25, 0, 100); g.d.needs.social = 100; g.changeRel(res.id, 6); } }]);
          }
          sim.news(`${res.name} is throwing a house party${guests.length ? ` with ${guests.map((g) => g.name).join(', ')}` : ''}! 🎉`, '🎉');
        } },
      ]);
      return;
    }
    case 'class': {
      // sit in on the teacher's class in the park
      const t = sim.residents.find((x) => x.working && x.d.job?.id === 'teacher' && !x.inside);
      if (t) {
        const a = Math.random() * Math.PI * 2;
        const x = t.x + Math.cos(a) * 2.2, z = t.z + Math.sin(a) * 2.2;
        res.setPlan([{ kind: 'walk', x, z }, { kind: 'anim', anim: chance(0.5) ? 'listen' : 'sitGround', dur: rand(15, 30), faceX: t.x, faceZ: t.z, emoji: '📚', expr: { happy: 0.4 } }]);
        return;
      }
      break;
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
      if (planActivity(res, sim, what)) return;
      break;
  }
  const p = island.randomPoint(3, 36);
  res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'wait', dur: rand(2, 6), anim: chance(0.4) ? 'idleLook' : 'idle' }]);
}
