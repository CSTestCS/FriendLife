// Shop, news, settings and build-mode UI.
import * as THREE from 'three';
import { $, h, openModal, toast, confirmBox, download, pickFiles } from './dom.js';
import { FOODS, ITEMS } from '../sim/data.js';
import { WEATHER_TYPES } from '../engine/weather.js';
import { BUILD_CATALOG } from '../world/props.js';
import { formatClock } from '../core/util.js';
import { VENUES, COSTS } from '../sim/economy.js';

export function openShop(app) {
  const sim = app.sim;
  const m = openModal({
    title: '🛍️ Island Shop',
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        b.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'tag' }, `🪙 ${Math.floor(sim.money)} coins`), h('span', { class: 'hint' }, 'Earn coins by solving residents\' problems, when they level up, and from their jobs.'),
          sim.residents.some((r) => r.working && r.d.job?.id === 'clerk') ? h('span', { class: 'tag good' }, '🛍️ Clerk on duty: 10% off!') : null));
        const section = (title, list) => {
          b.append(h('h3', {}, title));
          const grid = h('div', { class: 'grid3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' } });
          for (const it of list) {
            const need = sim.progress.levelFor('items', it.id);
            const locked = need > sim.progress.level;
            grid.append(h('div', { class: 'shop-item', title: it.desc || '', style: locked ? { opacity: 0.55 } : {} }, h('div', { class: 'ic' }, locked ? '🔒' : it.icon), h('b', {}, it.name),
              it.desc ? h('div', { class: 'hint' }, it.desc) : null,
              h('div', { class: 'hint' }, `Owned: ${sim.inventory[it.id] || 0}`),
              locked ? h('div', { class: 'tag' }, `Island level ${need}`)
                : h('button', { class: 'primary small', disabled: sim.money < sim.price(it), onclick: () => { if (sim.buy(it.id)) render(); } }, `Buy · ${sim.price(it)} 🪙`)));
          }
          b.append(grid);
        };
        section('Food', FOODS);
        section('Items', ITEMS);
      };
      render();
    },
  });
  return m;
}

/** Budget: what came in and went out, the daily bills, and venues to build. */
export function openBudget(app) {
  const sim = app.sim;
  const eco = sim.economy;
  openModal({
    title: '📒 Island Budget',
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        const sum = (o) => Math.round(Object.values(o || {}).reduce((a, c) => a + c, 0));
        const rows = (o, sign) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]).map(([k, v]) => h('div', { class: 'row' }, h('span', { style: { flex: 1 } }, k), h('b', {}, `${sign}${Math.round(v)} 🪙`)));
        const mul = eco.mul;
        const rent = Math.round(COSTS.rent * sim.residents.length * mul);
        const upkeep = [...eco.owned].reduce((a, k) => a + Math.round((VENUES[k]?.upkeep || 0) * mul), 0);
        b.append(h('div', { class: 'row', style: { marginBottom: '8px', gap: '8px' } },
          h('span', { class: `tag ${sim.money < 0 ? 'bad' : 'good'}` }, `🪙 ${Math.floor(sim.money)}${sim.money < 0 ? ' (in debt!)' : ''}`),
          h('span', { class: 'tag' }, `Tomorrow's bills: rent ${rent} 🪙 (${sim.residents.length} apartments) + upkeep ${upkeep} 🪙`),
          h('span', { class: 'tag' }, `Working: ${sim.residents.filter((r) => r.d.job).length}/${sim.residents.length} residents`)));
        b.append(h('div', { class: 'hint' }, `Residents' jobs pay the bills. Everyday spending: café ${Math.round(COSTS.cafe * mul)}, snack ${Math.round(COSTS.snack * mul)}, hot spring ${Math.round(COSTS.onsen * mul)}, shopping ${Math.round(COSTS.shop * mul)}, clinic ${Math.round(COSTS.clinic * mul)} 🪙. In debt, residents get unhappy and the shop won't sell to you.`));
        const cols = h('div', { class: 'grid2', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } });
        cols.append(
          h('div', {}, h('h3', {}, `Today: +${sum(eco.today.income)} / −${sum(eco.today.spent)}`), h('b', {}, 'Earned'), ...rows(eco.today.income, '+'), h('b', {}, 'Spent'), ...rows(eco.today.spent, '−')),
          h('div', {}, h('h3', {}, eco.yesterday ? `Yesterday: +${sum(eco.yesterday.income)} / −${sum(eco.yesterday.spent)}` : 'Yesterday'), eco.yesterday ? h('div', {}, h('b', {}, 'Earned'), ...rows(eco.yesterday.income, '+'), h('b', {}, 'Spent'), ...rows(eco.yesterday.spent, '−')) : h('div', { class: 'hint' }, 'No full day yet.')),
        );
        b.append(cols);
        b.append(h('h3', {}, '🏗️ Venues'));
        const grid = h('div', { class: 'grid3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' } });
        for (const [k, v] of Object.entries(VENUES)) {
          const own = eco.owned.has(k);
          grid.append(h('div', { class: 'shop-item' }, h('div', { class: 'ic' }, v.icon), h('b', {}, v.label), h('div', { class: 'hint' }, v.desc),
            h('div', { class: 'hint' }, `Upkeep ${Math.round(v.upkeep * mul)} 🪙/day`),
            own ? h('span', { class: 'tag good' }, 'Open')
              : h('button', { class: 'primary small', disabled: sim.money < v.price, onclick: () => { const err = eco.buyVenue(k); if (err) toast(err); render(); } }, `Build · ${v.price} 🪙`)));
        }
        b.append(grid);
      };
      render();
    },
  });
}

