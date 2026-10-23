// Jobs. Residents with a job go to work during their shift (except on their
// day off), earn wages for the island, get promoted, bond with coworkers,
// and their work gives perks to everyone else.

import { chance, clamp, pick, rand } from '../core/util.js';

export const JOBS = {
  none: { label: 'Unemployed', icon: '🛋️', desc: 'Free as a bird.' },
  barista: {
    label: 'Barista', icon: '☕', place: 'cafe', indoor: true, start: 8, end: 16, wage: 6,
    titles: ['Trainee Barista', 'Barista', 'Senior Barista', 'Café Manager'], anims: ['eatStand', 'talk', 'idle'],
    serve: 'Here\'s your {food}, {b}! ☕', fit: { sociability: 1, kindness: 0.6 },
    perk: 'Café visitors get extra happiness and make friends with the barista.',
  },
  clerk: {
    label: 'Shop Clerk', icon: '🛍️', place: 'shop', indoor: true, start: 10, end: 18, wage: 5,
    titles: ['Stock Helper', 'Shop Clerk', 'Fashion Advisor', 'Store Manager'], anims: ['idle', 'talk', 'idleLook'],
    serve: 'That looks great on you, {b}!', fit: { sociability: 0.8, quirk: 0.4 },
    perk: '10% off everything in the shop while on duty.',
  },
  doctor: {
    label: 'Doctor', icon: '🩺', place: 'clinic', indoor: true, start: 9, end: 17, wage: 9,
    titles: ['Intern', 'Nurse', 'Doctor', 'Chief of Medicine'], anims: ['think', 'talk', 'idle'],
    serve: 'Let\'s have a look at you, {b}.', fit: { kindness: 1, confidence: 0.5, energy: -0.3 },
    perk: 'Clinic visits heal far more while a doctor is in.',
  },
  gardener: {
    label: 'Gardener', icon: '🌷', place: 'park', start: 7, end: 13, wage: 4,
    titles: ['Weed Puller', 'Gardener', 'Head Gardener', 'Island Botanist'], anims: ['eatStand', 'think', 'exercise'],
    fit: { kindness: 0.5, sociability: -0.5, energy: 0.3 }, rainOff: true,
    perk: 'Residents relaxing in the park have more fun.',
  },
  fisher: {
    label: 'Fisher', icon: '🎣', place: 'pier', start: 5, end: 11, wage: 4,
    titles: ['Bait Boy', 'Fisher', 'Master Angler', 'Legend of the Sea'], anims: ['idleLook', 'think', 'sitGround'],
    fit: { energy: -0.6, sociability: -0.6, quirk: 0.3 },
    perk: 'Brings fresh fish home to your inventory.',
  },
  performer: {
    label: 'Performer', icon: '🎤', place: 'stage', start: 16, end: 21, wage: 6,
    titles: ['Street Performer', 'Performer', 'Star', 'Island Idol'], anims: ['dance', 'cheer', 'wave'],
    fit: { energy: 0.8, sociability: 0.7, confidence: 0.6 }, rainOff: true,
    perk: 'Everyone watching the show has fun.',
  },
  lifeguard: {
    label: 'Lifeguard', icon: '🛟', place: 'beach', start: 10, end: 17, wage: 5,
    titles: ['Trainee Lifeguard', 'Lifeguard', 'Head Lifeguard', 'Beach Captain'], anims: ['idleLook', 'exercise', 'point'],
    fit: { energy: 0.7, confidence: 0.6 }, rainOff: true,
    perk: 'Watches the swimmers and rescues anyone in trouble at once. Swimmers are safer and the beach is more fun.',
  },
  poolguard: {
    label: 'Pool Lifeguard', icon: '🏊', place: 'condoPool', indoor: true, start: 9, end: 20, wage: 5, needs: 'condo',
    titles: ['Pool Helper', 'Pool Lifeguard', 'Aquatics Lead', 'Aquatics Director'], anims: ['idleLook', 'point', 'idle'],
    fit: { energy: 0.6, confidence: 0.6, kindness: 0.3 },
    serve: 'Walk, don\'t run, {b}!',
    perk: 'Watches the condo\'s indoor pool and rescues anyone in trouble.',
  },
  mail: {
    label: 'Mail Carrier', icon: '📮', place: 'route', start: 8, end: 12, wage: 5,
    titles: ['Paper Kid', 'Mail Carrier', 'Postmaster', 'Island Postmaster General'], anims: ['wave'],
    fit: { energy: 0.6, sociability: 0.5 },
    perk: 'Delivers letters that bring residents closer.',
  },
};

