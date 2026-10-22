// Asset library: everything the player imports (VRM characters, VRM outfits,
// textures, animations). Imported files are stored in IndexedDB so they
// survive restarts. When running as the desktop app, files dropped into the
// "mods" folder next to the .exe are also picked up on start.

import { Emitter, uid, fileExt, baseName } from './util.js';

const DB_NAME = 'friendlife';
const DB_VERSION = 1;

export const ASSET_TYPES = {
  character: { label: 'Characters', exts: ['vrm'], folder: 'characters' },
  outfit: { label: 'Outfits & Parts', exts: ['vrm'], folder: 'outfits' },
  texture: { label: 'Textures', exts: ['png', 'jpg', 'jpeg', 'webp'], folder: 'textures' },
  animation: { label: 'Animations', exts: ['vrma', 'json'], folder: 'animations' },
};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function guessType(fileName) {
  const ext = fileExt(fileName);
  if (ext === 'vrma' || ext === 'json') return 'animation';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'texture';
  if (ext === 'vrm') return 'character';
  return null;
}

export class Library extends Emitter {
  constructor() {
    super();
    this.db = null;
    this.assets = new Map(); // id -> {id,type,name,source,ext,size,createdAt}
    this.meta = new Map(); // id -> {variants:[...], ...}
    this.dataCache = new Map();
    this.desktop = typeof window !== 'undefined' ? window.friendlife || null : null;
  }

  async init() {
    try {
      this.db = await openDB();
      const records = await tx(this.db, 'assets', 'readonly', (s) => s.getAll());
      for (const r of records || []) {
        const { data, ...info } = r;
        this.assets.set(r.id, info);
      }
      const metas = await tx(this.db, 'meta', 'readonly', (s) => s.getAll());
      for (const m of metas || []) this.meta.set(m.id, m);
    } catch (err) {
      console.warn('IndexedDB unavailable, imports will not persist', err);
    }
    await this.scanMods();
  }

  async scanMods() {
    if (!this.desktop?.listMods) return;
    try {
      const mods = await this.desktop.listMods();
      for (const m of mods) {
        const id = `mod:${m.type}/${m.file}`;
        this.assets.set(id, {
          id, type: m.type, name: baseName(m.file), source: 'mod', ext: fileExt(m.file),
          size: m.size, path: m.path, createdAt: m.mtime || 0,
        });
      }
    } catch (err) {
      console.warn('Could not scan mods folder', err);
    }
  }

