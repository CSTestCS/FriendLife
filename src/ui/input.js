// Input actions and bindings.
//
// Every game action can be bound to up to two keyboard keys / mouse buttons
// and up to two gamepad buttons. Bindings and control preferences are
// stored per computer (localStorage), not in the island save.

import * as THREE from 'three';
import { clamp } from '../core/util.js';

export const ACTIONS = [
  // camera
  { id: 'panForward', label: 'Pan camera forward', group: 'Camera', keys: ['KeyW', 'ArrowUp'], pad: [], hold: true },
  { id: 'panBack', label: 'Pan camera back', group: 'Camera', keys: ['KeyS', 'ArrowDown'], pad: [], hold: true },
  { id: 'panLeft', label: 'Pan camera left', group: 'Camera', keys: ['KeyA', 'ArrowLeft'], pad: [], hold: true },
  { id: 'panRight', label: 'Pan camera right', group: 'Camera', keys: ['KeyD', 'ArrowRight'], pad: [], hold: true },
  { id: 'orbitLeft', label: 'Rotate camera left', group: 'Camera', keys: ['KeyQ'], pad: [], hold: true },
  { id: 'orbitRight', label: 'Rotate camera right', group: 'Camera', keys: ['KeyE'], pad: [], hold: true },
  { id: 'zoomIn', label: 'Zoom in', group: 'Camera', keys: ['KeyZ'], pad: [7], hold: true },
  { id: 'zoomOut', label: 'Zoom out', group: 'Camera', keys: ['KeyX'], pad: [6], hold: true },
  { id: 'focusSelected', label: 'Follow / re-center selected resident', group: 'Camera', keys: ['KeyC'], pad: [11] },
  { id: 'padPanMode', label: 'Gamepad: left stick pans camera (toggle)', group: 'Camera', keys: [], pad: [10] },
  // general
  { id: 'confirm', label: 'Select / click', group: 'General', keys: [], pad: [0] },
  { id: 'back', label: 'Back / close / deselect', group: 'General', keys: ['Escape'], pad: [1] },
  { id: 'pause', label: 'Pause / resume', group: 'General', keys: ['Space'], pad: [3] },
  { id: 'speedUp', label: 'Faster', group: 'General', keys: ['Equal'], pad: [12] },
  { id: 'speedDown', label: 'Slower', group: 'General', keys: ['Minus'], pad: [13] },
  { id: 'speed1', label: 'Speed 1x', group: 'General', keys: ['Digit1'], pad: [] },
  { id: 'speed2', label: 'Speed 2x', group: 'General', keys: ['Digit2'], pad: [] },
  { id: 'speed4', label: 'Speed 4x', group: 'General', keys: ['Digit3'], pad: [] },
  { id: 'speed8', label: 'Speed 8x', group: 'General', keys: ['Digit4'], pad: [] },
  // residents
  { id: 'nextResident', label: 'Next resident', group: 'Residents', keys: ['Tab'], pad: [5] },
  { id: 'prevResident', label: 'Previous resident', group: 'Residents', keys: ['Backquote'], pad: [4] },
  { id: 'talk', label: 'Talk to selected resident', group: 'Residents', keys: ['KeyT'], pad: [2] },
  // menus
  { id: 'settings', label: 'Settings', group: 'Menus', keys: ['KeyO'], pad: [9] },
  { id: 'news', label: 'News', group: 'Menus', keys: ['KeyN'], pad: [8] },
  { id: 'library', label: 'Library', group: 'Menus', keys: ['KeyL'], pad: [14] },
  { id: 'build', label: 'Build mode', group: 'Menus', keys: ['KeyB'], pad: [15] },
  { id: 'shop', label: 'Shop', group: 'Menus', keys: ['KeyM'], pad: [] },
  { id: 'words', label: 'Dictionary', group: 'Menus', keys: ['KeyK'], pad: [] },
  { id: 'studio', label: 'Animation Studio', group: 'Menus', keys: ['KeyU'], pad: [] },
  { id: 'rotateBuild', label: 'Rotate decoration (build mode)', group: 'Menus', keys: ['KeyR'], pad: [] },
];

export const DEFAULT_PREFS = {
  mouseOrbit: 'left', // which mouse button rotates the camera ('left' or 'right'); the other one pans
  selectButton: 0, // mouse button that selects residents / places decorations
  invertZoom: false,
  cameraSpeed: 1, // keyboard / gamepad camera speed
  cursorSpeed: 1, // gamepad virtual cursor speed
  invertY: false, // gamepad right stick vertical
  deadzone: 0.18,
  onScreenKeyboard: 'auto', // auto (when using a gamepad) | always | never
};

