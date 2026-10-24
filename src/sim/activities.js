// Daytime things to do at the venues (court, playground, picnic lawn, hot
// spring, campfire, lookout, food truck) and around the island (jogging,
// kites, selfies, yoga, sandcastles, people-watching).

import { chance, clamp, pick, rand } from '../core/util.js';

const free = (loc) => (loc?.spots || []).filter((s) => !s.occupant);
const spotOf = (loc, type) => { const l = free(loc).filter((s) => !type || s.type === type); return l.length ? pick(l) : null; };

/** Weights for the day choices (0 = not possible right now). */
export function activityChoices(res, sim) {
  const L = sim.locations;
  const eco = sim.economy;
  const open = (k) => L[k] && eco.isOpen(k) && !L[k].locked;
  const w = sim.weather;
  const hour = sim.minuteOfDay / 60;
  const dry = !w.raining && !w.snowing;
  const t = res.t;
  const broke = sim.money < 0;
  return [
    ['hoops', open('court') && dry ? 1 + t.energy * 2 : 0],
    ['playground', open('playground') && dry ? 0.6 + t.quirk * 1.5 : 0],
    ['picnic', open('picnic') && dry && hour > 10 && hour < 18 ? 0.8 + t.sociability : 0],
    ['onsen', open('onsen') && !broke ? (w.snowing ? 3 : w.raining ? 1.2 : 0.8) + (1 - t.energy) : 0],
    ['campfire', open('campfire') && dry && hour >= 18 && hour < 22.5 ? 1.5 + t.sociability : 0],
    ['lookout', open('lookout') && (hour >= 17 && hour < 22.5 ? 1.6 : 0.5) + t.quirk * 0.5],
    ['snack', open('foodtruck') && !broke && res.d.needs.hunger < 70 ? 1.2 : 0],
    ['jog', dry && hour < 20 ? t.energy * 1.4 : 0],
    ['kite', dry && w.wind > 0.3 && hour < 19 ? 0.8 + t.quirk : 0],
    ['selfie', 0.5 + t.quirk * 0.8],
    ['yoga', dry && hour < 12 ? 0.5 + (1 - t.temper) : 0],
    ['sandcastle', dry && hour < 19 ? 0.4 + t.quirk : 0],
    ['peoplewatch', 0.6 + (1 - t.sociability) * 0.6],
  ];
}