export function openNews(app) {
  const sim = app.sim;
  openModal({
    title: '📰 Island News',
    body: (b) => {
      if (!sim.newsLog.length) b.append(h('div', { class: 'empty' }, 'Nothing has happened yet.'));
      for (const n of sim.newsLog) {
        b.append(h('div', { class: 'news-item' }, h('div', { class: 'ic' }, n.icon), h('div', {}, h('div', {}, n.text), h('div', { class: 'when' }, `Day ${n.day} · ${formatClock(n.time)}`))));
      }
    },
  });
}

export function openSettings(app, focus) {
  const sim = app.sim;
  const st = sim.settings;
  const m = openModal({
    title: '⚙️ Settings',
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        const left = h('div', {});
        const right = h('div', {});
        b.append(h('div', { class: 'grid2' }, left, right));
        // conflict
        const levels = [
          ['off', '☮️ Peaceful', 'No arguments or fights. Everyone gets along (mostly).'],
          ['mild', '💢 Mild', 'Arguments, insults, pranks, jealousy — but never physical.'],
          ['normal', '🥊 Normal', 'Heated conflicts can turn into fist fights with injuries.'],
          ['spicy', '🌶️ Spicy', 'Short fuses, more brawls, more injuries.'],
        ];
        left.append(h('h3', {}, 'Conflict'));
        for (const [k, label, desc] of levels) {
          left.append(h('label', { class: 'card', style: { display: 'flex', gap: '8px', marginBottom: '6px', cursor: 'pointer' } },
            h('input', { type: 'radio', name: 'conflict', checked: st.conflict === k, onchange: () => { st.conflict = k; } }),
            h('div', {}, h('b', {}, label), h('div', { class: 'hint' }, desc))));
        }
        left.append(h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.romance, onchange: (e) => { st.romance = e.target.checked; } }), ' Romance (crushes, dating, breakups)'));

        // weather
        right.append(h('h3', {}, 'Weather'));
        const wrow = h('div', { class: 'row' });
        wrow.append(h('button', { class: !sim.weather.locked ? 'active' : '', onclick: () => { sim.weather.locked = false; render(); } }, '🔄 Dynamic'));
        for (const [k, w] of Object.entries(WEATHER_TYPES)) {
          wrow.append(h('button', { class: sim.weather.locked && sim.weather.type === k ? 'active' : '', title: 'Lock this weather', onclick: () => { sim.weather.set(k, true); render(); } }, `${w.icon} ${w.label}`));
        }
        right.append(wrow, h('div', { class: 'hint' }, 'Dynamic weather changes every few hours. Rain soaks residents (wet sheen!), makes surfaces glossy, forms puddles and makes people grumpier and slip when running. Thunderstorms flash and rumble. Snow piles up.'));
        right.append(h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'lbl' }, 'Ground wetness'),
          h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: sim.weather.wetness, oninput: (e) => { sim.weather.wetness = +e.target.value; } })));

        right.append(h('h3', {}, 'Time'));
        right.append(h('div', { class: 'row' }, ...[[6, '🌅 Morning'], [12, '☀️ Noon'], [18, '🌇 Evening'], [22, '🌙 Night']].map(([hr, label]) => h('button', { class: 'small', onclick: () => {
          const day = Math.floor(sim.clock / 1440);
          let target = day * 1440 + hr * 60;
          if (target < sim.clock) target += 1440;
          sim.clock = target;
          toast(`Skipped to ${label}`);
        } }, label))));

        right.append(h('h3', {}, 'Voices'));
        right.append(
          h('div', { class: 'row' }, ...[['speech', '🗣️ Speech'], ['babble', '🎶 Babble'], ['off', '🔇 Off']].map(([k, label]) => h('button', { class: `small ${st.voice === k ? 'active' : ''}`, onclick: () => { st.voice = k; render(); } }, label))),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Speech for'), ...[['selected', 'Selected resident'], ['near', 'Everyone nearby']].map(([k, label]) => h('button', { class: `small ${st.voiceScope === k ? 'active' : ''}`, onclick: () => { st.voiceScope = k; render(); } }, label))),
          h('div', { class: 'hint' }, 'Speech uses each resident\'s voice (built-in synthesizer or a system voice — edit in 🎙️ Voice). Residents not chosen here babble.'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.autoOutfits !== false, onchange: (e) => { st.autoOutfits = e.target.checked; } }), ' Residents change outfits by weather/time'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.nightMischief !== false, onchange: (e) => { st.nightMischief = e.target.checked; } }), ' 🌙 Night mischief (residents sometimes sneak out at night)'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, '🪙 Cost of living'), ...[['relaxed', 'Relaxed'], ['normal', 'Normal'], ['tight', 'Tight']].map(([k, label]) => h('button', { class: `small ${(st.economy || 'normal') === k ? 'active' : ''}`, onclick: () => { st.economy = k; render(); } }, label))),
          (() => {
            const pct = (v) => `${Math.round((v ?? 0.05) * 100)}%`;
            const out = h('span', { class: 'lbl' }, pct(st.underwearRate));
            return h('div', { class: 'row' }, h('span', { class: 'lbl' }, '🩲 Leave home in underwear'),
              h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.underwearRate ?? 0.05, oninput: (e) => { st.underwearRate = +e.target.value; out.textContent = pct(st.underwearRate); } }), out);
          })(),
          h('div', { class: 'hint' }, 'How often a resident heads out without noticing they\'re still in underwear / half-dressed (also how often someone forgets to get dressed in the morning). 0% = never.'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.ik !== false, onchange: (e) => { st.ik = e.target.checked; } }), ' Foot IK & head tracking'),
        );
        right.append(h('h3', {}, 'Audio & view'));
        right.append(
          (() => {
            const out = h('span', { class: 'lbl' }, `${Math.round((st.nightBrightness ?? 0.5) * 100)}%`);
            return h('div', { class: 'row' }, h('span', { class: 'lbl' }, '🌙 Night brightness'),
              h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.nightBrightness ?? 0.5, oninput: (e) => { st.nightBrightness = +e.target.value; out.textContent = `${Math.round(st.nightBrightness * 100)}%`; } }), out);
          })(),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.music, onchange: (e) => { st.music = e.target.checked; sim.audio.setMusic(st.music); } }), ' Music'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Master'), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.volume, oninput: (e) => { st.volume = +e.target.value; sim.audio.setVolume(st.volume); } })),
          ...[['voiceVolume', 'voice', '🗣️ Voices'], ['musicVolume', 'music', '🎵 Music'], ['ambientVolume', 'ambient', '🌧️ Ambient & effects']].map(([key, ch, label]) =>
            h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st[key] ?? 1, oninput: (e) => { st[key] = +e.target.value; sim.audio.setLevel(ch, st[key]); } }))),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.follow, onchange: (e) => { st.follow = e.target.checked; } }), ' Camera follows selected resident'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.shadows, onchange: (e) => { st.shadows = e.target.checked; app.applyGraphics(); } }), ' Shadows'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Resolution'), ...['low', 'high'].map((q) => h('button', { class: `small ${st.quality === q ? 'active' : ''}`, onclick: () => { st.quality = q; app.applyGraphics(); render(); } }, q))),
        );

        b.append(h('h3', {}, 'Island'));
        b.append(h('div', { class: 'row' },
          h('button', { onclick: async () => { await app.save(); toast('Saved!'); } }, '💾 Save now'),
          h('button', { onclick: () => download(`friendlife-save-day${sim.day}.json`, JSON.stringify(sim.serialize())) }, '⬇ Export save'),
          h('button', { onclick: async () => {
            const [f] = await pickFiles('.json', false);
            if (!f) return;
            try { const data = JSON.parse(await f.text()); if (!data.residents) throw new Error('Not a FriendLife save'); await sim.library.saveGame('main', data); location.reload(); } catch (e) { toast(e.message); }
          } }, '⬆ Import save'),
          sim.library.desktop ? h('button', { onclick: () => sim.library.desktop.openModsFolder('') }, '📂 Mods folder') : null,
          h('button', { class: 'danger', onclick: async () => { if (await confirmBox('Start a brand new island? Your residents will be gone (imported files stay in the Library).', 'Start over')) { await sim.library.deleteGame('main'); location.reload(); } } }, '🌱 New island'),
        ));
        b.append(h('h3', {}, 'Controls'), h('div', { class: 'row' },
          h('button', { class: 'primary', onclick: () => app.openControls() }, '🎮 Controls & key bindings…'),
          h('span', { class: 'hint', html: 'Mouse: drag to rotate, other button pans, wheel zooms. Keyboard: <span class="kbd">WASD</span> pan · <span class="kbd">Q/E</span> rotate · <span class="kbd">Z/X</span> zoom · <span class="kbd">Space</span> pause · <span class="kbd">Tab</span> next resident · <span class="kbd">C</span> follow selected. Gamepad: left stick cursor, Ⓐ select, Ⓑ back, right stick camera. All rebindable.' })));
      };
      render();
    },
  });
  if (focus === 'weather') m.body.scrollTop = 0;
}

