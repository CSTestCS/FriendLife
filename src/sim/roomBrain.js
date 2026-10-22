// What residents do while inside a room instance.
import { chance, clamp, rand, weightedPick } from '../core/util.js';
import { isOnShift, JOBS } from './jobs.js';

export function thinkIndoors(res, sim, room) {
  if (res.plan.length || res.step || res.engaged || res.ko || res.moving) return;
  const n = res.d.needs;
  const hour = sim.minuteOfDay / 60;
  const others = sim.residents.filter((o) => o !== res && o.inside === res.inside && !o.engaged && !o.ko);

  // working: stand at the job spot and do the job
  const job = res.d.job && JOBS[res.d.job.id];
  if (job?.place === room.kind && isOnShift(res, sim)) {
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
  if (others.length && n.social < 75 && chance(0.35) && !res.seat?.type?.match(/bed|work/)) {
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
      if (res.sleeping || (isHome && (hour >= 22.5 || hour < 6))) {
        if (go(room.freeSpot('bed'), rand(60, 120), { expr: { relaxed: 1 }, then: () => { n.energy = clamp(n.energy + 30, 0, 100); } })) return;
        if (go(room.freeSpot('sofa'), rand(40, 80), { anim: 'sleep', expr: { relaxed: 1 } })) return;
      }
      const choice = weightedPick([
        ['sofa', 3], ['table', n.hunger < 60 ? 4 : 0.5], ['kitchen', n.hunger < 50 ? 3 : 0.7], ['books', 1 + res.t.quirk],
        ['closet', res.d.outfits?.length ? 1 : 0.3], ['floor', 0.8], ['stand', 0.6],
      ]);
      const spot = room.freeSpot(choice) || room.freeSpot('sofa') || room.freeSpot();
      if (!spot) break;
      const after = {
        table: () => { n.hunger = clamp(n.hunger + 40, 0, 100); res.emote('😋', 2); },
        kitchen: () => res.emote(chance(0.5) ? '🍳' : '🥘', 2),
        books: () => { n.fun = clamp(n.fun + 10, 0, 100); res.emote('📖', 2); },
        closet: () => { if (res.d.outfits?.length && chance(0.5)) sim.changeOutfit(res, Math.floor(rand(-1, res.d.outfits.length))); },
        sofa: () => { n.energy = clamp(n.energy + 6, 0, 100); },
      }[spot.type];
      go(spot, rand(10, 25), { then: after, expr: spot.type === 'sofa' ? { relaxed: 0.7 } : { happy: 0.3 } });
      return;
    }
    case 'cafe': {
      if (chance(0.35) && go(room.freeSpot('order'), rand(3, 6), { say: sim.dialogue.fill('One {food}, please!', { a: res }) })) return;
      if (go(room.freeSpot('table'), rand(12, 25), { expr: { happy: 0.6 }, then: () => { n.hunger = clamp(n.hunger + 35, 0, 100); n.social = clamp(n.social + 8, 0, 100); } })) return;
      break;
    }
    case 'shop': {
      if (chance(0.25) && go(room.freeSpot('order'), rand(3, 6), { say: 'I\'ll take this one!' })) return;
      if (chance(0.25) && go(room.freeSpot('mirror'), rand(4, 8), { emoji: '🪞' })) return;
      if (go(room.freeSpot('browse'), rand(6, 14), { then: () => { n.fun = clamp(n.fun + 6, 0, 100); } })) return;
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
