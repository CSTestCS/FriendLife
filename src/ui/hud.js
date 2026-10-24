// HUD: top bar, resident list, speech bubbles, alerts, picking.
import { ISLAND_LEVELS, islandTitle } from '../sim/progress.js';
import * as THREE from 'three';
import { $, h, esc, toast, openModal } from './dom.js';
import { formatClock } from '../core/util.js';
import { WEATHER_TYPES } from '../engine/weather.js';
import { personalityLabel } from '../sim/data.js';
import { PROBLEM_DEFS } from '../sim/problems.js';
import { jobTitle } from '../sim/jobs.js';
import { openBudget } from './misc.js';
import { importCharacter } from './charIO.js';

const _v = new THREE.Vector3();

export class Hud {
  constructor(app) {
    this.app = app;
    this.sim = app.sim;
    this.bubbleEls = new Map();
    this.hovered = null;
    this.buildTopbar();
    this.renderList();
    const sim = this.sim;
    sim.on('residents', () => this.renderList());
    sim.on('problem', () => this.renderList());
    sim.on('select', () => this.renderList());
    sim.on('alert', (a) => this.alert(a));
    sim.on('toast', (t) => toast(t));
    this.listTimer = 0;
  }

  buildTopbar() {
    const bar = $('#topbar');
    bar.innerHTML = '';
    this.clockEl = h('div', { class: 'clock' });
    this.weatherEl = h('div', { class: 'chip', title: 'Weather (click for settings)', style: { cursor: 'pointer' }, onclick: () => this.app.openSettings('weather') });
    this.moneyEl = h('div', { class: 'chip', title: 'Coins (click for the budget & venues)', style: { cursor: 'pointer' }, onclick: () => openBudget(this.app) });
    this.levelEl = h('div', { class: 'chip', title: 'Island level (click for progress & unlocks)', style: { cursor: 'pointer' }, onclick: () => openProgress(this.app) });
    const speeds = [0, 1, 2, 4, 8];
    this.speedBtns = speeds.map((s) => h('button', { class: 'small', title: s === 0 ? 'Pause (Space)' : `${s}x speed`, onclick: () => this.app.setSpeed(s) }, s === 0 ? '⏸' : `${s}x`));
    bar.append(
      this.clockEl, this.weatherEl, this.moneyEl, this.levelEl, h('div', { class: 'sep' }),
      ...this.speedBtns, h('div', { class: 'sep' }),
      h('button', { title: 'Shop', onclick: () => this.app.openShop() }, '🛍️', h('span', { class: 'tb-label' }, ' Shop')),
      h('button', { title: 'Island news', onclick: () => this.app.openNews() }, '📰', h('span', { class: 'tb-label' }, ' News')),
      h('button', { title: 'Island dictionary — words residents use', onclick: () => this.app.openDictionary() }, '📖', h('span', { class: 'tb-label' }, ' Words')),
      h('button', { title: 'Look inside houses, the café, shop, clinic and condo (H)', onclick: () => this.app.openRooms() }, '🏠', h('span', { class: 'tb-label' }, ' Rooms')),
      h('button', { title: 'Import & manage VRM characters, outfits, textures, animations', onclick: () => this.app.openLibrary() }, '📦', h('span', { class: 'tb-label' }, ' Library')),
      h('button', { title: 'Animation Studio', onclick: () => this.app.openStudio() }, '🎬', h('span', { class: 'tb-label' }, ' Studio')),
      h('button', { title: 'Decorate the island (B)', onclick: () => this.app.toggleBuild() }, '🔨', h('span', { class: 'tb-label' }, ' Build')),
      h('button', { title: 'Settings', onclick: () => this.app.openSettings() }, '⚙️'),
    );
  }

  updateTopbar() {
    const sim = this.sim;
    const w = WEATHER_TYPES[sim.weather.type];
    this.clockEl.textContent = `Day ${sim.day} · ${formatClock(sim.minuteOfDay)}`;
    const next = WEATHER_TYPES[sim.weather.next];
    this.weatherEl.textContent = `${w.icon} ${w.label}${sim.weather.wetness > 0.3 ? ' · 💧wet' : ''}`;
    this.weatherEl.title = sim.weather.locked ? 'Weather locked (Settings)' : `Forecast: ${next?.icon} ${next?.label} later`;
    this.moneyEl.textContent = `🪙 ${Math.floor(sim.money)}`;
    this.moneyEl.classList.toggle('bad', sim.money < 0);
    const pr = sim.progress;
    this.levelEl.innerHTML = `🏝️ Lv ${pr.level} <span class="lvbar"><i style="width:${Math.round(pr.pct * 100)}%"></i></span>`;
    this.speedBtns.forEach((b, i) => b.classList.toggle('active', [0, 1, 2, 4, 8][i] === sim.speed));
  }

  renderList() {
    const list = $('#residentList');
    list.innerHTML = '';
    for (const r of this.sim.residents) {
      const card = h('div', { class: `res-card ${this.sim.selected === r ? 'sel' : ''}`, onclick: () => this.sim.select(r) },
        h('div', { class: 'face' }, r.moodIcon()),
        h('div', {}, h('div', { class: 'nm' }, r.name), h('div', { class: 'sub' }, this.statusLine(r))),
        r.d.problem ? h('div', { class: 'prob', title: 'Has a problem!' }, PROBLEM_DEFS[r.d.problem.type]?.icon || '❗') : null,
      );
      card.dataset.id = r.id;
      list.append(card);
    }
    list.append(h('div', { class: 'res-card add', onclick: () => this.app.openCreator() }, '＋ New Resident'));
    list.append(h('div', { class: 'res-card add', title: 'Import a character exported from FriendLife', onclick: () => importCharacter(this.app) }, '📥 Import Character'));
  }

