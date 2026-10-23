// Outfits: when residents wear which outfit, how an outfit is perceived (by
// the wearer and by everyone else), and wardrobe mishaps.
//
// Every outfit (and the resident's main look) can carry:
//   tags        – "wear automatically when…" conditions
//   perception  – { self: [trait…], others: [trait…] }
// When several outfits match the current situation, one is picked at random
// (and kept until the situation changes).

import { chance, clamp, pick, rand } from '../core/util.js';

/** Wear-automatically conditions, in the order they are checked (most specific first). */
export const OUTFIT_CONDITIONS = [
  ['swim', '🏊 Swimming'],
  ['sleep', '😴 Sleeping'],
  ['work', '💼 Working'],
  ['exercise', '🏃 Exercising'],
  ['party', '🎉 Dancing'],
  ['date', '💕 On a date'],
  ['visiting', '🚪 Visiting someone'],
  ['home', '🏠 At home'],
  ['snow', '❄️ Snow'],
  ['rain', '🌧️ Rain'],
  ['night', '🌙 Evening'],
  ['morning', '🌅 Morning'],
  ['sunny', '☀️ Sunny'],
  ['out', '🚶 Out and about'],
  ['default', '⭐ Everyday'],
];
export const OUTFIT_TAGS = OUTFIT_CONDITIONS;
/** Activity beats place beats weather/time beats "out" beats everyday. */
const CONDITION_TIERS = [
  ['swim', 'sleep', 'work', 'exercise', 'party', 'date'],
  ['visiting', 'home'],
  ['snow', 'rain', 'night', 'morning', 'sunny'],
  ['out'],
  ['default'],
];

/** How an outfit can be perceived. */
export const PERCEPTIONS = {
  cute: { icon: '🎀', label: 'Cute' },
  elegant: { icon: '💎', label: 'Elegant' },
  sexy: { icon: '🔥', label: 'Sexy' },
  cool: { icon: '😎', label: 'Cool' },
  powerful: { icon: '💪', label: 'Powerful' },
  comfortable: { icon: '🛋️', label: 'Comfortable' },
  sporty: { icon: '🏃', label: 'Sporty' },
  professional: { icon: '💼', label: 'Professional' },
  trendy: { icon: '✨', label: 'Trendy' },
  silly: { icon: '🤪', label: 'Silly' },
  scary: { icon: '👻', label: 'Scary' },
  sloppy: { icon: '🧦', label: 'Sloppy' },
  embarrassing: { icon: '😳', label: 'Embarrassing' },
};
const POSITIVE = new Set(['cute', 'elegant', 'sexy', 'cool', 'powerful', 'trendy', 'professional', 'comfortable', 'sporty']);

/** Settings record for an outfit index (-1 = main look). */
export function outfitMeta(res, idx) {
  if (idx < 0) {
    res.d.mainOutfit ||= { tags: [], perception: { self: [], others: [] } };
    return res.d.mainOutfit;
  }
  const o = res.d.outfits?.[idx];
  if (!o) return null;
  o.tags ||= [];
  o.perception ||= { self: [], others: [] };
  return o;
}

/** Which conditions are true for this resident right now (in priority order). */
/**
 * ctx lets the resident plan ahead at their wardrobe:
 *   { activity: 'swim' | 'work' | …, outside: true } = "what do I wear for that, once I'm out?"
 */
export function activeConditions(res, sim, ctx = {}) {
  const hour = sim.minuteOfDay / 60;
  const w = sim.weather;
  const act = ctx.activity !== undefined ? null : res.player?.action;
  const activity = ctx.activity !== undefined ? ctx.activity : res.activity;
  const inside = ctx.outside ? null : res.inside;
  const own = res.homeKey;
  const on = {
    swim: !!((ctx.activity === undefined && res.inWater) || activity === 'swim'),
    sleep: activity === 'sleep',
    work: !!((ctx.activity === undefined && res.working) || activity === 'work'),
    exercise: act === 'exercise' || activity === 'exercise',
    party: act === 'dance' || activity === 'dance',
    date: activity === 'date' || (ctx.activity === undefined && res.engaged?.kind === 'date'),
    visiting: !!inside && inside.startsWith('home:') && inside !== own,
    home: !!inside && inside === own,
    snow: !!w.snowing,
    rain: !!w.raining,
    night: hour >= 19 || hour < 5,
    morning: hour >= 5 && hour < 10,
    sunny: w.type === 'sunny' || w.type === 'partly',
    out: !inside,
  };
  return OUTFIT_CONDITIONS.map(([k]) => k).filter((k) => on[k]);
}

