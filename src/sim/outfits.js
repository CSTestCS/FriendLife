// Outfits: when residents wear which outfit, how an outfit is perceived (by
// the wearer and by everyone else), and wardrobe mishaps.
//
// Every outfit (and the resident's main look) can carry:
//   tags        – "wear automatically when…" conditions
//   perception  – { self: [trait…], others: [trait…] }
// When several outfits match the current situation, one is picked at random
// (and kept until the situation changes).

import { chance, clamp, pick, rand } from '../core/util.js';
import { isRelative } from './relations.js';

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

/** The name of an outfit (-1 = main look). */
export function outfitName(res, idx = res.d.wearing ?? -1) {
  if (idx < 0) return res.d.mainOutfit?.name || 'Main look';
  return res.d.outfits?.[idx]?.name || '';
}

/** An outfit called "Underwear" can be stripped down to anywhere (no wardrobe needed). */
export function isUnderwear(res, idx = res.d.wearing ?? -1) {
  return /underwear/i.test(outfitName(res, idx));
}

/** Underwear shows: an "Underwear" or "…Incomplete…" outfit, or any wardrobe mishap. */
export function underwearShowing(res, idx = res.d.wearing ?? -1) {
  if (res.d.mishap && idx === res.d.wearing) return true;
  const n = outfitName(res, idx);
  return /underwear/i.test(n) || /incomplete/i.test(n);
}

// Why they put on what they're wearing ('swim', 'exercise', 'work', 'home'…).
// Remembered for as long as that outfit stays on, so someone walking back
// from the beach in their swimwear knows why they're in it.
const PLACE_BOUND = new Set(['home', 'sleep']); // only makes sense at home

/** Remember why they changed into outfit `index` (null = no particular reason). */
export function setOutfitPurpose(res, index, why) {
  res.d.outfitPurpose = why ? { why, index } : null;
}

/** The reason they're wearing the current outfit, if it still holds here. */
export function outfitPurpose(res, { anywhere = false } = {}) {
  const p = res.d.outfitPurpose;
  if (!p || p.index !== (res.d.wearing ?? -1)) return null;
  if (!anywhere && PLACE_BOUND.has(p.why) && res.inside !== res.homeKey) return null;
  return p.why;
}

/** Swimwear: an outfit tagged for swimming. */
export function isSwimwear(res, idx = res.d.wearing ?? -1) {
  return !!outfitMeta(res, idx)?.tags?.includes('swim');
}

/**
 * Wet in underwear or swimwear: they have to dry off before putting on
 * anything else (stripping down to underwear is always fine).
 */
export function mustDryFirst(res, target) {
  // properly dry, not just "mostly": no visible wet sheen left
  if ((res.d.wetness || 0) < 0.04 || target === res.d.wearing) return false;
  if (!(isUnderwear(res) || isSwimwear(res) || underwearShowing(res) || res.d.swimWet)) return false;
  return !isUnderwear(res, target);
}

/** Out where others can see (not at home, not swimming). */
export function inPublic(res) {
  if (res.inside && res.inside === res.homeKey) return false;
  return !(res.inWater || res.activity === 'swim');
}

