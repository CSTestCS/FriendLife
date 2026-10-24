// Export / import a resident as one file: their look, closet, personality,
// voice and words, with every model, texture and variant they use embedded
// (so it works on another computer). Life on the island (relationships, job,
// injuries, where they are) stays behind.
import { h, toast, pickFiles, download } from './dom.js';
import { newResidentData } from '../sim/resident.js';

const FORMAT = 'friendlife-character';
const DROP = ['relationships', 'prior', 'problem', 'job', 'pos', 'insideState', 'condoUnit', 'houseIndex', 'mishap', 'injuries', 'memories', 'outfitPurpose', 'manualUntil', 'soakedMinutes', 'wetness', 'swimWet', 'lastParty'];

function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Every {assetId, variantId} pair in an object tree. */
function variantRefs(o, out = []) {
  if (Array.isArray(o)) o.forEach((x) => variantRefs(x, out));
  else if (o && typeof o === 'object') {
    if (typeof o.assetId === 'string' && typeof o.variantId === 'string') out.push([o.assetId, o.variantId]);
    for (const v of Object.values(o)) variantRefs(v, out);
  }
  return out;
}

/** Every string in an object tree that is a library asset id. */
function assetRefs(o, lib, out = new Set()) {
  if (typeof o === 'string') { if (lib.get(o)) out.add(o); } else if (Array.isArray(o)) o.forEach((x) => assetRefs(x, lib, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => assetRefs(x, lib, out));
  return out;
}

/** Replace strings (asset / variant ids) throughout a tree. */
function remap(o, map) {
  if (typeof o === 'string') return map[o] ?? o;
  if (Array.isArray(o)) return o.map((x) => remap(x, map));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [map[k] ?? k, remap(v, map)]));
  return o;
}

export async function exportCharacter(app, res, save = download) {
  const lib = app.sim.library;
  const d = res.serialize();
  for (const k of DROP) delete d[k];
  const variants = [];
  for (const [assetId, variantId] of variantRefs(d)) {
    const v = lib.variant(assetId, variantId);
    if (v && !variants.some((x) => x.variantId === variantId)) variants.push({ assetId, variantId, look: v });
  }
  const ids = assetRefs([d, variants], lib);
  const assets = [];
  toast(`Packing ${res.name}…`);
  for (const id of ids) {
    const info = lib.get(id);
    try {
      const data = await lib.getData(id);
      assets.push({ id, name: lib.displayName(id), type: info.type, ext: info.ext, size: data.byteLength, data: toB64(data) });
    } catch (e) { console.warn('could not pack asset', id, e); }
  }
  const file = { format: FORMAT, version: 1, exportedAt: Date.now(), resident: d, variants, assets };
  save(`${res.name.replace(/[^\w-]+/g, '_')}.friendlife-character.json`, JSON.stringify(file));
  toast(`Exported ${res.name}${assets.length ? ` (with ${assets.length} model/texture file${assets.length > 1 ? 's' : ''})` : ''}.`);
}

export async function importCharacter(app) {
  const sim = app.sim;
  const lib = sim.library;
  const files = await pickFiles('.json', true);
  for (const f of files) {
    let file;
    try { file = JSON.parse(await f.text()); } catch (e) { toast(`${f.name}: not a character file`); continue; }
    if (file?.format !== FORMAT || !file.resident) { toast(`${f.name}: not a FriendLife character`); continue; }
    await importFile(app, file);
  }
  app.hud?.renderList?.();
}

/** Add the character in a parsed export file as a new resident. */
export async function importFile(app, file) {
  const sim = app.sim;
  const lib = sim.library;
  {
    const map = {};
    // models and textures: reuse an identical one already in the library
    for (const a of file.assets || []) {
      const same = lib.list(a.type).find((x) => (lib.displayName(x.id) === a.name || x.name === a.name) && x.size === a.size);
      if (same) { map[a.id] = same.id; continue; }
      const info = await lib.add({ name: a.name, type: a.type, data: fromB64(a.data), ext: a.ext });
      map[a.id] = info.id;
    }
    // variants
    for (const v of file.variants || []) {
      const assetId = map[v.assetId] || v.assetId;
      if (!lib.get(assetId)) continue;
      const nv = await lib.saveVariant(assetId, { ...remap(v.look, map), id: undefined });
      map[v.variantId] = nv.id;
    }
    const r = remap(file.resident, map);
    const base = newResidentData(r.name || 'Newcomer', r.gender);
    let name = r.name || base.name;
    if (sim.residents.some((x) => x.name === name)) name = `${name} 2`;
    const data = { ...base, ...r, id: base.id, name, relationships: {}, needs: base.needs, injuries: [], memories: [] };
    await sim.addResident(data);
    toast(`${name} moved in! 📥`);
  }
}
export const importForTest = importFile;

export { h };
