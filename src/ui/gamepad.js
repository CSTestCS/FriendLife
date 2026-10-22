// Gamepad support.
//
// Left stick moves a virtual cursor that can click anything (residents,
// buttons, menus, sliders…). Right stick rotates the camera, or scrolls a
// panel when the cursor is over one. Buttons trigger the bound actions
// (see input.js; rebind in Settings → Controls). Text boxes open the
// on-screen keyboard.

import { h, openModal, toast } from './dom.js';
import { isTextInput } from './osk.js';
import { orbitCamera, panCamera } from './input.js';

const HOVER_SEL = 'button, .res-card, input, select, textarea, label, .marker, .shop-item, .rel-row';

export class GamepadController {
  constructor(app) {
    this.app = app;
    this.prev = [];
    this.cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.el = h('div', { id: 'padCursor', class: 'hidden' });
    document.body.append(this.el);
    this.panMode = false;
    this.capture = null; // rebinding callback(buttonIndex)
    this.navRepeat = 0;
    this.navDir = '';
    this.hoverEl = null;
    this.index = null;
    window.addEventListener('gamepadconnected', (e) => {
      this.index = e.gamepad.index;
      toast(`🎮 ${e.gamepad.id.split('(')[0].trim() || 'Gamepad'} connected — left stick moves the cursor, Ⓐ selects. Rebind in Settings → Controls.`, 6000);
    });
    window.addEventListener('gamepaddisconnected', () => { this.index = null; this.setActive(false); });
  }

