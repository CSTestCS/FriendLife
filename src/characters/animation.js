// Animation system.
//
// Two clip types share one interface (sample(t, pose)):
//  * KeyframeClip – FriendLife's own JSON format (easy to hand-write or make
//    in the in-game Animation Studio). Rotations are Euler degrees relative
//    to the T-pose in VRM 1.0 normalized space.
//  * VrmaClip – standard VRM Animation (.vrma) files, e.g. exported from
//    VRoid Hub / Blender VRM add-on / other tools.
//
// JSON format:
// {
//   "name": "wave", "duration": 1.2, "loop": true,
//   "base": "stand",                       // optional: fill missing bones from the standing pose ("none" = T-pose)
//   "keys": [
//     { "t": 0,   "pose": { "rightUpperArm": [0, 0, -60], "rightLowerArm": [0, 0, -20] }, "hips": [0, 0, 0] },
//     { "t": 0.6, "pose": { "rightLowerArm": [0, 0, 20] } }
//   ]
// }
// "hips" is a position offset measured in hip-heights (so it scales to any avatar).

import * as THREE from 'three';
import { BONES } from './rig.js';
import { DEG, smooth } from '../core/util.js';

const _e = new THREE.Euler();
export function eulerDegToQuat(arr, out = new THREE.Quaternion()) {
  _e.set((arr[0] || 0) * DEG, (arr[1] || 0) * DEG, (arr[2] || 0) * DEG, 'XYZ');
  return out.setFromEuler(_e);
}

export function makePose() {
  const rot = {};
  for (const b of BONES) rot[b] = new THREE.Quaternion();
  return { rot, hips: new THREE.Vector3() };
}

export function copyPose(dst, src) {
  for (const b of BONES) dst.rot[b].copy(src.rot[b]);
  dst.hips.copy(src.hips);
  return dst;
}

/** The relaxed standing pose (arms down) used as a base by most clips. */
export const STAND_POSE = {
  leftUpperArm: [0, 0, -74],
  rightUpperArm: [0, 0, 74],
  leftLowerArm: [0, -8, 0],
  rightLowerArm: [0, 8, 0],
  leftShoulder: [0, 0, 0],
  rightShoulder: [0, 0, 0],
};
const STAND_Q = {};
for (const [k, v] of Object.entries(STAND_POSE)) STAND_Q[k] = eulerDegToQuat(v);

export class KeyframeClip {
  constructor(def) {
    this.def = def;
    this.name = def.name || 'custom';
    this.duration = Math.max(0.05, def.duration || 1);
    this.loop = def.loop !== false;
    this.base = def.base || 'stand';
    this.ease = def.ease || 'smooth';
    this.tracks = {};
    this.hipsTrack = [];
    const keys = def.keys ? [...def.keys] : [];
    // Also accept per-bone "tracks": { bone: [[t,[x,y,z]], ...] }
    if (def.tracks) {
      for (const [bone, arr] of Object.entries(def.tracks)) {
        if (bone === 'hips_position' || bone === 'hipsPosition') {
          this.hipsTrack = arr.map(([t, v]) => ({ t, v: new THREE.Vector3().fromArray(v) }));
          continue;
        }
        this.tracks[bone] = arr.map(([t, v]) => ({ t, q: eulerDegToQuat(v) }));
      }
    }
    keys.sort((a, b) => a.t - b.t);
    for (const k of keys) {
      if (k.pose) {
        for (const [bone, v] of Object.entries(k.pose)) {
          (this.tracks[bone] ||= []).push({ t: k.t, q: eulerDegToQuat(v) });
        }
      }
      if (k.hips) this.hipsTrack.push({ t: k.t, v: new THREE.Vector3().fromArray(k.hips) });
    }
    for (const arr of Object.values(this.tracks)) arr.sort((a, b) => a.t - b.t);
    this.hipsTrack.sort((a, b) => a.t - b.t);
  }

  _find(track, t) {
    // returns [i0, i1, alpha]
    const n = track.length;
    if (n === 1 || t <= track[0].t) {
      if (this.loop && n > 1 && t < track[0].t) {
        // wrap from last key to first key
        const last = track[n - 1];
        const span = this.duration - last.t + track[0].t;
        const a = span > 0 ? (t + this.duration - last.t) / span : 0;
        return [n - 1, 0, a];
      }
      return [0, 0, 0];
    }
    for (let i = 0; i < n - 1; i++) {
      if (t < track[i + 1].t) {
        const span = track[i + 1].t - track[i].t;
        return [i, i + 1, span > 0 ? (t - track[i].t) / span : 0];
      }
    }
    if (this.loop) {
      const last = track[n - 1];
      const span = this.duration - last.t + track[0].t;
      const a = span > 0 ? (t - last.t) / span : 0;
      return [n - 1, 0, Math.min(1, a)];
    }
    return [n - 1, n - 1, 0];
  }

