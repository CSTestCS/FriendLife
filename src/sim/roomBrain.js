// What residents do while inside a room instance.
import { chance, clamp, rand, weightedPick } from '../core/util.js';
import { isOnShift, JOBS } from './jobs.js';
import { causeMishap } from './outfits.js';
import { pick } from '../core/util.js';

/**
 * Bedtime and morning routines at home.
 * Bedtime: brush teeth, change into sleepwear, maybe read, then bed.
 * Morning: wake up, stretch, get dressed (or forget to…), breakfast, head out.
 */
function routines(res, sim, room) {
  const n = res.d.needs;
  const spot = (type) => room.spots.find((x) => x.type === type && x.occupant === res.id) || room.freeSpot(type);
  // walk to a furniture spot and use it; if it's taken, do it on the spot
  const use = (type, dur, extra = {}) => {
    const sp = spot(type);
    if (sp) return [{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur, anim: sp.anim, ...extra }];
    return [{ kind: 'anim', anim: extra.anim || 'idle', dur, emoji: extra.emoji, say: extra.say, then: extra.then }];
  };

  // ---- an errand to the wardrobe (change for the weather, for work, swimwear…)
  if (res.errand?.kind === 'dress') {
    const e = res.errand;
    res.setPlan([
      ...use('closet', 3, { anim: 'dress', emoji: '👚', then: () => {
        res.errand = null;
        sim.dressAtWardrobe(res, { index: e.index, ctx: e.leave ? { outside: true, activity: e.activity } : {}, avoidEmbarrassing: e.avoidEmbarrassing });
        if (e.leave) {
          if (e.after) res.onExit = e.after;
          res.insideUntil = Math.min(res.insideUntil, sim.clock + 1);
        }
      } }),
    ]);
    return true;
  }

  // ---- bedtime
  if (res.sleeping && sim.clock < (res.wakeAt ?? Infinity) && !res.bedtimeDone) {
    res.bedtimeDone = true;
    const steps = [
      { kind: 'call', fn: () => res.say(pick(['Time to get ready for bed~', '*yawn* Bedtime...', 'What a day!']), { emoji: '🌙', sound: false }) },
      ...use('kitchen', rand(4, 6), { anim: 'brush', emoji: '🪥', say: '*brush brush*' }),
      ...use('closet', 3, { anim: 'dress', emoji: '👚', then: () => { res.activity = 'sleep'; sim.dressAtWardrobe(res, { ctx: { activity: 'sleep' } }); } }),
    ];
    if (res.t.quirk > 0.5 || chance(0.35)) steps.push(...use('books', rand(5, 9), { anim: 'think', emoji: '📖' }));
    steps.push({ kind: 'call', fn: () => { res.activity = 'sleep'; res.say(pick(['Good night!', 'Nighty night~', 'Zzz...']), { emoji: '💤', sound: false }); } });
    res.setPlan(steps);
    return true;
  }

  // ---- morning: wake up, then get ready (resumes if something interrupted it)
  const wake = res.sleeping && sim.clock >= (res.wakeAt ?? Infinity);
  if (wake || res.morningPending) {
    const groggy = n.energy < 55 || res.t.energy < 0.3;
    const steps = [];
    if (wake) {
      res.sleeping = false;
      res.bedtimeDone = false;
      res.wakeAt = null;
      res.morningPending = true;
      steps.push({ kind: 'anim', anim: groggy ? 'yawn' : 'stretch', dur: 3, say: pick(groggy ? ['*yaaawn*... five more minutes...', 'Mmh... morning already?'] : ['Good morning! ☀️', 'Rise and shine!', 'A brand new day!']), emoji: groggy ? '🥱' : '☀️' });
    }
    // only now and then does someone forget to change out of their sleepwear
    const forgets = wake && chance(0.012 + (groggy ? 0.02 : 0) + (res.t.quirk > 0.7 ? 0.012 : 0));
    steps.push(...use('closet', 3, { anim: 'dress', emoji: forgets ? '' : '👕', then: () => {
      res.morningPending = false;
      if (res.activity === 'sleep') res.activity = null;
      if (forgets) { causeMishap(sim, res, 'pajamas'); return; }
      sim.dressAtWardrobe(res, { ctx: { outside: true, activity: null } });
      if (chance(0.01)) causeMishap(sim, res, 'inside');
    } }));
    steps.push(...use('kitchen', rand(4, 7), { anim: 'eatStand', emoji: '🍳', then: () => { n.hunger = clamp(n.hunger + 30, 0, 100); } }));
    steps.push({ kind: 'call', fn: () => { res.insideUntil = Math.min(res.insideUntil, sim.clock + rand(2, 10)); } });
    res.setPlan(steps);
    return true;
  }
  return false;
}

