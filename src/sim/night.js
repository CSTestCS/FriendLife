// Night mischief: now and then someone sneaks out after bedtime for something
// a little naughty — a midnight dip in their underwear, an underwear dare run
// round the fountain, raiding the closed café, moonlight dancing on the stage
// in pajamas, a secret campfire or stargazing in sleepwear. They usually
// bring a close friend. Getting caught is the risk: a close friend just
// tags along, anyone else scolds them and sends them home red-faced, and an
// officer on duty hands out a curfew fine.

import { chance, clamp, pick, rand } from '../core/util.js';
import { backToBed } from './brain.js';
import { isUnderwear, setOutfitPurpose } from './outfits.js';
import { jobOf, isOnShift } from './jobs.js';

export const MISCHIEF = {
  dip: { label: 'a midnight dip', icon: '🌊', strip: true, say: ['Last one in is a rotten egg! 🌊', 'The water\'s warm at night, I swear!', 'Shh! Nobody will know~'] },
  onsen: { label: 'an after-hours soak in the hot spring', icon: '♨️', strip: true, needs: 'onsen', say: ['Hot spring\'s all ours tonight ♨️', 'Shhh, it\'s technically closed...'] },
  dare: { label: 'an underwear dare run', icon: '🏃', strip: true, say: ['I dare you to run round the fountain like this!', 'Three laps! GO GO GO! 😂', 'This was a terrible idea! Hahaha!'] },
  raid: { label: 'a midnight snack raid on the café', icon: '🍰', say: ['The café\'s cake is calling to us...', 'Quiet! Grab the cake and run!', 'Midnight snacks taste better stolen 🍰'] },
  moondance: { label: 'moonlight dancing on the stage', icon: '🌙', say: ['Dance with me under the moon! 🌙', 'Nobody\'s watching... probably!', 'Pajama party on the stage!'] },
  campfire: { label: 'a secret campfire', icon: '🔥', needs: 'campfire', say: ['Spooky stories by the fire... 👻', 'Pass the marshmallows~', 'Shh, someone might see the fire!'] },
  stars: { label: 'sneaking out to stargaze', icon: '🌠', needs: 'lookout', say: ['Make a wish! 🌠', 'Look how many stars...', 'Pajamas and starlight~'] },
};

const CAUGHT_FRIEND = ['Ooh, sneaking out? I\'m in! 😆', 'You\'re not leaving me out of this!', 'Wait for meee!'];
const CAUGHT_SCOLD = ['What are you DOING out here?! In THAT?!', 'Do you know what time it is?! Go to bed!', 'Have you lost your mind?! Put some clothes on!', 'I\'m telling everyone about this tomorrow.'];
const CAUGHT_EMBARRASSED = ['W-we were just... going! 😳', 'This isn\'t what it looks like!', 'Please don\'t tell anyone!!'];

export class NightLife {
  constructor(sim) {
    this.sim = sim;
    this.outings = [];
    this.tonight = -1; // night (day number) of the last outing
  }

  get enabled() { return this.sim.settings.nightMischief !== false; }

  /** Per game minute. */
  update(min) {
    const sim = this.sim;
    const hour = sim.minuteOfDay / 60;
    const late = hour >= 23.5 || hour < 3;
    this.outings = this.outings.filter((o) => !o.done);
    for (const o of this.outings) this.watch(o, min);
    if (!this.enabled || !late || this.outings.length) return;
    const night = hour < 12 ? sim.day - 1 : sim.day;
    if (this.tonight === night) return; // one outing a night at most
    for (const r of sim.residents) {
      if (!r.sleeping || r.inside !== r.homeKey || r.engaged || r.ko || r.d.injuries.length || (jobOf(r) && isOnShift(r, sim))) continue;
      const urge = (r.t.quirk * 0.6 + r.t.energy * 0.4 + (1 - r.t.kindness) * 0.2) * (r.d.needs.fun < 50 ? 1.6 : 1);
      if (chance(0.0009 * urge * min)) { this.tonight = night; this.start(r); break; }
    }
  }

