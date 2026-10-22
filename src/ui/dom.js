// Tiny DOM helpers + modal dialogs.
import { escapeHtml } from '../core/util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = escapeHtml;

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const stack = [];
export function openModal({ title, wide = false, body, foot, onClose }) {
  const root = $('#modalRoot');
  const bodyEl = h('div', { class: 'modal-body' });
  const footEl = h('div', { class: 'modal-foot' });
  const close = () => {
    backdrop.remove();
    const i = stack.indexOf(api);
    if (i >= 0) stack.splice(i, 1);
    onClose?.();
  };
  const titleEl = h('h2', {}, title);
  const modal = h('div', { class: `modal ${wide ? 'wide' : ''}` },
    h('div', { class: 'modal-head' }, titleEl, h('button', { class: 'x small', onclick: close }, '✕')),
    bodyEl,
  );
  if (foot !== false) modal.append(footEl);
  const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, modal);
  root.append(backdrop);
  const api = { el: modal, body: bodyEl, foot: footEl, close, setTitle: (t) => { titleEl.textContent = t; } };
  stack.push(api);
  if (typeof body === 'function') body(bodyEl, api);
  else if (body) bodyEl.append(body);
  if (typeof foot === 'function') foot(footEl, api);
  if (!footEl.childNodes.length) footEl.remove();
  return api;
}

export function closeTopModal() {
  const m = stack[stack.length - 1];
  if (m) { m.close(); return true; }
  return false;
}

export function anyModalOpen() { return stack.length > 0; }

export function choose(title, text, options) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: (b) => {
        if (text) b.append(h('p', {}, text));
        const row = h('div', { class: 'title-buttons' });
        for (const o of options) {
          row.append(h('button', { class: o.primary ? 'primary' : '', onclick: () => { done = true; m.close(); resolve(o.value); } }, o.label, o.desc ? h('div', { class: 'hint' }, o.desc) : null));
        }
        b.append(row);
      },
      foot: false,
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

export async function confirmBox(text, yes = 'Yes', no = 'Cancel') {
  const v = await choose('Are you sure?', text, [{ label: yes, value: true, primary: true }, { label: no, value: false }]);
  return v === true;
}

export function prompt(title, value = '') {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { type: 'text', value, style: { width: '100%' } });
    const m = openModal({
      title,
      body: (b) => { b.append(input); setTimeout(() => input.focus(), 50); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); }); },
      foot: (f) => { f.append(h('button', { onclick: () => m.close() }, 'Cancel'), h('button', { class: 'primary', onclick: () => ok() }, 'OK')); },
      onClose: () => { if (!done) resolve(null); },
    });
    function ok() { done = true; m.close(); resolve(input.value.trim()); }
  });
}

export function toast(text, ms = 3200) {
  const el = h('div', { class: 'toast' }, text);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

export function bar(label, value, color, suffix = '') {
  const v = Math.max(0, Math.min(100, value));
  const col = color || (v > 60 ? 'var(--good)' : v > 30 ? 'var(--warn)' : 'var(--bad)');
  return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${v}%;background:${col}"></div></div><b>${Math.round(v)}${suffix}</b></div>`;
}

export function pickFiles(accept, multiple = true) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple });
    input.style.display = 'none';
    document.body.append(input);
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.click();
  });
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