// ---------------------------------------------------------------- build mode
export class BuildMode {
  constructor(app) {
    this.app = app;
    this.sim = app.sim;
    this.active = false;
    this.type = BUILD_CATALOG[0].type;
    this.rot = 0;
    this.ghost = null;
    this.erase = false;
    this.bar = $('#buildbar');
  }

  toggle(on = !this.active) {
    this.active = on;
    this.bar.classList.toggle('hidden', !on);
    if (on) this.renderBar();
    else this.clearGhost();
  }

  renderBar() {
    this.bar.innerHTML = '';
    for (const d of BUILD_CATALOG) {
      this.bar.append(h('button', { class: !this.erase && this.type === d.type ? 'active' : '', onclick: () => { this.type = d.type; this.erase = false; this.clearGhost(); this.renderBar(); } }, h('span', { class: 'ic' }, d.icon), d.label));
    }
    this.bar.append(
      h('button', { class: this.erase ? 'active' : '', onclick: () => { this.erase = !this.erase; this.clearGhost(); this.renderBar(); } }, h('span', { class: 'ic' }, '🧹'), 'Remove'),
      h('button', { onclick: () => { this.rot += Math.PI / 4; } }, h('span', { class: 'ic' }, '🔄'), 'Rotate (R)'),
      h('button', { onclick: () => this.surfaceMenu() }, h('span', { class: 'ic' }, '🖼️'), 'Surfaces'),
      h('button', { onclick: () => openBudget(this.app) }, h('span', { class: 'ic' }, '🏗️'), 'Venues'),
      h('button', { class: 'primary', onclick: () => this.toggle(false) }, h('span', { class: 'ic' }, '✔'), 'Done'),
    );
  }

