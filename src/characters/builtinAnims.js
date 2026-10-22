// Built-in animation set, written in the same JSON format players can use
// for their own animations (see animation.js for the format).
//
// Axis cheat-sheet (VRM normalized space, character faces +Z, left = +X):
//   arms down:          leftUpperArm z=-74, rightUpperArm z=+74
//   arm swings forward: upperArm x negative (with arm down)
//   arm raised up:      leftUpperArm z positive, rightUpperArm z negative
//   elbow bend forward: leftLowerArm y negative, rightLowerArm y positive
//   leg forward:        upperLeg x negative,  knee bend: lowerLeg x positive
//   lean forward:       spine/chest x positive, head nod: head x positive
//   turn:               y,  tilt sideways: z

const ARMS_DOWN = { leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74], leftLowerArm: [0, -8, 0], rightLowerArm: [0, 8, 0] };
const GUARD = {
  leftUpperArm: [-55, 0, -62], rightUpperArm: [-55, 0, 62],
  leftLowerArm: [0, -125, 0], rightLowerArm: [0, 125, 0],
  leftUpperLeg: [-14, 0, 6], rightUpperLeg: [12, 0, -6],
  leftLowerLeg: [18, 0, 0], rightLowerLeg: [14, 0, 0],
  spine: [8, 12, 0], head: [6, -10, 0],
};
const LYING = {
  leftUpperArm: [0, 0, -30], rightUpperArm: [0, 0, 30], leftLowerArm: [0, -10, 0], rightLowerArm: [0, 10, 0],
  leftUpperLeg: [0, 0, 6], rightUpperLeg: [0, 0, -6], head: [-10, 0, 0],
};
const SIT = {
  leftUpperLeg: [-88, 0, 4], rightUpperLeg: [-88, 0, -4],
  leftLowerLeg: [86, 0, 0], rightLowerLeg: [86, 0, 0],
  leftUpperArm: [-28, 0, -74], rightUpperArm: [-28, 0, 74],
  leftLowerArm: [0, -38, 0], rightLowerArm: [0, 38, 0],
};
const mirrorX = (pose) => {
  // swap left/right and flip y/z rotation signs
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const nk = k.startsWith('left') ? `right${k.slice(4)}` : k.startsWith('right') ? `left${k.slice(5)}` : k;
    out[nk] = [v[0], -v[1], -v[2]];
  }
  return out;
};
const merge = (...ps) => Object.assign({}, ...ps);

function walkCycle(name, { dur = 1.0, leg = 26, knee = 38, arm = 22, lean = 4, bob = 0.025, elbow = 10, extra = {} } = {}) {
  const contactL = {
    leftUpperLeg: [-leg, 0, 0], rightUpperLeg: [leg * 0.8, 0, 0],
    leftLowerLeg: [6, 0, 0], rightLowerLeg: [knee * 0.6, 0, 0],
    leftUpperArm: [arm, 0, -74], rightUpperArm: [-arm, 0, 74],
    leftLowerArm: [0, -elbow, 0], rightLowerArm: [0, elbow + 10, 0],
    spine: [lean, -5, 0], chest: [0, -3, 0], head: [0, 4, 0],
    ...extra,
  };
  const passL = {
    leftUpperLeg: [-2, 0, 0], rightUpperLeg: [-14, 0, 0],
    leftLowerLeg: [4, 0, 0], rightLowerLeg: [knee, 0, 0],
    leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74],
    leftLowerArm: [0, -elbow, 0], rightLowerArm: [0, elbow, 0],
    spine: [lean, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
    ...extra,
  };
  return {
    name, duration: dur, loop: true,
    keys: [
      { t: 0, pose: contactL, hips: [0, -bob, 0] },
      { t: dur * 0.25, pose: passL, hips: [0, bob, 0] },
      { t: dur * 0.5, pose: mirrorX(contactL), hips: [0, -bob, 0] },
      { t: dur * 0.75, pose: mirrorX(passL), hips: [0, bob, 0] },
    ],
  };
}

