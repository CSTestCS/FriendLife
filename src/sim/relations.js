// Prior relations: history the player gives residents before (or during)
// island life — family, rivalries and romances — each with variations that
// shape how the two get along.
//
// Stored on both residents as d.prior[otherId] = { type, variant }.
// Setting one adjusts their relationship right away; afterwards it keeps
// steering what they choose to do with each other (social weights), blocks
// romance between relatives, and slowly pulls their relationship back toward
// what it "should" be (family makes up, nemeses never quite forgive).

import { clamp } from '../core/util.js';

export const PRIOR_TYPES = {
  relative: {
    label: 'Relative', icon: '👪',
    variants: {
      parent: { label: 'Parent', mirror: 'child', score: 55 },
      child: { label: 'Child', mirror: 'parent', score: 55 },
      sibling: { label: 'Sibling', mirror: 'sibling', score: 40 },
      twin: { label: 'Twin', mirror: 'twin', score: 65 },
      cousin: { label: 'Cousin', mirror: 'cousin', score: 30 },
      grandparent: { label: 'Grandparent', mirror: 'grandchild', score: 55 },
      grandchild: { label: 'Grandchild', mirror: 'grandparent', score: 55 },
      auntUncle: { label: 'Aunt / Uncle', mirror: 'nieceNephew', score: 35 },
      nieceNephew: { label: 'Niece / Nephew', mirror: 'auntUncle', score: 35 },
      estranged: { label: 'Estranged family', mirror: 'estranged', score: -20, grudge: 30 },
    },
  },
  rival: {
    label: 'Rival', icon: '⚔️',
    variants: {
      friendly: { label: 'Friendly rival', mirror: 'friendly', score: 10 },
      competitive: { label: 'Competitive rival', mirror: 'competitive', score: -15 },
      bitter: { label: 'Bitter rival', mirror: 'bitter', score: -45, grudge: 40 },
      nemesis: { label: 'Nemesis', mirror: 'nemesis', score: -75, grudge: 70 },
      exFriend: { label: 'Ex-best friend', mirror: 'exFriend', score: -30, grudge: 35 },
      oneSided: { label: 'Sees them as a rival', mirror: null, score: -20 },
    },
  },
  relationship: {
    label: 'Relationship', icon: '💞',
    variants: {
      dating: { label: 'Dating', mirror: 'dating', score: 70, partner: true },
      engaged: { label: 'Engaged', mirror: 'engaged', score: 82, partner: true },
      married: { label: 'Married', mirror: 'married', score: 88, partner: true },
      exFriendly: { label: 'Ex (still friends)', mirror: 'exFriendly', score: 25, ex: true },
      exBitter: { label: 'Ex (bitter)', mirror: 'exBitter', score: -35, ex: true, grudge: 40 },
      crush: { label: 'Secret crush on', mirror: null, score: 45, crush: true },
      onAndOff: { label: 'On-and-off', mirror: 'onAndOff', score: 40, crush: true },
    },
  },
};

const ICONS = { parent: '👪', child: '👪', sibling: '👫', twin: '👯', grandparent: '👴', grandchild: '🧒', estranged: '🥀', friendly: '🤜', competitive: '🏁', bitter: '😠', nemesis: '⚔️', exFriend: '💢', oneSided: '👀', dating: '💞', engaged: '💍', married: '💒', exFriendly: '🤝', exBitter: '💔', crush: '💗', onAndOff: '🔁' };

export function priorOf(res, otherId) {
  return res.d.prior?.[otherId] || null;
}

export function priorDef(p) {
  return p ? PRIOR_TYPES[p.type]?.variants[p.variant] || null : null;
}

export function isRelative(a, b) {
  return priorOf(a, b.id)?.type === 'relative';
}

/** Romance only happens between a man and a woman (and never within a family). */
export function canRomance(a, b) {
  const g = [a?.d?.gender, b?.d?.gender];
  return g.includes('m') && g.includes('f') && !isRelative(a, b);
}

/** Label / icon for the relationship list. */
export function priorLabel(res, otherId) {
  const p = priorOf(res, otherId);
  const def = priorDef(p);
  return def ? { label: def.label, icon: ICONS[p.variant] || PRIOR_TYPES[p.type].icon } : null;
}

/** Set (or with type null, clear) a prior relation between a and b. Mirrors it on b. */
export function setPrior(sim, a, b, type, variant) {
  a.d.prior ||= {};
  b.d.prior ||= {};
  const ra = a.rel(b.id);
  const rb = b.rel(a.id);
  // clear the old one (and the romance flags it gave)
  const old = priorDef(a.d.prior[b.id]);
  if (old?.partner) { ra.partner = rb.partner = false; }
  delete a.d.prior[b.id];
  if (b.d.prior[a.id] && (!type || priorDef(b.d.prior[a.id])?.mirror !== null)) delete b.d.prior[a.id];
  if (!type) return;
  const def = PRIOR_TYPES[type]?.variants[variant];
  if (!def) return;
  a.d.prior[b.id] = { type, variant };
  if (def.mirror) b.d.prior[a.id] = { type, variant: def.mirror };
  const mdef = def.mirror ? PRIOR_TYPES[type].variants[def.mirror] : null;
  // starting point for their relationship
  ra.met = rb.met = true;
  ra.score = def.score;
  if (mdef) rb.score = mdef.score;
  else rb.score = Math.max(rb.score, 0);
  ra.grudge = def.grudge || 0;
  if (mdef) rb.grudge = mdef.grudge || 0;
  const romantic = canRomance(a, b);
  if (def.partner && romantic) {
    // only one partner each
    for (const x of [a, b]) { const p = x.partnerId(); if (p && p !== (x === a ? b.id : a.id)) sim.social.breakUp(x, sim.byId(p), false); }
    ra.partner = rb.partner = true;
    ra.crush = rb.crush = true;
  }
  if (def.crush && romantic) ra.crush = true;
  if (def.ex) { ra.ex = rb.ex = true; ra.partner = rb.partner = false; }
  if (type === 'relative') { ra.crush = rb.crush = false; ra.partner = rb.partner = false; }
  a.addMemory(`${def.label}: ${b.name}`);
}