/**
 * Pick the outfit for the moment: the first condition that any outfit is
 * tagged with wins; several matching outfits → a random one (the current one
 * is kept if it still matches). Nothing matches → main look.
 */
export function preferredOutfit(res, sim, ctx = {}) {
  const n = res.d.outfits?.length || 0;
  if (!n) return -1;
  if (res.d.mishap?.type === 'pajamas') return res.d.wearing; // forgot to change…
  const all = [-1, ...Array.from({ length: n }, (_, i) => i)];
  const active = new Set([...activeConditions(res, sim, ctx), 'default']);
  // most specific tier first; within a tier every outfit that fits is a candidate
  for (const tier of CONDITION_TIERS) {
    const conds = tier.filter((c) => active.has(c));
    if (!conds.length) continue;
    const m = all.filter((i) => conds.some((c) => outfitMeta(res, i)?.tags?.includes(c)));
    if (!m.length) continue;
    if (m.includes(res.d.wearing)) return res.d.wearing;
    return pick(m);
  }
  return -1;
}

/** The perception of what the resident is wearing right now (incl. mishaps). */
export function wornPerception(res) {
  const meta = outfitMeta(res, res.d.wearing ?? -1) || {};
  const self = new Set(meta.perception?.self || []);
  const others = new Set(meta.perception?.others || []);
  const m = res.d.mishap;
  if (m) {
    self.add(m.owned ? 'cool' : 'embarrassing');
    others.add(m.type === 'pajamas' ? 'silly' : 'sloppy');
  }
  return { self, others };
}

const SELF_LINES = {
  embarrassing: ['Ugh... please don\'t look at me in this.', 'Why did I put this on...', 'I want to hide...'],
  sexy: ['Looking good, if I say so myself.', 'Heads are turning today~', 'Hot stuff coming through!'],
  elegant: ['Simply divine, darling.', 'One must always dress the part.', 'Elegance is a lifestyle.'],
  cute: ['I feel so cute today! ♡', 'Teehee~ so fluffy!', 'Cutest outfit ever!'],
  powerful: ['I feel UNSTOPPABLE!', 'Nobody messes with me in this.', 'Power outfit: ON.'],
  cool: ['Too cool for school.', 'Yeah. I look cool.', '*adjusts collar*'],
  comfortable: ['Sooo comfy...', 'I could live in this.', 'Comfort is everything.'],
  sporty: ['Ready to move!', 'Let\'s get those steps in!', 'Feeling athletic!'],
  professional: ['All business today.', 'Dressed for success.', 'Time to be productive.'],
  trendy: ['So in style right now.', 'Fashion icon, coming through!', 'Totally on trend.'],
  silly: ['Hehe, I look ridiculous!', 'Who cares, it\'s fun!', 'Honk honk!'],
  scary: ['Fear me! Mwahaha!', 'Boo!', 'Spooky season is every season.'],
  sloppy: ['Eh, whatever.', 'Didn\'t feel like dressing up.', 'Who even irons anymore?'],
};
const SELF_EMOTION = { embarrassing: 'shy', sexy: 'smug', elegant: 'smug', cute: 'happy', powerful: 'smug', cool: 'smug', comfortable: 'happy', silly: 'happy', trendy: 'happy', scary: 'smug' };

/** Happiness target shift from how the wearer feels in their outfit (used by sim.perMinute). */
export function selfMoodShift(res) {
  const { self } = wornPerception(res);
  let s = 0;
  for (const t of self) s += t === 'embarrassing' ? -10 : t === 'sloppy' ? -2 : POSITIVE.has(t) || t === 'silly' ? 3 : 0;
  return clamp(s, -14, 10);
}

/** Damage multiplier in fights (feeling powerful hits harder; feeling embarrassed doesn't). */
export function fightPowerMul(res) {
  const { self } = wornPerception(res);
  return (self.has('powerful') ? 1.18 : 1) * (self.has('embarrassing') ? 0.9 : 1);
}

