// FriendLife entry point.
import * as THREE from 'three';
import { Stage } from './engine/stage.js';
import { Weather } from './engine/weather.js';
import { AudioEngine } from './engine/audio.js';
import { VoiceEngine } from './engine/voice.js';
import { openDictionary } from './ui/dictionary.js';
import { InputBindings, orbitCamera, panCamera, zoomCamera } from './ui/input.js';
import { GamepadController } from './ui/gamepad.js';
import { OnScreenKeyboard, isTextInput } from './ui/osk.js';
import { openControls } from './ui/controls.js';
import { RoomManager } from './world/rooms.js';
import { RoomBar, openRoomList } from './ui/rooms.js';
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
    this.rooms = new RoomManager(this.stage.renderer, this.textures);
    this.sim = new Sim({
      stage: this.stage, island: this.island, weather: this.weather, audio: this.audio, voice: this.voice, rooms: this.rooms,
      library: this.library, registry: this.registry, textures: this.textures, effects: this.effects,
    });
    this.hud = new Hud(this);
    this.panel = new Panel(this);
    this.build = new BuildMode(this);
    this.roomBar = new RoomBar(this);
    this.sim.on('viewRoom', (key) => (key ? this.viewRoom(key) : this.leaveRoom()));
    this.input = new InputBindings();
    this.osk = new OnScreenKeyboard();
    this.pad = new GamepadController(this);
    this.lastDevice = 'mouse';
    this.applyControls();
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
    for (const [k, ch] of [['voiceVolume', 'voice'], ['musicVolume', 'music'], ['ambientVolume', 'ambient']]) this.audio.setLevel(ch, this.sim.settings[k] ?? 1);
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
  openControls() { openControls(this); }
  openRooms() { openRoomList(this); }

  // ------------------------------------------------------------------ room instances
  /** Look inside a room instance (house / café / shop / clinic). */
  viewRoom(key) {
    const room = this.rooms.get(key);
    if (!room) return;
    const st = this.stage;
    const c = st.controls;
    if (!this.outsideCam) {
      this.outsideCam = { pos: st.camera.position.clone(), target: c.target.clone(), min: c.minDistance, max: c.maxDistance, polar: c.maxPolarAngle };
    }
    if (this.build.active) this.build.toggle(false);
    this.sim.viewRoom = room;
    st.overrideScene = this.rooms.scene;
    this.rooms.focus(room);
    // bigger rooms (condo hallway, pool) need the camera further back
    const k = Math.max(1, room.w / 8, room.d / 6);
    c.target.copy(room.center);
    st.camera.position.set(room.ox + 1.2, 4.3 * k, 8.6 * k);
    c.minDistance = 2.5;
    c.maxDistance = 13 * k;
    c.maxPolarAngle = Math.PI * 0.46;
    c.minAzimuthAngle = -1.15;
    c.maxAzimuthAngle = 1.15;
    c.update();
    this.roomBar.show(room);
    const sel = this.sim.selected;
    this.sim.followTarget = sel && sel.room === room ? sel : null;
    $('#helpHint').classList.add('hidden');
  }

  leaveRoom() {
    if (!this.sim.viewRoom) return;
    const st = this.stage;
    const c = st.controls;
    this.sim.viewRoom = null;
    st.overrideScene = null;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    if (this.outsideCam) {
      st.camera.position.copy(this.outsideCam.pos);
      c.target.copy(this.outsideCam.target);
      c.minDistance = this.outsideCam.min;
      c.maxDistance = this.outsideCam.max;
      c.maxPolarAngle = this.outsideCam.polar;
      this.outsideCam = null;
    }
    c.update();
    this.roomBar.show(null);
    const sel = this.sim.selected;
    // keep following someone outside; stop following someone still indoors (otherwise we'd jump straight back in)
    this.sim.followTarget = sel && !sel.inside ? sel : null;
    this.lastFollowed = null;
    $('#helpHint').classList.remove('hidden');
  }

  /** Which building (if any) is under the cursor → its room key. */
  pickBuilding() {
    const cands = [];
    for (const hs of this.island.houses) if (hs.obj && hs.owner) cands.push([hs.obj, `home:${hs.owner}`]);
    for (const k of ['cafe', 'shop', 'clinic', 'condo']) if (this.island.locations[k]?.building) cands.push([this.island.locations[k].building, k]);
    const hits = this.raycaster.intersectObjects(cands.map((x) => x[0]), true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o) {
      const f = cands.find((x) => x[0] === o);
      if (f) return f[1];
      o = o.parent;
    }
    return null;
  }
  openSettings(focus) { openSettings(this, focus); }
  toggleBuild() { this.build.toggle(); }

  // ------------------------------------------------------------------ input
  bindInput() {
    const canvas = this.stage.renderer.domElement;
    this.keysDown = new Set();
    let down = null;
    canvas.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
      // dragging with the pan button moves the camera away from the followed resident;
      // rotating and zooming keep following.
      const panButton = this.input.prefs.mouseOrbit === 'left' ? 2 : 0;
      if (e.button === panButton) this.panDrag = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const btn = down.button;
      down = null;
      if (moved > 6 || !this.started) return;
      this.canvasClick(e.clientX, e.clientY, btn);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.panDrag && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 && this.sim) this.sim.followTarget = null;
      this.moveThrottle = (this.moveThrottle || 0) + 1;
      if (this.moveThrottle % 3) return;
      this.pointerAt(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => { this.panDrag = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // real mouse movement switches back from gamepad mode
    window.addEventListener('mousemove', (e) => {
      if (this.lastDevice === 'pad' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) this.pad.setActive(false);
    });

    // mouse buttons bound to actions (middle / side buttons by default unbound)
    window.addEventListener('mousedown', (e) => {
      if (this.captureKey) return;
      const acts = this.input.actionsForKey(`Mouse${e.button}`);
      if (!acts.length) return;
      if (e.button === 0 && e.target !== canvas) return; // left click on UI always clicks the UI
      for (const id of acts) this.doAction(id);
    });

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (this.captureKey) { this.captureKey(e); return; }
      if (e.target.matches?.('input, textarea, select')) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (this.lastDevice === 'pad') this.pad.setActive(false);
      const acts = this.input.actionsForKey(e.code);
      if (!acts.length) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keysDown.add(e.code);
      if (!e.repeat) for (const id of acts) this.doAction(id);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());

    // on-screen keyboard when a text box gets focus while using the gamepad
    document.addEventListener('focusin', (e) => {
      const mode = this.input.prefs.onScreenKeyboard;
      if (isTextInput(e.target) && (mode === 'always' || (mode === 'auto' && this.lastDevice === 'pad'))) this.osk.show(e.target);
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

  /** Click on the 3D view at screen coordinates (mouse or gamepad cursor). */
  canvasClick(clientX, clientY, btn) {
    if (!this.started) return;
    this.setMouse({ clientX, clientY });
    const select = this.input.prefs.selectButton;
    if (this.build.active) {
      // the other button (or the Remove tool) deletes a decoration
      if (btn !== select || this.build.erase) this.build.remove(this.pickProp());
      else this.build.click(this.pickGround());
      return;
    }
    if (btn !== select) return;
    const res = this.pickResident();
    if (res) { this.sim.select(res); return; }
    if (!this.sim.viewRoom) {
      const key = this.pickBuilding();
      if (key) { this.viewRoom(key); toast(`Looking inside: ${this.rooms.get(key).label(this.sim)}`); return; }
    }
    if (this.sim.selected) this.sim.followTarget = null;
  }

  pointerAt(clientX, clientY) {
    if (!this.started) return;
    if (this.sim.viewRoom && this.build.active) this.build.toggle(false);
    this.setMouse({ clientX, clientY });
    if (this.build.active) this.build.pointerMove(this.pickGround());
    else {
      const r = this.pickResident();
      this.hud.hovered = r;
      this.stage.renderer.domElement.style.cursor = r ? 'pointer' : '';
    }
  }

  /** One-shot actions (keyboard, mouse buttons, gamepad). */
  doAction(id) {
    const sim = this.sim;
    if (id === 'back') {
      if (this.osk.open) return this.osk.hide();
      if (closeTopModal()) return;
      if (this.build.active) return this.build.toggle(false);
      if (sim?.viewRoom) return this.leaveRoom();
      sim?.select(null);
      return;
    }
    if (!this.started || anyModalOpen()) return;
    const step = (dir) => {
      const speeds = [0, 1, 2, 4, 8];
      const i = Math.max(0, speeds.indexOf(sim.speed));
      this.setSpeed(speeds[Math.max(0, Math.min(speeds.length - 1, i + dir))]);
    };
    const cycle = (dir) => {
      const rs = sim.residents;
      if (!rs.length) return;
      const i = rs.indexOf(sim.selected);
      sim.select(rs[(i + dir + rs.length) % rs.length]);
    };
    switch (id) {
      case 'pause': this.setSpeed(sim.speed ? 0 : this.lastSpeed || 1); break;
      case 'speedUp': step(1); break;
      case 'speedDown': step(-1); break;
      case 'speed1': this.setSpeed(1); break;
      case 'speed2': this.setSpeed(2); break;
      case 'speed4': this.setSpeed(4); break;
      case 'speed8': this.setSpeed(8); break;
      case 'nextResident': cycle(1); break;
      case 'prevResident': cycle(-1); break;
      case 'talk': if (sim.selected) { const msg = sim.talkTo(sim.selected); if (msg) toast(msg); } break;
      case 'focusSelected': if (sim.selected) sim.followTarget = sim.selected; break;
      case 'settings': this.openSettings(); break;
      case 'news': this.openNews(); break;
      case 'library': this.openLibrary(); break;
      case 'build': this.toggleBuild(); break;
      case 'shop': this.openShop(); break;
      case 'words': this.openDictionary(); break;
      case 'studio': this.openStudio(); break;
      case 'rooms': this.openRooms(); break;
      case 'rotateBuild': if (this.build.active) this.build.rot += Math.PI / 4; break;
      default: break;
    }
  }

  /** Continuous actions while a key/button is held. */
  holdAction(id, dt) {
    if (!this.started || anyModalOpen() || this.osk.open) return;
    const sp = this.input.prefs.cameraSpeed;
    switch (id) {
      case 'panForward': panCamera(this.stage, 0, dt * 1.6 * sp); this.sim.followTarget = null; break;
      case 'panBack': panCamera(this.stage, 0, -dt * 1.6 * sp); this.sim.followTarget = null; break;
      case 'panLeft': panCamera(this.stage, -dt * 1.6 * sp, 0); this.sim.followTarget = null; break;
      case 'panRight': panCamera(this.stage, dt * 1.6 * sp, 0); this.sim.followTarget = null; break;
      case 'orbitLeft': orbitCamera(this.stage, dt * 1.8 * sp, 0); break;
      case 'orbitRight': orbitCamera(this.stage, -dt * 1.8 * sp, 0); break;
      case 'zoomIn': zoomCamera(this.stage, 1 - dt * 1.4 * sp); break;
      case 'zoomOut': zoomCamera(this.stage, 1 + dt * 1.4 * sp); break;
      default: break;
    }
  }

  applyControls() {
    const p = this.input.prefs;
    const c = this.stage.controls;
    c.mouseButtons = p.mouseOrbit === 'left'
      ? { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.zoomSpeed = p.invertZoom ? -1 : 1;
  }

  setMouse(e) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.mouse, this.stage.camera);
  }

  pickResident() {
    const view = this.sim.viewRoom;
    const hits = this.raycaster.intersectObjects(this.sim.residents.filter((r) => (view ? r.room === view : !r.inside)).map((r) => r.hit), false);
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
    this.pad.update(dt);
    for (const code of this.keysDown) for (const id of this.input.actionsForKey(code)) this.holdAction(id, dt);
    if (this.started) {
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
      this.roomBar.update(dt);
      this.rooms.update({ sky: this.stage.skyUniforms.uHorizon.value, rain: this.weather.p.rain, night: this.stage.light.night, cloud: this.weather.p.cloud });
      // the camera follows the selected resident in and out of buildings
      const ft = sim.followTarget || (sim.selected && this.lastFollowed === sim.selected ? sim.selected : null);
      if (ft) {
        if (ft.room && sim.viewRoom !== ft.room) { this.viewRoom(ft.inside); sim.followTarget = ft; }
        else if (!ft.inside && sim.viewRoom && this.lastFollowedRoom) this.leaveRoom();
        this.lastFollowed = ft;
        this.lastFollowedRoom = ft.room || null;
      } else this.lastFollowed = null;
    }
    this.stage.render(dt);
  }
}

const app = new App();
app.init().catch((err) => {
  console.error(err);
  document.body.append(h('pre', { style: { position: 'fixed', top: '10px', left: '10px', background: '#fff', padding: '10px', zIndex: 999, color: '#a00' } }, `FriendLife failed to start:\n${err.stack || err}`));
});
