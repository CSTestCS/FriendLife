// The condo: once every house is taken, newcomers get an apartment in the
// condo tower (four per floor, as many floors as needed). The tower has a
// lobby, a hallway per floor where neighbours run into each other, and an
// indoor pool with its own lifeguard post.

import { CONDO_UNITS_PER_FLOOR } from '../world/rooms.js';

export class Condo {
  constructor(sim) {
    this.sim = sim;
    this.units = {}; // residentId → unit number (0-based)
  }

  unitOf(id) { return this.units[id] ?? null; }
  floorOf(unit) { return Math.floor(unit / CONDO_UNITS_PER_FLOOR) + 1; }
  unitLabel(unit) { return `${this.floorOf(unit)}0${(unit % CONDO_UNITS_PER_FLOOR) + 1}`; }
  get count() { return Object.keys(this.units).length; }
  get active() { return this.count > 0; }
  get floors() { return Math.max(1, ...Object.values(this.units).map((u) => this.floorOf(u))); }

  ownerOf(unit) {
    const id = Object.keys(this.units).find((k) => this.units[k] === unit);
    return id ? this.sim.byId(id)?.name || null : null;
  }

  residentsOnFloor(floor) {
    return this.sim.residents.filter((r) => this.unitOf(r.id) != null && this.floorOf(this.unitOf(r.id)) === floor);
  }

  assign(res, prefer = null) {
    const used = new Set(Object.entries(this.units).filter(([id]) => id !== res.id).map(([, u]) => u));
    let unit = prefer != null && !used.has(prefer) ? prefer : null;
    if (unit == null) { unit = 0; while (used.has(unit)) unit++; }
    this.units[res.id] = unit;
    res.d.condoUnit = unit;
    this.sim.island.showCondo(true);
    this.sim.rooms?.refreshHalls();
    return unit;
  }

  release(res) {
    if (this.units[res.id] == null) return;
    delete this.units[res.id];
    res.d.condoUnit = null;
    if (!this.active) this.sim.island.showCondo(false);
    this.sim.rooms?.refreshHalls();
  }
}