/** Would they feel embarrassed to be seen in this outfit (in public)? */
export function embarrassingToWear(res, idx = res.d.wearing ?? -1) {
  const meta = outfitMeta(res, idx);
  const self = new Set(meta?.perception?.self || []);
  const proud = ['sexy', 'cool', 'powerful', 'elegant', 'cute', 'trendy'].some((t) => self.has(t));
  if (self.has('embarrassing')) return true;
  if (idx === res.d.wearing && res.d.mishap && !res.d.mishap.owned) return true;
  return underwearShowing(res, idx) && !proud;
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
  if (underwearShowing(res) && !self.size) self.add('embarrassing');
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


const anim = (o, name, r) => { if (!o.plan.length && !o.moving && !o.step) o.setPlan([{ kind: 'anim', anim: name, dur: 2.4, faceX: r.x, faceZ: r.z }]); };

/**
 * Someone spots a resident's underwear. How they react depends on who they
 * are to each other and their personality: flustered crushes, teasing best
 * friends, groaning family, a kind soul offering a jacket, a prankster
 * pointing and laughing, a prude scolding, the shy one pretending not to see.
 */
export function reactToUndies(sim, o, r, near = []) {
  const attracted = sim.settings.romance && !isRelative(o, r) && ((o.d.gender === 'm' && r.d.gender === 'f') || (o.d.gender === 'f' && r.d.gender === 'm'));
  const rel = o.rel(r.id);
  const t = o.t;
  const close = rel.score > 60;
  const why = underwearIntent(sim, r);
  o.faceTo(r.x, r.z);
  let kind;
  if (rel.partner) kind = 'partner';
  else if (isRelative(o, r)) kind = 'family';
  else if (close) kind = 'bestie';
  else if (attracted) kind = pick(['flustered', 'flustered', 'stare', 'smooth']);
  else if (t.kindness > 0.65 && !why) kind = 'jacket';
  else if (t.quirk > 0.65 || (t.temper > 0.5 && rel.score < 0)) kind = 'laugh';
  else if (t.sociability < 0.35) kind = 'shy';
  else if (t.temper > 0.65 && t.confidence > 0.5) kind = 'scold';
  else kind = pick(['notice', 'notice', 'bold']);
  const lines = {
    partner: ['Babe! Clothes! ...actually, never mind. 😏', 'Is this for me? 😳', 'Put something on before someone else sees you like that!'],
    family: ['Ugh, cover up! I\'m family!', 'Nope. Didn\'t need to see that. 🙈', 'Mom would be SO embarrassed right now.'],
    bestie: ['Nice undies, bestie! 😂', 'Did you lose a bet or something?', 'Bold move! I respect it.', 'Going somewhere fun? Wait for me!'],
    flustered: ['W-whoa... 😳', 'I-I can see your... um...', '*trips over own feet*', 'My face is so red right now...'],
    stare: ['*stares* ...sorry, what were we talking about?', 'Um. Wow. Hi.', '*forgets how to speak*'],
    smooth: ['Looking good. Real good. 😏', 'Well, that\'s one way to make an entrance.', 'You should dress like that more often.'],
    jacket: ['Here, take my jacket!', 'Oh no, are you okay? Let me help you cover up!', 'Quick, stand behind me!'],
    laugh: ['HAHAHA! Everyone look! 🤣', 'Nice underwear! LOL!', 'Pfft— I can\'t breathe! 😂'],
    shy: ['I-I didn\'t see anything! 🙈', '*looks away very hard*', 'Eep!'],
    scold: ['Have some decency!', 'This is a public place, you know!', 'Put some clothes on, honestly!'],
    notice: ['Uh, I can see your underwear!', 'Psst! You might want to put some clothes on...', 'Um... your underwear is showing.'],
    bold: ['Huh. Bold choice.', 'Laundry day?', 'Interesting outfit...'],
  }[kind];
  const emoji = { partner: '😳', family: '🙈', bestie: '😂', flustered: '😳', stare: '😳', smooth: '😏', jacket: '🧥', laugh: '🤣', shy: '🙈', scold: '😤', notice: '👀', bold: '🤨' }[kind];
  o.say(pick(lines), { emoji });
  anim(o, { laugh: 'laugh', bestie: 'laugh', shy: 'shy', flustered: 'shy', stare: 'shocked', scold: 'argue', family: 'shy', jacket: 'wave', notice: 'point', bold: 'think', smooth: 'wave', partner: 'shy' }[kind] || 'idle', r);
  // effects on the onlooker
  if (['flustered', 'stare', 'smooth', 'partner'].includes(kind)) {
    o.setEmotion(chance(0.5) ? 'love' : 'shy', 25);
    o.changeRel(r.id, 4);
    if (!rel.crush && !rel.partner && rel.score > 10 && chance(0.25) && kind !== 'partner') {
      rel.crush = true;
      o.addMemory(`Couldn't stop thinking about ${r.name} after seeing them in their underwear`);
      sim.problems.offer(o, 'confess', { other: r.id });
    }
  } else o.d.needs.fun = clamp(o.d.needs.fun + (kind === 'laugh' || kind === 'bestie' ? 8 : 3), 0, 100);
  // and the wearer's reply
  setTimeout(() => {
    if (!sim.residents.includes(r) || r.engaged) return;
    const wt = r.t;
    if (why) { r.say(pick(ACK[why] || ['I know! It\'s on purpose.']), { emoji: '😄' }); return; }
    switch (kind) {
      case 'jacket':
        r.say(pick(['Thank you SO much! 🥹', 'You\'re a lifesaver!', 'I owe you one!']), { emoji: '🥹' });
        r.changeRel(o.id, 6); o.changeRel(r.id, 3);
        r.d.happiness = clamp(r.d.happiness + 2, 0, 100);
        break;
      case 'laugh':
        r.say(pick(['Stop laughing!! 😭', 'It\'s NOT funny!', 'I hate you right now.']), { emoji: '😭' });
        r.changeRel(o.id, -4);
        r.setEmotion('shy', 50);
        for (const x of near) if (x !== o && chance(0.4)) { x.say(pick(['*giggles*', 'Hehe...', 'Oh my...']), { emoji: '🤭' }); }
        break;
      case 'scold':
        r.say(wt.temper > 0.6 ? pick(['Mind your own business!', 'Nobody asked you!']) : pick(['S-sorry!', 'I\'m going, I\'m going!']), { emoji: wt.temper > 0.6 ? '😠' : '😣' });
        r.changeRel(o.id, -2);
        break;
      case 'bestie': case 'partner':
        r.say(pick(['Don\'t tell anyone! 🤫', 'Hehe... oops?', 'You saw nothing!']), { emoji: '🤭' });
        r.changeRel(o.id, 2);
        break;
      default:
        if (wt.confidence > 0.75) r.say(pick(['What? It\'s a look.', 'Jealous?', 'I make this work.']), { emoji: '😎' });
        else r.say(pick(['Wh-what?! Oh no!', 'Don\'t look at meee!', '*turns bright red*']), { emoji: '😳' });
    }
  }, 1700);
}

/**
 * Underwear on show in public gets noticed; people who feel embarrassed in
 * what they wear (or whose underwear shows) go change when someone sees them.
 * Swimming is the exception. Called every game minute.
 */
export function updateExposure(sim, min) {
  for (const r of sim.residents) {
    if (r.engaged || r.ko || !r.avatar || r.sleeping || (r.inside && !r.room)) continue;
    if (r.nightOut) continue; // sneaking out on purpose (night.js handles getting caught)
    if (!inPublic(r)) continue;
    const showing = underwearShowing(r);
    // dressed like this on purpose (swimwear on the way back from the beach…): no shock
    const swimming = underwearIntent(sim, r) === 'swim';
    const embarrassed = embarrassingToWear(r) && (!!r.d.mishap || (!outfitPurpose(r) && !swimming));
    if (!showing && !embarrassed) continue;
    const near = sim.residents.filter((o) => o !== r && !o.engaged && !o.ko && !o.sleeping && (o.inside || null) === (r.inside || null) && sim.dist(o, r) < 7);
    if (!near.length) continue;
    // someone notices the underwear
    // (each onlooker comments once, then not again for hours; swimwear on the way to / from a swim is barely worth a remark)
    const fresh = near.filter((o) => sim.clock - (o.saidUndies?.[r.id] ?? -1e9) > 240);
    if (showing && fresh.length && chance(0.05 * min * (swimming ? 0.25 : 1)) && sim.clock - (r.seenUndiesAt ?? -999) > 10) {
      r.seenUndiesAt = sim.clock;
      const o = pick(fresh);
      (o.saidUndies ||= {})[r.id] = sim.clock;
      reactToUndies(sim, o, r, near);
    }
    // the wearer reacts: go and get dressed (unless they're proud of it or working)
    if (embarrassed && !r.working && !r.errand && sim.clock - (r.lastDressTrip ?? -1e9) > 20 && chance(0.06 * min)) {
      r.say(pick(['Eek! Don\'t look!', 'I need to go change. NOW.', 'Nobody saw that, right?!', '*covers up* Be right back!']), { emoji: '😳' });
      r.setEmotion('shy', 40);
      r.d.happiness = clamp(r.d.happiness - 3, 0, 100);
      sim.coverUp(r);
    }
  }
}

function reactTo(sim, o, r, t, re, self) {
  o.faceTo(r.x, r.z);
  if (!o.plan.length && !o.moving) o.setPlan([{ kind: 'anim', anim: re.anim, dur: 2.2, faceX: r.x, faceZ: r.z }]);
  o.say(pick(re.say), { emoji: re.emoji });
  o.changeRel(r.id, re.rel);
  if (re.fun) o.d.needs.fun = clamp(o.d.needs.fun + re.fun, 0, 100);
  if (re.mood) o.setEmotion(re.mood, 15);
  if (re.crush && sim.settings.romance && o.relScore(r.id) > 25 && !isRelative(o, r)) sim.social.maybeCrush(o, r);
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
  shoes: { label: 'Half-dressed', icon: '🩲', line: 'Huh? Did I forget my... pants?!' },
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
    case 'shoes': for (const s of slots) if (['Shoes', 'shoes', 'Bottoms', 'bottom'].includes(s.category) && !out.hidden.includes(s.key)) out.hidden.push(s.key); break;
    default: break;
  }
  // parts the player marked as "can be lost in a mishap" (👕 Wardrobe) actually vanish,
  // so underwear shows; which ones is decided once per mishap
  if (m.type !== 'pajamas') {
    const allowed = (out.mishapHide || []).filter((k) => slots.some((s) => s.key === k));
    if (allowed.length) {
      if (!m.parts || !m.parts.every((k) => allowed.includes(k))) {
        const n = 1 + Math.floor(Math.random() * allowed.length);
        m.parts = [...allowed].sort(() => Math.random() - 0.5).slice(0, n);
      }
      for (const k of m.parts) if (!out.hidden.includes(k)) out.hidden.push(k);
    }
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

// ---------------------------------------------------------------------------
// Telling someone their underwear shows (during a chat)

const ACT_TAG = { swim: 'swim', sleep: 'sleep', exercise: 'exercise', dance: 'party', work: 'work', date: 'date' };

/**
 * Why is their underwear showing on purpose? Returns a reason ('swim', 'sleep',
 * 'home', 'work', 'own'…) or null if it's accidental.
 */
export function underwearIntent(sim, res) {
  const m = res.d.mishap;
  if (m) return m.owned ? 'own' : null;
  if (res.nightOut) return 'mischief';
  // still wet from a swim (or just been swimming): obviously that's why
  const swimmy = isSwimwear(res) || isUnderwear(res) || underwearShowing(res);
  if (swimmy && (res.d.swimWet || sim.clock - (res.d.lastSwamAt ?? -1e9) < 120 || res.inside === 'condoPool')) return 'swim';
  // they remember why they put it on (e.g. walking back from a swim)
  const why = outfitPurpose(res);
  if (why) return why;
  const tags = outfitMeta(res, res.d.wearing ?? -1)?.tags || [];
  if (res.inWater || res.activity === 'swim') return tags.includes('swim') || res.inWater ? 'swim' : null;
  const act = res.activity || (res.working ? 'work' : null);
  if (act && tags.includes(ACT_TAG[act])) return act;
  if (res.inside && res.inside === res.homeKey && (tags.includes('home') || tags.includes('sleep'))) return 'home';
  if (res.sleeping || res.morningPending) return 'sleep';
  return null;
}

const ACK = {
  swim: ['It\'s swimwear, silly!', 'I\'m swimming today!', 'Beach day! 🏖️'],
  sleep: ['I\'m about to go to bed!', 'It\'s what I sleep in~', 'Bedtime soon!'],
  home: ['I\'m just relaxing at home~', 'My house, my rules!', 'Comfy at home!'],
  exercise: ['It\'s my workout gear!', 'Easier to move in!', 'Workout time!'],
  dance: ['It\'s for dancing!', 'Gotta move freely!'],
  party: ['It\'s for dancing!', 'Gotta move freely!'],
  work: ['It\'s my work uniform, actually.', 'All part of the job!'],
  date: ['It\'s for my date~', 'I\'m dressed for a date!'],
  mischief: ['Shh! We\'re sneaking out! 🤫', 'Don\'t tell anyone, okay?', 'It\'s a night adventure! 😈'],
  own: ['I know. I\'m owning it. 😎', 'It\'s a look!'],
};

/**
 * Extra opening beats for a chat when someone's underwear shows: the other
 * one tells them; they either explain (it's on purpose) or get flustered and
 * go change after the chat. Returns [] if nothing to say.
 */
export function underwearChatBeats(sim, it) {
  const out = [];
  for (const [tellerKey, wearerKey] of [['a', 'b'], ['b', 'a']]) {
    const teller = it[tellerKey];
    const wearer = it[wearerKey];
    if (!underwearShowing(wearer) || sim.clock - (wearer.toldUndiesAt ?? -1e9) < 45) continue;
    if (sim.clock - (teller.saidUndies?.[wearer.id] ?? -1e9) < 240) continue; // already told them
    wearer.toldUndiesAt = sim.clock;
    (teller.saidUndies ||= {})[wearer.id] = sim.clock;
    const attracted = sim.settings.romance && !isRelative(teller, wearer) && ((teller.d.gender === 'm' && wearer.d.gender === 'f') || (teller.d.gender === 'f' && wearer.d.gender === 'm'));
    const intent = underwearIntent(sim, wearer);
    const tell = attracted
      ? pick(['Um... I-I can see your underwear... 😳', 'So, uh... your underwear is showing. Not complaining!', 'I can see your underwear. Just so you know. *blush*'])
      : pick(['Hey, just so you know... I can see your underwear.', 'Psst! Your underwear is showing.', 'Um, are you aware your underwear is on show?']);
    const beat = { dur: 3 };
    beat[tellerKey] = { anim: 'talk', say: tell, expr: attracted ? { blush: 1, happy: 0.4 } : { surprised: 0.4 }, emoji: attracted ? '😳' : '👀' };
    beat[wearerKey] = { anim: 'listen', expr: { surprised: 0.5 } };
    const reply = { dur: 3 };
    if (intent) {
      reply[wearerKey] = { anim: 'wave', say: pick(ACK[intent] || ['I know! It\'s on purpose.']), expr: { happy: 0.6 }, emoji: '😄' };
      reply[tellerKey] = { anim: 'idle', expr: { happy: 0.4 } };
    } else {
      reply[wearerKey] = { anim: 'shy', say: pick(['W-what?! Oh no!', 'Eek! Thanks for telling me!', 'Oh my gosh, I didn\'t notice!']), expr: { blush: 1, surprised: 0.6 }, emoji: '😳' };
      reply[tellerKey] = { anim: 'idle', expr: { relaxed: 0.4 } };
      reply.fn = () => {
        wearer.changeAfterChat = true;
        if (wearer.d.mishap) wearer.d.mishap.noticed = true;
        wearer.setEmotion('shy', 40);
        wearer.changeRel(teller.id, 2);
      };
    }
    if (attracted) beat.fn = () => { teller.changeRel(wearer.id, 3); teller.setEmotion('love', 20); };
    out.push(beat, reply);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Heading out the door

/**
 * About to leave home with their underwear showing and no reason for it
 * (not off to swim in it, not dressed for the activity they're heading to)?
 */
export function underdressedToLeave(res) {
  if (!underwearShowing(res) || res.nightOut) return false;
  if (res.d.mishap?.owned) return false;
  const tags = outfitMeta(res, res.d.wearing ?? -1)?.tags || [];
  const act = res.activity && res.activity !== 'sleep' ? res.activity : null;
  if (act && tags.includes(ACT_TAG[act])) return false;
  // changed into it for something they do out there (a swim, a workout…)
  const why = outfitPurpose(res, { anywhere: true });
  if (why && !PLACE_BOUND.has(why)) return false;
  return true;
}

/** Chance (0–1) that someone leaves home underdressed anyway (player setting). */
export function underwearLeaveRate(sim) {
  const v = sim.settings?.underwearRate;
  return clamp(v == null ? 0.05 : v, 0, 1);
}
