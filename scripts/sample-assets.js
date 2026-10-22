// Generates small sample VRM 1.0 files (a mannequin character, an outfit,
// and a .vrma dance) entirely in the browser with three.js. Used for tests
// and shipped as samples so the import features can be tried right away.
// Bundled by scripts/make-samples.cjs and executed in headless Chromium.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUILTIN_ANIMATIONS } from '../src/characters/builtinAnims.js';
import { KeyframeClip, makePose } from '../src/characters/animation.js';
import { BONES, BONE_PARENT } from '../src/characters/rig.js';

// Realistic-ish 1.6 m humanoid in T-pose, facing +Z, left = +X (VRM 1.0)
const LAYOUT = {
  hips: [0, 0.9, 0], spine: [0, 0.1, 0], chest: [0, 0.12, 0], upperChest: [0, 0.12, 0], neck: [0, 0.14, 0], head: [0, 0.08, 0],
  leftShoulder: [0.03, 0.09, 0], leftUpperArm: [0.11, 0, 0], leftLowerArm: [0.26, 0, 0], leftHand: [0.24, 0, 0],
  rightShoulder: [-0.03, 0.09, 0], rightUpperArm: [-0.11, 0, 0], rightLowerArm: [-0.26, 0, 0], rightHand: [-0.24, 0, 0],
  leftUpperLeg: [0.09, -0.06, 0], leftLowerLeg: [0, -0.4, 0], leftFoot: [0, -0.39, 0], leftToes: [0, -0.04, 0.1],
  rightUpperLeg: [-0.09, -0.06, 0], rightLowerLeg: [0, -0.4, 0], rightFoot: [0, -0.39, 0], rightToes: [0, -0.04, 0.1],
};

function makeSkeleton() {
  const bones = {};
  const list = [];
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(LAYOUT[name]);
    bones[name] = b;
    list.push(b);
    if (BONE_PARENT[name]) bones[BONE_PARENT[name]].add(b);
  }
  return { bones, list, root: bones.hips };
}

/** A body part primitive rigidly skinned to one bone. pos is in world (rest) space. */
function part(geo, boneIndex, pos, rot = null, scale = null) {
  const g = geo.clone();
  if (scale) g.scale(...scale);
  if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
  g.translate(...pos);
  const n = g.attributes.position.count;
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? boneIndex : 0)), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  return g;
}

function worldPos(bones, name, local = [0, 0, 0]) {
  bones.hips.updateMatrixWorld(true);
  return new THREE.Vector3(...local).applyMatrix4(bones[name].matrixWorld).toArray();
}

function limb(bones, list, from, to, r, extra = 0) {
  const a = new THREE.Vector3(...worldPos(bones, from));
  const b = new THREE.Vector3(...worldPos(bones, to));
  const len = a.distanceTo(b) + extra;
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 12);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  geo.applyQuaternion(q);
  return part(geo, list.indexOf(bones[from]), mid.toArray());
}

function mesh(geos, material, skel) {
  // keep geometry indexed: VRM tools (and three-vrm's MToon outlines) expect indexed meshes
  const geo = mergeGeometries(geos.map((g) => { const c = g.clone(); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) c.deleteAttribute(k); return c; }), false);
  geo.computeVertexNormals();
  const m = new THREE.SkinnedMesh(geo, material);
  return m;
}

function mat(name, color) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  m.name = name;
  return m;
}

