// Room instance UI: the "inside" view bar, the list of rooms, decorating, and jobs.
import { $, h, openModal, toast } from './dom.js';
import { DECOR_ITEMS, WALL_COLORS, FLOOR_COLORS, WOOD_COLORS, ROOM_LABELS } from '../world/rooms.js';
import { JOBS, JOB_IDS, jobFit, jobTitle, jobWage, jobOf, assignJob, isOnShift } from '../sim/jobs.js';

/** Bar shown while looking inside a room. */
export class RoomBar {
  constructor(app) {
    this.app = app;
    this.el = h('div', { id: 'roomBar', class: 'hidden' });
    $('#hud').append(this.el);
    this.timer = 0;
  }

  show(room) {
    this.room = room;
    this.el.classList.toggle('hidden', !room);
    this.render();
  }

  render() {
    const room = this.room;
    if (!room) return;
    const sim = this.app.sim;
    const people = sim.residents.filter((r) => r.room === room);
    this.el.innerHTML = '';
    this.el.append(
      h('b', {}, `🏠 ${room.label(sim)}`),
      h('span', { class: 'hint' }, people.length ? `· ${people.map((p) => `${p.name}${p.working ? ' 💼' : p.sleeping && p.inside === `home:${p.id}` ? ' 💤' : ''}`).join(', ')}` : '· nobody inside'),
      h('button', { class: 'small', onclick: () => openDecorate(this.app, room.key) }, '🎨 Decorate'),
      h('button', { class: 'small', onclick: () => openRoomList(this.app) }, '🚪 Rooms'),
      h('button', { class: 'small primary', onclick: () => this.app.leaveRoom() }, '⬅ Outside'),
    );
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && this.room) { this.timer = 1; this.render(); }
  }
}

export function openRoomList(app) {
  const sim = app.sim;
  const condoKeys = sim.condo.active ? ['condo', 'condoPool', ...Array.from({ length: sim.condo.floors }, (_, i) => `hall:${i + 1}`)] : [];
  const keys = ['cafe', 'shop', 'clinic', ...condoKeys, ...sim.residents.map((r) => `home:${r.id}`)];
  const m = openModal({
    title: '🚪 Rooms',
    body: (b) => {
      for (const key of keys) {
        const people = sim.residents.filter((r) => r.inside === key);
        const label = sim.placeName(key);
        const icon = { cafe: '☕', shop: '👕', clinic: '🏥', condo: '🏢', condoPool: '🏊' }[key] || (key.startsWith('hall:') ? '🚪' : sim.condo.unitOf(key.slice(5)) != null ? '🏢' : '🏠');
        b.append(h('div', { class: 'asset-row' }, h('span', { style: { fontSize: '22px' } }, icon), h('span', { class: 'nm' }, label),
          h('span', { class: 'grow hint' }, people.length ? people.map((p) => `${p.name}${p.working ? ' (working)' : ''}`).join(', ') : 'empty'),
          h('button', { class: 'small primary', onclick: () => { m.close(); app.viewRoom(key); } }, 'Look inside'),
          h('button', { class: 'small', onclick: () => { m.close(); openDecorate(app, key); } }, '🎨')));
      }
    },
  });
}

export function openDecorate(app, key) {
  const sim = app.sim;
  const rooms = sim.rooms;
  const room = rooms.get(key);
  if (!room) return;
  const textures = sim.library.list('texture');
  const m = openModal({
    title: `🎨 Decorate — ${room.label(sim)}`,
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        const st = room.style;
        const apply = async (patch) => { await rooms.setStyle(key, patch); render(); };
        const swatches = (list, current, cb) => h('div', { class: 'row' }, ...list.map((c) => h('span', { class: 'swatch', style: { background: c, outline: c === current ? '3px solid var(--accent)' : '' }, onclick: () => cb(c) })),
          h('input', { type: 'color', value: current, onchange: (e) => cb(e.target.value) }));
        const texSel = (current, cb) => {
          const s = h('select', { onchange: (e) => cb(e.target.value || null) }, h('option', { value: '' }, 'No texture'), ...textures.map((t) => h('option', { value: t.id, selected: t.id === current }, sim.library.displayName(t.id))));
          return s;
        };
        b.append(
          h('div', { class: 'field' }, h('label', {}, 'Walls'), swatches(WALL_COLORS, st.wall, (c) => apply({ wall: c, wallTex: null })), textures.length ? h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Wallpaper'), texSel(st.wallTex, (v) => apply({ wallTex: v }))) : null),
          h('div', { class: 'field' }, h('label', {}, 'Floor'), swatches(FLOOR_COLORS, st.floor, (c) => apply({ floor: c, floorTex: null })), textures.length ? h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Flooring'), texSel(st.floorTex, (v) => apply({ floorTex: v }))) : null),
          h('div', { class: 'field' }, h('label', {}, 'Furniture'), swatches(WOOD_COLORS, st.wood, (c) => apply({ wood: c }))),
        );
        const slots = room.layout.decorSlots || [];
        const decor = h('div', { class: 'row' });
        slots.forEach((_, i) => {
          const sel = h('select', { onchange: (e) => { const d = [...(st.decor || [])]; d[i] = e.target.value; apply({ decor: d }); } },
            ...Object.entries(DECOR_ITEMS).map(([k, v]) => h('option', { value: k, selected: (st.decor?.[i] || 'none') === k }, `${v.icon} ${v.label}`)));
          decor.append(h('span', { class: 'tag' }, `Spot ${i + 1} `, sel));
        });
        b.append(h('div', { class: 'field' }, h('label', {}, 'Decorations'), decor),
          h('div', { class: 'hint' }, 'Import textures in 📦 Library → Textures to use them as wallpaper or flooring.'));
      };
      render();
    },
    foot: (f) => f.append(...[
      sim.viewRoom === room ? null : h('button', { onclick: () => { m.close(); app.viewRoom(key); } }, 'Look inside'),
      h('button', { class: 'primary', onclick: () => m.close() }, 'Done'),
    ].filter(Boolean)),
  });
}

