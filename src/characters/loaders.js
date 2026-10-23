// VRM / VRMA loading through three.js' GLTFLoader with the pixiv plugins.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Residents built from the same .vrm file share its decoded textures (one
// image in memory and one upload to the GPU instead of one per resident).
// Keyed by the file's ArrayBuffer; dropped once no avatar uses the file.
const sharedTex = new WeakMap(); // ArrayBuffer -> { tex: Map<index, Promise<Texture|null>>, users }

class SharedTexturePlugin {
  constructor(parser, entry) {
    this.parser = parser;
    this.entry = entry;
    this.name = 'FL_shared_textures';
  }

  loadTexture(index) {
    const def = this.parser.json.textures?.[index];
    if (!def || def.extensions) return null; // KTX2/WebP etc: let the loader handle it
    let p = this.entry.tex.get(index);
    if (!p) {
      p = this.parser.loadTexture(index);
      this.entry.tex.set(index, p);
    }
    // a clone shares the image (and the GPU texture) but has its own lifetime
    return p.then((t) => {
      if (!t) return null;
      const c = t.clone();
      this.parser.associations.set(c, { textures: index });
      return c;
    });
  }
}

function vrmLoaderFor(buffer) {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  if (buffer) {
    let entry = sharedTex.get(buffer);
    if (!entry) sharedTex.set(buffer, (entry = { tex: new Map(), users: 0 }));
    loader.register((parser) => new SharedTexturePlugin(parser, entry));
  }
  return loader;
}

/** One fewer avatar uses this file: forget its shared textures when nobody does. */
export function releaseVRMFile(buffer) {
  const e = buffer && sharedTex.get(buffer);
  if (!e) return;
  e.users = Math.max(0, e.users - 1);
  if (!e.users) {
    for (const p of e.tex.values()) p.then((t) => t?.dispose());
    sharedTex.delete(buffer);
  }
}
const vrmaLoader = new GLTFLoader();
vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function parse(loader, buffer) {
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

/** Parse a .vrm file. Returns the VRM object (gltf.userData.vrm). */
export async function parseVRM(buffer) {
  const loader = vrmLoaderFor(buffer);
  const entry = sharedTex.get(buffer);
  if (entry) entry.users++;
  let gltf;
  try {
    gltf = await parse(loader, buffer.slice(0));
  } catch (err) {
    releaseVRMFile(buffer);
    throw err;
  }
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
  if (!vrm) { releaseVRMFile(buffer); throw new Error('This file is not a VRM model (no VRM extension found).'); }
  vrm.userData = { ...(vrm.userData || {}), fileBuffer: buffer };
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
  releaseVRMFile(vrm.userData?.fileBuffer);
  if (vrm.userData) vrm.userData.fileBuffer = null;
}
