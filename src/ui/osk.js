// On-screen keyboard for typing with a gamepad.
// Opens when a text box gets focus while the gamepad is being used.
// D-pad / left stick: move · A: type key · B: backspace · X: space · Y: shift
// LB/RB: move the text cursor · Start: done.

import { h } from './dom.js';

const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', "'"],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '!', '?'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '&', '#'],
  ['⇧ Shift', 'Space', '⌫', '◀', '▶', '✓ Done'],
];
const SYMBOL_ROWS = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_'],
  ['+', '=', '/', '\\', ':', ';', '"', '<', '>', '~', '`'],
  ['é', 'è', 'ü', 'ö', 'ñ', 'ç', 'ß', '♪', '♥', '★', '…'],
  ['😀', '😂', '😍', '😢', '😡', '👍', '🎉', '🍰', '🌧️', '☀️', '💤'],
  ['⇧ Shift', 'Space', '⌫', '◀', '▶', '✓ Done'],
];

export function isTextInput(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && ['text', 'search', 'number', 'email', 'url', ''].includes(el.type);
}

export class OnScreenKeyboard {
  constructor() {
    this.el = h('div', { id: 'osk', class: 'hidden' });
    document.body.append(this.el);
    this.target = null;
    this.shift = false;
    this.symbols = false;
    this.row = 1;
    this.col = 0;
    this.keys = [];
    this.render();
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(input) {
    if (!isTextInput(input)) return;
    this.target = input;
    this.el.classList.remove('hidden');
    this.render();
    // keep the box visible above the keyboard
    input.scrollIntoView({ block: 'center' });
  }

  hide() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    const t = this.target;
    this.target = null;
    if (t) {
      t.dispatchEvent(new Event('change', { bubbles: true }));
      t.blur();
    }
  }

  render() {
    this.el.innerHTML = '';
    const rows = this.symbols ? SYMBOL_ROWS : ROWS;
    const preview = h('div', { class: 'osk-preview' }, this.target ? (this.target.value || this.target.placeholder || '') : '');
    this.previewEl = preview;
    this.el.append(h('div', { class: 'osk-head' }, preview,
      h('button', { class: 'small', onclick: () => { this.symbols = !this.symbols; this.render(); } }, this.symbols ? 'ABC' : '#+😀'),
      h('button', { class: 'small', onclick: () => this.enter() }, '⏎ Enter'),
    ));
    this.keys = [];
    rows.forEach((row, ri) => {
      const r = h('div', { class: 'osk-row' });
      const keyRow = [];
      row.forEach((k, ci) => {
        const label = k.length === 1 && this.shift ? k.toUpperCase() : k;
        const b = h('button', { class: `osk-key ${k.length > 2 ? 'wide' : ''}`, onmousedown: (e) => e.preventDefault(), onclick: () => { this.row = ri; this.col = ci; this.press(k); } }, label);
        r.append(b);
        keyRow.push({ k, b });
      });
      this.keys.push(keyRow);
      this.el.append(r);
    });
    this.el.append(h('div', { class: 'osk-hint' }, 'Ⓐ type · Ⓑ backspace · Ⓧ space · Ⓨ shift · LB/RB move cursor · Start done'));
    this.highlight();
  }

  highlight() {
    this.row = Math.max(0, Math.min(this.keys.length - 1, this.row));
    this.col = Math.max(0, Math.min(this.keys[this.row].length - 1, this.col));
    this.keys.flat().forEach(({ b }) => b.classList.remove('sel'));
    this.keys[this.row][this.col].b.classList.add('sel');
  }

  move(dx, dy) {
    if (dy) {
      const frac = this.col / Math.max(1, this.keys[this.row].length - 1);
      this.row = (this.row + dy + this.keys.length) % this.keys.length;
      this.col = Math.round(frac * (this.keys[this.row].length - 1));
    }
    if (dx) this.col = (this.col + dx + this.keys[this.row].length) % this.keys[this.row].length;
    this.highlight();
  }

  pressSelected() { this.press(this.keys[this.row][this.col].k); }

  press(k) {
    const t = this.target;
    if (!t) return;
    if (k === '⇧ Shift') { this.shift = !this.shift; this.render(); return; }
    if (k === '✓ Done') { this.hide(); return; }
    if (k === '⌫') return this.backspace();
    if (k === '◀' || k === '▶') return this.caret(k === '◀' ? -1 : 1);
    const ch = k === 'Space' ? ' ' : this.shift && k.length === 1 ? k.toUpperCase() : k;
    this.insert(ch);
    if (this.shift && k.length === 1) { this.shift = false; this.render(); }
  }

  insert(text) {
    const t = this.target;
    if (!t) return;
    if (t.maxLength > 0 && t.value.length >= t.maxLength) return;
    if (t.type === 'number' && !/[0-9.\-]/.test(text)) return;
    const pos = t.type === 'number' ? t.value.length : t.selectionStart ?? t.value.length;
    const end = t.type === 'number' ? t.value.length : t.selectionEnd ?? pos;
    t.value = t.value.slice(0, pos) + text + t.value.slice(end);
    if (t.type !== 'number') t.setSelectionRange(pos + text.length, pos + text.length);
    this.changed();
  }

  backspace() {
    const t = this.target;
    if (!t || !t.value) return;
    const pos = t.type === 'number' ? t.value.length : t.selectionStart ?? t.value.length;
    if (pos <= 0) return;
    const chars = [...t.value.slice(0, pos)];
    chars.pop();
    const before = chars.join('');
    t.value = before + t.value.slice(pos);
    if (t.type !== 'number') t.setSelectionRange(before.length, before.length);
    this.changed();
  }

  caret(dir) {
    const t = this.target;
    if (!t || t.type === 'number') return;
    const p = Math.max(0, Math.min(t.value.length, (t.selectionStart ?? 0) + dir));
    t.setSelectionRange(p, p);
  }

  space() { this.insert(' '); }
  toggleShift() { this.shift = !this.shift; this.render(); }

  enter() {
    const t = this.target;
    this.hide();
    t?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  }

  changed() {
    this.target.dispatchEvent(new Event('input', { bubbles: true }));
    if (this.previewEl) this.previewEl.textContent = this.target.value;
  }
}