  get prefs() { return this.app.input.prefs; }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index !== null && pads[this.index]) return pads[this.index];
    for (const p of pads) if (p && p.connected) { this.index = p.index; return p; }
    return null;
  }

  setActive(on) {
    this.app.lastDevice = on ? 'pad' : 'mouse';
    this.el.classList.toggle('hidden', !on || this.app.osk.open);
    document.body.classList.toggle('using-pad', on);
    if (!on) this.setHover(null);
  }

  stick(x, y) {
    const dz = this.prefs.deadzone;
    const m = Math.hypot(x, y);
    if (m < dz) return [0, 0];
    const k = (m - dz) / (1 - dz) / m;
    return [x * k, y * k];
  }

  update(dt) {
    const p = this.pad();
    if (!p) return;
    const pressed = p.buttons.map((b) => b.pressed || b.value > 0.5);
    const down = pressed.map((v, i) => v && !this.prev[i]);
    this.prev = pressed;
    const [lx, ly] = this.stick(p.axes[0] || 0, p.axes[1] || 0);
    const [rx, ry] = this.stick(p.axes[2] || 0, p.axes[3] || 0);
    const anyInput = down.some(Boolean) || lx || ly || rx || ry;
    if (anyInput && this.app.lastDevice !== 'pad') this.setActive(true);
    if (this.app.lastDevice !== 'pad') return;

    // rebinding: next button press is the binding
    if (this.capture) {
      const i = down.findIndex(Boolean);
      if (i >= 0) { const cb = this.capture; this.capture = null; cb(i); }
      return;
    }

    // on-screen keyboard has its own controls
    const osk = this.app.osk;
    if (osk.open) {
      this.el.classList.add('hidden');
      this.navigate(dt, pressed, lx, ly, (dx, dy) => osk.move(dx, dy));
      if (down[0]) osk.pressSelected();
      if (down[1]) osk.backspace();
      if (down[2]) osk.space();
      if (down[3]) osk.toggleShift();
      if (down[4]) osk.caret(-1);
      if (down[5]) osk.caret(1);
      if (down[9]) osk.hide();
      return;
    }
    this.el.classList.remove('hidden');

    // left stick: cursor (or pan the camera in pan mode)
    if (this.panMode && this.app.started) {
      if (lx || ly) { panCamera(this.app.stage, lx * dt * 1.6 * this.prefs.cameraSpeed, -ly * dt * 1.6 * this.prefs.cameraSpeed); this.app.sim.followTarget = null; }
    } else if (lx || ly) {
      const speed = 900 * this.prefs.cursorSpeed * dt;
      const mag = Math.min(1, Math.hypot(lx, ly));
      const curve = mag ** 0.6 / Math.max(mag, 1e-4);
      this.cursor.x = Math.max(0, Math.min(window.innerWidth - 1, this.cursor.x + lx * curve * speed));
      this.cursor.y = Math.max(0, Math.min(window.innerHeight - 1, this.cursor.y + ly * curve * speed));
    }
    this.el.style.transform = `translate(${this.cursor.x}px, ${this.cursor.y}px)`;
    this.el.classList.toggle('pan', this.panMode);

    const under = document.elementFromPoint(this.cursor.x, this.cursor.y);
    this.setHover(under);

    // right stick: scroll the panel under the cursor, otherwise rotate the camera
    if (rx || ry) {
      const scroller = scrollableAncestor(under);
      if (scroller && Math.abs(ry) > Math.abs(rx)) scroller.scrollTop += ry * 900 * dt;
      else if (this.app.started) orbitCamera(this.app.stage, -rx * 2.4 * dt * this.prefs.cameraSpeed, (this.prefs.invertY ? -ry : ry) * 1.6 * dt * this.prefs.cameraSpeed);
    }

    // canvas hover (resident names / build ghost)
    if (under === this.app.stage.renderer.domElement) this.app.pointerAt(this.cursor.x, this.cursor.y);

    // held actions (zoom etc.)
    const input = this.app.input;
    pressed.forEach((v, i) => {
      if (!v) return;
      for (const id of input.actionsForPad(i)) this.app.holdAction(id, dt);
    });
    // pressed actions
    down.forEach((v, i) => {
      if (!v) return;
      for (const id of input.actionsForPad(i)) {
        if (id === 'confirm') this.click(under);
        else if (id === 'padPanMode') { this.panMode = !this.panMode; toast(this.panMode ? '🎮 Left stick now pans the camera (press again for the cursor)' : '🎮 Left stick moves the cursor'); }
        else this.app.doAction(id);
      }
    });
  }

  /** Discrete navigation with key-repeat from d-pad or stick. */
  navigate(dt, pressed, lx, ly, fn) {
    let dir = '';
    if (pressed[12] || ly < -0.6) dir = 'u';
    else if (pressed[13] || ly > 0.6) dir = 'd';
    else if (pressed[14] || lx < -0.6) dir = 'l';
    else if (pressed[15] || lx > 0.6) dir = 'r';
    if (!dir) { this.navDir = ''; return; }
    if (dir !== this.navDir) { this.navDir = dir; this.navRepeat = 0.38; }
    else { this.navRepeat -= dt; if (this.navRepeat > 0) return; this.navRepeat = 0.11; }
    fn(dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
  }

  setHover(el) {
    const target = el?.closest?.(HOVER_SEL) || null;
    if (target === this.hoverEl) return;
    this.hoverEl?.classList.remove('pad-hover');
    this.hoverEl = target;
    target?.classList.add('pad-hover');
  }

  click(el) {
    const app = this.app;
    const { x, y } = this.cursor;
    if (!el) return;
    if (el === app.stage.renderer.domElement) {
      app.canvasClick(x, y, app.input.prefs.selectButton);
      return;
    }
    const t = el.closest('input, select, textarea, button, label, a, .res-card, .marker, .shop-item, .rel-row') || el;
    if (isTextInput(t)) {
      t.focus();
      if (this.prefs.onScreenKeyboard !== 'never') app.osk.show(t);
      return;
    }
    if (t.tagName === 'SELECT') return this.selectPicker(t);
    if (t.tagName === 'INPUT' && t.type === 'range') {
      const r = t.getBoundingClientRect();
      const min = +t.min || 0, max = t.max === '' ? 100 : +t.max, step = +t.step || 1;
      let v = min + (max - min) * Math.max(0, Math.min(1, (x - r.left) / r.width));
      v = Math.round(v / step) * step;
      t.value = String(v);
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    if (t.tagName === 'INPUT' && t.type === 'color') return this.colorPicker(t);
    if (t.tagName === 'INPUT' && t.type === 'file') return t.click();
    t.click();
  }

  selectPicker(sel) {
    const m = openModal({
      title: 'Choose',
      body: (b) => {
        const list = h('div', { class: 'title-buttons' });
        for (const o of sel.options) {
          list.append(h('button', { class: o.selected ? 'primary' : '', onclick: () => {
            sel.value = o.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            m.close();
          } }, o.textContent));
        }
        b.append(list);
      },
      foot: false,
    });
  }

  colorPicker(input) {
    const colors = ['#ffffff', '#f2c9a5', '#c68c62', '#6e4a31', '#1e1a1a', '#e05a4f', '#ff9f1c', '#ffd166', '#8ac926', '#06d6a0', '#4fb3e8', '#3a6aa3', '#9b5de5', '#f15bb5', '#a0a0a0', '#34495e'];
    const m = openModal({
      title: 'Pick a colour',
      body: (b) => {
        const row = h('div', { class: 'row' });
        for (const c of colors) {
          row.append(h('button', { style: { background: c, width: '44px', height: '44px' }, onclick: () => {
            input.value = c;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            m.close();
          } }, ''));
        }
        b.append(row);
      },
      foot: false,
    });
  }
}

function scrollableAncestor(el) {
  let n = el;
  while (n && n !== document.body) {
    if (n.scrollHeight > n.clientHeight + 4) {
      const oy = getComputedStyle(n).overflowY;
      if (oy === 'auto' || oy === 'scroll') return n;
    }
    n = n.parentElement;
  }
  return null;
}
