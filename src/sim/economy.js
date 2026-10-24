// The island's money: where it comes from, where it goes.
//
// Income: residents' wages (get them jobs and promotions!), solving problems,
// level-ups, a small daily allowance.
// Costs: condo rent for every apartment and upkeep for every venue (billed
// each morning), plus residents' everyday spending (café meals, snacks,
// hot-spring entry, shopping, clinic visits). New venues have to be bought.
// Run out and the island goes into debt: residents worry, the shop won't
// sell to you until it's paid off.

import { clamp } from '../core/util.js';

export const VENUES = {
  picnic: { label: 'Picnic Lawn', icon: '🧺', price: 0, upkeep: 0, desc: 'Picnic tables and a blanket under the blossoms.' },
  campfire: { label: 'Campfire', icon: '🔥', price: 150, upkeep: 4, desc: 'Evening stories and marshmallows around the fire.' },
  court: { label: 'Basketball Court', icon: '🏀', price: 300, upkeep: 6, desc: 'Shoot hoops, play one-on-one, cheer from the bench.' },
  playground: { label: 'Playground', icon: '🛝', price: 400, upkeep: 6, desc: 'Swings, a slide and a see-saw. Not just for kids.' },
  foodtruck: { label: 'Food Truck', icon: '🌮', price: 500, upkeep: 10, desc: 'Cheap snacks on the go. Earns a little from sales.' },
  lookout: { label: 'Stargazing Lookout', icon: '🔭', price: 600, upkeep: 6, desc: 'A telescope deck on the cliffs. Romantic at dusk.' },
  onsen: { label: 'Hot Spring', icon: '♨️', price: 1200, upkeep: 15, desc: 'Steaming outdoor bath. Residents soak in swimwear (or less).' },
};

// everyday spending, per visit
export const COSTS = { cafe: 8, terrace: 6, snack: 5, onsen: 4, shop: 12, clinic: 20, rent: 12 };
const MUL = { relaxed: 0.5, normal: 1, tight: 1.5 };

export class Economy {
  constructor(sim) {
    this.sim = sim;
    this.owned = new Set(['picnic']);
    this.today = { income: {}, spent: {} };
    this.yesterday = null;
    this.debtDays = 0;
  }

  get mul() { return MUL[this.sim.settings.economy] ?? 1; }

  earn(amount, why = 'other') {
    if (!(amount > 0)) return;
    this.sim.money += amount;
    this.today.income[why] = (this.today.income[why] || 0) + amount;
  }

  /** Charge the island. Bills can push it into debt. Returns the amount. */
  spend(amount, why = 'other') {
    const a = Math.round(amount * this.mul);
    if (a <= 0) return 0;
    this.sim.money -= a;
    this.today.spent[why] = (this.today.spent[why] || 0) + a;
    return a;
  }

  /** Record money the player spent directly (shop, decorations). */
  paid(amount, why) { this.today.spent[why] = (this.today.spent[why] || 0) + amount; }

  /** A resident pays for something everyday (café meal, snack…). */
  living(res, kind) {
    const cost = COSTS[kind] ?? 0;
    const a = this.spend(cost, kind);
    if (a && kind === 'snack' && this.owned.has('foodtruck')) this.earn(Math.round(a * 0.3), 'food truck');
    return a;
  }

  get inDebt() { return this.sim.money < 0; }

  isOpen(key) { return !VENUES[key] || this.owned.has(key); }

  buyVenue(key) {
    const v = VENUES[key];
    if (!v || this.owned.has(key)) return 'Already built.';
    if (this.sim.money < v.price) return `You need ${v.price} 🪙 for the ${v.label}.`;
    this.sim.money -= v.price;
    this.today.spent.building = (this.today.spent.building || 0) + v.price;
    this.owned.add(key);
    this.sim.island.setVenueOpen(key, true);
    this.sim.news(`${v.icon} The ${v.label} is open! Upkeep ${Math.round(v.upkeep * this.mul)} 🪙/day.`, v.icon);
    this.sim.progress?.add(40, 'new venue');
    this.sim.audio?.levelUp?.();
    return null;
  }

  /** Each morning: rent and upkeep, yesterday's summary, debt trouble. */
  newDay() {
    const sim = this.sim;
    const apartments = sim.residents.length;
    const rent = this.spend(COSTS.rent * apartments, 'rent');
    let upkeep = 0;
    for (const k of this.owned) upkeep += this.spend(VENUES[k]?.upkeep || 0, 'upkeep');
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    this.yesterday = { income: { ...this.today.income }, spent: { ...this.today.spent } };
    const inc = Math.round(sum(this.yesterday.income));
    const out = Math.round(sum(this.yesterday.spent));
    this.today = { income: {}, spent: {} };
    sim.news(`📒 Yesterday: +${inc} 🪙 earned, −${out} 🪙 spent. This morning: rent −${rent} 🪙${upkeep ? `, upkeep −${upkeep} 🪙` : ''}.`, '📒');
    if (this.inDebt) {
      this.debtDays++;
      sim.news(`⚠️ The island is ${Math.round(-sim.money)} 🪙 in debt! Residents are worried. Get them working (and maybe skip the hot spring).`, '⚠️');
      for (const r of sim.residents) r.d.happiness = clamp(r.d.happiness - 4 - this.debtDays * 2, 0, 100);
    } else this.debtDays = 0;
  }

  /** What's been earned / spent today (for the budget window). */
  ledger() {
    return { today: this.today, yesterday: this.yesterday, owned: [...this.owned], debtDays: this.debtDays };
  }

  serialize() { return { owned: [...this.owned], today: this.today, yesterday: this.yesterday, debtDays: this.debtDays }; }

  restore(d) {
    if (!d) return;
    this.owned = new Set(d.owned || ['picnic']);
    this.today = d.today || { income: {}, spent: {} };
    this.yesterday = d.yesterday || null;
    this.debtDays = d.debtDays || 0;
  }
}