function buildModel({ withBody = true, outfit = false }) {
  const { bones, list, root } = makeSkeleton();
  const scene = new THREE.Group();
  scene.name = outfit ? 'OutfitRoot' : 'MannequinRoot';
  const armature = new THREE.Group();
  armature.name = 'Armature';
  armature.add(root);
  scene.add(armature);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  const idx = (n) => list.indexOf(bones[n]);
  const meshes = [];
  const add = (name, color, geos) => {
    const m = mesh(geos, mat(name, color), skeleton);
    m.name = name;
    scene.add(m);
    meshes.push(m);
  };
  const skin = '#f1c8a6';
  if (withBody) {
    // skin body
    add('N00_000_00_Body_00_SKIN', skin, [
      part(new THREE.SphereGeometry(0.11, 20, 16), idx('head'), worldPos(bones, 'head', [0, 0.1, 0.01]), null, [1, 1.12, 1.02]),
      limb(bones, list, 'neck', 'head', 0.04),
      limb(bones, list, 'leftLowerArm', 'leftHand', 0.035, 0.04),
      limb(bones, list, 'rightLowerArm', 'rightHand', 0.035, 0.04),
      part(new THREE.SphereGeometry(0.045, 10, 8), idx('leftHand'), worldPos(bones, 'leftHand', [0.05, 0, 0])),
      part(new THREE.SphereGeometry(0.045, 10, 8), idx('rightHand'), worldPos(bones, 'rightHand', [-0.05, 0, 0])),
      limb(bones, list, 'leftLowerLeg', 'leftFoot', 0.05),
      limb(bones, list, 'rightLowerLeg', 'rightFoot', 0.05),
    ]);
    add('N00_000_00_Face_00_SKIN', '#2b2b38', [
      part(new THREE.SphereGeometry(0.018, 8, 8), idx('head'), worldPos(bones, 'head', [0.04, 0.11, 0.1])),
      part(new THREE.SphereGeometry(0.018, 8, 8), idx('head'), worldPos(bones, 'head', [-0.04, 0.11, 0.1])),
    ]);
    add('N00_000_Hair_00_HAIR', '#3b5bdb', [
      part(new THREE.SphereGeometry(0.118, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), idx('head'), worldPos(bones, 'head', [0, 0.12, -0.005]), [-0.2, 0, 0], [1.02, 1.1, 1.05]),
      part(new THREE.CapsuleGeometry(0.09, 0.15, 4, 10), idx('head'), worldPos(bones, 'head', [0, 0.02, -0.07]), null, [1.15, 1, 0.6]),
    ]);
    add('N00_000_00_Tops_01_CLOTH', '#e8e8e8', [
      limb(bones, list, 'hips', 'neck', 0.12),
      limb(bones, list, 'leftUpperArm', 'leftLowerArm', 0.045, 0.04),
      limb(bones, list, 'rightUpperArm', 'rightLowerArm', 0.045, 0.04),
    ]);
    add('N00_000_00_Bottoms_01_CLOTH', '#3d4a66', [
      part(new THREE.CylinderGeometry(0.13, 0.14, 0.16, 16), idx('hips'), worldPos(bones, 'hips', [0, -0.02, 0])),
      limb(bones, list, 'leftUpperLeg', 'leftLowerLeg', 0.065),
      limb(bones, list, 'rightUpperLeg', 'rightLowerLeg', 0.065),
    ]);
    add('N00_000_00_Shoes_01_CLOTH', '#5a3a2a', [
      part(new THREE.BoxGeometry(0.1, 0.07, 0.24), idx('leftFoot'), worldPos(bones, 'leftFoot', [0, -0.02, 0.05])),
      part(new THREE.BoxGeometry(0.1, 0.07, 0.24), idx('rightFoot'), worldPos(bones, 'rightFoot', [0, -0.02, 0.05])),
    ]);
  }
  if (outfit) {
    add('N00_002_01_Tops_01_CLOTH', '#ff7a59', [
      limb(bones, list, 'hips', 'neck', 0.15),
      part(new THREE.TorusGeometry(0.075, 0.03, 8, 16), idx('neck'), worldPos(bones, 'neck', [0, 0.02, -0.03]), [Math.PI / 2, 0, 0]),
      limb(bones, list, 'leftUpperArm', 'leftLowerArm', 0.06, 0.05),
      limb(bones, list, 'rightUpperArm', 'rightLowerArm', 0.06, 0.05),
      limb(bones, list, 'leftLowerArm', 'leftHand', 0.05, -0.05),
      limb(bones, list, 'rightLowerArm', 'rightHand', 0.05, -0.05),
    ]);
    add('N00_002_01_Bottoms_01_CLOTH', '#ffd166', [
      part(new THREE.CylinderGeometry(0.16, 0.3, 0.38, 20, 1, false), idx('hips'), worldPos(bones, 'hips', [0, -0.12, 0])),
    ]);
    add('N00_002_01_Accessory_Hat_01_CLOTH', '#2f8f6b', [
      part(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20), idx('head'), worldPos(bones, 'head', [0, 0.22, 0])),
      part(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24), idx('head'), worldPos(bones, 'head', [0, 0.18, 0])),
    ]);
  }
  for (const m of meshes) m.bind(skeleton, m.matrixWorld);
  return { scene, bones };
}

function exportGLB(scene, animations = []) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(scene, (r) => resolve(r), reject, { binary: true, animations, onlyVisible: false });
  });
}

function readGLB(buf) {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binStart = 20 + jsonLen;
  const binLen = dv.getUint32(binStart, true);
  const bin = new Uint8Array(buf, binStart + 8, binLen);
  return { json, bin };
}

function writeGLB(json, bin) {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jpad = (4 - (jsonBytes.length % 4)) % 4;
  const jb = new Uint8Array(jsonBytes.length + jpad);
  jb.set(jsonBytes);
  jb.fill(0x20, jsonBytes.length);
  const bpad = (4 - (bin.length % 4)) % 4;
  const total = 12 + 8 + jb.length + 8 + bin.length + bpad;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jb.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20);
  const b0 = 20 + jb.length;
  dv.setUint32(b0, bin.length + bpad, true);
  dv.setUint32(b0 + 4, 0x004e4942, true);
  out.set(bin, b0 + 8);
  return out.buffer;
}

function humanBones(json) {
  const out = {};
  json.nodes.forEach((n, i) => { if (BONES.includes(n.name)) out[n.name] = { node: i }; });
  return out;
}