export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View/Back', 'Menu/Start', 'L-Stick', 'R-Stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'];

const KEY_NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', Backquote: '`', Equal: '=', Minus: '-',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
};
const MOUSE_NAMES = ['Left click', 'Middle click', 'Right click', 'Mouse 4', 'Mouse 5'];

export function keyLabel(code) {
  if (!code) return '';
  if (code.startsWith('Mouse')) return MOUSE_NAMES[+code.slice(5)] || code;
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

export function padLabel(i) { return PAD_BUTTON_NAMES[i] ?? `Button ${i}`; }

const STORE_KEY = 'friendlife_controls_v1';

export class InputBindings {
  constructor() {
    this.bind = {};
    this.prefs = { ...DEFAULT_PREFS };
    this.load();
  }

  defaults() {
    const out = {};
    for (const a of ACTIONS) out[a.id] = { keys: [...a.keys], pad: [...a.pad] };
    return out;
  }

  load() {
    this.bind = this.defaults();
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (raw?.bind) for (const [k, v] of Object.entries(raw.bind)) if (this.bind[k]) this.bind[k] = { keys: v.keys || [], pad: v.pad || [] };
      if (raw?.prefs) this.prefs = { ...DEFAULT_PREFS, ...raw.prefs };
    } catch (e) { /* storage unavailable: use defaults */ }
  }

  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ bind: this.bind, prefs: this.prefs })); } catch (e) { /* ignore */ }
  }

  reset() {
    this.bind = this.defaults();
    this.prefs = { ...DEFAULT_PREFS };
    this.save();
  }

  /** Set slot `slot` of an action's keyboard or gamepad bindings; removes the same input from other actions. */
  set(actionId, kind, slot, value) {
    const list = kind === 'pad' ? 'pad' : 'keys';
    if (value !== null && value !== undefined) {
      for (const [id, b] of Object.entries(this.bind)) {
        if (id === actionId) continue;
        b[list] = b[list].filter((v) => v !== value);
      }
    }
    const arr = this.bind[actionId][list];
    if (value === null || value === undefined) arr.splice(slot, 1);
    else arr[slot] = value;
    this.bind[actionId][list] = arr.filter((v) => v !== undefined && v !== null);
    this.save();
  }

  actionsForKey(code) {
    return Object.entries(this.bind).filter(([, b]) => b.keys.includes(code)).map(([id]) => id);
  }

  actionsForPad(button) {
    return Object.entries(this.bind).filter(([, b]) => b.pad.includes(button)).map(([id]) => id);
  }

  keysOf(id) { return this.bind[id]?.keys || []; }
  padOf(id) { return this.bind[id]?.pad || []; }
}

// ---------------------------------------------------------------- camera helpers
const _off = new THREE.Vector3();
const _sph = new THREE.Spherical();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

/** Orbit the camera around its target (yaw, pitch in radians). Works while following a resident. */
export function orbitCamera(stage, yaw, pitch) {
  const c = stage.controls;
  _off.copy(stage.camera.position).sub(c.target);
  _sph.setFromVector3(_off);
  _sph.theta += yaw;
  _sph.phi = clamp(_sph.phi + pitch, c.minPolarAngle + 0.05, c.maxPolarAngle);
  _off.setFromSpherical(_sph);
  stage.camera.position.copy(c.target).add(_off);
  stage.camera.lookAt(c.target);
}

export function zoomCamera(stage, factor) {
  const c = stage.controls;
  _off.copy(stage.camera.position).sub(c.target);
  const len = clamp(_off.length() * factor, c.minDistance, c.maxDistance);
  _off.setLength(len);
  stage.camera.position.copy(c.target).add(_off);
}

/** Pan along the ground relative to the camera's facing. */
export function panCamera(stage, dx, dz) {
  const cam = stage.camera;
  cam.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  _fwd.normalize();
  _right.set(-_fwd.z, 0, _fwd.x);
  const dist = cam.position.distanceTo(stage.controls.target);
  const k = Math.max(0.5, dist * 0.04);
  const move = _right.multiplyScalar(dx * k).add(_fwd.multiplyScalar(dz * k));
  stage.controls.target.add(move);
  cam.position.add(move);
}
