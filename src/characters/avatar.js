// Avatar = the visual body of a resident. Either an imported VRoid/VRM model
// or the built-in procedural doll. Both expose the same API so the rest of
// the game does not care which one it is talking to.

import * as THREE from 'three';
import { BONES, buildDoll, nearestBone } from './rig.js';
import { parseVRM, disposeVRM, releaseVRMFile } from './loaders.js';
import { prepareMToonWet, applyMToonWet, patchWeather, shineKind, applyMToonShine, applyPBRShine } from '../engine/materials.js';
import { clamp, damp, rand } from '../core/util.js';

const R180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _L = new THREE.Vector3();
const _R = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ikQ = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _tq = new THREE.Quaternion();
const _rootQ = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function materialCategory(name) {
  const n = name.toLowerCase();
  if (/hair/.test(n)) return 'Hair';
  if (/face|eye|mouth|brow|lash|teeth|tongue|iris|highlight/.test(n)) return 'Face';
  if (/onepiece|one_piece|dress/.test(n)) return 'Onepiece';
  if (/tops|shirt|jacket|outer|coat|hoodie|sweater/.test(n)) return 'Tops';
  if (/bottom|pants|skirt|short/.test(n)) return 'Bottoms';
  if (/shoe|boot|sock|sneaker/.test(n)) return 'Shoes';
  if (/acc|hat|glass|ribbon|bag|ear/.test(n)) return 'Accessory';
  if (/body|skin/.test(n)) return 'Body';
  return 'Other';
}

export function baseMatName(mat) {
  return (mat.name || 'material').replace(/ \(Outline\)$/, '');
}

