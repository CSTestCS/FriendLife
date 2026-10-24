// Progression.
//
// The player: an Island Level. Island XP comes from looking after residents
// (solving their problems, feeding favourites, gifts), from residents growing
// (levelling up, promotions, rescues), new arrivals and every new day. Each
// island level pays a bonus and unlocks things: new jobs, shop items, a
// bigger daily allowance and a shop discount.
//
// Residents: their own level now matters. Higher levels earn more at work,
// get promoted faster, swim more safely, are tougher in fights, are more
// persuasive in romance, stay in better spirits, and unlock activities
// (house parties at level 5, island celebrity at level 8).

import { clamp, chance, pick } from '../core/util.js';

export const ISLAND_LEVELS = [
  { level: 2, text: 'Sewing Kits 🧵 and Life Rings 🛟 in the shop', items: ['sewkit', 'lifering'] },
  { level: 3, text: 'New jobs: Chef 🍳 and Tailor 🧵', jobs: ['chef', 'tailor'] },
  { level: 4, text: 'Daily allowance +20 🪙', allowance: 20 },
  { level: 5, text: 'New jobs: Police Officer 👮 and Paramedic 🚑', jobs: ['police', 'paramedic'] },
  { level: 6, text: 'Shop prices −5% for good', discount: 0.05 },
  { level: 7, text: 'New job: Teacher 📚', jobs: ['teacher'] },
  { level: 8, text: 'Daily allowance +30 🪙', allowance: 30 },
  { level: 10, text: 'Shop prices −5% more, and the title "Paradise Island" 🏝️', discount: 0.05 },
  { level: 12, text: 'Daily allowance +50 🪙', allowance: 50 },
];

/** Island XP needed to reach `level` (cumulative). */
export function islandXpFor(level) {
  return Math.round(150 * ((level - 1) ** 1.5));
}

export function islandTitle(level) {
  return level >= 10 ? 'Paradise Island' : level >= 7 ? 'Thriving Island' : level >= 4 ? 'Lively Island' : level >= 2 ? 'Cozy Island' : 'New Island';
}

export class Progress {
  constructor(sim) {
    this.sim = sim;
    this.xp = 0;
    this.level = 1;
  }

  get next() { return islandXpFor(this.level + 1); }
  get pct() { const lo = islandXpFor(this.level); return clamp((this.xp - lo) / (this.next - lo), 0, 1); }

  /** Things unlocked so far. */
  unlocked(kind, id) {
    return ISLAND_LEVELS.some((l) => l.level <= this.level && l[kind]?.includes(id));
  }

  /** Level needed for a job / item (0 = always available). */
  levelFor(kind, id) {
    return ISLAND_LEVELS.find((l) => l[kind]?.includes(id))?.level || 0;
  }

  isAvailable(kind, id) {
    const need = this.levelFor(kind, id);
    return !need || need <= this.level;
  }

  get allowanceBonus() { return ISLAND_LEVELS.filter((l) => l.level <= this.level).reduce((s, l) => s + (l.allowance || 0), 0); }
  get discount() { return ISLAND_LEVELS.filter((l) => l.level <= this.level).reduce((s, l) => s + (l.discount || 0), 0); }

  add(amount, why = '') {
    const sim = this.sim;
    this.xp += amount;
    sim.emit('progress', { amount, why });
    while (this.xp >= this.next) {
      this.level++;
      const bonus = 100 * this.level;
      sim.economy.earn(bonus, "island level");
      const unlocks = ISLAND_LEVELS.filter((l) => l.level === this.level).map((l) => l.text);
      sim.news(`🏝️ Island level ${this.level} — "${islandTitle(this.level)}"! +${bonus} 🪙${unlocks.length ? ` Unlocked: ${unlocks.join('; ')}.` : ''}`, '🏝️');
      sim.alert(`🏝️ Island level ${this.level}!${unlocks.length ? ` Unlocked: ${unlocks.join('; ')}` : ''}`, null, 'level');
      sim.audio?.levelUp();
    }
  }

  serialize() { return { xp: this.xp, level: this.level }; }
  restore(d) { if (d) { this.xp = d.xp || 0; this.level = d.level || 1; } }
}

/** What a resident's level gives them. */
export function residentPerks(level = 1) {
  const l = Math.max(1, level) - 1;
  return {
    wageMul: 1 + Math.min(0.6, l * 0.06),
    promoMul: 1 + Math.min(1, l * 0.1),
    swimRisk: 1 / (1 + l * 0.2),
    fightHp: l * 4,
    romance: Math.min(0.2, l * 0.025),
    mood: Math.min(10, l * 1.2),
    parties: level >= 5,
    celebrity: level >= 8,
  };
}

/** Short description for the resident panel. */
export function perkSummary(level = 1) {
  const p = residentPerks(level);
  const out = [];
  if (level > 1) {
    out.push(`+${Math.round((p.wageMul - 1) * 100)}% wages`, `${Math.round((p.promoMul - 1) * 100)}% faster promotions`, 'safer swimmer', `+${p.fightHp} toughness`, `+${Math.round(p.romance * 100)}% charm`, 'happier');
  }
  if (p.parties) out.push('throws house parties');
  if (p.celebrity) out.push('island celebrity (fans!)');
  const next = level < 5 ? 'Lv 5: throws house parties' : level < 8 ? 'Lv 8: island celebrity' : null;
  return { perks: out, next };
}

/** Level 8+ residents are island celebrities: fans come up to them. */
export function updateCelebrities(sim, min) {
  for (const r of sim.residents) {
    if (r.d.level < 8 || r.engaged || r.ko || r.sleeping || r.inside || !chance(0.008 * min)) continue;
    const fans = sim.residents.filter((o) => o !== r && !o.engaged && !o.ko && !o.inside && sim.dist(o, r) < 9);
    if (!fans.length) continue;
    const f = pick(fans);
    f.faceTo(r.x, r.z);
    f.say(pick([`OMG, it's ${r.name}! Can I get an autograph?`, `${r.name}! I'm your biggest fan!`, 'Can I take a selfie with you?!']), { emoji: '🌟' });
    f.changeRel(r.id, 3);
    f.d.needs.fun = clamp(f.d.needs.fun + 6, 0, 100);
    r.d.happiness = clamp(r.d.happiness + 2, 0, 100);
    setTimeout(() => { if (!r.engaged) r.say(pick(['Of course! ✍️', 'Aww, thank you!', 'Say cheese!']), { emoji: '😎' }); }, 1500);
  }
}