  surfaceMenu() {
    const lib = this.sim.library;
    const texs = lib.list('texture');
    openModal({
      title: '🖼️ Island surfaces',
      body: (b) => {
        if (!texs.length) b.append(h('div', { class: 'empty' }, 'Import textures in 📦 Library → Textures first.'));
        for (const surface of ['ground', 'path']) {
          const row = h('div', { class: 'row', style: { marginBottom: '8px' } }, h('b', { style: { width: '70px' } }, surface));
          row.append(h('button', { class: 'small', onclick: () => this.app.setSurface(surface, null) }, 'Default'));
          for (const t of texs) row.append(h('button', { class: 'small', onclick: () => this.app.setSurface(surface, t.id) }, lib.displayName(t.id)));
          b.append(row);
        }
      },
    });
  }

  clearGhost() {
    if (this.ghost) { this.ghost.removeFromParent(); this.ghost = null; }
  }

  pointerMove(point) {
    if (!this.active || this.erase || !point) { this.clearGhost(); return; }
    if (!this.ghost || this.ghost.userData.type !== this.type) {
      this.clearGhost();
      const def = BUILD_CATALOG.find((d) => d.type === this.type);
      this.ghost = def.make();
      this.ghost.userData.type = this.type;
      this.ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.55;
          o.castShadow = false;
        }
      });
      this.sim.scene.add(this.ghost);
    }
    this.ghost.position.set(point.x, this.sim.island.heightAt(point.x, point.z), point.z);
    this.ghost.rotation.y = this.rot;
  }

  remove(propId) {
    if (!propId) return;
    this.sim.island.removeProp(propId);
    this.sim.money += 5;
    this.sim.audio.pop();
  }

  click(point) {
    const sim = this.sim;
    if (!point) return;
    if (Math.hypot(point.x, point.z) > 40) return toast('Too close to the water!');
    if (sim.island.isBlocked(point.x, point.z, 0.3)) return toast('Something is in the way.');
    if (sim.money < 10) return toast('Each decoration costs 10 🪙.');
    sim.money -= 10;
    sim.economy.paid(10, 'decorations');
    sim.island.placeProp(this.type, point.x, point.z, this.rot);
    sim.audio.pop();
  }
}
