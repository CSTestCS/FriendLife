// Humanoid rig definitions shared by VRM avatars and the built-in
// procedural "doll" avatars. Bone names follow the VRM humanoid spec, and
// all poses use the VRM 1.0 normalized convention: identity rotation is a
// T-pose, the character faces +Z and its left hand points to +X.

import * as THREE from 'three';
import { stdMat } from '../engine/materials.js';

export const BONES = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
  'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
  'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
];

export const BONE_PARENT = {
  spine: 'hips', chest: 'spine', upperChest: 'chest', neck: 'upperChest', head: 'neck',
  leftShoulder: 'upperChest', leftUpperArm: 'leftShoulder', leftLowerArm: 'leftUpperArm', leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest', rightUpperArm: 'rightShoulder', rightLowerArm: 'rightUpperArm', rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips', leftLowerLeg: 'leftUpperLeg', leftFoot: 'leftLowerLeg', leftToes: 'leftFoot',
  rightUpperLeg: 'hips', rightLowerLeg: 'rightUpperLeg', rightFoot: 'rightLowerLeg', rightToes: 'rightFoot',
};

/** Walk up the humanoid tree until we find a bone the avatar actually has. */
export function nearestBone(name, has) {
  let n = name;
  while (n && !has(n)) n = BONE_PARENT[n];
  return n || 'hips';
}

// ---------------------------------------------------------------------
// Procedural doll avatar

export const DOLL_DEFAULTS = {
  skin: '#f2c9a5',
  hair: '#4a3328',
  eyes: '#2b2b38',
  top: '#5aa9e6',
  bottom: '#34495e',
  shoes: '#6b4b3a',
  hairStyle: 'short', // short | long | spiky | bun | bald
  bottomStyle: 'pants', // pants | skirt | shorts
  height: 1.0, // scale multiplier
  build: 1.0, // width multiplier
};

export const HAIR_STYLES = ['short', 'long', 'spiky', 'bun', 'bob', 'bald'];
export const BOTTOM_STYLES = ['pants', 'shorts', 'skirt'];

function capsuleBetween(radius, length, axis, offset, material) {
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 4, 10);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.position.copy(offset);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * Build a chibi doll with a VRM-compatible skeleton (plain Object3D bones
 * that body parts are parented to). Returns {root, bones, slots, face}.
 */