export const BUILTIN_ANIMATIONS = [
  {
    name: 'idle', duration: 3.2, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, chest: [0, 0, 0], head: [0, 0, 0] } },
      { t: 1.6, pose: { leftUpperArm: [0, 0, -71], rightUpperArm: [0, 0, 71], chest: [-2.5, 0, 0], head: [-2, 3, 1] }, hips: [0, 0.006, 0] },
      { t: 3.2, pose: { ...ARMS_DOWN, chest: [0, 0, 0], head: [0, 0, 0] } },
    ],
  },
  {
    name: 'idleLook', duration: 4, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, head: [0, 0, 0] } },
      { t: 1, pose: { head: [0, 35, 0], neck: [0, 10, 0] } },
      { t: 2, pose: { head: [0, 35, 0], neck: [0, 10, 0] } },
      { t: 3, pose: { head: [0, -30, 0], neck: [0, -10, 0] } },
      { t: 4, pose: { head: [0, 0, 0], neck: [0, 0, 0] } },
    ],
  },
  walkCycle('walk'),
  walkCycle('walkSad', { dur: 1.3, leg: 16, knee: 25, arm: 6, lean: 10, bob: 0.012, extra: { head: [22, 0, 0], neck: [10, 0, 0] } }),
  walkCycle('walkHappy', { dur: 0.85, leg: 28, knee: 42, arm: 35, lean: 0, bob: 0.05, elbow: 40 }),
  walkCycle('run', { dur: 0.62, leg: 48, knee: 85, arm: 50, lean: 14, bob: 0.06, elbow: 95 }),
  {
    // injured leg: short painful step on the right
    name: 'limp', duration: 1.6, loop: true,
    keys: [
      { t: 0, pose: { leftUpperLeg: [-24, 0, 0], rightUpperLeg: [10, 0, 0], leftLowerLeg: [5, 0, 0], rightLowerLeg: [25, 0, 0], spine: [6, 0, -4], head: [8, 0, 0], ...ARMS_DOWN }, hips: [0, -0.02, 0] },
      { t: 0.55, pose: { leftUpperLeg: [0, 0, 0], rightUpperLeg: [-8, 0, 0], rightLowerLeg: [12, 0, 0], spine: [8, 0, 6], leftUpperArm: [0, 0, -62] }, hips: [0, -0.05, 0] },
      { t: 0.8, pose: { leftUpperLeg: [12, 0, 0], rightUpperLeg: [-14, 0, 0], leftLowerLeg: [30, 0, 0], rightLowerLeg: [8, 0, 0], spine: [10, 0, 8], head: [12, 0, -6] }, hips: [0, -0.07, 0] },
      { t: 1.3, pose: { leftUpperLeg: [-10, 0, 0], rightUpperLeg: [4, 0, 0], leftLowerLeg: [40, 0, 0], spine: [6, 0, 0], head: [8, 0, 0], leftUpperArm: [0, 0, -74] }, hips: [0, -0.01, 0] },
    ],
  },
  {
    name: 'talk', duration: 2.4, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, head: [0, 0, 0] } },
      { t: 0.5, pose: { rightUpperArm: [-30, 0, 62], rightLowerArm: [0, 70, 0], head: [6, 5, 3] } },
      { t: 1.0, pose: { rightUpperArm: [-38, 0, 58], rightLowerArm: [0, 80, -20], head: [-3, -4, 0] } },
      { t: 1.5, pose: { leftUpperArm: [-30, 0, -62], leftLowerArm: [0, -70, 0], rightUpperArm: [0, 0, 74], rightLowerArm: [0, 8, 0], head: [5, 0, -3] } },
      { t: 2.0, pose: { leftUpperArm: [0, 0, -74], leftLowerArm: [0, -8, 0], head: [0, 0, 0] } },
    ],
  },
  {
    name: 'listen', duration: 3, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, head: [0, 0, 6] } },
      { t: 0.8, pose: { head: [10, 0, 6] } },
      { t: 1.2, pose: { head: [0, 0, 6] } },
      { t: 1.6, pose: { head: [10, 0, 6] } },
      { t: 2.2, pose: { head: [2, 0, -4] } },
    ],
  },
  {
    name: 'wave', duration: 1.0, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [0, 0, -62], rightLowerArm: [0, 0, -40], head: [0, 0, -4] } },
      { t: 0.25, pose: { rightLowerArm: [0, 0, 5] } },
      { t: 0.5, pose: { rightLowerArm: [0, 0, -40] } },
      { t: 0.75, pose: { rightLowerArm: [0, 0, 5] } },
    ],
  },
  {
    name: 'laugh', duration: 0.8, loop: true,
    keys: [
      { t: 0, pose: { spine: [-10, 0, 0], head: [-14, 0, 0], leftUpperArm: [-25, 0, -70], rightUpperArm: [-25, 0, 70], leftLowerArm: [0, -60, 0], rightLowerArm: [0, 60, 0] } },
      { t: 0.2, pose: { spine: [-6, 0, 0], head: [-6, 0, 0] }, hips: [0, 0.01, 0] },
      { t: 0.4, pose: { spine: [-12, 0, 0], head: [-16, 0, 0] } },
      { t: 0.6, pose: { spine: [-6, 0, 0], head: [-6, 0, 0] }, hips: [0, 0.01, 0] },
    ],
  },
  {
    name: 'cheer', duration: 0.9, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [0, 0, 60], rightUpperArm: [0, 0, -60], leftLowerArm: [0, 0, 20], rightLowerArm: [0, 0, -20], leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 0], leftLowerLeg: [20, 0, 0], rightLowerLeg: [20, 0, 0], head: [-10, 0, 0] }, hips: [0, -0.04, 0] },
      { t: 0.35, pose: { leftUpperArm: [0, 0, 75], rightUpperArm: [0, 0, -75], leftLowerLeg: [0, 0, 0], rightLowerLeg: [0, 0, 0], head: [-15, 0, 0] }, hips: [0, 0.16, 0] },
      { t: 0.6, pose: { leftLowerLeg: [10, 0, 0], rightLowerLeg: [10, 0, 0] }, hips: [0, 0.0, 0] },
    ],
  },
  {
    name: 'dance', duration: 1.6, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [0, 0, 40], rightUpperArm: [0, 0, 74], leftLowerArm: [0, 0, 40], rightLowerArm: [0, 40, 0], spine: [0, 15, 8], head: [0, -10, -8], leftLowerLeg: [20, 0, 0], rightLowerLeg: [5, 0, 0], leftUpperLeg: [-10, 0, 4] }, hips: [0.03, -0.03, 0] },
      { t: 0.4, pose: { leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74], leftLowerArm: [0, -60, 0], rightLowerArm: [0, 60, 0], spine: [0, 0, 0], head: [0, 0, 0], leftLowerLeg: [5, 0, 0], rightLowerLeg: [5, 0, 0], leftUpperLeg: [0, 0, 0] }, hips: [0, 0.02, 0] },
      { t: 0.8, pose: { rightUpperArm: [0, 0, -40], leftUpperArm: [0, 0, -74], rightLowerArm: [0, 0, -40], leftLowerArm: [0, -40, 0], spine: [0, -15, -8], head: [0, 10, 8], rightLowerLeg: [20, 0, 0], leftLowerLeg: [5, 0, 0], rightUpperLeg: [-10, 0, -4] }, hips: [-0.03, -0.03, 0] },
      { t: 1.2, pose: { leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74], leftLowerArm: [0, -60, 0], rightLowerArm: [0, 60, 0], spine: [0, 0, 0], head: [0, 0, 0], rightLowerLeg: [5, 0, 0], rightUpperLeg: [0, 0, 0] }, hips: [0, 0.02, 0] },
    ],
  },
  {
    name: 'sit', duration: 4, loop: true,
    keys: [
      { t: 0, pose: { ...SIT, spine: [0, 0, 0], head: [0, 0, 0] }, hips: [0, -0.46, 0.05] },
      { t: 2, pose: { spine: [3, 0, 0], head: [4, 8, 0] }, hips: [0, -0.46, 0.05] },
      { t: 4, pose: { spine: [0, 0, 0], head: [0, 0, 0] }, hips: [0, -0.46, 0.05] },
    ],
  },
  {
    name: 'sitGround', duration: 4, loop: true,
    keys: [
      { t: 0, pose: { leftUpperLeg: [-80, 0, 10], rightUpperLeg: [-80, 0, -10], leftLowerLeg: [10, 0, 0], rightLowerLeg: [10, 0, 0], spine: [-12, 0, 0], leftUpperArm: [30, 0, -62], rightUpperArm: [30, 0, 62], head: [-5, 0, 0] }, hips: [0, -0.86, 0] },
      { t: 2, pose: { head: [-12, 10, 0], spine: [-14, 0, 0] }, hips: [0, -0.86, 0] },
      { t: 4, pose: { head: [-5, 0, 0], spine: [-12, 0, 0] }, hips: [0, -0.86, 0] },
    ],
  },
  {
    name: 'eat', duration: 1.4, loop: true,
    keys: [
      { t: 0, pose: { ...SIT, rightUpperArm: [-30, 0, 70], rightLowerArm: [0, 60, 0], leftUpperArm: [-35, 0, -70], leftLowerArm: [0, -70, 0], head: [10, 0, 0] }, hips: [0, -0.46, 0.05] },
      { t: 0.6, pose: { rightUpperArm: [-55, 0, 66], rightLowerArm: [0, 135, 0], head: [-4, 0, 0] }, hips: [0, -0.46, 0.05] },
      { t: 0.9, pose: { rightUpperArm: [-55, 0, 66], rightLowerArm: [0, 135, 0], head: [-2, 0, 0] }, hips: [0, -0.46, 0.05] },
    ],
  },
  {
    name: 'eatStand', duration: 1.4, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, rightUpperArm: [-30, 0, 70], rightLowerArm: [0, 60, 0], head: [8, 0, 0] } },
      { t: 0.6, pose: { rightUpperArm: [-55, 0, 66], rightLowerArm: [0, 135, 0], head: [-4, 0, 0] } },
      { t: 0.9, pose: { rightUpperArm: [-55, 0, 66], rightLowerArm: [0, 135, 0], head: [-2, 0, 0] } },
    ],
  },
  {
    name: 'cry', duration: 0.6, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [-62, 0, -55], rightUpperArm: [-62, 0, 55], leftLowerArm: [0, -135, 0], rightLowerArm: [0, 135, 0], head: [24, 0, 0], spine: [14, 0, 0], leftShoulder: [0, 0, 4], rightShoulder: [0, 0, -4] }, hips: [0, -0.02, 0] },
      { t: 0.3, pose: { head: [28, 0, 0], spine: [16, 0, 0], leftShoulder: [0, 0, 10], rightShoulder: [0, 0, -10] }, hips: [0, -0.03, 0] },
    ],
  },
  {
    name: 'sulk', duration: 3, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [-20, 0, -40], rightUpperArm: [-20, 0, 40], leftLowerArm: [0, -110, 0], rightLowerArm: [0, 110, 0], head: [18, -25, 0], spine: [6, 0, 0] } },
      { t: 1.5, pose: { head: [14, -32, 0] } },
    ],
  },
  {
    name: 'angry', duration: 1.0, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [10, 0, -48], rightUpperArm: [10, 0, 48], leftLowerArm: [0, 0, -95], rightLowerArm: [0, 0, 95], spine: [6, 0, 0], head: [10, 0, 0], leftUpperLeg: [0, 0, 0], leftLowerLeg: [0, 0, 0] } },
      { t: 0.25, pose: { leftUpperLeg: [-40, 0, 0], leftLowerLeg: [50, 0, 0], head: [14, 8, 0] }, hips: [0, 0.02, 0] },
      { t: 0.45, pose: { leftUpperLeg: [0, 0, 0], leftLowerLeg: [0, 0, 0], head: [10, 0, 0] }, hips: [0, -0.015, 0] },
      { t: 0.75, pose: { head: [12, -8, 0] } },
    ],
  },
  {
    name: 'argue', duration: 1.4, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [-80, 0, 70], rightLowerArm: [0, 20, 0], leftUpperArm: [10, 0, -48], leftLowerArm: [0, 0, -95], spine: [12, 10, 0], head: [6, -6, 0] } },
      { t: 0.35, pose: { rightUpperArm: [-95, 0, 72], rightLowerArm: [0, 35, 0], spine: [16, 12, 0] } },
      { t: 0.7, pose: { rightUpperArm: [-60, 0, 65], rightLowerArm: [0, 90, 0], spine: [8, 4, 0], head: [10, 0, 0] } },
      { t: 1.05, pose: { rightUpperArm: [-90, 0, 72], rightLowerArm: [0, 25, 0], spine: [15, 12, 0], head: [4, -6, 0] } },
    ],
  },
  {
    name: 'shocked', duration: 1.2, loop: false,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN } },
      { t: 0.15, pose: { leftUpperArm: [-40, 0, -30], rightUpperArm: [-40, 0, 30], leftLowerArm: [0, -100, 0], rightLowerArm: [0, 100, 0], spine: [-12, 0, 0], head: [-10, 0, 0] }, hips: [0, 0.08, -0.05] },
      { t: 0.4, pose: { spine: [-8, 0, 0] }, hips: [0, 0, -0.05] },
      { t: 1.2, pose: { leftUpperArm: [-30, 0, -40], rightUpperArm: [-30, 0, 40], spine: [-5, 0, 0], head: [-5, 0, 0] }, hips: [0, 0, -0.05] },
    ],
  },
  {
    name: 'think', duration: 3, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [-40, 0, 70], rightLowerArm: [0, 140, 0], leftUpperArm: [-30, 0, -60], leftLowerArm: [0, -95, 0], head: [-5, 0, 10] } },
      { t: 1.5, pose: { head: [-8, 10, 12] } },
    ],
  },
  {
    name: 'shy', duration: 2.4, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [25, 0, -66], rightUpperArm: [25, 0, 66], leftLowerArm: [0, 60, 0], rightLowerArm: [0, -60, 0], head: [20, -10, 8], spine: [0, -8, 0], leftUpperLeg: [0, 0, -4] } },
      { t: 1.2, pose: { head: [18, 10, -8], spine: [0, 8, 0], leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 4] } },
    ],
  },
  {
    name: 'hug', duration: 2, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [-70, 0, -25], rightUpperArm: [-70, 0, 25], leftLowerArm: [0, -75, 0], rightLowerArm: [0, 75, 0], spine: [8, 0, 0], head: [6, 15, 0] } },
      { t: 1, pose: { spine: [10, 0, 3], head: [8, 18, 4] } },
    ],
  },
  {
    name: 'guard', duration: 0.7, loop: true,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.35, pose: { ...GUARD, spine: [10, 14, 0] }, hips: [0, -0.03, 0] },
    ],
  },
  {
    name: 'punch', duration: 0.5, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.1, pose: { ...GUARD, rightUpperArm: [-45, 0, 70], rightLowerArm: [0, 135, 0], spine: [8, -10, 0] }, hips: [0, -0.06, -0.02] },
      { t: 0.2, pose: { ...GUARD, rightUpperArm: [-92, 0, 86], rightLowerArm: [0, 5, 0], spine: [12, 30, 0], head: [6, -20, 0] }, hips: [0, -0.07, 0.08] },
      { t: 0.32, pose: { ...GUARD, rightUpperArm: [-90, 0, 86], rightLowerArm: [0, 8, 0], spine: [12, 28, 0] }, hips: [0, -0.07, 0.08] },
      { t: 0.5, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'jab', duration: 0.4, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.12, pose: { ...GUARD, leftUpperArm: [-92, 0, -86], leftLowerArm: [0, -5, 0], spine: [10, -10, 0] }, hips: [0, -0.06, 0.05] },
      { t: 0.22, pose: { ...GUARD, leftUpperArm: [-90, 0, -86], leftLowerArm: [0, -8, 0], spine: [10, -8, 0] }, hips: [0, -0.06, 0.05] },
      { t: 0.4, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'kick', duration: 0.7, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.15, pose: { ...GUARD, rightUpperLeg: [-60, 0, 0], rightLowerLeg: [100, 0, 0], spine: [-6, 0, 0] }, hips: [0, -0.02, 0] },
      { t: 0.3, pose: { ...GUARD, rightUpperLeg: [-88, 0, 0], rightLowerLeg: [5, 0, 0], leftLowerLeg: [10, 0, 0], spine: [-16, 0, 0] }, hips: [0, -0.01, -0.04] },
      { t: 0.42, pose: { ...GUARD, rightUpperLeg: [-85, 0, 0], rightLowerLeg: [10, 0, 0], spine: [-14, 0, 0] }, hips: [0, -0.01, -0.04] },
      { t: 0.7, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'shove', duration: 0.6, loop: false,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN } },
      { t: 0.15, pose: { leftUpperArm: [-60, 0, -70], rightUpperArm: [-60, 0, 70], leftLowerArm: [0, -110, 0], rightLowerArm: [0, 110, 0], spine: [0, 0, 0] } },
      { t: 0.28, pose: { leftUpperArm: [-90, 0, -80], rightUpperArm: [-90, 0, 80], leftLowerArm: [0, -10, 0], rightLowerArm: [0, 10, 0], spine: [16, 0, 0] }, hips: [0, -0.03, 0.08] },
      { t: 0.6, pose: { ...ARMS_DOWN, spine: [0, 0, 0] } },
    ],
  },
  {
    name: 'tackle', duration: 0.8, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.2, pose: { leftUpperArm: [-80, 0, -50], rightUpperArm: [-80, 0, 50], leftLowerArm: [0, -40, 0], rightLowerArm: [0, 40, 0], spine: [40, 0, 0], head: [-20, 0, 0], leftUpperLeg: [-30, 0, 0], rightUpperLeg: [30, 0, 0], leftLowerLeg: [40, 0, 0] }, hips: [0, -0.2, 0.2] },
      { t: 0.45, pose: { spine: [45, 0, 0], leftUpperLeg: [10, 0, 0], rightUpperLeg: [-40, 0, 0] }, hips: [0, -0.22, 0.35] },
      { t: 0.8, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'dodge', duration: 0.5, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.15, pose: { ...GUARD, spine: [10, 0, 25], head: [0, 0, 15], leftLowerLeg: [35, 0, 0], rightLowerLeg: [35, 0, 0] }, hips: [0.14, -0.15, 0] },
      { t: 0.5, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'block', duration: 0.45, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.1, pose: { ...GUARD, leftUpperArm: [-80, 0, -40], rightUpperArm: [-80, 0, 40], leftLowerArm: [0, -150, 0], rightLowerArm: [0, 150, 0], spine: [-6, 0, 0], head: [12, 0, 0] }, hips: [0, -0.08, -0.04] },
      { t: 0.45, pose: GUARD, hips: [0, -0.06, 0] },
    ],
  },
  {
    name: 'hurt', duration: 0.55, loop: false,
    keys: [
      { t: 0, pose: GUARD, hips: [0, -0.06, 0] },
      { t: 0.08, pose: { leftUpperArm: [10, 0, -40], rightUpperArm: [10, 0, 40], leftLowerArm: [0, -40, 0], rightLowerArm: [0, 40, 0], spine: [-22, -10, 0], head: [-25, 15, 0] }, hips: [0, -0.04, -0.1] },
      { t: 0.3, pose: { spine: [-8, 0, 0], head: [-6, 5, 0] }, hips: [0, -0.06, -0.08] },
      { t: 0.55, pose: GUARD, hips: [0, -0.06, -0.04] },
    ],
  },
  {
    name: 'knockdown', duration: 1.1, loop: false, base: 'none',
    keys: [
      { t: 0, pose: { ...GUARD, hips: [0, 0, 0] }, hips: [0, -0.06, 0] },
      { t: 0.25, pose: { hips: [-30, 0, 0], spine: [-15, 0, 0], head: [-25, 0, 0], leftUpperArm: [20, 0, 10], rightUpperArm: [20, 0, -10], leftUpperLeg: [-30, 0, 0], rightUpperLeg: [-10, 0, 0], leftLowerLeg: [30, 0, 0] }, hips: [0, -0.35, -0.2] },
      { t: 0.55, pose: { hips: [-80, 0, 0], spine: [-5, 0, 0], head: [10, 0, 0], ...LYING, leftUpperLeg: [-25, 0, 6], rightUpperLeg: [-5, 0, -6] }, hips: [0, -0.8, -0.45] },
      { t: 0.75, pose: { hips: [-90, 0, 0], spine: [0, 0, 0], head: [-15, 0, 0] }, hips: [0, -0.78, -0.5] },
      { t: 1.1, pose: { hips: [-90, 0, 0], ...LYING, leftUpperLeg: [0, 0, 6], rightUpperLeg: [0, 0, -6], spine: [0, 0, 0] }, hips: [0, -0.82, -0.5] },
    ],
  },
  {
    name: 'lieDown', duration: 3, loop: true, base: 'none',
    keys: [
      { t: 0, pose: { hips: [-90, 0, 0], ...LYING, chest: [0, 0, 0] }, hips: [0, -0.82, -0.5] },
      { t: 1.5, pose: { hips: [-90, 0, 0], chest: [-3, 0, 0], head: [-12, 6, 0] }, hips: [0, -0.82, -0.5] },
      { t: 3, pose: { hips: [-90, 0, 0], chest: [0, 0, 0], head: [-10, 0, 0] }, hips: [0, -0.82, -0.5] },
    ],
  },
  {
    name: 'getUp', duration: 1.4, loop: false, base: 'none',
    keys: [
      { t: 0, pose: { hips: [-90, 0, 0], ...LYING }, hips: [0, -0.82, -0.5] },
      { t: 0.4, pose: { hips: [-45, 0, 0], spine: [30, 0, 0], head: [10, 0, 0], leftUpperArm: [30, 0, -60], rightUpperArm: [30, 0, 60], leftUpperLeg: [-50, 0, 6], rightUpperLeg: [-70, 0, -6], leftLowerLeg: [60, 0, 0], rightLowerLeg: [100, 0, 0] }, hips: [0, -0.75, -0.3] },
      { t: 0.85, pose: { hips: [0, 0, 0], spine: [35, 0, 0], head: [-10, 0, 0], leftUpperArm: [-30, 0, -70], rightUpperArm: [-30, 0, 70], leftUpperLeg: [-90, 0, 6], rightUpperLeg: [-90, 0, -6], leftLowerLeg: [130, 0, 0], rightLowerLeg: [130, 0, 0] }, hips: [0, -0.55, -0.1] },
      { t: 1.4, pose: { hips: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], ...ARMS_DOWN, leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 0], leftLowerLeg: [0, 0, 0], rightLowerLeg: [0, 0, 0] }, hips: [0, 0, 0] },
    ],
  },
  {
    name: 'dizzy', duration: 2, loop: true,
    keys: [
      { t: 0, pose: { ...ARMS_DOWN, leftUpperArm: [0, 0, -55], rightUpperArm: [0, 0, 55], spine: [0, 0, 8], head: [5, 0, 12] }, hips: [0.03, -0.02, 0] },
      { t: 0.5, pose: { spine: [8, 0, 0], head: [12, 0, 0] }, hips: [0, -0.02, 0.03] },
      { t: 1.0, pose: { spine: [0, 0, -8], head: [5, 0, -12] }, hips: [-0.03, -0.02, 0] },
      { t: 1.5, pose: { spine: [-6, 0, 0], head: [-6, 0, 0] }, hips: [0, -0.02, -0.03] },
    ],
  },
  {
    name: 'victory', duration: 1.2, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [0, 0, -70], rightLowerArm: [0, 0, -60], leftUpperArm: [10, 0, -48], leftLowerArm: [0, 0, -95], head: [-12, 0, 0], spine: [-6, 0, 0] } },
      { t: 0.6, pose: { rightUpperArm: [0, 0, -80], rightLowerArm: [0, 0, -30], head: [-18, 0, 0] }, hips: [0, 0.03, 0] },
    ],
  },
  {
    name: 'taunt', duration: 1.2, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [-75, 0, 72], rightLowerArm: [0, 20, 0], leftUpperArm: [10, 0, -48], leftLowerArm: [0, 0, -95], head: [-10, 0, 0] } },
      { t: 0.3, pose: { rightLowerArm: [0, 20, -50] } },
      { t: 0.6, pose: { rightLowerArm: [0, 20, 0] } },
      { t: 0.9, pose: { rightLowerArm: [0, 20, -50] } },
    ],
  },
  {
    name: 'exercise', duration: 1.0, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74], leftUpperLeg: [0, 0, 0], rightUpperLeg: [0, 0, 0] } },
      { t: 0.5, pose: { leftUpperArm: [0, 0, 70], rightUpperArm: [0, 0, -70], leftUpperLeg: [0, 0, 14], rightUpperLeg: [0, 0, -14] }, hips: [0, 0.06, 0] },
    ],
  },
  {
    name: 'shiver', duration: 0.25, loop: true,
    keys: [
      { t: 0, pose: { leftUpperArm: [-60, 0, -40], rightUpperArm: [-60, 0, 40], leftLowerArm: [0, -140, 0], rightLowerArm: [0, 140, 0], spine: [10, 2, 0], head: [10, 0, 0] } },
      { t: 0.12, pose: { spine: [10, -2, 0], head: [10, 0, 2] } },
    ],
  },
  {
    name: 'sleep', duration: 4, loop: true, base: 'none',
    keys: [
      { t: 0, pose: { hips: [-90, 0, 0], ...LYING, leftUpperArm: [0, 0, -70], rightUpperArm: [0, 0, 70], head: [-5, 20, 0] }, hips: [0, -0.82, -0.5] },
      { t: 2, pose: { hips: [-90, 0, 0], chest: [-4, 0, 0], head: [-5, 20, 0] }, hips: [0, -0.82, -0.5] },
    ],
  },
  {
    name: 'point', duration: 2, loop: true,
    keys: [
      { t: 0, pose: { rightUpperArm: [-85, 0, 76], rightLowerArm: [0, 5, 0], head: [0, -5, 0] } },
      { t: 1, pose: { rightUpperArm: [-88, 0, 76], head: [2, -5, 0] } },
    ],
  },
];

// Pose modifiers (partial poses layered over whatever is playing)
export const MOD_POSES = {
  umbrella: { rightUpperArm: [-38, 0, 64], rightLowerArm: [0, 95, -10] },
  sling: { leftUpperArm: [-12, 0, -70], leftLowerArm: [0, -105, 0], leftHand: [0, 0, 0] },
  carry: { leftUpperArm: [-30, 0, -70], leftLowerArm: [0, -95, 0], rightUpperArm: [-30, 0, 70], rightLowerArm: [0, 95, 0] },
};

export const ACTION_LIST = BUILTIN_ANIMATIONS.map((a) => a.name);