  sample(time, pose) {
    const t = this.loop ? ((time % this.duration) + this.duration) % this.duration : Math.min(time, this.duration);
    for (const b of BONES) {
      const track = this.tracks[b];
      if (!track || track.length === 0) {
        if (this.base === 'stand' && STAND_Q[b]) pose.rot[b].copy(STAND_Q[b]);
        else pose.rot[b].identity();
        continue;
      }
      const [i0, i1, a] = this._find(track, t);
      const alpha = this.ease === 'linear' ? a : smooth(a);
      pose.rot[b].copy(track[i0].q).slerp(track[i1].q, alpha);
    }
    if (this.hipsTrack.length) {
      const [i0, i1, a] = this._find(this.hipsTrack, t);
      const alpha = this.ease === 'linear' ? a : smooth(a);
      pose.hips.copy(this.hipsTrack[i0].v).lerp(this.hipsTrack[i1].v, alpha);
    } else pose.hips.set(0, 0, 0);
    return pose;
  }
}

/** Wraps a VRMAnimation (from @pixiv/three-vrm-animation). */
export class VrmaClip {
  constructor(name, vrmAnimation, loop = true) {
    this.name = name;
    this.duration = Math.max(0.05, vrmAnimation.duration);
    this.loop = loop;
    this.interps = {};
    for (const [bone, track] of vrmAnimation.humanoidTracks.rotation.entries()) {
      this.interps[bone] = track.createInterpolant();
    }
    const tr = vrmAnimation.humanoidTracks.translation.get('hips');
    this.hipsInterp = tr ? tr.createInterpolant() : null;
    this.rest = vrmAnimation.restHipsPosition.clone();
    this.restY = Math.max(0.01, this.rest.y);
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
      pose.hips.set((v[0] - this.rest.x) / this.restY, (v[1] - this.rest.y) / this.restY, (v[2] - this.rest.z) / this.restY);
      // Keep root motion in place: the simulation moves characters itself.
      pose.hips.x = 0;
      pose.hips.z = 0;
    } else pose.hips.set(0, 0, 0);
    return pose;
  }
}

/**
 * Plays clips on one avatar with cross-fading, plus "modifiers" that
 * override specific bones on top of whatever is playing (e.g. holding an
 * umbrella, arm in a sling).
 */
export class AnimationPlayer {
  constructor(registry) {
    this.registry = registry;
    this.clip = null;
    this.action = null;
    this.time = 0;
    this.speed = 1;
    this.fade = 0;
    this.fadeDur = 0;
    this.pose = makePose();
    this.fromPose = makePose();
    this.tmpPose = makePose();
    this.modifiers = new Map();
    this.finished = false;
    this.onEnd = null;
    this.hold = false;
  }

  /** Play a named action (resolved through the registry, so imported animations can override built-ins). */
  play(action, opts = {}) {
    const clip = typeof action === 'string' ? this.registry.resolve(action) : action;
    if (!clip) return;
    if (this.clip === clip && !opts.restart) {
      this.speed = opts.speed ?? this.speed;
      return;
    }
    copyPose(this.fromPose, this.pose);
    this.fadeDur = opts.fade ?? 0.22;
    this.fade = this.clip ? 0 : this.fadeDur; // no fade on first clip
    this.clip = clip;
    this.action = typeof action === 'string' ? action : clip.name;
    this.time = opts.offset ?? 0;
    this.speed = opts.speed ?? 1;
    this.loopOverride = opts.loop;
    this.finished = false;
    this.onEnd = opts.onEnd || null;
  }

  isLooping() {
    return this.loopOverride ?? this.clip?.loop;
  }

  update(dt) {
    if (!this.clip) return this.pose;
    this.time += dt * this.speed;
    const loop = this.isLooping();
    let t = this.time;
    if (!loop && this.time >= this.clip.duration) {
      t = this.clip.duration - 1e-4;
      if (!this.finished) {
        this.finished = true;
        const cb = this.onEnd;
        this.onEnd = null;
        if (cb) cb();
      }
    }
    const prevLoop = this.clip.loop;
    this.clip.loop = loop;
    this.clip.sample(t, this.tmpPose);
    this.clip.loop = prevLoop;
    if (this.fade < this.fadeDur) {
      this.fade += dt;
      const a = smooth(Math.min(1, this.fade / this.fadeDur));
      for (const b of BONES) this.pose.rot[b].copy(this.fromPose.rot[b]).slerp(this.tmpPose.rot[b], a);
      this.pose.hips.copy(this.fromPose.hips).lerp(this.tmpPose.hips, a);
    } else copyPose(this.pose, this.tmpPose);
    for (const mod of this.modifiers.values()) mod(this.pose, dt);
    return this.pose;
  }

  setModifier(name, fn) {
    if (fn) this.modifiers.set(name, fn); else this.modifiers.delete(name);
  }
}

/** Helper for modifiers: blend selected bones toward fixed Euler targets. */
export function boneOverride(targets, weight = 1) {
  const qs = Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, eulerDegToQuat(v)]));
  return (pose) => {
    for (const [k, q] of Object.entries(qs)) pose.rot[k].slerp(q, weight);
  };
}
