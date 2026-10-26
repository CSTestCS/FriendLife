// Animation Studio: a small keyframe editor with a live 3D preview.
// Pose bones with sliders at keyframes, scrub, play, then save the result to
// the Library as a FriendLife JSON animation (usable for actions/emotes).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { h, openModal, toast, download, prompt } from './dom.js';
import { KeyframeClip, makePose } from '../characters/animation.js';
import { BUILTIN_ANIMATIONS } from '../characters/builtinAnims.js';
import { BONES } from '../characters/rig.js';
import { Avatar } from '../characters/avatar.js';
import { DEG } from '../core/util.js';

const EDIT_BONES = BONES.filter((b) => !['leftToes', 'rightToes'].includes(b));
const R2D = 180 / Math.PI;

/**
 * Turn any clip (imported Mixamo .fbx, .vrma, JSON…) into editable keyframes:
 * sample it `fps` times a second and store each bone's rotation (degrees) and
 * the hips offset. Played back linearly it looks the same as the original.
 */
export function bakeClip(clip, name, fps = 12) {
  const dur = Math.max(0.05, clip.duration || 1);
  const n = Math.max(2, Math.round(dur * fps));
  const pose = makePose();
  const e = new THREE.Euler();
  const keys = [];
  for (let i = 0; i <= n; i++) {
    if (clip.loop !== false && i === n) break; // the loop wraps back to the first key
    const t = Math.min(dur, (i / n) * dur);
    clip.sample(t, pose);
    const k = { t: Math.round(t * 1000) / 1000, pose: {}, hips: pose.hips.toArray().map((v) => Math.round(v * 1000) / 1000) };
    for (const b of BONES) {
      const q = pose.rot[b];
      if (Math.abs(q.w) > 0.99995 && i > 0 && !keys[0].pose[b]) continue; // never moves: leave it out
      e.setFromQuaternion(q, 'XYZ');
      k.pose[b] = [e.x * R2D, e.y * R2D, e.z * R2D].map((v) => Math.round(v * 10) / 10);
    }
    keys.push(k);
  }
  // bones that only showed up later still need a value in the first key
  for (const k of keys) for (const b of Object.keys(k.pose)) if (!keys[0].pose[b]) keys[0].pose[b] = [0, 0, 0];
  return { name, duration: Math.round(dur * 1000) / 1000, loop: clip.loop !== false, base: 'none', ease: 'linear', keys };
}