export function buildDoll(preset = {}, localWet) {
  const p = { ...DOLL_DEFAULTS, ...preset };
  const mk = (color, rough = 0.8, extra = {}) => stdMat(color, { roughness: rough, porosity: 0.35, unique: true, local: localWet, snow: false, ...extra });
  const slots = {
    skin: mk(p.skin, 0.65),
    hair: mk(p.hair, 0.5),
    top: mk(p.top, 0.85),
    bottom: mk(p.bottom, 0.85),
    shoes: mk(p.shoes, 0.6),
    eyes: new THREE.MeshStandardMaterial({ color: p.eyes, roughness: 0.2 }),
  };
  const root = new THREE.Group();
  root.name = 'DollRoot';
  const bones = {};
  const w = p.build;
  const layout = {
    hips: [0, 0.62, 0], spine: [0, 0.07, 0], chest: [0, 0.1, 0], upperChest: [0, 0.08, 0], neck: [0, 0.1, 0], head: [0, 0.05, 0],
    leftShoulder: [0.03 * w, 0.06, 0], leftUpperArm: [0.08 * w, 0, 0], leftLowerArm: [0.17, 0, 0], leftHand: [0.16, 0, 0],
    rightShoulder: [-0.03 * w, 0.06, 0], rightUpperArm: [-0.08 * w, 0, 0], rightLowerArm: [-0.17, 0, 0], rightHand: [-0.16, 0, 0],
    leftUpperLeg: [0.075 * w, -0.04, 0], leftLowerLeg: [0, -0.27, 0], leftFoot: [0, -0.27, 0], leftToes: [0, -0.03, 0.07],
    rightUpperLeg: [-0.075 * w, -0.04, 0], rightLowerLeg: [0, -0.27, 0], rightFoot: [0, -0.27, 0], rightToes: [0, -0.03, 0.07],
  };
  for (const name of BONES) {
    const b = new THREE.Object3D();
    b.name = `doll_${name}`;
    b.position.fromArray(layout[name]);
    bones[name] = b;
    (BONE_PARENT[name] ? bones[BONE_PARENT[name]] : root).add(b);
  }

  // torso
  const torso = capsuleBetween(0.12 * w, 0.14, 'y', new THREE.Vector3(0, 0.1, 0), slots.top);
  torso.scale.set(1, 1, 0.8);
  bones.spine.add(torso);
  const pelvis = capsuleBetween(0.11 * w, 0.04, 'y', new THREE.Vector3(0, 0.0, 0), slots.bottom);
  pelvis.scale.set(1, 1, 0.8);
  bones.hips.add(pelvis);
  if (p.bottomStyle === 'skirt') {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * w, 0.2 * w, 0.2, 16, 1, true), slots.bottom);
    skirt.material.side = THREE.DoubleSide;
    skirt.position.y = -0.08;
    skirt.castShadow = true;
    bones.hips.add(skirt);
  }
  // neck + head
  bones.neck.add(capsuleBetween(0.04, 0.04, 'y', new THREE.Vector3(0, 0.03, 0), slots.skin));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), slots.skin);
  head.position.set(0, 0.17, 0);
  head.scale.set(1, 0.95, 0.95);
  head.castShadow = true;
  bones.head.add(head);

  // hair
  const hairGroup = new THREE.Group();
  hairGroup.position.copy(head.position);
  bones.head.add(hairGroup);
  if (p.hairStyle !== 'bald') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.212, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), slots.hair);
    cap.rotation.x = -0.25;
    cap.castShadow = true;
    hairGroup.add(cap);
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.205, 20, 8, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.18, Math.PI * 0.2), slots.hair);
    fringe.rotation.y = 0;
    hairGroup.add(fringe);
    if (p.hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 12), slots.hair);
      back.position.set(0, -0.12, -0.08);
      back.scale.set(1.1, 1, 0.55);
      back.castShadow = true;
      hairGroup.add(back);
    } else if (p.hairStyle === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), slots.hair);
        const a = (i / 7) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.1 - 0.03);
        s.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        hairGroup.add(s);
      }
    } else if (p.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), slots.hair);
      bun.position.set(0, 0.2, -0.1);
      hairGroup.add(bun);
    } else if (p.hairStyle === 'bob') {
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.225, 20, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35), slots.hair);
      bob.position.y = 0.0;
      bob.rotation.y = Math.PI;
      const shape = new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.235, 0.16, 20, 1, true, Math.PI * 0.75, Math.PI * 1.5), slots.hair);
      shape.material.side = THREE.DoubleSide;
      shape.position.y = -0.04;
      hairGroup.add(shape);
    }
  }

  // face
  const face = new THREE.Group();
  face.position.copy(head.position);
  bones.head.add(face);
  const eyeGeo = new THREE.SphereGeometry(0.028, 12, 10);
  const eyeL = new THREE.Mesh(eyeGeo, slots.eyes);
  const eyeR = new THREE.Mesh(eyeGeo, slots.eyes);
  eyeL.position.set(0.07, 0.01, 0.175);
  eyeR.position.set(-0.07, 0.01, 0.175);
  eyeL.scale.set(0.8, 1.2, 0.5);
  eyeR.scale.set(0.8, 1.2, 0.5);
  const browMat = slots.hair;
  const browGeo = new THREE.BoxGeometry(0.06, 0.012, 0.01);
  const browL = new THREE.Mesh(browGeo, browMat);
  const browR = new THREE.Mesh(browGeo, browMat);
  browL.position.set(0.07, 0.07, 0.178);
  browR.position.set(-0.07, 0.07, 0.178);
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7a2e2e, roughness: 0.4 });
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), mouthMat);
  mouth.position.set(0, -0.075, 0.18);
  mouth.scale.set(1.2, 0.35, 0.4);
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff7f8f, transparent: true, opacity: 0.0, depthWrite: false });
  const blushGeo = new THREE.CircleGeometry(0.025, 12);
  const blushL = new THREE.Mesh(blushGeo, blushMat);
  const blushR = new THREE.Mesh(blushGeo, blushMat);
  blushL.position.set(0.11, -0.04, 0.165);
  blushR.position.set(-0.11, -0.04, 0.165);
  blushL.rotation.y = 0.5;
  blushR.rotation.y = -0.5;
  face.add(eyeL, eyeR, browL, browR, mouth, blushL, blushR);

  // arms
  bones.leftUpperArm.add(capsuleBetween(0.042, 0.11, 'x', new THREE.Vector3(0.085, 0, 0), slots.top));
  bones.rightUpperArm.add(capsuleBetween(0.042, 0.11, 'x', new THREE.Vector3(-0.085, 0, 0), slots.top));
  bones.leftLowerArm.add(capsuleBetween(0.036, 0.1, 'x', new THREE.Vector3(0.08, 0, 0), slots.skin));
  bones.rightLowerArm.add(capsuleBetween(0.036, 0.1, 'x', new THREE.Vector3(-0.08, 0, 0), slots.skin));
  const handGeo = new THREE.SphereGeometry(0.045, 12, 10);
  const hl = new THREE.Mesh(handGeo, slots.skin); hl.position.set(0.03, 0, 0); hl.castShadow = true;
  const hr = new THREE.Mesh(handGeo, slots.skin); hr.position.set(-0.03, 0, 0); hr.castShadow = true;
  bones.leftHand.add(hl);
  bones.rightHand.add(hr);

  // legs
  const legMat = p.bottomStyle === 'pants' ? slots.bottom : slots.skin;
  bones.leftUpperLeg.add(capsuleBetween(0.055 * w, 0.17, 'y', new THREE.Vector3(0, -0.135, 0), p.bottomStyle === 'skirt' ? slots.skin : slots.bottom));
  bones.rightUpperLeg.add(capsuleBetween(0.055 * w, 0.17, 'y', new THREE.Vector3(0, -0.135, 0), p.bottomStyle === 'skirt' ? slots.skin : slots.bottom));
  bones.leftLowerLeg.add(capsuleBetween(0.045, 0.18, 'y', new THREE.Vector3(0, -0.135, 0), legMat));
  bones.rightLowerLeg.add(capsuleBetween(0.045, 0.18, 'y', new THREE.Vector3(0, -0.135, 0), legMat));
  const shoeGeo = new THREE.CapsuleGeometry(0.05, 0.08, 4, 10);
  shoeGeo.rotateX(Math.PI / 2);
  const sl = new THREE.Mesh(shoeGeo, slots.shoes); sl.position.set(0, -0.02, 0.03); sl.scale.set(1, 0.7, 1); sl.castShadow = true;
  const sr = new THREE.Mesh(shoeGeo, slots.shoes); sr.position.set(0, -0.02, 0.03); sr.scale.set(1, 0.7, 1); sr.castShadow = true;
  bones.leftFoot.add(sl);
  bones.rightFoot.add(sr);

  root.scale.setScalar(p.height);

  return {
    root,
    bones,
    slots,
    face: { eyeL, eyeR, browL, browR, mouth, blushMat },
    hipsHeight: 0.62 * p.height,
    height: 1.12 * p.height,
  };
}
