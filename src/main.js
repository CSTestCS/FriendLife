// FriendLife entry point.
import * as THREE from 'three';
import { Stage } from './engine/stage.js';
import { Weather } from './engine/weather.js';
import { AudioEngine } from './engine/audio.js';
import { VoiceEngine } from './engine/voice.js';
import { openDictionary } from './ui/dictionary.js';
import { Effects } from './engine/fx.js';
import { TextureStore } from './engine/textures.js';
import { Island } from './world/island.js';
import { Library } from './core/library.js';
import { AnimationRegistry } from './characters/registry.js';
import { Sim, newResidentData } from './sim/sim.js';
import { Hud } from './ui/hud.js';
import { Panel } from './ui/panel.js';
import { openCreator } from './ui/creator.js';
import { openWardrobe } from './ui/wardrobe.js';
import { openLibrary, importFiles } from './ui/library.js';
import { openStudio } from './ui/studio.js';
import { openShop, openNews, openSettings, BuildMode } from './ui/misc.js';
import { $, h, toast, closeTopModal, anyModalOpen } from './ui/dom.js';

class App {
  async init() {
    this.stage = new Stage($('#viewport'));
    this.audio = new AudioEngine();
    this.voice = new VoiceEngine(this.audio);
    this.library = new Library();
    await this.library.init();
    this.textures = new TextureStore(this.library);
    this.registry = new AnimationRegistry(this.library);
    await this.registry.loadAll();
    this.island = new Island(this.stage.scene);
    this.weather = new Weather(this.stage, this.audio);
    this.effects = new Effects(this.stage.scene);
    this.sim = new Sim({
      stage: this.stage, island: this.island, weather: this.weather, audio: this.audio, voice: this.voice,
      library: this.library, registry: this.registry, textures: this.textures, effects: this.effects,
    });
    this.hud = new Hud(this);
    this.panel = new Panel(this);
    this.build = new BuildMode(this);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.lastFrame = performance.now();
    this.bindInput();
    this.loop();
    window.__friendlife = this; // handy for debugging from devtools
    await this.showTitle();
  }

  async showTitle() {
    const saved = await this.library.loadGame('main');
    const btns = $('#titleButtons');
    btns.innerHTML = '';
    if (saved) {
      btns.append(h('button', { class: 'primary', onclick: () => this.start(saved) }, `▶ Continue (Day ${Math.floor((saved.clock || 0) / 1440) + 1}, ${saved.residents?.length || 0} residents)`));
    }
    btns.append(h('button', { class: saved ? '' : 'primary', onclick: async () => {
      if (saved && !confirm('Start a new island? Your current island will be replaced.')) return;
      await this.library.deleteGame('main');
      this.start(null);
    } }, '🌱 New Island'));
  }

  async start(saved) {
    this.audio.start();
    $('#title').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    if (saved) {
      try {
        await this.sim.restore(saved);
        for (const [surface, id] of Object.entries(this.sim.surfaces || {})) this.setSurface(surface, id, true);
      } catch (err) {
        console.error(err);
        toast(`Could not fully load the save: ${err.message}`);
      }
      toast(`Welcome back! Day ${this.sim.day}.`);
    } else {
      this.sim.news('Welcome to your new island! Residents are moving in. 🏝️', '🏝️');
      const genders = ['f', 'm', 'f', 'm', 'x', 'f'];
      for (let i = 0; i < 6; i++) {
        const d = newResidentData(this.sim.randomName(), genders[i]);
        await this.sim.addResident(d, { announce: false });
      }
      // give the starting cast a little history so drama can happen early
      const rs = this.sim.residents;
      for (const a of rs) for (const b of rs) if (a !== b) { const r = a.rel(b.id); r.met = Math.random() < 0.6; r.score = Math.round((Math.random() - 0.35) * 40); }
      toast('Click a resident to see what they\'re up to. Import your own VRoid avatars from 📦 Library!', 6000);
    }
    this.audio.setVolume(this.sim.settings.volume);
    this.audio.setMusic(this.sim.settings.music);
    this.applyGraphics();
    this.started = true;
    this.autosaveTimer = 60;
  }

  async save() {
    if (!this.started) return;
    try {
      await this.library.saveGame('main', this.sim.serialize());
    } catch (err) {
      console.error('Save failed', err);
    }
  }