/** How b's outfit changes what a decides to do with them (social weights). */
export function outfitSocialBias(a, b) {
  const { others } = wornPerception(b);
  const bias = { compliment: 1, insult: 1, joke: 1, argue: 1, confess: 1, prank: 1 };
  for (const t of others) {
    if (['cute', 'elegant', 'cool', 'trendy', 'sexy'].includes(t)) bias.compliment += 0.8;
    if (t === 'sexy') bias.confess += 0.6;
    if (t === 'embarrassing' || t === 'sloppy') { bias.insult += 0.8; bias.joke += 0.6; bias.prank += 0.4; bias.compliment *= 0.6; }
    if (t === 'silly') bias.joke += 1;
    if (t === 'powerful' || t === 'scary') { bias.argue *= 0.5; bias.insult *= 0.5; bias.prank *= 0.5; }
    if (t === 'professional') bias.prank *= 0.6;
  }
  return bias;
}

const REACT = {
  sexy: { say: ['W-wow... you look... wow.', 'Is it hot out here or is it just you?', 'Whoa, look at you!'], emoji: '😳', anim: 'shy', rel: 2, mood: 'shy', crush: true },
  elegant: { say: ['So elegant! 💎', 'You look like royalty!', 'Fancy! Where are you off to?'], emoji: '😍', anim: 'cheer', rel: 2 },
  cute: { say: ['Aww, that\'s so cute!', 'Adorable outfit!', 'Cuuuute! ♡'], emoji: '🥰', anim: 'cheer', rel: 2 },
  cool: { say: ['Nice fit!', 'Lookin\' cool!', 'Okay, that\'s a vibe.'], emoji: '😎', anim: 'wave', rel: 2 },
  trendy: { say: ['So stylish!', 'Where did you get that?!', 'Fashion icon!'], emoji: '✨', anim: 'cheer', rel: 2 },
  powerful: { say: ['Y-yikes, you look tough...', 'I wouldn\'t mess with you today.', 'Strong look!'], emoji: '😨', anim: 'shocked', rel: 0, mood: 'scared' },
  comfortable: { say: ['That looks so comfy!', 'I want one too!', 'Cozy vibes.'], emoji: '😌', anim: 'idle', rel: 1 },
  sporty: { say: ['Going for a run?', 'Sporty look!', 'Ready for the gym?'], emoji: '👍', anim: 'wave', rel: 1 },
  professional: { say: ['Very professional.', 'Big meeting today?', 'Looking sharp!'], emoji: '👔', anim: 'idle', rel: 1 },
  silly: { say: ['Pfft, hahaha!', 'What IS that?!', 'You look hilarious!'], emoji: '🤣', anim: 'laugh', rel: 1, fun: 8 },
  scary: { say: ['AAH! Oh, it\'s just you.', 'Spooky!', 'You scared me!'], emoji: '😱', anim: 'shocked', rel: 0, mood: 'scared' },
  sloppy: { say: ['Did you sleep in that?', 'Um... rough day?', 'Your clothes...'], emoji: '😬', anim: 'idle', rel: -1 },
  embarrassing: { say: ['Pfft! What are you WEARING?', 'Oh no... oh no no no.', 'Hahaha! Nice outfit... not!'], emoji: '🤭', anim: 'laugh', rel: -2, tease: true },
};

/**
 * Residents notice what others wear. Called every game minute.
 * The wearer's own feelings and other people's reactions can disagree, which
 * is where the fun is (they think it's sexy, everyone thinks it's embarrassing).
 */
export function updateOutfitPerception(sim, min) {
  for (const r of sim.residents) {
    if (r.engaged || r.ko || !r.avatar || (r.inside && !r.room) || r.sleeping) continue;
    const { self, others } = wornPerception(r);
    // the wearer's own feelings now and then
    if (self.size && chance(0.004 * min)) {
      const t = pick([...self]);
      if (SELF_LINES[t]) r.say(pick(SELF_LINES[t]), { emoji: PERCEPTIONS[t]?.icon });
      if (SELF_EMOTION[t]) r.setEmotion(SELF_EMOTION[t], 25);
    }
    if (!others.size || !chance(0.012 * min)) continue;
    // someone nearby reacts
    const obs = sim.residents.filter((o) => o !== r && !o.engaged && !o.ko && !o.sleeping && (o.inside || null) === (r.inside || null) && sim.dist(o, r) < 7);
    if (!obs.length) continue;
    const o = pick(obs);
    const t = pick([...others]);
    const re = REACT[t];
    if (!re) continue;
    reactTo(sim, o, r, t, re, self);
  }
}

