// Mixamo (.fbx) animation support.
//
// Mixamo rigs use bones named "mixamorig:Hips", "mixamorig:LeftArm", …
// with their own rest orientations. We convert every rotation into the
// VRM 1.0 normalized space (rest = T-pose, identity rotations) using the
// same approach as pixiv's three-vrm Mixamo example:
//   q_vrm = parentRestWorld * q_local * inverse(restWorld)
// The result is a TrackClip that plays on VRM avatars and built-in dolls.

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { BONES } from './rig.js';

export const MIXAMO_TO_VRM = {
  Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head',
  LeftShoulder: 'leftShoulder', LeftArm: 'leftUpperArm', LeftForeArm: 'leftLowerArm', LeftHand: 'leftHand',
  RightShoulder: 'rightShoulder', RightArm: 'rightUpperArm', RightForeArm: 'rightLowerArm', RightHand: 'rightHand',
  LeftUpLeg: 'leftUpperLeg', LeftLeg: 'leftLowerLeg', LeftFoot: 'leftFoot', LeftToeBase: 'leftToes',
  RightUpLeg: 'rightUpperLeg', RightLeg: 'rightLowerLeg', RightFoot: 'rightFoot', RightToeBase: 'rightToes',
};

/** "mixamorig:LeftArm" / "mixamorig1LeftArm" / "Character1_LeftArm" → "LeftArm" */
export function mixamoBaseName(name) {
  return String(name).replace(/^.*mixamorig\d*[:_]?/i, '').replace(/^.*[:|]/, '');
}

/**
 * Plays retargeted tracks. Same sample() interface as KeyframeClip/VrmaClip.
 * rotations: Map(vrmBone -> QuaternionKeyframeTrack in VRM1 normalized space)
 * hips: VectorKeyframeTrack of hips offset in hip-heights (or null)
 */
export class TrackClip {
  constructor(name, duration, rotations, hips, loop = true) {
    this.name = name;
    this.duration = Math.max(0.05, duration);
    this.loop = loop;
    this.interps = {};
    for (const [bone, track] of rotations) this.interps[bone] = track.createInterpolant();
    this.hipsInterp = hips ? hips.createInterpolant() : null;
  }

  sample(time, pose) {
    const t = this.loop ? ((time % this.duration) + this.duration) % this.duration : Math.min(time, this.duration);
    for (const b of BONES) {
      const it = this.interps[b];
      if (!it) { pose.rot[b].identity(); continue; }
      const v = it.evaluate(t);
      pose.rot[b].set(v[0], v[1], v[2], v[3]).normalize();
    }
    if (this.hipsInterp) {
      const v = this.hipsInterp.evaluate(t);
      pose.hips.set(0, v[1], 0); // keep root motion in place; the sim moves characters
    } else pose.hips.set(0, 0, 0);
    return pose;
  }
}

const _qa = new THREE.Quaternion();
const _restInv = new THREE.Quaternion();
const _parentRest = new THREE.Quaternion();

/**
 * Convert a loaded Mixamo/FBX scene (with .animations) into a TrackClip.
 * Exported separately from parsing so it can be tested without a file.
 */
export function retargetMixamo(asset, name = 'mixamo') {
  const clip = asset.animations?.find((c) => c.name === 'mixamo.com') || asset.animations?.[0];
  if (!clip) throw new Error('This FBX has no animation in it.');
  asset.updateMatrixWorld(true);
  const nodes = new Map(); // baseName -> object
  asset.traverse((o) => {
    const base = mixamoBaseName(o.name);
    if (MIXAMO_TO_VRM[base] && !nodes.has(base)) nodes.set(base, o);
  });
  if (!nodes.has('Hips')) throw new Error('No Mixamo skeleton found (expected bones like "mixamorig:Hips").');
  const hipsNode = nodes.get('Hips');
  const restHips = hipsNode.position.clone();
  const hipsHeight = Math.max(1e-4, Math.abs(restHips.y));

  const rotations = new Map();
  let hipsTrack = null;
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const nodeName = track.name.slice(0, dot);
    const prop = track.name.slice(dot + 1);
    const base = mixamoBaseName(nodeName);
    const vrmBone = MIXAMO_TO_VRM[base];
    const node = nodes.get(base);
    if (!vrmBone || !node) continue;
    if (prop === 'quaternion') {
      node.getWorldQuaternion(_restInv).invert();
      if (node.parent) node.parent.getWorldQuaternion(_parentRest); else _parentRest.identity();
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        _qa.fromArray(track.values, i);
        _qa.premultiply(_parentRest).multiply(_restInv);
        _qa.toArray(values, i);
      }
      rotations.set(vrmBone, new THREE.QuaternionKeyframeTrack(`${vrmBone}.quaternion`, track.times, values));
    } else if (prop === 'position' && vrmBone === 'hips') {
      // hips offset in hip-heights, measured in the parent's space
      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 3) {
        values[i] = (track.values[i] - restHips.x) / hipsHeight;
        values[i + 1] = (track.values[i + 1] - restHips.y) / hipsHeight;
        values[i + 2] = (track.values[i + 2] - restHips.z) / hipsHeight;
      }
      hipsTrack = new THREE.VectorKeyframeTrack('hips.position', track.times, values);
    }
  }
  if (!rotations.size) throw new Error('Could not match any Mixamo bones in this FBX.');
  return new TrackClip(name, clip.duration, rotations, hipsTrack, true);
}

export async function parseMixamoFBX(buffer, name) {
  const loader = new FBXLoader();
  const asset = loader.parse(buffer, '');
  const clip = retargetMixamo(asset, name);
  // free GPU-side data the loader created (we only needed the animation)
  asset.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m?.map?.dispose(); m?.dispose?.(); }
    }
  });
  return clip;
}