export async function openStudio(app, assetId = null) {
  const sim = app.sim;
  const lib = sim.library;
  let doc = {
    name: 'My Animation', duration: 1.6, loop: true, base: 'stand',
    keys: [{ t: 0, pose: {}, hips: [0, 0, 0] }, { t: 0.8, pose: { rightUpperArm: [0, 0, -40] }, hips: [0, 0, 0] }],
  };
  // open a library animation: JSON as-is, anything else (Mixamo .fbx, .vrma) baked into keyframes
  const fromLibrary = async (id) => {
    const info = lib.get(id);
    if (info?.ext === 'json') {
      const d = JSON.parse(await lib.getText(id));
      d.name = d.name || lib.displayName(id);
      return d;
    }
    const clip = sim.registry.custom.get(id) || await sim.registry.loadAsset(id);
    if (!clip) throw new Error('could not load');
    return bakeClip(clip, `${lib.displayName(id)} (edited)`);
  };
  let sourceId = null; // imported animation being adjusted (its in-game uses move to the edit)
  if (assetId) {
    try {
      doc = await fromLibrary(assetId);
      // a baked import is saved as a new JSON animation (the original file stays)
      if (lib.get(assetId)?.ext !== 'json') { sourceId = assetId; assetId = null; }
    } catch (e) { toast('Could not open that animation.'); }
  }
  let keyIdx = 0;
  let keysOpen = null; // keyframe list shown? (null = decide by length)
  let bodyMode = 'all'; // body position / rotation edits: 'all' = whole animation, 'key' = this key
  let bone = 'rightUpperArm';
  let time = 0;
  let playing = true;
  let clip = new KeyframeClip(doc);
  const pose = makePose();

  // preview scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6);
  dl.position.set(2, 4, 3);
  scene.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshStandardMaterial({ color: 0xf3e2c9 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
  camera.position.set(1.6, 1.3, 2.6);
  let avatar = null;
  const src = sim.selected || sim.residents[0];
  try {
    if (src?.d.look.kind === 'vrm' && src.d.look.assetId) avatar = await Avatar.fromVRM(await lib.getData(src.d.look.assetId));
  } catch (e) { avatar = null; }
  if (!avatar) avatar = await Avatar.fromDoll(src?.d.look.doll);
  const s = avatar.kind === 'vrm' ? 1.4 / avatar.height : 1;
  avatar.root.scale.setScalar(s);
  scene.add(avatar.root);
  const target = new THREE.Vector3(0, (avatar.height * s) * 0.55, 0);
  let controls;
  let raf = 0;
  let last = performance.now();

  const m = openModal({
    title: '🎬 Animation Studio',
    wide: true,
    body: (b) => {
      const preview = h('div', { class: 'preview' });
      preview.append(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      const side = h('div', {});
      const timeLbl = h('b', {}, '0.00s');
      const scrub = h('input', { type: 'range', min: 0, max: 1, step: 0.001, value: 0, style: { flex: 1 }, oninput: (e) => { playing = false; time = +e.target.value * doc.duration; } });
      b.append(h('div', { class: 'studio' }, h('div', {}, preview, timeline()), side));

      function timeline() {
        return h('div', { class: 'row', style: { marginTop: '8px' } },
          h('button', { class: 'small', onclick: () => { playing = !playing; } }, '⏯'), scrub, timeLbl);
      }

      function bodySection() {
        const box = h('div', { class: 'field', style: { borderTop: '1px solid #0001', paddingTop: '6px' } });
        const key = doc.keys[keyIdx];
        const all = bodyMode === 'all' || !key;
        box.append(h('div', { class: 'row', style: { alignItems: 'center', gap: '6px' } }, h('b', {}, 'Body'),
          ...[['all', 'Whole animation'], ['key', 'This key']].map(([k, l]) => h('button', { class: `small ${bodyMode === k ? 'active' : ''}`, onclick: () => { bodyMode = k; renderSide(); } }, l)),
          all && (doc.offset?.pos?.some((v) => v) || doc.offset?.rot?.some((v) => v)) ? h('button', { class: 'small', onclick: () => { delete doc.offset; rebuild(); renderSide(); } }, '↺ Reset') : null));
        box.append(h('div', { class: 'hint' }, all
          ? 'Moves / turns every frame at once — fix a sit that floats or sinks, a sleep facing the wrong way, an animation that drifts sideways.'
          : `Only key #${keyIdx + 1} (${key.t.toFixed(2)}s); in between it blends.`));
        const slider = (label, min, max, step, get, set, fmt) => {
          const out = h('b', {}, fmt(get()));
          return h('div', { class: 'trait' }, h('span', {}, label), h('input', { type: 'range', min, max, step, value: get(), oninput: (e) => { set(+e.target.value); out.textContent = fmt(+e.target.value); if (!all) { time = key.t; playing = false; } rebuild(); } }), out);
        };
        const posArr = () => (all ? ((doc.offset ||= {}).pos ||= [0, 0, 0]) : (key.hips ||= [0, 0, 0]));
        const rotArr = () => (all ? ((doc.offset ||= {}).rot ||= [0, 0, 0]) : (key.bodyRot ||= [0, 0, 0]));
        const pos = h('div', { class: 'bone-sliders' });
        ['X', 'Y', 'Z'].forEach((ax, i) => pos.append(slider(ax, -1.5, 1.5, 0.01, () => posArr()[i], (v) => { posArr()[i] = v; }, (v) => v.toFixed(2))));
        const rot = h('div', { class: 'bone-sliders' });
        [['X', 'tip forward/back'], ['Y', 'turn around'], ['Z', 'roll sideways']].forEach(([ax, tip], i) => rot.append(slider(ax, -180, 180, 1, () => rotArr()[i], (v) => { rotArr()[i] = v; }, (v) => `${Math.round(v)}°`)));
        box.append(h('label', {}, 'Position (hip-heights; Y −0.45 ≈ sitting)'), pos,
          h('label', {}, 'Rotation (X: tip forward/back · Y: turn around · Z: roll)'), rot,
          h('div', { class: 'row' }, ...[[0, 180, 0, '↻ Turn around 180°'], [90, 0, 0, '⤵ Lie face-up/down (X 90°)'], [0, 0, 90, '⤷ Roll onto side (Z 90°)']].map(([x, y, z, l]) => h('button', { class: 'small', onclick: () => { const r = rotArr(); const wrap = (v) => { const w = ((((v + 180) % 360) + 360) % 360) - 180; return w === -180 ? 180 : w; }; r[0] = wrap(r[0] + x); r[1] = wrap(r[1] + y); r[2] = wrap(r[2] + z); rebuild(); renderSide(); } }, l))));
        return box;
      }

      const renderSide = () => {
        side.innerHTML = '';
        side.append(
          h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: doc.name, oninput: (e) => { doc.name = e.target.value; } })),
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', {}, 'Duration (s)'), h('input', { type: 'number', min: 0.1, step: 0.1, value: doc.duration, style: { width: '80px' }, onchange: (e) => { doc.duration = Math.max(0.1, +e.target.value); rebuild(); } })),
            h('label', { class: 'tag' }, h('input', { type: 'checkbox', checked: doc.loop !== false, onchange: (e) => { doc.loop = e.target.checked; rebuild(); } }), ' Loop'),
            h('label', { class: 'tag', title: 'Bones you don\'t key use the relaxed standing pose (arms down). Off = T-pose.' }, h('input', { type: 'checkbox', checked: doc.base !== 'none', onchange: (e) => { doc.base = e.target.checked ? 'stand' : 'none'; rebuild(); } }), ' Standing base'),
          ),
          h('div', { class: 'field' }, h('label', {}, 'Start from'), (() => {
            const libAnims = lib.list('animation');
            const sel = h('select', { onchange: async (e) => {
              const v = e.target.value;
              if (!v) return;
              if (v.startsWith('lib:')) {
                // an imported animation (Mixamo / VRMA / JSON) to adjust; saved as a new animation
                try {
                  doc = await fromLibrary(v.slice(4));
                  if (!/\(edited\)$/.test(doc.name)) doc.name = `${doc.name} (edited)`;
                  assetId = null;
                  sourceId = v.slice(4);
                  keyIdx = 0; time = 0; rebuild(); renderSide();
                  toast(`Loaded ${doc.keys.length} keyframes — tweak any key, then 💾 Save.`);
                } catch (err) { toast('Could not open that animation.'); }
                return;
              }
              const def = BUILTIN_ANIMATIONS.find((a) => a.name === v);
              if (def) { doc = JSON.parse(JSON.stringify({ ...def, name: `${def.name} (custom)` })); doc.keys = doc.keys || []; keyIdx = 0; rebuild(); renderSide(); }
            } }, h('option', { value: '' }, '— pick an animation —'),
            libAnims.length ? h('optgroup', { label: 'Your library (Mixamo, VRMA, JSON)' }, ...libAnims.map((a) => h('option', { value: `lib:${a.id}` }, `${lib.displayName(a.id)} (.${a.ext})`))) : null,
            h('optgroup', { label: 'Built-in' }, ...BUILTIN_ANIMATIONS.filter((a) => a.keys).map((a) => h('option', { value: a.name }, a.name))));
            return sel;
          })()),
        );
        // keys (collapsible: long imported animations have hundreds)
        if (keysOpen === null) keysOpen = doc.keys.length <= 24;
        const goKey = (i) => { keyIdx = Math.max(0, Math.min(doc.keys.length - 1, i)); time = doc.keys[keyIdx].t; playing = false; renderSide(); };
        const head = h('div', { class: 'row', style: { alignItems: 'center', gap: '6px' } },
          h('button', { class: 'small', title: keysOpen ? 'Hide the keyframe list' : 'Show all keyframes', onclick: () => { keysOpen = !keysOpen; renderSide(); } }, keysOpen ? '▾' : '▸'),
          h('b', {}, `Keyframes (${doc.keys.length})`),
          h('button', { class: 'small', title: 'Previous key', onclick: () => goKey(keyIdx - 1) }, '◀'),
          h('span', { class: 'tag' }, doc.keys[keyIdx] ? `#${keyIdx + 1} · ${doc.keys[keyIdx].t.toFixed(2)}s` : '—'),
          h('button', { class: 'small', title: 'Next key', onclick: () => goKey(keyIdx + 1) }, '▶'),
          h('button', { class: 'small', title: 'Jump to the key nearest the playhead', onclick: () => { let best = 0; doc.keys.forEach((k, i) => { if (Math.abs(k.t - time) < Math.abs(doc.keys[best].t - time)) best = i; }); goKey(best); } }, '⌖ Nearest'));
        const keys = h('div', { class: 'keys', style: { maxHeight: '110px', overflowY: 'auto' } });
        if (keysOpen) doc.keys.forEach((k, i) => keys.append(h('button', { class: `small ${i === keyIdx ? 'sel' : ''}`, onclick: () => goKey(i) }, `${k.t.toFixed(2)}s`)));
        side.append(h('div', { class: 'field' }, head, keysOpen ? keys : null, h('div', { class: 'row' },
          h('button', { class: 'small primary', onclick: () => { const t = Math.round(Math.min(time, doc.duration) * 100) / 100; if (doc.keys.some((k) => Math.abs(k.t - t) < 0.01)) return toast('There is already a key here.'); const k = { t, pose: {}, hips: [0, 0, 0] }; doc.keys.push(k); doc.keys.sort((a, b) => a.t - b.t); keyIdx = doc.keys.indexOf(k); rebuild(); renderSide(); } }, '＋ Key at playhead'),
          h('button', { class: 'small', onclick: () => { const k = doc.keys[keyIdx]; if (!k) return; const copy = JSON.parse(JSON.stringify(k)); copy.t = Math.min(doc.duration, Math.round((time + 0.01) * 100) / 100); if (doc.keys.some((x) => Math.abs(x.t - copy.t) < 0.01)) return toast('Move the playhead to an empty time first.'); doc.keys.push(copy); doc.keys.sort((a, b) => a.t - b.t); keyIdx = doc.keys.indexOf(copy); rebuild(); renderSide(); } }, '⧉ Duplicate to playhead'),
          h('button', { class: 'small danger', disabled: doc.keys.length <= 1, onclick: () => { doc.keys.splice(keyIdx, 1); keyIdx = Math.max(0, keyIdx - 1); rebuild(); renderSide(); } }, '🗑 Key'),
        )));
        // body position + rotation: for the whole animation, or just this key
        side.append(bodySection());
        const key = doc.keys[keyIdx];
        if (!key) return;
        side.append(h('div', { class: 'field' }, h('label', {}, 'Key time'), h('input', { type: 'number', step: 0.05, min: 0, max: doc.duration, value: key.t, onchange: (e) => { key.t = Math.max(0, Math.min(doc.duration, +e.target.value)); doc.keys.sort((a, b) => a.t - b.t); keyIdx = doc.keys.indexOf(key); rebuild(); renderSide(); } })));
        const boneSel = h('select', { onchange: (e) => { bone = e.target.value; renderSide(); } }, ...EDIT_BONES.map((bn) => h('option', { value: bn, selected: bn === bone }, `${key.pose?.[bn] ? '● ' : ''}${bn}`)));
        side.append(h('div', { class: 'field' }, h('label', {}, 'Bone'), boneSel));
        const val = key.pose?.[bone] || [0, 0, 0];
        const sliders = h('div', { class: 'bone-sliders' });
        ['X', 'Y', 'Z'].forEach((ax, i) => {
          const out = h('b', {}, `${Math.round(val[i])}°`);
          sliders.append(h('div', { class: 'trait' }, h('span', {}, ax), h('input', { type: 'range', min: -180, max: 180, step: 1, value: val[i], oninput: (e) => {
            key.pose = key.pose || {};
            const v = key.pose[bone] || [0, 0, 0];
            v[i] = +e.target.value;
            key.pose[bone] = v;
            out.textContent = `${v[i]}°`;
            time = key.t; playing = false;
            rebuild();
          } }), out));
        });
        side.append(sliders, h('div', { class: 'row' },
          h('button', { class: 'small', onclick: () => { if (key.pose) delete key.pose[bone]; rebuild(); renderSide(); } }, 'Clear bone at this key'),
          h('span', { class: 'hint' }, 'X: forward/back · Y: twist · Z: sideways'),
        ));
      };

      renderSide();
      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (playing) time = (time + dt) % doc.duration;
        clip.sample(time, pose);
        avatar.applyPose(pose);
        avatar.update(dt);
        scrub.value = String(time / doc.duration);
        timeLbl.textContent = `${time.toFixed(2)}s`;
        const w = preview.clientWidth, hh = preview.clientHeight;
        if (renderer.domElement.width !== w || renderer.domElement.height !== hh) {
          renderer.setSize(w, hh, false);
          camera.aspect = w / Math.max(1, hh);
          camera.updateProjectionMatrix();
        }
        controls.update();
        renderer.render(scene, camera);
      };
      loop();
    },
    foot: (f) => {
      f.append(
        h('button', { onclick: () => download(`${(doc.name || 'animation').replace(/[^\w-]+/g, '_')}.json`, JSON.stringify(doc, null, 2)) }, '⬇ Download JSON'),
        h('button', { class: 'primary', onclick: save }, assetId ? '💾 Save changes' : '💾 Save to Library'),
      );
    },
    onClose: () => {
      cancelAnimationFrame(raf);
      controls?.dispose();
      avatar.dispose();
      renderer.dispose();
    },
  });

  function rebuild() {
    clip = new KeyframeClip(doc);
  }

  async function save() {
    const name = doc.name?.trim() || (await prompt('Animation name', 'My Animation'));
    if (!name) return;
    doc.name = name;
    const data = new TextEncoder().encode(JSON.stringify(doc, null, 2)).buffer;
    if (assetId && lib.get(assetId)?.source === 'imported') {
      // replace: delete + re-add keeps things simple, then move mappings over
      const old = assetId;
      const asset = await lib.add({ name, type: 'animation', data, ext: 'json' });
      for (const [k, v] of Object.entries(sim.registry.actionMap)) if (v === old) sim.registry.actionMap[k] = asset.id;
      if (sim.registry.emotes.has(old)) sim.registry.emotes.add(asset.id);
      await lib.remove(old);
      sim.registry.remove(old);
      assetId = asset.id;
      await sim.registry.loadAsset(asset.id);
    } else {
      const asset = await lib.add({ name, type: 'animation', data, ext: 'json' });
      assetId = asset.id;
      await sim.registry.loadAsset(asset.id);
      // an adjusted import takes over the original's jobs in game (actions it replaces, idle emote)
      if (sourceId) {
        const reg = sim.registry;
        const took = [];
        for (const [k, v] of Object.entries(reg.actionMap)) if (v === sourceId) { reg.actionMap[k] = asset.id; took.push(k); }
        if (reg.emotes.has(sourceId)) { reg.emotes.delete(sourceId); reg.emotes.add(asset.id); took.push('idle emote'); }
        reg.emit('change');
        sourceId = null;
        if (took.length) { toast(`Saved “${name}” — now used in game for: ${took.join(', ')} (instead of the original).`); return; }
      }
    }
    toast(`Saved “${name}”. Map it to an action or make it an idle emote in 📦 Library → Animations.`);
  }
}