function reactTo(sim, o, r, t, re, self) {
  o.faceTo(r.x, r.z);
  if (!o.plan.length && !o.moving) o.setPlan([{ kind: 'anim', anim: re.anim, dur: 2.2, faceX: r.x, faceZ: r.z }]);
  o.say(pick(re.say), { emoji: re.emoji });
  o.changeRel(r.id, re.rel);
  if (re.fun) o.d.needs.fun = clamp(o.d.needs.fun + re.fun, 0, 100);
  if (re.mood) o.setEmotion(re.mood, 15);
  if (re.crush && sim.settings.romance && o.relScore(r.id) > 25) sim.social.maybeCrush(o, r);
  const proud = [...self].some((s) => POSITIVE.has(s));
  setTimeout(() => {
    if (!sim.residents.includes(r) || r.engaged) return;
    if (re.tease || t === 'sloppy') {
      if (proud) {
        // they love it, others laugh: hurt feelings
        r.say(pick(['Hey! I think it looks great!', 'Rude! This is fashion!', 'You just don\'t get it.']), { emoji: '😤' });
        r.setEmotion('angry', 20);
        r.changeRel(o.id, -3);
      } else {
        r.say(pick(['I KNOW, okay?!', 'Don\'t look at meee!', '*hides face*']), { emoji: '😳' });
        r.setEmotion('shy', 30);
        r.d.happiness = clamp(r.d.happiness - 4, 0, 100);
      }
    } else if (re.rel > 0) {
      const humble = self.has('embarrassing');
      r.say(humble ? pick(['R-really? I thought it looked silly...', 'You think so?!']) : pick(['Thanks! ♪', 'Why thank you!', 'I know, right?']), { emoji: humble ? '🥹' : '😊' });
      r.d.happiness = clamp(r.d.happiness + (humble ? 6 : 3), 0, 100);
      r.changeRel(o.id, 1);
    }
  }, 1600);
}

// ---------------------------------------------------------------------------
// Wardrobe mishaps

export const MISHAPS = {
  torn: { label: 'Torn clothes', icon: '🩹', line: 'My clothes got ripped! 😭' },
  pajamas: { label: 'Forgot to get dressed', icon: '🛌', line: 'Wait... I\'m still in my pajamas?!' },
  shoes: { label: 'Forgot shoes', icon: '🦶', line: 'Huh? Where are my shoes?!' },
  stain: { label: 'Stained clothes', icon: '☕', line: 'Noooo, I spilled all over myself!' },
  inside: { label: 'Wearing it inside out', icon: '🔄', line: 'Is my shirt... inside out?' },
  seam: { label: 'Split seam', icon: '🧵', line: '*RRRIP* ...did anyone hear that?' },
};

/** Visual tweaks for a mishap, merged into the resident's composed look. */
export function mishapLook(res, avatar, out) {
  const m = res.d.mishap;
  if (!m || !avatar) return out;
  const slots = avatar.materialSlots();
  const clothes = slots.filter((s) => ['Tops', 'Bottoms', 'Onepiece', 'top', 'bottom'].includes(s.category));
  const set = (list, tint) => { for (const s of list) out.tints[s.key] = tint; };
  switch (m.type) {
    case 'torn': set(clothes, '#9a8b7c'); break;
    case 'seam': set(clothes.filter((s) => ['Bottoms', 'bottom'].includes(s.category)), '#b5a596'); break;
    case 'stain': set(clothes.filter((s) => ['Tops', 'Onepiece', 'top'].includes(s.category)), '#9b6b45'); break;
    case 'inside': set(clothes.filter((s) => ['Tops', 'Onepiece', 'top'].includes(s.category)), '#d8d2c8'); break;
    case 'shoes': for (const s of slots) if (['Shoes', 'shoes'].includes(s.category) && !out.hidden.includes(s.key)) out.hidden.push(s.key); break;
    default: break;
  }
  return out;
}