  list(type) {
    const out = [...this.assets.values()].filter((a) => !type || a.type === type);
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  get(id) { return this.assets.get(id) || null; }

  async getData(id) {
    if (this.dataCache.has(id)) return this.dataCache.get(id);
    const info = this.assets.get(id);
    if (!info) throw new Error(`Unknown asset ${id}`);
    let data;
    if (info.source === 'mod') {
      data = await this.desktop.readMod(info.path);
    } else if (info.source === 'memory') {
      data = info.data;
    } else {
      const rec = await tx(this.db, 'assets', 'readonly', (s) => s.get(id));
      data = rec?.data;
    }
    if (!data) throw new Error(`Missing data for ${id}`);
    // Electron IPC hands back a Uint8Array; normalise to ArrayBuffer.
    if (ArrayBuffer.isView(data)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    this.dataCache.set(id, data);
    return data;
  }

  async getText(id) {
    const buf = await this.getData(id);
    return new TextDecoder().decode(buf);
  }

  async add({ name, type, data, ext }) {
    const id = uid(type);
    const info = { id, type, name, source: 'imported', ext: ext || '', size: data.byteLength, createdAt: Date.now() };
    if (this.db) {
      await tx(this.db, 'assets', 'readwrite', (s) => s.put({ ...info, data }));
    } else {
      info.source = 'memory';
      info.data = data;
    }
    this.assets.set(id, info);
    this.dataCache.set(id, data);
    this.emit('change', type);
    return info;
  }

  async importFile(file, typeOverride) {
    const type = typeOverride || guessType(file.name);
    if (!type) throw new Error(`Unsupported file: ${file.name}`);
    const data = await file.arrayBuffer();
    return this.add({ name: baseName(file.name), type, data, ext: fileExt(file.name) });
  }

  async remove(id) {
    const info = this.assets.get(id);
    if (!info) return;
    if (info.source === 'mod') throw new Error('This item lives in the mods folder. Delete the file there instead.');
    if (this.db && info.source === 'imported') await tx(this.db, 'assets', 'readwrite', (s) => s.delete(id));
    this.assets.delete(id);
    this.dataCache.delete(id);
    await this.setMeta(id, null);
    this.emit('change', info.type);
  }

  async rename(id, name) {
    const info = this.assets.get(id);
    if (!info) return;
    if (info.source === 'mod') {
      await this.setMeta(id, { ...this.getMeta(id), displayName: name });
    } else {
      info.name = name;
      if (this.db && info.source === 'imported') {
        const rec = await tx(this.db, 'assets', 'readonly', (s) => s.get(id));
        if (rec) await tx(this.db, 'assets', 'readwrite', (s) => s.put({ ...rec, name }));
      }
    }
    this.emit('change', info.type);
  }

  displayName(id) {
    const m = this.meta.get(id);
    return m?.displayName || this.assets.get(id)?.name || '(missing)';
  }

  getMeta(id) { return this.meta.get(id) || { id, variants: [] }; }

  async setMeta(id, meta) {
    if (meta === null) {
      this.meta.delete(id);
      if (this.db) await tx(this.db, 'meta', 'readwrite', (s) => s.delete(id));
      return;
    }
    const m = { ...meta, id };
    this.meta.set(id, m);
    if (this.db) await tx(this.db, 'meta', 'readwrite', (s) => s.put(m));
    const info = this.assets.get(id);
    this.emit('meta', id, info?.type);
  }

  // ---- variants: named sets of texture swaps / tints / hidden parts ----
  variants(id) { return this.getMeta(id).variants || []; }
  variant(id, variantId) { return this.variants(id).find((v) => v.id === variantId) || null; }

  async saveVariant(id, variant) {
    const meta = this.getMeta(id);
    const list = [...(meta.variants || [])];
    const v = { ...variant, id: variant.id || uid('var') };
    const i = list.findIndex((x) => x.id === v.id);
    if (i >= 0) list[i] = v; else list.push(v);
    await this.setMeta(id, { ...meta, variants: list });
    return v;
  }

  async deleteVariant(id, variantId) {
    const meta = this.getMeta(id);
    await this.setMeta(id, { ...meta, variants: (meta.variants || []).filter((v) => v.id !== variantId) });
  }

  // ---- bundled samples ----
  async addSamples() {
    const samples = [
      { file: 'Sample Mannequin.vrm', type: 'character' },
      { file: 'Sample Hoodie Outfit.vrm', type: 'outfit' },
      { file: 'Sample Dance.vrma', type: 'animation' },
    ];
    const added = [];
    for (const s of samples) {
      const name = baseName(s.file);
      if (this.list(s.type).some((a) => a.name === name)) continue;
      let data;
      if (this.desktop?.readSample) data = await this.desktop.readSample(s.file);
      else data = await (await fetch(`samples/${encodeURIComponent(s.file)}`)).arrayBuffer();
      if (ArrayBuffer.isView(data)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      added.push(await this.add({ name, type: s.type, data, ext: fileExt(s.file) }));
    }
    return added;
  }

  // ---- save games ----
  async saveGame(slot, data) {
    const payload = { id: slot, savedAt: Date.now(), data };
    if (this.db) await tx(this.db, 'saves', 'readwrite', (s) => s.put(payload));
    else localStorage.setItem(`friendlife_save_${slot}`, JSON.stringify(payload));
  }

  async loadGame(slot) {
    if (this.db) {
      const rec = await tx(this.db, 'saves', 'readonly', (s) => s.get(slot));
      return rec?.data || null;
    }
    const raw = localStorage.getItem(`friendlife_save_${slot}`);
    return raw ? JSON.parse(raw).data : null;
  }

  async deleteGame(slot) {
    if (this.db) await tx(this.db, 'saves', 'readwrite', (s) => s.delete(slot));
    localStorage.removeItem(`friendlife_save_${slot}`);
  }
}