  applyGraphics() {
    const st = this.sim.settings;
    const r = this.stage.renderer;
    r.shadowMap.enabled = !!st.shadows;
    this.stage.sun.castShadow = !!st.shadows;
    r.setPixelRatio(st.quality === 'low' ? 0.75 : Math.min(window.devicePixelRatio, 2));
    this.stage.resize();
    this.stage.scene.traverse((o) => { if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach((m) => { m.needsUpdate = true; }); } });
  }

  async setSurface(surface, textureId, silent = false) {
    let tex = null;
    if (textureId) {
      try { tex = (await this.textures.get(textureId, { flipY: true, repeat: 1 })).clone(); tex.needsUpdate = true; } catch (e) { if (!silent) toast('Texture missing.'); return; }
    }
    this.island.setSurfaceTexture(surface, tex);
    this.sim.surfaces = { ...(this.sim.surfaces || {}), [surface]: textureId || null };
    if (!silent) toast(textureId ? `Applied texture to ${surface}.` : `Reset ${surface}.`);
  }

  setSpeed(s) {
    this.sim.speed = s;
    if (s > 0) this.lastSpeed = s;
  }

  openCreator(res, preset) { openCreator(this, res, preset); }
  openWardrobe(res, onDone) { openWardrobe(this, res, onDone); }
  openLibrary(tab) { openLibrary(this, tab); }
  openStudio(assetId) { openStudio(this, assetId); }
  openShop() { openShop(this); }
  openNews() { openNews(this); }
  openDictionary() { openDictionary(this); }
  openSettings(focus) { openSettings(this, focus); }
  toggleBuild() { this.build.toggle(); }

  // ------------------------------------------------------------------ input
  bindInput() {
    const canvas = this.stage.renderer.domElement;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, button: e.button }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const btn = down.button;
      down = null;
      if (moved > 6 || !this.started) return;
      this.setMouse(e);
      if (this.build.active) {
        // right-click (or the Remove tool) deletes a decoration, left-click places one
        if (btn === 2 || this.build.erase) this.build.remove(this.pickProp());
        else if (btn === 0) this.build.click(this.pickGround());
        return;
      }
      if (btn !== 0) return;
      const res = this.pickResident();
      if (res) this.sim.select(res);
      else if (this.sim.selected) { this.sim.followTarget = null; }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.started) return;
      this.setMouse(e);
      this.moveThrottle = (this.moveThrottle || 0) + 1;
      if (this.moveThrottle % 3) return;
      if (this.build.active) this.build.pointerMove(this.pickGround());
      else {
        const r = this.pickResident();
        this.hud.hovered = r;
        canvas.style.cursor = r ? 'pointer' : '';
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // when the user drags the camera, stop following
    this.stage.controls.addEventListener('start', () => { this.dragging = true; });
    this.stage.controls.addEventListener('end', () => { this.dragging = false; });
    canvas.addEventListener('wheel', () => {}, { passive: true });
    let panStart = null;
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) panStart = true; });
    canvas.addEventListener('pointermove', () => { if (panStart && this.sim) this.sim.followTarget = null; });
    window.addEventListener('pointerup', () => { panStart = null; });

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'Escape') {
        if (closeTopModal()) return;
        if (this.build.active) return this.build.toggle(false);
        this.sim.select(null);
        return;
      }
      if (!this.started || anyModalOpen()) return;
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(this.sim.speed ? 0 : this.lastSpeed || 1); }
      if (e.key === '1') this.setSpeed(1);
      if (e.key === '2') this.setSpeed(2);
      if (e.key === '3') this.setSpeed(4);
      if (e.key === '4') this.setSpeed(8);
      if (e.key === 'b' || e.key === 'B') this.toggleBuild();
      if (e.key === 'l' || e.key === 'L') this.openLibrary();
      if ((e.key === 'r' || e.key === 'R') && this.build.active) this.build.rot += Math.PI / 4;
      if (e.key === 'Tab') {
        e.preventDefault();
        const rs = this.sim.residents;
        if (!rs.length) return;
        const i = rs.indexOf(this.sim.selected);
        this.sim.select(rs[(i + 1) % rs.length]);
      }
    });

    // drag & drop import
    const overlay = $('#dropOverlay');
    let depth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; overlay.classList.add('on'); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('on'); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      overlay.classList.remove('on');
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) await importFiles(this, files);
    });

    window.addEventListener('beforeunload', () => { this.save(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }

  setMouse(e) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.stage.camera);
  }

  pickResident() {
    const hits = this.raycaster.intersectObjects(this.sim.residents.filter((r) => !r.inside).map((r) => r.hit), false);
    if (!hits.length) return null;
    return this.sim.byId(hits[0].object.userData.residentId);
  }

  pickGround() {
    const hits = this.raycaster.intersectObject(this.island.ground, false);
    return hits[0]?.point || null;
  }

  pickProp() {
    const objs = this.island.props.map((p) => p.obj);
    const hits = this.raycaster.intersectObjects(objs, true);
    return hits[0]?.object.userData.propId || null;
  }

  // ------------------------------------------------------------------ loop
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    const sim = this.sim;
    if (this.started) {
      if (this.dragging) sim.followTarget = null;
      sim.update(dt);
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) { this.autosaveTimer = 60; this.save(); }
      const avgHappy = sim.residents.length ? sim.residents.reduce((a, r) => a + r.d.happiness, 0) / sim.residents.length / 100 : 1;
      this.audio.updateMusic(dt, 0.6 + avgHappy * 0.4, this.stage.light.night);
    }
    const sdt = dt * (this.started ? Math.max(sim.speed, 0.0001) : 1);
    this.weather.update(sdt, this.started ? sdt : 0, sim.minuteOfDay);
    this.stage.updateEnvironment(dt, sim.minuteOfDay, this.weather.p);
    this.island.update(sdt, this.stage.light);
    this.effects.update(sdt);
    if (this.started) {
      this.hud.update(dt);
      this.panel.update(dt);
    }
    this.stage.render(dt);
  }
}

const app = new App();
app.init().catch((err) => {
  console.error(err);
  document.body.append(h('pre', { style: { position: 'fixed', top: '10px', left: '10px', background: '#fff', padding: '10px', zIndex: 999, color: '#a00' } }, `FriendLife failed to start:\n${err.stack || err}`));
});