  statusLine(r) {
    if (r.ko) return '💫 Knocked down';
    if (r.engaged?.isFight) return '🥊 Fighting!';
    if (r.engaged) return `💬 ${r.engaged.kind === 'argue' ? 'Arguing' : 'Chatting'}`;
    if (r.working) return `💼 Working · ${jobTitle(r)}`;
    if (r.inside) return `🏠 ${this.sim.placeName(r.inside)}${r.sleeping ? ' (zzz)' : ''}`;
    if (r.d.injuries.length) return `🤕 ${personalityLabel(r.t)}`;
    return `Lv ${r.d.level} · ${personalityLabel(r.t)}`;
  }

  refreshListStatus() {
    for (const card of $('#residentList').children) {
      const r = this.sim.byId(card.dataset.id);
      if (!r) continue;
      card.querySelector('.face').textContent = r.moodIcon();
      card.querySelector('.sub').textContent = this.statusLine(r);
    }
  }

  alert({ text, onClick, kind }) {
    const el = h('div', { class: `alert ${kind}`, onclick: () => { onClick?.(); el.remove(); } }, text);
    const root = $('#alerts');
    root.prepend(el);
    while (root.children.length > 5) root.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  // --- speech bubbles & markers projected over residents
  updateBubbles() {
    const sim = this.sim;
    const cam = sim.stage.camera;
    const w = window.innerWidth, hgt = window.innerHeight;
    const root = $('#bubbles');
    const seen = new Set();
    for (const r of sim.residents) {
      seen.add(r.id);
      let el = this.bubbleEls.get(r.id);
      if (!el) {
        el = h('div', { class: 'bub' });
        el.innerHTML = '<div class="slot"></div><div class="name"></div>';
        root.append(el);
        this.bubbleEls.set(r.id, el);
        el.addEventListener('click', (e) => { if (e.target.classList.contains('marker')) { sim.select(r); } });
      }
      // only residents in what we're looking at: the island, or the room we're inside
      const show = (sim.viewRoom ? r.room === sim.viewRoom : !r.inside) && r.group.visible;
      if (!show) { el.style.display = 'none'; continue; }
      _v.set(r.x, r.group.position.y + (r.headHeight || 1.4) + 0.25, r.z).project(cam);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { el.style.display = 'none'; continue; }
      const dist = cam.position.distanceTo(r.group.position);
      el.style.display = 'flex';
      el.style.left = `${((_v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - _v.y) / 2) * hgt}px`;
      el.style.zIndex = String(1000 - Math.round(dist));
      const scale = Math.max(0.55, Math.min(1, 18 / dist));
      el.style.transform = `translate(-50%, -100%) scale(${scale})`;
      // content
      let html = '';
      const b = r.bubble;
      if (b && dist < 60) {
        if (b.kind === 'emote' || !b.text) html = `<div class="emote">${esc(b.emoji)}</div>`;
        else html = `<div class="speech">${b.emoji ? `<span class="em">${esc(b.emoji)}</span> ` : ''}${esc(b.text)}</div>`;
      } else if (r.d.problem && !r.engaged) {
        html = `<div class="marker" title="${esc(r.name)} needs help">${PROBLEM_DEFS[r.d.problem.type]?.icon || '❗'}</div>`;
      }
      const slot = el.firstChild;
      if (slot._html !== html) { slot.innerHTML = html; slot._html = html; }
      const nameEl = el.lastChild;
      const showName = sim.selected === r || this.hovered === r || dist < 9;
      nameEl.style.display = showName ? '' : 'none';
      if (showName && nameEl.textContent !== r.name) nameEl.textContent = r.name;
    }
    for (const [id, el] of this.bubbleEls) if (!seen.has(id)) { el.remove(); this.bubbleEls.delete(id); }
  }

  update(dt) {
    this.updateTopbar();
    this.updateBubbles();
    this.listTimer -= dt;
    if (this.listTimer <= 0) { this.listTimer = 0.7; this.refreshListStatus(); }
  }
}

/** Island level, progress and what each level unlocks. */
export function openProgress(app) {
  const sim = app.sim;
  const pr = sim.progress;
  openModal({
    title: `🏝️ ${islandTitle(pr.level)} — level ${pr.level}`,
    body: (b) => {
      b.append(
        h('div', { class: 'meta' }, `Island XP: ${Math.floor(pr.xp)} / ${pr.next} to level ${pr.level + 1}`),
        h('div', { class: 'lvbar', style: { width: '100%', height: '10px', margin: '6px 0 12px' } }, h('i', { style: { width: `${Math.round(pr.pct * 100)}%` } })),
        h('div', { class: 'hint' }, 'Earn island XP by solving residents\' problems, feeding favourites and giving gifts, stopping fights, rescues, residents levelling up and getting promoted, new residents moving in, and every new day. Each level also pays a coin bonus.'),
        h('h3', {}, 'Unlocks'),
      );
      for (const l of ISLAND_LEVELS) {
        const got = l.level <= pr.level;
        b.append(h('div', { class: 'row', style: { opacity: got ? 1 : 0.6 } }, h('span', { class: `tag ${got ? 'good' : ''}` }, got ? '✓' : `Lv ${l.level}`), h('span', {}, l.text)));
      }
      b.append(h('h3', {}, 'Resident levels'), h('div', { class: 'hint' }, 'Residents level up from happiness, your help, classes and work. Each level: higher wages, faster promotions, safer swimming, tougher in fights, more charming, happier. Level 5: they throw house parties. Level 8: island celebrity with fans.'));
    },
  });
}