export const JOB_IDS = Object.keys(JOBS).filter((k) => k !== 'none');
const XP_PER_LEVEL = 10 * 60; // working minutes for the first promotion; each next one takes longer

export function jobOf(res) {
  return res.d.job && JOBS[res.d.job.id] && res.d.job.id !== 'none' ? JOBS[res.d.job.id] : null;
}

export function jobTitle(res) {
  const j = jobOf(res);
  if (!j) return 'Unemployed';
  return j.titles[Math.min(j.titles.length - 1, res.d.job.level || 0)];
}

export function jobWage(res) {
  const j = jobOf(res);
  return j ? j.wage * (1 + (res.d.job.level || 0) * 0.35) : 0;
}

/** 0..1 how well the job suits the resident's personality. */
export function jobFit(job, traits) {
  if (!job?.fit) return 0.5;
  let s = 0;
  let w = 0;
  for (const [k, weight] of Object.entries(job.fit)) {
    const v = traits[k] ?? 0.5;
    s += (weight >= 0 ? v : 1 - v) * Math.abs(weight);
    w += Math.abs(weight);
  }
  return w ? s / w : 0.5;
}

export function isWorkDay(res, sim) {
  return res.d.job?.dayOff === undefined || sim.day % 7 !== res.d.job.dayOff;
}

export function isOnShift(res, sim) {
  const j = jobOf(res);
  if (!j || !isWorkDay(res, sim)) return false;
  if (j.needs === 'condo' && !sim.condo?.active) return false;
  const h = sim.minuteOfDay / 60;
  if (j.rainOff && (sim.weather.raining || sim.weather.snowing)) return false;
  return h >= j.start && h < j.end;
}

export function assignJob(sim, res, id) {
  const prev = jobOf(res);
  if (!id || id === 'none') {
    res.d.job = null;
    res.working = false;
    if (prev) sim.news(`${res.name} quit their job as a ${prev.label}.`, '💼');
    return;
  }
  res.d.job = { id, level: 0, xp: 0, earned: 0, dayOff: Math.floor(rand(0, 7)), since: sim.day };
  sim.news(`${res.name} started working as a ${JOBS[id].label}! ${JOBS[id].icon}`, '💼');
  res.addMemory(`Got a job as a ${JOBS[id].label}`);
}

/** Is someone working at this place right now? (for perks) */
export function onDuty(sim, jobId) {
  return sim.residents.some((r) => r.d.job?.id === jobId && r.working && isOnShift(r, sim));
}

/** Per game-minute bookkeeping: wages, promotions, perks, job satisfaction. */
export function updateJobs(sim, min) {
  for (const r of sim.residents) {
    const j = jobOf(r);
    if (!j) { r.working = false; if (r.activity === 'work') r.activity = null; continue; }
    if (!isOnShift(r, sim)) { r.working = false; if (r.activity === 'work') r.activity = null; }
    if (!r.working) continue;
    const job = r.d.job;
    const pay = (jobWage(r) / 60) * min;
    sim.money += pay;
    job.earned = (job.earned || 0) + pay;
    job.xp = (job.xp || 0) + min;
    r.d.needs.energy = clamp(r.d.needs.energy - min * 0.02, 0, 100);
    r.d.needs.social = clamp(r.d.needs.social + min * 0.03, 0, 100);
    // liking the job
    const fit = jobFit(j, r.t);
    r.d.happiness = clamp(r.d.happiness + (fit - 0.45) * 0.02 * min, 0, 100);
    if (fit < 0.3 && chance(0.0006 * min)) sim.problems.offer(r, 'quitJob', {});
    // promotion
    if (job.xp >= XP_PER_LEVEL * ((job.level + 1) ** 1.6) && job.level < j.titles.length - 1) {
      job.level++;
      sim.news(`${r.name} got promoted to ${j.titles[job.level]}! ${j.icon}`, '🎉');
      sim.gainXp(r, 40);
      r.setEmotion('happy', 240);
      if (!r.engaged) r.say(`I got promoted! ${j.icon}`, { emoji: '🎉' });
      if (sim.isNear(r)) sim.audio.levelUp();
    }
    // coworkers bond
    for (const o of sim.residents) {
      if (o !== r && o.working && o.d.job?.id === r.d.job.id && chance(0.02 * min)) { r.changeRel(o.id, 1); }
    }
  }
  // perks
  if (onDuty(sim, 'performer')) {
    const st = sim.locations.stage;
    for (const r of sim.residents) if (!r.inside && Math.hypot(r.x - st.x, r.z - st.z) < 12 && r.d.job?.id !== 'performer') r.d.needs.fun = clamp(r.d.needs.fun + 0.3 * min, 0, 100);
  }
  if (onDuty(sim, 'gardener')) {
    const p = sim.locations.park;
    for (const r of sim.residents) if (!r.inside && Math.hypot(r.x - p.x, r.z - p.z) < 10) r.d.needs.fun = clamp(r.d.needs.fun + 0.15 * min, 0, 100);
  }
  if (onDuty(sim, 'lifeguard')) {
    const b = sim.locations.beach;
    for (const r of sim.residents) if (!r.inside && Math.hypot(r.x - b.x, r.z - b.z) < 12) r.d.needs.fun = clamp(r.d.needs.fun + 0.15 * min, 0, 100);
  }
}

