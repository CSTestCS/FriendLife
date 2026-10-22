// Shop, news, settings and build-mode UI.
import * as THREE from 'three';
import { $, h, openModal, toast, confirmBox, download, pickFiles } from './dom.js';
import { FOODS, ITEMS } from '../sim/data.js';
import { WEATHER_TYPES } from '../engine/weather.js';
import { BUILD_CATALOG } from '../world/props.js';
import { formatClock } from '../core/util.js';

export function openShop(app) {
  const sim = app.sim;
  const m = openModal({
    title: '🛍️ Island Shop',
    wide: true,
    body: (b) => {
      const render = () => {
        b.innerHTML = '';
        b.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'tag' }, `🪙 ${Math.floor(sim.money)} coins`), h('span', { class: 'hint' }, 'Earn coins by solving residents\' problems and when they level up.')));
        const section = (title, list) => {
          b.append(h('h3', {}, title));
          const grid = h('div', { class: 'grid3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' } });
          for (const it of list) {
            grid.append(h('div', { class: 'shop-item', title: it.desc || '' }, h('div', { class: 'ic' }, it.icon), h('b', {}, it.name),
              it.desc ? h('div', { class: 'hint' }, it.desc) : null,
              h('div', { class: 'hint' }, `Owned: ${sim.inventory[it.id] || 0}`),
              h('button', { class: 'primary small', disabled: sim.money < it.price, onclick: () => { if (sim.buy(it.id)) render(); } }, `Buy · ${it.price} 🪙`)));
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
          h('div', { class: 'hint' }, 'Speech uses your computer\'s text-to-speech voices with each resident\'s pitch/speed (edit in ✏️ Edit). Others babble.'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.autoOutfits !== false, onchange: (e) => { st.autoOutfits = e.target.checked; } }), ' Residents change outfits by weather/time'),
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.ik !== false, onchange: (e) => { st.ik = e.target.checked; } }), ' Foot IK & head tracking'),
        );
        right.append(h('h3', {}, 'Audio & view'));
        right.append(
          h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: st.music, onchange: (e) => { st.music = e.target.checked; sim.audio.setMusic(st.music); } }), ' Music'),
          h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Volume'), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.volume, oninput: (e) => { st.volume = +e.target.value; sim.audio.setVolume(st.volume); } })),
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
        b.append(h('h3', {}, 'Controls'), h('div', { class: 'hint', html: '<span class="kbd">Left-drag</span> orbit · <span class="kbd">Right-drag</span> pan · <span class="kbd">Wheel</span> zoom · <span class="kbd">Click</span> select resident · <span class="kbd">Space</span> pause · <span class="kbd">1-4</span> speed · <span class="kbd">Tab</span> next resident · <span class="kbd">B</span> build · <span class="kbd">L</span> library · <span class="kbd">Esc</span> close' }));
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
    sim.island.placeProp(this.type, point.x, point.z, this.rot);
    sim.audio.pop();
  }
}
