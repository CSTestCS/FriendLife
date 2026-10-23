// Static batching: merges the many small meshes a building / tree / bench is
// made of into one mesh per material. The island goes from ~700 meshes to a
// few dozen, which cuts draw calls (twice: shadow pass + main pass) and the
// per-mesh memory overhead. Materials stay shared, so night lights, weather
// and re-skinned surfaces still work on the merged meshes.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();

function mergeable(o) {
  return o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && !Array.isArray(o.material) && !o.userData.noBatch
    && o.geometry?.attributes?.position && !o.geometry.morphAttributes?.position
    && !Object.values(o.geometry.attributes).some((a) => a.isInterleavedBufferAttribute);
}

function visibleUpTo(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Merge the meshes under `root` (or only those under `parts`) into one mesh
 * per material, added to `into` (default root). Objects flagged
 * userData.noBatch (and everything under them) are left alone. Returns the
 * number of meshes removed.
 */
export function bakeStatic(root, { parts = null, into = root } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(into.matrixWorld).invert();
  const groups = new Map();
  const visit = (o) => {
    if (o.userData.noBatch) return;
    if (mergeable(o) && visibleUpTo(o, root)) {
      const g = o.geometry;
      const sig = [o.material.uuid, o.castShadow, o.receiveShadow, o.renderOrder, Object.keys(g.attributes).sort().join(',')].join('|');
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(o);
    }
    for (const c of o.children) visit(c);
  };
  for (const p of parts || [root]) visit(p);

  let removed = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((mesh) => {
      let g = mesh.geometry.clone();
      g.clearGroups();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      _m.multiplyMatrices(_inv, mesh.matrixWorld);
      g.applyMatrix4(_m);
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const src = meshes[0];
    const out = new THREE.Mesh(merged, src.material);
    out.name = `batch:${src.material.name || src.material.type}`;
    out.castShadow = src.castShadow;
    out.receiveShadow = src.receiveShadow;
    out.renderOrder = src.renderOrder;
    out.userData.batched = true;
    into.add(out);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      removed++;
    }
  }
  // drop groups left empty
  const prune = (o) => {
    for (const c of [...o.children]) prune(c);
    if (o !== root && o !== into && o.type === 'Group' && !o.children.length && !Object.keys(o.userData).length) o.removeFromParent();
  };
  for (const p of parts || [root]) if (p.parent || p === root) prune(p);
  return removed;
}