  /** Someone sneaks out. Returns the outing. */
  start(leader, kind = null) {
    const sim = this.sim;
    const open = (k) => !MISCHIEF[k].needs || sim.economy.isOpen(MISCHIEF[k].needs);
    kind ||= pick(Object.keys(MISCHIEF).filter(open));
    const def = MISCHIEF[kind];
    const o = { kind, def, leader, crew: [leader], caught: false, done: false, at: sim.clock, checked: 0 };
    this.outings.push(o);
    // bring a close friend along (they're woken with a "psst")
    const buddy = sim.residents.filter((f) => f !== leader && f.sleeping && f.inside === f.homeKey && !f.engaged && leader.relScore(f.id) > 60 && f.t.quirk + f.t.energy > 0.6)
      .sort((a, b) => leader.relScore(b.id) - leader.relScore(a.id))[0];
    if (buddy && chance(leader.relScore(buddy.id) > 80 ? 1 : 0.7)) o.crew.push(buddy);
    for (const r of o.crew) this.sneakOut(r, o);
    return o;
  }

  sneakOut(r, o) {
    const sim = this.sim;
    r.sleeping = false;
    r.bedtimeDone = false;
    r.nightOut = { kind: o.kind };
    r.wakeAt = Infinity;
    r.say(r === o.leader ? pick(['*sneaks out of bed*', 'Psst... time for some fun 😈', '*tiptoes to the door*']) : pick(['*yawn* ...okay, I\'m up! 😆', 'You woke me for THIS? ...I\'m in.']), { emoji: '🌙', sound: false });
    // they go as they are (sleepwear!) — or strip right down for a dip / dare
    if (o.def.strip) {
      const u = (r.d.outfits || []).findIndex((x, i) => isUnderwear(r, i));
      if (u >= 0 && u !== r.d.wearing) sim.changeOutfit(r, u, { quiet: true, purpose: 'mischief', force: true });
      else setOutfitPurpose(r, r.d.wearing ?? -1, 'mischief');
    } else setOutfitPurpose(r, r.d.wearing ?? -1, 'mischief');
    r.headOut(() => this.plan(r, o));
  }