/** Outdoor shift plans (indoor jobs are handled by the room brain). Returns true if a plan was set. */
export function planOutdoorWork(res, sim) {
  const j = jobOf(res);
  const island = sim.island;
  const loc = sim.locations;
  const work = (x, z, heading, minutes, after, via = []) => {
    const anim = pick(j.anims);
    res.setPlan([
      ...via.map((p) => ({ kind: 'walk', x: p.x, z: p.z })),
      { kind: 'walk', x, z },
      { kind: 'call', fn: () => { res.working = true; } },
      { kind: 'anim', anim, dur: minutes, heading, expr: { happy: 0.3 } },
      { kind: 'call', fn: () => after?.() },
    ]);
  };
  switch (res.d.job.id) {
    case 'gardener': {
      const p = island.randomPoint(2, 7);
      const x = loc.park.x + rand(-5, 5), z = loc.park.z + rand(-5, 5);
      work(island.isBlocked(x, z, 0.4) ? p.x : x, island.isBlocked(x, z, 0.4) ? p.z : z, undefined, rand(15, 30), () => { res.emote('🌷', 2); });
      return true;
    }
    case 'fisher': {
      work(loc.pier.x, loc.pier.z, loc.pier.rotY, rand(20, 40), () => {
        if (chance(0.45)) {
          sim.inventory.fish = (sim.inventory.fish || 0) + 1;
          sim.emit('inventory');
          res.say('Caught a fish! 🐟', { emoji: '🎣' });
          if (chance(0.3)) sim.news(`${res.name} caught a fish at the pier. It's in your inventory! 🐟`, '🎣');
        }
      });
      return true;
    }
    case 'performer': {
      const spot = island.stageSpot();
      res.setPlan([
        { kind: 'walk', x: spot.entry[0], z: spot.entry[1] },
        { kind: 'walk', x: spot.x, z: spot.z },
        { kind: 'call', fn: () => { res.working = true; res.say(sim.dialogue.fill('♪ {song} ♪', { a: res }), { emoji: '🎤' }); } },
        { kind: 'anim', anim: chance(0.7) ? 'dance' : 'cheer', dur: rand(15, 30), heading: spot.heading, expr: { happy: 1 } },
      ]);
      return true;
    }
    case 'lifeguard': {
      // mostly at the tower watching the water, sometimes patrolling the shore
      const post = island.lifeguardPost;
      const swimmers = sim.residents.filter((r) => r.inWater && !r.inside);
      if (post && (chance(0.65) || swimmers.length)) {
        res.setPlan([
          { kind: 'walk', x: post.x, z: post.z },
          { kind: 'call', fn: () => { res.working = true; } },
          { kind: 'anim', anim: swimmers.length && chance(0.4) ? 'point' : 'idleLook', dur: rand(12, 25), heading: post.rot, expr: { happy: 0.2 } },
        ]);
      } else {
        const p = island.shorePoint();
        work(p.x, p.z - 0.5, 0, rand(10, 20));
      }
      return true;
    }
    case 'mail': {
      const houses = island.houses.filter((h) => h.owner && h.owner !== res.id && h.door);
      // the condo gets one mailbox stop for all its residents
      const condoFolks = sim.residents.filter((r) => r !== res && sim.condo.unitOf(r.id) != null);
      if (condoFolks.length) houses.push({ owner: pick(condoFolks).id, door: loc.condo.door });
      if (!houses.length) return false;
      const h = pick(houses);
      res.setPlan([
        { kind: 'walk', x: h.door[0], z: h.door[1] },
        { kind: 'call', fn: () => {
          res.working = true;
          const to = sim.byId(h.owner);
          const from = pick(sim.residents.filter((x) => x !== to)) || res;
          res.say(`📮 Letter for ${to?.name || 'you'}!`, { emoji: '✉️' });
          if (to && from && from !== to) { to.changeRel(from.id, 3); from.changeRel(to.id, 1); }
          res.changeRel(h.owner, 1);
        } },
        { kind: 'anim', anim: 'wave', dur: 2.5 },
      ]);
      return true;
    }
    default:
      return false;
  }
}
