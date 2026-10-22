// VRM / VRMA loading through three.js' GLTFLoader with the pixiv plugins.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));
const vrmaLoader = new GLTFLoader();
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function parse(loader, buffer) {
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

/** Parse a .vrm file. Returns the VRM object (gltf.userData.vrm). */
export async function parseVRM(buffer) {
  const gltf = await parse(vrmLoader, buffer.slice(0));
  // MToon outlines are added as an extra geometry group, which only works on
  // indexed geometry. Some exporters write non-indexed meshes; index them.
  gltf.scene.traverse((o) => {
    if (o.isMesh && !o.geometry.index && Array.isArray(o.material) && o.material.length > 1) {
      const groups = o.geometry.groups.map((g) => ({ ...g }));
      const indexed = mergeVertices(o.geometry);
      const count = indexed.index.count;
      indexed.clearGroups();
      for (const g of groups) indexed.addGroup(0, count, g.materialIndex);
      o.geometry = indexed;
    }
  });
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('This file is not a VRM model (no VRM extension found).');
  try { VRMUtils.removeUnnecessaryVertices(gltf.scene); } catch (e) { /* optional optimisation */ }
  if (!globalThis.__flNoCombine) { try { VRMUtils.combineSkeletons?.(gltf.scene); } catch (e) { /* optional optimisation */ } }
  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
  vrm.scene.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return vrm;
}

export async function parseVRMA(buffer) {
  const gltf = await parse(vrmaLoader, buffer.slice(0));
  const anims = gltf.userData.vrmAnimations;
  if (!anims || !anims.length) throw new Error('This file has no VRM animation in it.');
  return anims[0];
}

export function disposeVRM(vrm) {
  try { VRMUtils.deepDispose(vrm.scene); } catch (e) { /* ignore */ }
}