  /** The plan once outside (also picked up again by think() if interrupted). */
  plan(r, o) {
    const sim = this.sim;
    const L = sim.locations;
    if (o.done || o.caught) return backToBed(r, sim);
    const n = r.d.needs;
    const say = () => pick(o.def.say);
    const finish = { kind: 'call', fn: () => this.finish(r, o) };
    switch (o.kind) {
      case 'dip': {
        const shore = sim.island.shorePoint();
        r.setPlan([{ kind: 'walk', x: shore.x, z: shore.z, run: true }, { kind: 'call', fn: () => { r.say(say(), { emoji: '🌊' }); r.activity = 'swim'; } },
          { kind: 'walk', x: shore.x, z: shore.z + 1.2 }, { kind: 'anim', anim: 'laugh', dur: 6, emoji: '💦' },
          { kind: 'call', fn: () => { r.d.wetness = 1; r.d.swimWet = true; r.avatar?.setWetness(1); r.activity = null; } }, finish]);
        break;
      }
      case 'onsen': {
        const sp = (L.onsen?.spots || []).find((s) => !s.occupant) || L.onsen?.spots?.[0];
        if (!sp) { this.finish(r, o); return; }
        r.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'call', fn: () => { r.activity = 'swim'; } },
          { kind: 'sit', seat: sp, dur: rand(20, 30), anim: 'sitGround', say: say(), emoji: '♨️', expr: { relaxed: 1, happy: 0.5 },
            then: () => { r.d.wetness = 1; r.d.swimWet = true; r.avatar?.setWetness(1); r.activity = null; } }, finish]);
        break;
      }
      case 'dare': {
        const pts = [0, 1, 2, 3, 4].map((i) => ({ kind: 'walk', x: Math.cos(i * 1.6) * 7.5, z: Math.sin(i * 1.6) * 7.5, run: true }));
        r.setPlan([{ kind: 'call', fn: () => r.say(say(), { emoji: '🏃' }) }, ...pts, { kind: 'anim', anim: 'laugh', dur: 4, emoji: '🤣' }, finish]);
        break;
      }
      case 'raid': {
        const c = L.cafe;
        r.setPlan([{ kind: 'walk', x: c.door[0], z: c.door[1] }, { kind: 'call', fn: () => r.say(say(), { emoji: '🍰' }) },
          { kind: 'anim', anim: 'eatStand', dur: 8, emoji: '🍰' }, { kind: 'call', fn: () => { n.hunger = clamp(n.hunger + 30, 0, 100); } }, finish]);
        break;
      }
      case 'moondance': {
        const sp = sim.island.stageSpot();
        r.setPlan([{ kind: 'walk', x: sp.entry[0], z: sp.entry[1] }, { kind: 'walk', x: sp.x, z: sp.z },
          { kind: 'anim', anim: 'dance', dur: rand(12, 18), heading: sp.heading, say: say(), emoji: '🌙', expr: { happy: 1 } }, finish]);
        break;
      }
      case 'campfire': case 'stars': {
        const loc = o.kind === 'campfire' ? L.campfire : L.lookout;
        const sp = (loc?.spots || []).find((s) => !s.occupant);
        if (!sp) { this.finish(r, o); return; }
        r.setPlan([{ kind: 'walk', x: sp.x, z: sp.z }, { kind: 'sit', seat: sp, dur: rand(20, 30), anim: 'sitGround', say: say(), emoji: o.def.icon, expr: { relaxed: 0.8, happy: 0.6 } }, finish]);
        break;
      }
      default:
        this.finish(r, o);
    }
  }

  /** Called from think() when a mischief-maker has nothing planned (interrupted / done). */
  think(r) {
    const o = this.outings.find((x) => x.crew.includes(r));
    if (!o || o.done || o.caught || this.sim.clock - o.at > 150) { r.nightOut = null; backToBed(r, this.sim); return true; }
    this.plan(r, o);
    return true;
  }

  finish(r, o) {
    const sim = this.sim;
    r.d.needs.fun = clamp(r.d.needs.fun + 30, 0, 100);
    if (!o.caught) {
      for (const f of o.crew) if (f !== r) { r.changeRel(f.id, 6); }
      if (!o.reported) {
        o.reported = true;
        const names = o.crew.map((x) => x.name).join(' and ');
        r.addMemory(`Snuck out at night for ${o.def.label}${o.crew.length > 1 ? ` with ${o.crew.filter((x) => x !== r).map((x) => x.name).join(', ')}` : ''} 😈`);
        sim.news(`🌙 Psst... ${names} snuck out for ${o.def.label} last night. Nobody caught them! ${o.def.icon}`, '🌙');
        sim.progress?.add(5, 'mischief');
      }
    }
    r.say(pick(['Best. Night. Ever. 😆', 'Back to bed before anyone notices...', '*sneaks back in*']), { emoji: '😴', sound: false });
    r.nightOut = null;
    if (o.crew.every((x) => !x.nightOut)) o.done = true;
    backToBed(r, sim);
  }

  /** Each minute of an outing: maybe a neighbour wakes up to the noise, or an officer walks by. */
  watch(o, min) {
    const sim = this.sim;
    if (o.caught || o.done) return;
    const out = o.crew.filter((r) => r.nightOut && !r.inside);
    if (!out.length) return;
    // someone awake nearby?
    for (const r of out) {
      const near = sim.residents.find((x) => !o.crew.includes(x) && !x.inside && !x.sleeping && !x.engaged && !x.ko && sim.dist(x, r) < 8);
      if (near) { this.caughtBy(o, near); return; }
    }
    // the noise wakes someone up
    o.checked += min;
    if (!o.waking && o.checked > 6 && chance(0.012 * min * (o.kind === 'dare' || o.kind === 'moondance' ? 2 : 1))) {
      const sleepers = sim.residents.filter((x) => !o.crew.includes(x) && x.sleeping && x.inside === x.homeKey && !x.engaged);
      if (!sleepers.length) return;
      // close friends of the crew are the light sleepers, apparently
      const w = pick(sleepers);
      o.waking = w;
      w.sleeping = false;
      w.bedtimeDone = false;
      w.nightOut = { kind: 'investigate' };
      w.say(pick(['Hm? What\'s that noise...?', '*grumble* Who\'s out there?!', 'Is someone... outside?']), { emoji: '👀', sound: false });
      const target = out[0];
      w.headOut(() => {
        w.setPlan([{ kind: 'walk', x: target.x + rand(-1.5, 1.5), z: target.z + rand(-1.5, 1.5), run: true }, { kind: 'call', fn: () => { if (!o.caught && !o.done) this.caughtBy(o, w); else { w.nightOut = null; backToBed(w, sim); } } }]);
      });
    }
  }

  caughtBy(o, x) {
    const sim = this.sim;
    const crew = o.crew.filter((r) => r.nightOut);
    if (!crew.length) return;
    x.faceTo(crew[0].x, crew[0].z);
    const friend = crew.every((r) => x.relScore(r.id) > 60 || r.rel(x.id).partner);
    const officer = x.working && x.d.job?.id === 'police';
    if (friend && !officer) {
      // close friends don't tell — they join in
      x.say(pick(CAUGHT_FRIEND), { emoji: '😆' });
      for (const r of crew) { r.say(pick(['Yesss, get over here! 😆', 'Shh! Come on!']), { emoji: '🤫' }); r.changeRel(x.id, 4); }
      o.crew.push(x);
      o.waking = null;
      x.clearPlan();
      x.sleeping = false;
      x.nightOut = { kind: o.kind };
      setOutfitPurpose(x, x.d.wearing ?? -1, 'mischief');
      this.plan(x, o);
      return;
    }
    o.caught = true;
    if (officer) {
      x.say(pick(['Curfew! Back to bed, all of you! 👮', 'Out in your pajamas at this hour? That\'s a fine.']), { emoji: '👮' });
      const fine = sim.economy.spend(15 * crew.length, 'curfew fines');
      sim.news(`👮 Officer ${x.name} caught ${crew.map((r) => r.name).join(' and ')} out after curfew (${o.def.label}). Fine: ${fine} 🪙`, '👮');
    } else {
      x.say(pick(CAUGHT_SCOLD), { emoji: '😤' });
      sim.news(`😳 ${x.name} caught ${crew.map((r) => r.name).join(' and ')} sneaking out for ${o.def.label}... in their sleepwear!`, '😳');
      x.addMemory(`Caught ${crew.map((r) => r.name).join(' and ')} sneaking out at night`);
    }
    for (const r of crew) {
      setTimeout(() => { if (sim.residents.includes(r)) r.say(pick(CAUGHT_EMBARRASSED), { emoji: '😳' }); }, 1500);
      r.setEmotion('shy', 60);
      r.d.happiness = clamp(r.d.happiness - 6, 0, 100);
      r.changeRel(x.id, -3);
      x.changeRel(r.id, -2);
      r.addMemory(`Got caught sneaking out at night by ${x.name} 😳`);
      r.nightOut = null;
      setTimeout(() => { if (sim.residents.includes(r)) backToBed(r, sim); }, 2500);
    }
    x.nightOut = null;
    setTimeout(() => { if (sim.residents.includes(x) && !x.inside) backToBed(x, sim); }, 3500);
    o.done = true;
  }

  serialize() { return { tonight: this.tonight }; }
  restore(d) { this.tonight = d?.tonight ?? -1; }
}