/** Job section for the resident panel. */
export function jobSection(app, res, rerender) {
  const sim = app.sim;
  const j = jobOf(res);
  const wrap = h('div', {});
  if (!j) {
    wrap.append(h('div', { class: 'row' }, h('span', {}, '🛋️ Unemployed'), h('button', { class: 'small primary', onclick: () => openJobPicker(app, res, (id) => { assignJob(sim, res, id); rerender(); }) }, '💼 Find a job')));
    return wrap;
  }
  const job = res.d.job;
  const fit = jobFit(j, res.t);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  wrap.append(
    h('div', { class: 'row' }, h('b', {}, `${j.icon} ${jobTitle(res)}`), res.working ? h('span', { class: 'tag good' }, 'at work') : isOnShift(res, sim) ? h('span', { class: 'tag' }, 'on shift') : null),
    h('div', { class: 'meta' }, `${String(j.start).padStart(2, '0')}:00–${String(j.end).padStart(2, '0')}:00 · day off: ${days[job.dayOff ?? 0]} (every 7th day) · ${Math.round(jobWage(res))} 🪙/h · earned ${Math.round(job.earned || 0)} 🪙`),
    h('div', { class: 'meta' }, `Likes the job: ${'★'.repeat(Math.round(fit * 5))}${'☆'.repeat(5 - Math.round(fit * 5))} · next promotion ${promoPct(job)}%`),
    h('div', { class: 'meta' }, `Perk: ${j.perk}`),
    h('div', { class: 'row', style: { marginTop: '4px' } },
      h('button', { class: 'small', onclick: () => openJobPicker(app, res, (id) => { assignJob(sim, res, id); rerender(); }) }, 'Change job…'),
      j.indoor ? h('button', { class: 'small', onclick: () => app.viewRoom(j.place) }, `Look inside the ${ROOM_LABELS[j.place]}`) : null),
  );
  return wrap;
}

function promoPct(job) {
  const need = (l) => 600 * (l ** 1.6);
  const lo = job.level ? need(job.level) : 0;
  const hi = need(job.level + 1);
  return Math.round(Math.max(0, Math.min(100, (((job.xp || 0) - lo) / (hi - lo)) * 100)));
}

export function openJobPicker(app, res, onPick) {
  const sim = app.sim;
  const m = openModal({
    title: `💼 Jobs for ${res.name}`,
    wide: true,
    body: (b) => {
      const grid = h('div', { class: 'grid2' });
      for (const id of [...JOB_IDS, 'none']) {
        const j = JOBS[id];
        const fit = id === 'none' ? null : jobFit(j, res.t);
        const coworkers = sim.residents.filter((r) => r !== res && r.d.job?.id === id).map((r) => r.name);
        const needLv = sim.progress.levelFor('jobs', id);
        const locked = (j.needs === 'condo' && !sim.condo.active) || needLv > sim.progress.level;
        grid.append(h('div', { class: 'card' },
          h('div', { class: 'row' }, h('b', { style: { fontSize: '16px' } }, `${j.icon} ${j.label}`),
            fit !== null ? h('span', { class: 'tag', title: 'How well it suits their personality' }, `${'★'.repeat(Math.round(fit * 5))}${'☆'.repeat(5 - Math.round(fit * 5))}`) : null,
            h('button', { class: `small ${res.d.job?.id === id ? 'active' : 'primary'}`, disabled: locked, title: locked ? 'Opens when the condo is built (more than 10 residents)' : '', style: { marginLeft: 'auto' }, onclick: () => { m.close(); onPick(id); } }, locked ? (needLv > sim.progress.level ? `🔒 Island Lv ${needLv}` : '🔒 Needs condo') : res.d.job?.id === id || (!res.d.job && id === 'none') ? 'Current' : 'Choose')),
          id === 'none' ? h('div', { class: 'hint' }, 'No work, no pay — more free time.') : h('div', { class: 'hint' }, `${ROOM_LABELS[j.place] || j.place} · ${j.start}:00–${j.end}:00 · ${j.wage} 🪙/h${j.rainOff ? ' · off when it rains' : ''}`),
          j.perk ? h('div', { class: 'hint' }, `Perk: ${j.perk}`) : null,
          coworkers.length ? h('div', { class: 'hint' }, `Coworkers: ${coworkers.join(', ')}`) : null));
      }
      b.append(h('p', { class: 'hint' }, 'Working residents earn coins for the island, get promoted over time and bond with coworkers. A job that doesn\'t fit their personality makes them unhappy.'), grid);
    },
  });
}

export { toast };