/** Start a mishap (no-op if they already have one). */
export function causeMishap(sim, res, type, { quiet = false } = {}) {
  if (res.d.mishap || !MISHAPS[type]) return false;
  // pajamas only make sense if they have something they sleep in
  if (type === 'pajamas' && !(res.d.wearing >= -1 && outfitMeta(res, res.d.wearing)?.tags?.includes('sleep'))) type = 'shoes';
  res.d.mishap = { type, at: sim.clock, noticed: type === 'torn' || type === 'stain' || type === 'seam' };
  res.applyLook();
  const def = MISHAPS[type];
  if (res.d.mishap.noticed && !quiet) {
    res.say(def.line, { emoji: def.icon });
    res.setEmotion('shy', 40);
  }
  sim.news(`Wardrobe mishap! ${res.name}: ${def.label.toLowerCase()} ${def.icon}`, '👗');
  if (res.d.mishap.noticed) sim.problems.offer(res, 'mishap', {});
  sim.emit('resident', res);
  return true;
}

/** Mishaps that weren't noticed yet get noticed after a while (or when someone laughs). */
const TELL = {
  pajamas: ['Psst... you\'re still in your pajamas!', 'Uh, nice PJs? Did you forget to get dressed?', 'Pfft! Pajama day?'],
  shoes: ['Hey, where are your shoes?', 'Um... you\'re barefoot!', 'Forgot something? Like... shoes?'],
  torn: ['Your clothes are all ripped!', 'Yikes, your outfit got torn up!'],
  seam: ['Psst... your seam split.', 'Um, there\'s a rip in your pants...'],
  stain: ['You\'ve got a big stain there!', 'Oops, you spilled on yourself!'],
  inside: ['Your shirt\'s inside out!', 'Hehe, inside-out shirt?'],
};

function notice(sim, r, by = null) {
  const m = r.d.mishap;
  m.noticed = true;
  if (!r.engaged) {
    r.say(by ? pick(['Wh-what?! Oh no!', 'Oh no... thanks for telling me!', 'NO WAY. How embarrassing!']) : MISHAPS[m.type].line, { emoji: MISHAPS[m.type].icon });
    r.setEmotion('shy', 40);
  }
  if (by) { r.changeRel(by.id, 1); }
  // most head straight home to change; otherwise they ask you what to do
  if (!r.working && !r.engaged && !r.ko && chance(0.65) && sim.goChange(r, { say: false })) return;
  sim.problems.offer(r, 'mishap', {});
}

/** Mishaps get noticed: someone points it out, or they spot it themselves. */
export function updateMishaps(sim, min) {
  for (const r of sim.residents) {
    const m = r.d.mishap;
    if (!m) continue;
    if (!m.noticed && !m.telling && !r.engaged && !r.sleeping) {
      // others are quick to point it out
      const near = sim.residents.filter((o) => o !== r && !o.engaged && !o.ko && !o.sleeping && (o.inside || null) === (r.inside || null) && sim.dist(o, r) < 7);
      if (near.length && chance(0.1 * min)) {
        const o = pick(near);
        o.faceTo(r.x, r.z);
        o.say(pick(TELL[m.type] || ['Um... your outfit?']), { emoji: '👀' });
        setTimeout(() => { if (r.d.mishap === m && !m.noticed) notice(sim, r, o); }, 1500);
        m.telling = true;
      } else if (sim.clock - m.at > 50 || (!r.inside && chance(0.02 * min))) notice(sim, r);
    }
    // a mishap nobody fixed wears off eventually (they change at home / at night)
    if (sim.clock - m.at > 8 * 60) fixMishap(sim, r, true);
  }
}

export function fixMishap(sim, res, quiet = false) {
  if (!res.d.mishap) return;
  const wasPajamas = res.d.mishap.type === 'pajamas';
  res.d.mishap = null;
  if (res.d.problem?.type === 'mishap') res.d.problem = null;
  res.applyLook();
  if (wasPajamas) sim.goChange?.(res, { say: false });
  if (!quiet) res.say('Phew, all fixed!', { emoji: '✨' });
  sim.emit('resident', res);
}
