// Loads texture assets from the library and caches them.
import * as THREE from 'three';

export class TextureStore {
  constructor(library) {
    this.library = library;
    this.images = new Map(); // id -> Promise<HTMLImageElement>
    this.textures = new Map(); // `${id}|${flip}|${repeat}` -> THREE.Texture
  }

  image(id) {
    if (!this.images.has(id)) {
      this.images.set(id, (async () => {
        const data = await this.library.getData(id);
        const info = this.library.get(id);
        const mime = info?.ext === 'jpg' || info?.ext === 'jpeg' ? 'image/jpeg' : info?.ext === 'webp' ? 'image/webp' : 'image/png';
        const url = URL.createObjectURL(new Blob([data], { type: mime }));
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      })());
    }
    return this.images.get(id);
  }

  /** flipY=false for glTF/VRM materials, true for normal three.js geometry. repeat>0 tiles it. */
  async get(id, { flipY = false, repeat = 0 } = {}) {
    const key = `${id}|${flipY}|${repeat}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const img = await this.image(id);
    const tex = new THREE.Texture(img);
    tex.flipY = flipY;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (repeat > 0) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    tex.needsUpdate = true;
    this.textures.set(key, tex);
    return tex;
  }

  forget(id) {
    this.images.delete(id);
    for (const k of [...this.textures.keys()]) if (k.startsWith(`${id}|`)) { this.textures.get(k).dispose(); this.textures.delete(k); }
  }
}