/**
 * Social weights between a and b from their history. chooseKind multiplies
 * its weights by these.
 */
export function priorSocialBias(a, b) {
  const p = priorOf(a, b.id);
  const bias = { chat: 1, joke: 1, compliment: 1, gossip: 1, hug: 1, date: 1, prank: 1, danceOff: 1, argue: 1, insult: 1, apology: 1, breakup: 1, confess: 1 };
  if (!p) return bias;
  switch (p.variant) {
    case 'parent': case 'grandparent': case 'auntUncle':
      Object.assign(bias, { chat: 1.8, hug: 2.2, compliment: 1.6, argue: 0.7, insult: 0.3, apology: 2 }); break;
    case 'child': case 'grandchild': case 'nieceNephew':
      Object.assign(bias, { chat: 1.6, hug: 2, joke: 1.4, argue: 0.9, prank: 1.3, apology: 1.5 }); break;
    case 'sibling':
      Object.assign(bias, { chat: 1.6, joke: 1.6, prank: 2, argue: 1.5, hug: 1.4, insult: 0.8, apology: 2 }); break;
    case 'twin':
      Object.assign(bias, { chat: 2, joke: 1.8, hug: 2, prank: 1.5, danceOff: 1.6 }); break;
    case 'cousin':
      Object.assign(bias, { chat: 1.4, joke: 1.4 }); break;
    case 'estranged':
      Object.assign(bias, { chat: 0.6, argue: 1.8, apology: 1.6, hug: 0.3 }); break;
    case 'friendly':
      Object.assign(bias, { danceOff: 3, joke: 1.5, prank: 1.5, argue: 0.8 }); break;
    case 'competitive':
      Object.assign(bias, { danceOff: 2.5, argue: 1.5, insult: 1.2, compliment: 0.6 }); break;
    case 'bitter': case 'exFriend':
      Object.assign(bias, { argue: 2.2, insult: 2, prank: 1.5, chat: 0.5, compliment: 0.3 }); break;
    case 'nemesis':
      Object.assign(bias, { argue: 3, insult: 2.5, prank: 2, chat: 0.3, compliment: 0.1, hug: 0, apology: 0.4 }); break;
    case 'oneSided':
      Object.assign(bias, { danceOff: 2, argue: 1.4, insult: 1.3 }); break;
    case 'dating':
      Object.assign(bias, { date: 1.5, hug: 1.8, compliment: 1.6 }); break;
    case 'engaged':
      Object.assign(bias, { date: 2, hug: 2, compliment: 1.8, breakup: 0.5 }); break;
    case 'married':
      Object.assign(bias, { date: 2, hug: 2.2, chat: 1.5, argue: 1.2, breakup: 0.25, apology: 2 }); break;
    case 'exFriendly':
      Object.assign(bias, { chat: 1.3, joke: 1.2, confess: 0.6 }); break;
    case 'exBitter':
      Object.assign(bias, { argue: 2, insult: 1.6, chat: 0.6, compliment: 0.4 }); break;
    case 'crush':
      Object.assign(bias, { compliment: 2.2, chat: 1.3, confess: 1.8 }); break;
    case 'onAndOff':
      Object.assign(bias, { date: 1.5, argue: 1.6, breakup: 1.5, confess: 2, hug: 1.4 }); break;
    default: break;
  }
  // no romance between relatives
  if (p.type === 'relative') Object.assign(bias, { date: 0, confess: 0, breakup: 0 });
  return bias;
}

/** Per game minute: history pulls relationships back toward where they belong. */
export function updatePriorRelations(sim, min) {
  for (const a of sim.residents) {
    if (!a.d.prior) continue;
    for (const [id, p] of Object.entries(a.d.prior)) {
      const b = sim.byId(id);
      const def = priorDef(p);
      if (!b || !def) { delete a.d.prior[id]; continue; }
      const r = a.rel(id);
      const pull = p.type === 'relative' ? 0.004 : 0.002;
      r.score = clamp(r.score + (def.score - r.score) * pull * min, -100, 100);
      if (def.grudge) r.grudge = Math.max(r.grudge, def.grudge * 0.5);
      // family forgives: grudges fade faster
      if (p.type === 'relative' && p.variant !== 'estranged') r.grudge = Math.max(0, r.grudge - 0.03 * min);
    }
  }
}