/** Plan one of the activities above. Returns true if planned. */
export function planActivity(res, sim, what) {
  const L = sim.locations;
  const n = res.d.needs;
  const island = sim.island;
  const fun = (v) => () => { n.fun = clamp(n.fun + v, 0, 100); };
  switch (what) {
    case 'hoops': {
      const sp = spotOf(L.court, 'shoot');
      if (!sp) return false;
      res.setPlan([
        { kind: 'walk', x: sp.x, z: sp.z },
        { kind: 'sit', seat: sp, dur: rand(10, 18), anim: 'exercise', say: pick(['Swish! 🏀', 'Nothing but net!', 'Airball... 😅', 'Watch this shot!', 'Three-pointer!']), emoji: '🏀', expr: { happy: 0.6 } },
        { kind: 'call', fn: () => { fun(14)(); n.energy = clamp(n.energy - 6, 0, 100); if (chance(0.3)) res.say(pick(['Good game!', 'I\'m getting better!', 'Phew, I\'m beat.']), { emoji: '💦' }); } },
      ]);
      res.activity = 'exercise';
      return true;
    }
    case 'playground': {
      const sp = spotOf(L.playground);
      if (!sp) return false;
      const anim = sp.type === 'swing' ? 'sit' : sp.type === 'sand' ? 'sitGround' : sp.type === 'slide' ? 'cheer' : 'laugh';
      const say = { swing: ['Wheee! Higher!', 'I feel like a kid again!'], slide: ['Wheeeee! 🛝', 'One more time!'], seesaw: ['Up and down~', 'You\'re too heavy! Haha'], sand: ['Building a sand fortress!', '*digs happily*'] }[sp.type] || ['Fun!'];
      res.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur: rand(10, 20), anim, say: pick(say), emoji: '🛝', expr: { happy: 0.9 }, then: fun(16) }]);
      return true;
    }
    case 'picnic': {
      const seat = island.freeSeat('picnic') || spotOf(L.picnic, 'blanket');
      if (!seat) return false;
      res.setPlan([
        { kind: 'walk', x: seat.x, z: seat.z },
        { kind: 'sit', seat, dur: rand(20, 35), anim: seat.area ? 'eat' : 'sitGround', say: pick(['Perfect day for a picnic! 🧺', 'Sandwiches taste better outside.', 'Mmm, so peaceful here.']), emoji: '🧺', expr: { relaxed: 0.8, happy: 0.5 },
          then: () => { n.hunger = clamp(n.hunger + 30, 0, 100); fun(12)(); sim.economy.living(res, 'snack'); } },
      ]);
      // invite a friend along
      const f = sim.residents.find((o) => o !== res && !o.inside && !o.engaged && !o.plan.length && res.relScore(o.id) > 30 && sim.dist(o, res) < 25);
      if (f && chance(0.5)) {
        const s2 = island.freeSeat('picnic');
        if (s2) { f.setPlan([{ kind: 'walk', x: s2.x, z: s2.z }, { kind: 'sit', seat: s2, dur: rand(20, 35), anim: 'eat', expr: { happy: 0.6 }, then: () => { f.changeRel(res.id, 4); res.changeRel(f.id, 4); } }]); res.say(`${f.name}, picnic with me?`, { emoji: '🧺' }); }
      }
      return true;
    }
    case 'onsen': {
      const go = () => {
        const sp = spotOf(L.onsen, 'soak');
        if (!sp) return;
        res.setPlan([
          { kind: 'walk', x: sp.x, z: sp.z },
          { kind: 'call', fn: () => { res.activity = 'swim'; sim.economy.living(res, 'onsen'); } },
          { kind: 'sit', seat: sp, dur: rand(25, 45), anim: 'sitGround', say: pick(['Ahhh... ♨️ this is the life.', 'So warm~', 'My muscles are melting...']), emoji: '♨️', expr: { relaxed: 1 },
            then: () => { res.d.wetness = 1; res.d.swimWet = true; res.avatar?.setWetness(1); fun(14)(); n.energy = clamp(n.energy + 15, 0, 100); res.d.injuries.forEach((i) => { i.remaining *= 0.85; }); } },
          { kind: 'call', fn: () => { res.activity = null; } },
        ]);
      };
      // swimwear (from the wardrobe) for the bath
      if (!sim.dressFirst(res, 'swim', go)) go();
      return true;
    }
    case 'campfire': {
      const sp = spotOf(L.campfire, 'fire');
      if (!sp) return false;
      res.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur: rand(20, 40), anim: 'sitGround', emoji: '🔥', expr: { relaxed: 0.7, happy: 0.5 },
        say: pick(['Who wants a marshmallow? 🍡', 'Let me tell you a scary story...', 'The fire is so cozy.', '*hums a camp song*']), then: () => { fun(14)(); n.social = clamp(n.social + 10, 0, 100); } }]);
      return true;
    }
    case 'lookout': {
      const sp = spotOf(L.lookout);
      if (!sp) return false;
      const night = (sim.stage?.light?.night ?? 0) > 0.4;
      res.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur: rand(15, 30), anim: sp.type === 'scope' ? 'point' : 'sitGround', emoji: night ? '🌌' : '🔭',
        say: night ? pick(['Look, a shooting star! 🌠', 'I can see Saturn\'s rings!', 'The stars are so bright tonight.']) : pick(['What a view!', 'I can see a ship out there!', 'The sea goes on forever...']), expr: { relaxed: 0.7 }, then: fun(10) }]);
      return true;
    }
    case 'snack': {
      const sp = spotOf(L.foodtruck, 'order');
      if (!sp) return false;
      res.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur: rand(4, 7), anim: 'eatStand', say: pick(['One taco, please! 🌮', 'Fries and a soda!', 'Whatever smells best!']), emoji: '🌮',
        then: () => { sim.economy.living(res, 'snack'); n.hunger = clamp(n.hunger + 35, 0, 100); res.emote('😋', 2); } }]);
      return true;
    }
    case 'jog': {
      // a lap along the coast path
      const pts = [];
      const a0 = rand(0, Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const a = a0 + i * 0.45;
        const p = { x: Math.cos(a) * 34, z: Math.sin(a) * 34 };
        if (!island.isBlocked(p.x, p.z, 0.8)) pts.push(p);
      }
      if (!pts.length) return false;
      res.setPlan([
        { kind: 'call', fn: () => { res.activity = 'exercise'; if (chance(0.4)) res.say(pick(['Time for a jog!', 'Feel the burn!', 'Just one more lap...']), { emoji: '🏃' }); } },
        ...pts.map((p) => ({ kind: 'walk', x: p.x, z: p.z, run: true })),
        { kind: 'anim', anim: 'stretch', dur: 3, emoji: '💦' },
        { kind: 'call', fn: () => { res.activity = null; fun(8)(); n.energy = clamp(n.energy - 8, 0, 100); } },
      ]);
      return true;
    }
    case 'kite': {
      const b = L.beach;
      const x = b.x + rand(-8, 8), z = b.z - rand(1, 3);
      res.setPlan([{ kind: 'walk', x, z }, { kind: 'anim', anim: 'point', dur: rand(10, 16), heading: 0, say: pick(['Go, kite, go! 🪁', 'It\'s flying so high!', 'Don\'t get tangled...']), emoji: '🪁', expr: { happy: 0.8 } }, { kind: 'call', fn: fun(12) }]);
      return true;
    }
    case 'selfie': {
      const spots = [L.fountain, L.stage, L.pier, L.beach, L.lookout, L.onsen].filter((l) => l && !l.locked);
      const l = pick(spots.length ? spots : [L.plaza]);
      const x = l.x + rand(-2, 2), z = l.z + rand(-2, 2);
      res.setPlan([{ kind: 'walk', x, z }, { kind: 'anim', anim: 'wave', dur: 4, say: pick(['Selfie time! 📸', 'Say cheese~', '#IslandLife ✨', 'Gotta get my good side.']), emoji: '📸', expr: { happy: 1 } }, { kind: 'call', fn: fun(6) }]);
      return true;
    }
    case 'yoga': {
      const b = L.beach;
      const x = b.x + rand(-6, 6), z = b.z - rand(2, 4);
      res.setPlan([
        { kind: 'walk', x, z },
        { kind: 'call', fn: () => { res.activity = 'exercise'; } },
        { kind: 'anim', anim: 'stretch', dur: rand(10, 16), heading: 0, say: pick(['Breathe in... breathe out...', 'Sun salutation~ 🧘', 'Namaste.']), emoji: '🧘', expr: { relaxed: 1 } },
        { kind: 'call', fn: () => { res.activity = null; fun(8)(); res.d.happiness = clamp(res.d.happiness + 3, 0, 100); } },
      ]);
      return true;
    }
    case 'sandcastle': {
      const b = L.beach;
      const x = b.x + rand(-8, 8), z = b.z + rand(-1, 1);
      res.setPlan([{ kind: 'walk', x, z }, { kind: 'anim', anim: 'sitGround', dur: rand(14, 22), say: pick(['The greatest sandcastle ever built! 🏰', 'Needs a moat...', 'Don\'t let the waves get it!']), emoji: '🏰', expr: { happy: 0.7 } }, { kind: 'call', fn: fun(12) }]);
      return true;
    }
    case 'peoplewatch': {
      const seat = island.freeSeat('plaza') || island.freeSeat();
      if (!seat) return false;
      res.setPlan([{ kind: 'walk', x: seat.x, z: seat.z }, { kind: 'sit', seat, dur: rand(15, 30), expr: { relaxed: 0.6 }, say: pick(['I love watching everyone go by.', 'Hmm, who\'s that with...?', '*sips coffee*']), emoji: '👀', then: fun(5) }]);
      return true;
    }
    default:
      return false;
  }
}