/** In a hallway: stop for a chat with a neighbour now and then. */
function meetNeighbour(res, sim, others) {
  if (!others.length || sim.clock - (res.hallChatAt ?? -999) < 90 || !chance(0.45)) return false;
  res.hallChatAt = sim.clock;
  const o = others[Math.floor(Math.random() * others.length)];
  if (o.seat?.type === 'bed') return false;
  if (!o.d.relationships[res.id]?.met) res.say(`Oh, hi! You live on this floor too?`, { emoji: '👋' });
  const kind = sim.social.chooseKind(res, o) || 'chat';
  return !!sim.social.start(res, o, kind, { indoor: true });
}

export function thinkIndoors(res, sim, room) {
  if (res.plan.length || res.step || res.engaged || res.ko || res.moving) return;
  const n = res.d.needs;
  const hour = sim.minuteOfDay / 60;
  const others = sim.residents.filter((o) => o !== res && o.inside === res.inside && !o.engaged && !o.ko);
  const rooms = sim.rooms;

  // walking through nested rooms (condo lobby → hallway → apartment / pool)
  if (res.route) {
    const r = res.route;
    const i = r.keys.indexOf(res.inside);
    if (i >= 0) r.keys = r.keys.slice(i + 1);
    if (!r.keys.length) {
      res.route = null;
      res.leaving = false;
      res.insideUntil = sim.clock + r.minutes;
    } else if (rooms.parentOf(r.keys[0]) === res.inside) {
      if (room.kind === 'hall' && meetNeighbour(res, sim, others)) return;
      const next = r.keys[0];
      const d = rooms.doorIn(next);
      if (d) {
        res.setPlan([{ kind: 'walk', x: d.x, z: d.z }, { kind: 'call', fn: () => res.goInto(next) }]);
        return;
      }
      res.route = null;
    } else res.leaving = true;
  }
  if (res.leaving) {
    if (room.kind === 'hall' && meetNeighbour(res, sim, others)) return;
    const [ex, ez] = room.entry;
    res.setPlan([{ kind: 'walk', x: ex, z: ez }, { kind: 'call', fn: () => res.stepOut() }]);
    return;
  }

  // working: stand at the job spot and do the job
  const job = res.d.job && JOBS[res.d.job.id];
  if ((job?.place === room.kind || job?.place === room.key) && isOnShift(res, sim)) {
    const spot = room.spots.find((s) => s.type === 'work' && s.job === res.d.job.id && (!s.occupant || s.occupant === res.id));
    if (spot) {
      res.working = true;
      const anim = weightedPick(job.anims.map((a) => [a, 1]));
      if (res.seat !== spot) {
        res.setPlan([{ kind: 'walk', x: spot.x, z: spot.z }, { kind: 'sit', seat: spot, dur: rand(8, 16), anim, expr: { happy: 0.4 } }]);
      } else res.setPlan([{ kind: 'sit', seat: spot, dur: rand(8, 16), anim, expr: { happy: 0.4 } }]);
      // serve whoever is waiting at the counter
      const customer = others.find((o) => o.seat?.type === 'order');
      if (customer && chance(0.5)) res.say(sim.dialogue.fill(chance(0.5) ? job.serve : 'Thanks for coming, {b}!', { a: res, b: customer }), { emoji: job.icon });
      return;
    }
  }

  // visitors and housemates chat with each other
  if (others.length && n.social < 75 && chance(0.35) && !res.seat?.type?.match(/bed|work/) && !res.errand && !res.morningPending && !(res.sleeping && !res.bedtimeDone)) {
    const other = others[Math.floor(Math.random() * others.length)];
    if (!other.seat || other.seat.type !== 'bed') {
      const kind = sim.social.chooseKind(res, other) || 'chat';
      if (sim.social.start(res, other, kind, { indoor: true })) return;
    }
  }

  const go = (spot, dur, extra = {}) => {
    if (!spot) return false;
    res.setPlan([{ kind: 'walk', x: spot.x, z: spot.z }, { kind: 'sit', seat: spot, dur, anim: spot.anim, ...extra }]);
    return true;
  };

  switch (room.kind) {
    case 'home': {
      const isHome = res.inside === `home:${res.id}`;
      if (isHome && routines(res, sim, room)) return;
      if (res.sleeping || (isHome && (hour >= 22.5 || hour < 6))) {
        // sleep until the alarm (the morning routine starts right after)
        const nap = res.sleeping && Number.isFinite(res.wakeAt) ? clamp(res.wakeAt - sim.clock, 3, 120) : rand(60, 120);
        if (go(room.freeSpot('bed'), nap, { expr: { relaxed: 1 }, then: () => { n.energy = clamp(n.energy + nap / 4, 0, 100); } })) return;
        if (go(room.freeSpot('sofa'), rand(40, 80), { anim: 'sleep', expr: { relaxed: 1 } })) return;
      }
      const choice = weightedPick([
        ['sofa', 3], ['table', n.hunger < 60 ? 4 : 0.5], ['kitchen', n.hunger < 50 ? 3 : 0.7], ['books', 1 + res.t.quirk],
        ['closet', res.d.outfits?.length ? 1 : 0.3], ['floor', 0.8], ['stand', 0.6],
      ]);
      const spot = room.freeSpot(choice) || room.freeSpot('sofa') || room.freeSpot();
      if (!spot) break;
      const after = {
        table: () => { n.hunger = clamp(n.hunger + 40, 0, 100); res.emote('😋', 2); if (chance(0.015)) causeMishap(sim, res, 'stain'); },
        kitchen: () => res.emote(chance(0.5) ? '🍳' : '🥘', 2),
        books: () => { n.fun = clamp(n.fun + 10, 0, 100); res.emote('📖', 2); },
        closet: () => { sim.dressAtWardrobe(res, {}); },
        sofa: () => { n.energy = clamp(n.energy + 6, 0, 100); },
      }[spot.type];
      go(spot, rand(10, 25), { then: after, expr: spot.type === 'sofa' ? { relaxed: 0.7 } : { happy: 0.3 } });
      return;
    }
    case 'cafe': {
      if (chance(0.35) && go(room.freeSpot('order'), rand(3, 6), { say: sim.dialogue.fill('One {food}, please!', { a: res }) })) return;
      if (go(room.freeSpot('table'), rand(12, 25), { expr: { happy: 0.6 }, then: () => { n.hunger = clamp(n.hunger + 35, 0, 100); n.social = clamp(n.social + 8, 0, 100); if (chance(0.025)) causeMishap(sim, res, 'stain'); } })) return;
      break;
    }
    case 'shop': {
      if (chance(0.25) && go(room.freeSpot('order'), rand(3, 6), { say: 'I\'ll take this one!' })) return;
      if (chance(0.25) && go(room.freeSpot('mirror'), rand(4, 8), { emoji: '🪞' })) return;
      if (go(room.freeSpot('browse'), rand(6, 14), { then: () => { n.fun = clamp(n.fun + 6, 0, 100); } })) return;
      break;
    }
    case 'lobby': {
      const choice = weightedPick([['sofa', 3], ['mail', 1.5], ['wait', 1], ['stand', 1]]);
      const spot = room.freeSpot(choice) || room.freeSpot();
      if (spot && go(spot, rand(8, 20), { then: () => {
        if (spot.type === 'mail') { res.emote(chance(0.5) ? '✉️' : '📭', 2); if (chance(0.3)) n.social = clamp(n.social + 6, 0, 100); }
      } })) return;
      break;
    }
    case 'hall': {
      // neighbours hang around and chat; someone may look out of the window
      const spot = room.freeSpot(chance(0.6) ? 'chat' : chance(0.5) ? 'window' : 'bench') || room.freeSpot();
      if (spot && go(spot, rand(6, 14), { expr: { happy: 0.3 } })) return;
      break;
    }
    case 'pool': {
      if (res.d.job?.id !== 'poolguard' || !isOnShift(res, sim)) {
        const w = weightedPick([['swim', sim.swim.canSwim(res) ? 4 : 0], ['lounge', 2], ['edge', 1.5]]);
        if (w === 'swim') {
          if (!res.activity) res.activity = 'swim';
          sim.swim.planSwim(res);
          return;
        }
        if (go(room.freeSpot(w), rand(10, 25), { expr: { relaxed: 0.8 }, then: () => { n.fun = clamp(n.fun + 6, 0, 100); } })) return;
      }
      break;
    }
    case 'clinic': {
      if (res.d.injuries.length || res.hasEffect?.('sneeze')) {
        if (go(room.freeSpot('bed'), rand(20, 40), { expr: { sad: 0.4 } })) return;
        if (go(room.freeSpot('wait'), rand(8, 15), { expr: { sad: 0.3 } })) return;
      } else if (go(room.freeSpot('wait'), rand(8, 15))) return;
      break;
    }
    default:
      break;
  }
  const p = room.randomFloorPoint();
  res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'wait', dur: rand(3, 6), anim: chance(0.5) ? 'idleLook' : 'idle' }]);
}
