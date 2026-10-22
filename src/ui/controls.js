// Settings → Controls: rebind every action for keyboard & mouse and for
// gamepad, plus mouse/camera/gamepad preferences.
import { h, openModal, toast, confirmBox } from './dom.js';
import { ACTIONS, keyLabel, padLabel } from './input.js';

export function openControls(app) {
  const input = app.input;
  let waiting = null; // {id, kind, slot, el}

  const cancelWait = () => {
    if (!waiting) return;
    waiting = null;
    app.captureKey = null;
    app.pad.capture = null;
    window.removeEventListener('mousedown', onMouse, true);
  };

  function onMouse(e) {
    if (!waiting || waiting.kind !== 'keys') return;
    if (e.button === 0) return; // left click stays for using the menus; bind it via the mouse prefs instead
    e.preventDefault();
    e.stopPropagation();
    const w = waiting;
    cancelWait();
    input.set(w.id, 'keys', w.slot, `Mouse${e.button}`);
    render();
  }

  let m_body = null;
  const m = openModal({
    title: '🎮 Controls',
    wide: true,
    body: (b) => {
      m_body = b;
      render();
    },
    foot: (f) => f.append(
      h('button', { onclick: async () => { if (await confirmBox('Reset all controls to the defaults?', 'Reset')) { input.reset(); app.applyControls(); render(); } } }, '↺ Reset to defaults'),
      h('button', { class: 'primary', onclick: () => m.close() }, 'Done'),
    ),
    onClose: () => { cancelWait(); app.applyControls(); },
  });

  function startWait(id, kind, slot, el) {
    cancelWait();
    waiting = { id, kind, slot };
    el.textContent = kind === 'pad' ? 'Press a gamepad button…' : 'Press a key / mouse button…';
    el.classList.add('primary');
    if (kind === 'pad') {
      app.pad.capture = (btn) => { cancelWait(); input.set(id, 'pad', slot, btn); render(); };
    } else {
      app.captureKey = (e) => {
        e.preventDefault();
        const code = e.code;
        cancelWait();
        if (code === 'Escape') { render(); return; }
        if (code === 'Backspace' || code === 'Delete') input.set(id, 'keys', slot, null);
        else input.set(id, 'keys', slot, code);
        render();
      };
      setTimeout(() => window.addEventListener('mousedown', onMouse, true), 0);
    }
  }

  function slotBtn(id, kind, slot) {
    const list = kind === 'pad' ? input.padOf(id) : input.keysOf(id);
    const v = list[slot];
    const label = v === undefined ? '—' : kind === 'pad' ? padLabel(v) : keyLabel(v);
    const btn = h('button', { class: 'small', style: { minWidth: '96px' }, title: 'Click, then press the new input. Esc cancels, Backspace clears.' }, label);
    btn.onclick = () => startWait(id, kind, slot, btn);
    const clear = v === undefined ? null : h('button', { class: 'small', title: 'Clear', onclick: () => { input.set(id, kind, slot, null); render(); } }, '✕');
    return h('span', { class: 'row', style: { gap: '2px' } }, btn, clear);
  }

  function render() {
    const b = m_body;
    if (!b) return;
    const p = input.prefs;
    const save = () => { input.save(); app.applyControls(); };
    b.innerHTML = '';
    // ---- preferences
    const prefs = h('div', { class: 'grid2' });
    const left = h('div', {});
    const right = h('div', {});
    prefs.append(left, right);
    left.append(h('h3', {}, 'Mouse & camera'),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Rotate camera with'),
        ...[['left', 'Left drag'], ['right', 'Right drag']].map(([k, l]) => h('button', { class: `small ${p.mouseOrbit === k ? 'active' : ''}`, onclick: () => { p.mouseOrbit = k; save(); render(); } }, l)),
        h('span', { class: 'hint' }, '(the other button pans; wheel zooms)')),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Select residents with'),
        ...[[0, 'Left click'], [2, 'Right click']].map(([k, l]) => h('button', { class: `small ${p.selectButton === k ? 'active' : ''}`, onclick: () => { p.selectButton = k; save(); render(); } }, l))),
      h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: p.invertZoom, onchange: (e) => { p.invertZoom = e.target.checked; save(); } }), ' Invert mouse-wheel zoom'),
      slider('Camera speed', p.cameraSpeed, 0.3, 3, (v) => { p.cameraSpeed = v; save(); }),
    );
    right.append(h('h3', {}, 'Gamepad'),
      slider('Cursor speed', p.cursorSpeed, 0.3, 3, (v) => { p.cursorSpeed = v; save(); }),
      slider('Stick deadzone', p.deadzone, 0.05, 0.5, (v) => { p.deadzone = v; save(); }),
      h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: p.invertY, onchange: (e) => { p.invertY = e.target.checked; save(); } }), ' Invert camera Y (right stick)'),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'On-screen keyboard'),
        ...[['auto', 'With gamepad'], ['always', 'Always'], ['never', 'Never']].map(([k, l]) => h('button', { class: `small ${p.onScreenKeyboard === k ? 'active' : ''}`, onclick: () => { p.onScreenKeyboard = k; save(); render(); } }, l))),
      h('div', { class: 'hint' }, app.pad.pad() ? `Connected: ${app.pad.pad().id}` : 'No gamepad detected — press any button on it.'),
      h('div', { class: 'hint' }, 'Left stick: cursor · Right stick: rotate camera / scroll panels · Text boxes open the on-screen keyboard.'),
    );
    b.append(prefs);

    // ---- bindings table
    b.append(h('h3', {}, 'Key bindings'), h('div', { class: 'hint' }, 'Click a slot and press the new key, mouse button (middle / side / right) or gamepad button. Esc cancels, Backspace clears. An input can only do one thing — assigning it elsewhere moves it.'));
    let group = null;
    const table = h('div', {});
    for (const a of ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        table.append(h('div', { class: 'slot-row', style: { fontWeight: 800, gridTemplateColumns: '1fr 260px 150px', marginTop: '8px' } }, h('span', {}, group), h('span', {}, '⌨️ Keyboard / mouse'), h('span', {}, '🎮 Gamepad')));
      }
      table.append(h('div', { class: 'slot-row', style: { gridTemplateColumns: '1fr 260px 150px' } },
        h('span', {}, a.label),
        h('span', { class: 'row', style: { gap: '4px' } }, slotBtn(a.id, 'keys', 0), slotBtn(a.id, 'keys', 1)),
        h('span', { class: 'row', style: { gap: '4px' } }, slotBtn(a.id, 'pad', 0)),
      ));
    }
    b.append(table);
  }
  return m;
}

function slider(label, value, min, max, onChange) {
  const out = h('b', {}, (+value).toFixed(2));
  return h('div', { class: 'trait' }, h('span', { class: 'lo' }, label),
    h('input', { type: 'range', min, max, step: 0.01, value, oninput: (e) => { onChange(+e.target.value); out.textContent = (+e.target.value).toFixed(2); } }), out);
}