export class Avatar {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'Avatar';
    this.kind = 'doll';
    this.vrm = null;
    this.doll = null;
    this.hipsHeight = 0.62;
    this.height = 1.4;
    this.isVRM0 = false;
    this.wetUniform = { value: 0 };
    this.wetness = 0;
    this.expr = { happy: 0, angry: 0, sad: 0, surprised: 0, relaxed: 0, blush: 0 };
    this.exprTarget = { ...this.expr };
    this.talking = false;
    this.blinkTimer = rand(1, 4);
    this.blink = 0;
    this.talkPhase = 0;
    this.look = { textures: {}, tints: {}, hidden: [] };
    this.outfit = null; // {assetId, meshes:[], materials:[]}
    this.restHips = new THREE.Vector3();
  }

  static async fromDoll(preset) {
    const a = new Avatar();
    a.kind = 'doll';
    a.doll = buildDoll(preset, a.wetUniform);
    a.root.add(a.doll.root);
    a.hipsHeight = a.doll.hipsHeight;
    a.height = 1.38 * (preset?.height || 1);
    a.restHips.copy(a.doll.bones.hips.position);
    return a;
  }

  static async fromVRM(buffer) {
    const a = new Avatar();
    const vrm = await parseVRM(buffer);
    a.kind = 'vrm';
    a.vrm = vrm;
    a.isVRM0 = vrm.meta?.metaVersion === '0';
    a.root.add(vrm.scene);
    const hipsRest = vrm.humanoid.normalizedRestPose?.hips?.position;
    a.hipsHeight = hipsRest ? hipsRest[1] : 0.9;
    a.restHips.fromArray(hipsRest || [0, a.hipsHeight, 0]);
    // VRoid models stand around 1.4-1.7 m; the island is built for ~1.4 m dolls,
    // so very tall models are gently scaled down to keep everyone readable.
    vrm.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(vrm.scene);
    a.height = Math.max(0.5, box.max.y - box.min.y);
    a.materials = [];
    vrm.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        a._prepareWet(m);
        if (!a.materials.includes(m)) a.materials.push(m);
      }
    });
    if (vrm.lookAt) vrm.lookAt.autoUpdate = false;
    return a;
  }

  /** MToon gets a matcap/rim based sheen; PBR materials get the shared wet shader. */
  _prepareWet(m) {
    if (m.isMToonMaterial) prepareMToonWet(m);
    else if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.weather) patchWeather(m, { local: this.wetUniform, porosity: 0.3, snow: false });
  }

  /** Normalized humanoid bone node (what we pose). */
  getBone(name) {
    if (this.kind === 'doll') return this.doll.bones[name] || null;
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  /** Raw skeleton bone (what skinned meshes follow). */
  getRawBone(name) {
    if (this.kind === 'doll') return this.doll.bones[name] || null;
    return this.vrm.humanoid.getRawBoneNode(name);
  }

  applyPose(pose) {
    const flip = this.isVRM0;
    for (const b of BONES) {
      const node = this.getBone(b);
      if (!node) continue;
      const q = pose.rot[b];
      if (flip) node.quaternion.set(-q.x, q.y, -q.z, q.w);
      else node.quaternion.copy(q);
    }
    const hips = this.getBone('hips');
    if (hips) {
      _v.copy(pose.hips).multiplyScalar(this.hipsHeight);
      if (flip) { _v.x = -_v.x; _v.z = -_v.z; }
      hips.position.copy(this.restHips).add(_v);
    }
  }

  restPose() {
    for (const b of BONES) this.getBone(b)?.quaternion.identity();
    this.getBone('hips')?.position.copy(this.restHips);
    if (this.vrm) this.vrm.update(0);
    this.root.updateMatrixWorld(true);
  }

  /** World position/orientation of a bone, orientation in VRM1 convention (+Z forward). */
  getBoneWorld(name, pos, quat) {
    const node = this.getBone(name) || this.getBone(nearestBone(name, (n) => !!this.getBone(n)));
    if (!node) return false;
    node.updateWorldMatrix(true, false);
    if (pos) node.getWorldPosition(pos);
    if (quat) {
      node.getWorldQuaternion(quat);
      if (this.isVRM0) quat.multiply(R180);
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Inverse kinematics

  /** Rotate a bone by a world-space rotation q (pivoting at the bone). */
  _rotateWorld(bone, q) {
    bone.parent.getWorldQuaternion(_pq);
    _tq.copy(_pq).invert().multiply(q).multiply(_pq);
    bone.quaternion.premultiply(_tq);
    bone.updateMatrixWorld(true);
  }

  /** Classic analytic two-bone IK (thigh/shin or upper/lower arm) toward a world target. */
  twoBoneIK(upper, lower, end, target, bendAxis) {
    upper.getWorldPosition(_A);
    lower.getWorldPosition(_B);
    end.getWorldPosition(_C);
    const l1 = _A.distanceTo(_B), l2 = _B.distanceTo(_C);
    if (l1 < 1e-4 || l2 < 1e-4) return;
    const d = clamp(_A.distanceTo(target), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    _u.subVectors(_A, _B).normalize();
    _w.subVectors(_C, _B).normalize();
    const cur = Math.acos(clamp(_u.dot(_w), -1, 1));
    const want = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    _n.crossVectors(_u, _w);
    if (_n.lengthSq() < 1e-8) _n.copy(bendAxis); else _n.normalize();
    _ikQ.setFromAxisAngle(_n, want - cur);
    this._rotateWorld(lower, _ikQ);
    end.getWorldPosition(_C);
    _u.subVectors(_C, _A).normalize();
    _w.subVectors(target, _A).normalize();
    _ikQ.setFromUnitVectors(_u, _w);
    this._rotateWorld(upper, _ikQ);
  }

  /**
   * Foot IK: keep feet on the ground when it isn't flat under the character
   * (stage edges, steps, the pier, slopes). groundAt(x, z) gives terrain height,
   * rootGround is the height the character root stands at.
   */
  solveFootIK(groundAt, rootGround, enabled, dt) {
    const legs = [['leftUpperLeg', 'leftLowerLeg', 'leftFoot', _L], ['rightUpperLeg', 'rightLowerLeg', 'rightFoot', _R]];
    if (!enabled || !this.getBone('leftFoot') || !this.getBone('rightFoot')) {
      this.ikDrop = damp(this.ikDrop || 0, 0, 10, dt);
      this.root.position.y = this.ikDrop;
      return;
    }
    this.root.position.y = 0;
    this.root.updateWorldMatrix(true, true);
    const deltas = [];
    for (const [, , foot, out] of legs) {
      this.getBone(foot).getWorldPosition(out);
      deltas.push(clamp(groundAt(out.x, out.z) - rootGround, -0.7, 0.7));
    }
    const drop = Math.min(0, deltas[0], deltas[1]);
    this.ikDrop = damp(this.ikDrop || 0, drop, 14, dt);
    this.root.position.y = this.ikDrop;
    if (Math.abs(deltas[0] - this.ikDrop) < 0.01 && Math.abs(deltas[1] - this.ikDrop) < 0.01) return;
    this.root.updateWorldMatrix(false, true);
    this.root.getWorldQuaternion(_rootQ);
    _right.set(-1, 0, 0).applyQuaternion(_rootQ); // character's right (knees bend forward)
    legs.forEach(([up, lo, foot, pos], i) => {
      const lift = deltas[i] - this.ikDrop;
      if (Math.abs(lift) < 0.01) return;
      const target = pos.clone();
      target.y += deltas[i]; // original foot height + ground difference under this foot
      this.twoBoneIK(this.getBone(up), this.getBone(lo), this.getBone(foot), target, _right);
    });
  }

  setExpression(name, weight) {
    if (name in this.exprTarget) this.exprTarget[name] = weight;
  }

  clearExpressions() {
    for (const k of Object.keys(this.exprTarget)) this.exprTarget[k] = 0;
  }

  setWetness(w) {
    w = clamp(w);
    if (Math.abs(w - this.wetness) < 0.002) return;
    this.wetness = w;
    this.wetUniform.value = w;
    if (this.kind === 'vrm') this._refreshMaterials();
    this._applyThin();
  }

  update(dt) {
    // smooth expressions
    for (const k of Object.keys(this.expr)) this.expr[k] = damp(this.expr[k], this.exprTarget[k], 8, dt);
    // blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) { this.blink = 1; this.blinkTimer = rand(2, 5); }
    this.blink = Math.max(0, this.blink - dt * 7);
    const blinkW = this.blink > 0 ? Math.sin((1 - this.blink) * Math.PI) : 0;
    // mouth
    this.talkPhase += dt * 14;
    const mouthOpen = this.talking ? (0.35 + 0.35 * Math.sin(this.talkPhase) + 0.2 * Math.sin(this.talkPhase * 2.3)) : 0;

    if (this.kind === 'vrm') {
      const em = this.vrm.expressionManager;
      if (em) {
        const e = this.expr;
        em.setValue('happy', clamp(e.happy));
        em.setValue('angry', clamp(e.angry));
        em.setValue('sad', clamp(e.sad));
        em.setValue('surprised', clamp(e.surprised));
        em.setValue('relaxed', clamp(e.relaxed + e.blush * 0.5));
        const eyesClosedByExpr = clamp(e.happy * 0.6 + e.relaxed * 0.6);
        em.setValue('blink', clamp(blinkW * (1 - eyesClosedByExpr)));
        em.setValue('aa', clamp(mouthOpen));
      }
      this.vrm.update(dt);
    } else {
      const f = this.doll.face;
      const e = this.expr;
      const eyeOpen = 1 - Math.max(blinkW, e.happy * 0.7);
      const eyeH = 1.2 * Math.max(0.12, eyeOpen) * (1 + e.surprised * 0.4);
      f.eyeL.scale.y = eyeH;
      f.eyeR.scale.y = eyeH;
      const browTilt = e.angry * 0.45 - e.sad * 0.4;
      f.browL.rotation.z = browTilt;
      f.browR.rotation.z = -browTilt;
      const browY = 0.07 + e.surprised * 0.02 - e.angry * 0.012;
      f.browL.position.y = browY;
      f.browR.position.y = browY;
      const smile = e.happy - e.sad * 0.8 - e.angry * 0.4;
      f.mouth.scale.set(1.2 + smile * 0.6 - e.surprised * 0.4, 0.3 + mouthOpen * 0.9 + e.surprised * 0.8 + Math.max(0, e.angry) * 0.2, 0.4);
      f.mouth.position.y = -0.075 - smile * 0.008;
      f.blushMat.opacity = clamp(e.blush * 0.8);
    }
  }

  // ------------------------------------------------------------------
  // Material slots, texture swaps, tints and hidden parts ("variations")

  /**
   * Wardrobe items: one per distinct texture (not per material name). VRoid
   * exports often reuse a name such as "Onepiece_00_CLOTH" for socks, bra and
   * panties, each with its own texture; those become separate items. Keys stay
   * the plain material name for the first item of a name (so older saved looks
   * keep working) and "name#2", "name#3"… for the others.
   */
  materialSlots() {
    if (this.kind === 'doll') {
      return ['skin', 'hair', 'top', 'bottom', 'shoes'].map((k) => ({ key: k, label: k, category: k }));
    }
    if (!this._slots) this._slots = this._buildSlots();
    return [...this._slots.values()].map(({ mats, ...rest }) => rest);
  }

  _buildSlots() {
    const slots = new Map();
    const add = (list, prefix) => {
      const groups = new Map(); // name → [texture uuid…] in order of appearance
      for (const m of list) {
        const n = baseMatName(m);
        const tex = m.userData.origMap ? m.userData.origMap.map : m.map || null; // the model's own texture
        const texId = tex ? tex.uuid : `mat:${m.uuid}`;
        if (!groups.has(n)) groups.set(n, []);
        const g = groups.get(n);
        // outline materials share the main material's texture → same item
        let i = g.findIndex((x) => x.texId === texId);
        if (i < 0) { g.push({ texId, tex }); i = g.length - 1; }
        const key = `${prefix}${n}${i ? `#${i + 1}` : ''}`;
        if (!slots.has(key)) {
          const nice = n.replace(/^N\d+_\d+_\d+_/, '').replace(/ \(Instance\)$/, '');
          slots.set(key, { key, base: n, label: `${prefix ? '👕 ' : ''}${nice}`, category: materialCategory(n), outfit: !!prefix, tex, mats: [] });
        }
        const sl = slots.get(key);
        if (!sl.mats.includes(m)) sl.mats.push(m);
      }
      // number duplicates in the label so they can be told apart
      for (const [n, g] of groups) if (g.length > 1) g.forEach((_, i) => { const sl = slots.get(`${prefix}${n}${i ? `#${i + 1}` : ''}`); if (sl) sl.label += ` (${i + 1}/${g.length})`; });
    };
    add(this.materials, '');
    if (this.outfit) add(this.outfit.materials, 'outfit:');
    return slots;
  }

  /** A small preview of an item's texture (data URL) for the wardrobe list. */
  slotThumb(key, size = 40) {
    if (this.kind === 'doll') return null;
    if (!this._slots) this._slots = this._buildSlots();
    const sl = this._slots.get(key);
    const img = (sl?.mats[0]?.map || sl?.tex)?.image;
    if (!img || !img.width) return null;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, 0, 0, size, size);
      return c.toDataURL();
    } catch { return null; }
  }

  _materialsForSlot(key) {
    if (this.kind === 'doll') return this.doll.slots[key] ? [this.doll.slots[key]] : [];
    if (!this._slots) this._slots = this._buildSlots();
    return this._slots.get(key)?.mats || [];
  }

  /**
   * Apply a "look": { textures: {slot: textureAssetId}, tints: {slot: '#rrggbb'}, hidden: [slot] }
   * textureStore resolves asset ids to THREE.Texture.
   */
  async applyLook(look, textureStore) {
    this.look = { textures: { ...(look?.textures || {}) }, tints: { ...(look?.tints || {}) }, hidden: [...(look?.hidden || [])], thin: [...(look?.thin || [])] };
    // remember original maps so a look can be removed again
    const allMats = this.kind === 'doll' ? Object.values(this.doll.slots) : [...this.materials, ...(this.outfit?.materials || [])];
    for (const m of allMats) {
      if (!m.userData.origMap) m.userData.origMap = { map: m.map || null, shade: m.shadeMultiplyTexture || null, color: m.color?.clone() };
    }
    for (const slot of this.materialSlots()) {
      const mats = this._materialsForSlot(slot.key);
      const texId = this.look.textures[slot.key];
      let tex = null;
      if (texId && textureStore) {
        try { tex = await textureStore.get(texId, { flipY: this.kind === 'doll' }); } catch (e) { console.warn('texture missing', texId); }
      }
      for (const m of mats) {
        const o = m.userData.origMap;
        const newMap = tex || o.map;
        if (m.map !== newMap) {
          const hadMap = !!m.map;
          m.map = newMap;
          if (m.isMToonMaterial && 'shadeMultiplyTexture' in m && (o.shade || tex)) m.shadeMultiplyTexture = tex || o.shade;
          if (hadMap !== !!newMap) m.needsUpdate = true;
        }
        m.visible = !this.look.hidden.includes(slot.key);
        m.userData.thin = this.look.thin.includes(slot.key);
        // "metallic" / "silk" in the texture's name: always shiny
        const texName = tex ? (textureStore?.library?.displayName?.(texId) || tex.name) : (o.map?.name || o.map?.source?.data?.name || '');
        m.userData.shine = shineKind(texName);
        const tint = this.look.tints[slot.key];
        m.userData.tint = tint ? new THREE.Color(tint) : null;
        if (this.kind === 'doll' && o.color) {
          m.color.copy(o.color);
          if (m.userData.tint) m.color.multiply(m.userData.tint);
        }
      }
    }
    this._refreshMaterials();
  }

  /** "Thin" items turn see-through as they get wet. */
  _applyThin() {
    const mats = this.kind === 'doll' ? Object.values(this.doll.slots) : [...this.materials, ...(this.outfit?.materials || [])];
    for (const m of mats) {
      const thin = !!m.userData.thin;
      if (!thin && !m.userData.thinWas) continue;
      const op = thin ? 1 - 0.62 * clamp((this.wetness - 0.15) / 0.75) : 1;
      if (op < 0.985) {
        if (!m.userData.thinWas) {
          m.userData.thinWas = { transparent: m.transparent, depthWrite: m.depthWrite, opacity: m.opacity, alphaTest: m.alphaTest || 0 };
          m.transparent = true;
          m.needsUpdate = true;
        }
        const w = m.userData.thinWas;
        m.opacity = op * w.opacity;
        // VRoid body/cloth materials use an alpha cut-off (often 0.5): scale it with the
        // opacity, otherwise the faded part drops below the cut-off and vanishes entirely
        if (w.alphaTest > 0) m.alphaTest = w.alphaTest * op * 0.9;
      } else if (m.userData.thinWas) {
        const w = m.userData.thinWas;
        m.transparent = w.transparent;
        m.depthWrite = w.depthWrite;
        m.opacity = w.opacity;
        m.alphaTest = w.alphaTest;
        m.userData.thinWas = null;
        m.needsUpdate = true;
      }
    }
  }

  _refreshMaterials() {
    this._applyThin();
    if (this.kind !== 'vrm') {
      for (const m of Object.values(this.doll?.slots || {})) if (m.isMeshStandardMaterial) applyPBRShine(m, m.userData.shine || null);
      return;
    }
    const mats = [...this.materials, ...(this.outfit?.materials || [])];
    for (const m of mats) {
      if (m.isMToonMaterial) {
        // shiny fabrics keep their own steady shine (the wet look leaves them alone)
        if (m.userData.shine) applyMToonShine(m, m.userData.shine, m.userData.tint || null);
        else applyMToonWet(m, this.wetness, m.userData.tint || null);
        continue;
      }
      if (m.isMeshStandardMaterial) applyPBRShine(m, m.userData.shine || null);
      if (m.color && m.userData.origMap?.color) {
        m.color.copy(m.userData.origMap.color);
        if (m.userData.tint) m.color.multiply(m.userData.tint);
      }
    }
  }

  // ------------------------------------------------------------------
  // Outfits: skinned meshes taken from another VRM and re-bound to this
  // avatar's skeleton.

  /** Inspect which material parts a VRM has, for the outfit part picker. */
  static listParts(vrm) {
    const parts = new Map();
    vrm.scene.traverse((o) => {
      if (!o.isSkinnedMesh && !o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const n = baseMatName(m);
        if (!parts.has(n)) parts.set(n, { key: n, category: materialCategory(n) });
      }
    });
    return [...parts.values()];
  }

  static defaultOutfitParts(parts) {
    return parts.filter((p) => ['Tops', 'Bottoms', 'Shoes', 'Onepiece', 'Accessory'].includes(p.category)).map((p) => p.key);
  }

  removeOutfit() {
    this._slots = null;
    if (!this.outfit) return;
    for (const m of this.outfit.meshes) {
      m.removeFromParent();
      m.geometry?.dispose();
    }
    // the outfit's materials and textures live on the GPU until disposed
    for (const m of this.outfit.materials) disposeMaterial(m);
    releaseVRMFile(this.outfit.buffer);
    this.outfit = null;
  }

  /**
   * Wear parts of another VRM. parts = array of material names to take (null = auto).
   * Each taken skinned mesh is re-bound to this avatar's bones at T-pose so the
   * clothing keeps the shape it was modelled with and follows our skeleton.
   */
  async wearOutfit(buffer, parts, assetId) {
    this.removeOutfit();
    const ovrm = await parseVRM(buffer);
    const allParts = Avatar.listParts(ovrm);
    const take = new Set(parts && parts.length ? parts : Avatar.defaultOutfitParts(allParts));
    // map outfit raw bones -> humanoid names
    const rawToHuman = new Map();
    for (const name of BONES) {
      const raw = ovrm.humanoid.getRawBoneNode(name);
      if (raw) rawToHuman.set(raw, name);
    }
    const humanFor = (bone) => {
      let b = bone;
      while (b) {
        if (rawToHuman.has(b)) return rawToHuman.get(b);
        b = b.parent;
      }
      return 'hips';
    };
    // outfit at rest
    ovrm.scene.updateMatrixWorld(true);
    // our avatar at rest (T-pose), keep current world placement
    this.restPose();
    const taken = [];
    const meshes = [];
    ovrm.scene.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!take.has(baseMatName(mat))) continue;
      const outfitWorld = mesh.matrixWorld.clone(); // in outfit space == our root space
      const targetBones = mesh.skeleton.bones.map((b) => {
        const hn = humanFor(b);
        const tb = this.getRawBone(nearestBone(hn, (n) => !!this.getRawBone(n)));
        return tb || this.getRawBone('hips');
      });
      mesh.removeFromParent();
      this.root.add(mesh);
      // local matrix relative to our root == its old world in outfit space
      outfitWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.updateMatrixWorld(true);
      const inverses = targetBones.map((b) => b.matrixWorld.clone().invert());
      mesh.bind(new THREE.Skeleton(targetBones, inverses), mesh.matrixWorld.clone());
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      taken.push(mesh);
    }
    const materials = [];
    for (const m of taken) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        this._prepareWet(mm);
        if (!materials.includes(mm)) materials.push(mm);
      }
    }
    // Outline meshes share the same skinned mesh in three-vrm (multi-material groups), so they come along.
    // Free the parts we did not take (materials/textures may be shared, so only geometry).
    ovrm.scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
    this.outfit = { assetId, meshes: taken, materials, buffer: ovrm.userData?.fileBuffer || null };
    this._slots = null;
    this._refreshMaterials();
    return { taken: taken.length, parts: allParts };
  }

  dispose() {
    this.removeOutfit();
    // original textures set aside while a custom texture is shown
    for (const m of this.materials || []) { m.userData.origMap?.map?.dispose(); m.userData.origMap?.shade?.dispose(); }
    if (this.vrm) disposeVRM(this.vrm);
    this.root.removeFromParent();
  }
}

/** Free a material and the textures it holds (shared ones are re-uploaded if used again). */
function disposeMaterial(m) {
  if (!m) return;
  for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
  m.userData?.origMap?.map?.dispose();
  m.userData?.origMap?.shade?.dispose();
  m.dispose();
}