function toVRM(buf, name, shade) {
  const { json, bin } = readGLB(buf);
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'VRMC_vrm', 'VRMC_materials_mtoon'])];
  json.extensions = json.extensions || {};
  json.extensions.VRMC_vrm = {
    specVersion: '1.0',
    meta: {
      name, version: '1.0', authors: ['FriendLife sample generator'], licenseUrl: 'https://vrm.dev/licenses/1.0/',
      avatarPermission: 'everyone', allowExcessivelyViolentUsage: true, allowExcessivelySexualUsage: false, commercialUsage: 'corporation',
      allowPoliticalOrReligiousUsage: true, allowAntisocialOrHateUsage: false, creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution',
    },
    humanoid: { humanBones: humanBones(json) },
    expressions: { preset: {} },
  };
  for (const m of json.materials || []) {
    const c = m.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
    m.extensions = m.extensions || {};
    m.extensions.VRMC_materials_mtoon = {
      specVersion: '1.0', transparentWithZWrite: false, renderQueueOffsetNumber: 0,
      shadeColorFactor: c.slice(0, 3).map((v) => v * shade), shadingShiftFactor: -0.1, shadingToonyFactor: 0.9, giEqualizationFactor: 0.9,
      matcapFactor: [0, 0, 0], parametricRimColorFactor: [0, 0, 0], rimLightingMixFactor: 1, parametricRimFresnelPowerFactor: 5, parametricRimLiftFactor: 0,
      outlineWidthMode: 'worldCoordinates', outlineWidthFactor: 0.002, outlineColorFactor: [0.15, 0.1, 0.1], outlineLightingMixFactor: 1,
    };
  }
  return writeGLB(json, bin);
}

async function makeVRMA() {
  const { scene, bones } = buildModel({ withBody: false });
  const def = BUILTIN_ANIMATIONS.find((a) => a.name === 'dance');
  const clip = new KeyframeClip(def);
  const pose = makePose();
  const fps = 30;
  const n = Math.round(clip.duration * fps) + 1;
  const times = [];
  const rot = {};
  const hips = [];
  for (const b of BONES) rot[b] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times.push(t);
    clip.sample(t, pose);
    for (const b of BONES) rot[b].push(...pose.rot[b].toArray());
    hips.push(pose.hips.x * 0.9, 0.9 + pose.hips.y * 0.9, pose.hips.z * 0.9);
  }
  const tracks = BONES.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rot[b]));
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hips));
  const anim = new THREE.AnimationClip('dance', clip.duration, tracks);
  const buf = await exportGLB(scene, [anim]);
  const { json, bin } = readGLB(buf);
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'VRMC_vrm_animation'])];
  json.extensions = { ...(json.extensions || {}), VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones: humanBones(json) } } };
  // .vrma files contain no meshes
  delete json.meshes; delete json.skins; delete json.materials; delete json.textures; delete json.images; delete json.samplers;
  for (const node of json.nodes) { delete node.mesh; delete node.skin; }
  return writeGLB(json, bin);
}

// VRM 0.x: model faces -Z (rotate everything 180° about Y and bake it in).
function bakeVRM0(scene, bones) {
  for (const b of Object.values(bones)) { b.position.x *= -1; b.position.z *= -1; }
  scene.traverse((o) => { if (o.isSkinnedMesh) o.geometry.rotateY(Math.PI); });
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.calculateInverses(); o.bind(o.skeleton, o.matrixWorld); } });
}

function toVRM0(buf, name) {
  const { json, bin } = readGLB(buf);
  json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), 'VRM'])];
  json.extensions = json.extensions || {};
  json.extensions.VRM = {
    exporterVersion: 'FriendLife sample generator', specVersion: '0.0',
    meta: { title: name, version: '1.0', author: 'FriendLife', allowedUserName: 'Everyone', violentUssageName: 'Allow', sexualUssageName: 'Disallow', commercialUssageName: 'Allow', licenseName: 'CC0' },
    humanoid: { humanBones: Object.entries(humanBones(json)).map(([bone, v]) => ({ bone, node: v.node, useDefaultValues: true })) },
    firstPerson: {}, blendShapeMaster: { blendShapeGroups: [] }, secondaryAnimation: { boneGroups: [], colliderGroups: [] }, materialProperties: [],
  };
  return writeGLB(json, bin);
}

function toB64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.makeSamples = async () => {
  const char = buildModel({ withBody: true });
  const outfit = buildModel({ withBody: true, outfit: true });
  const v0 = buildModel({ withBody: true });
  bakeVRM0(v0.scene, v0.bones);
  return {
    'test/Sample Mannequin VRM0.vrm': toB64(toVRM0(await exportGLB(v0.scene), 'Sample Mannequin VRM0')),
    'Sample Mannequin.vrm': toB64(toVRM(await exportGLB(char.scene), 'Sample Mannequin', 0.75)),
    'Sample Hoodie Outfit.vrm': toB64(toVRM(await exportGLB(outfit.scene), 'Sample Hoodie Outfit', 0.75)),
    'Sample Dance.vrma': toB64(await makeVRMA()),
  };
};
