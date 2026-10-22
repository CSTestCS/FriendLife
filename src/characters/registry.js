// Animation registry: built-in clips plus anything imported (.vrma or JSON).
// Imported animations can be mapped onto game actions ("use my dance for
// 'dance'") or tagged as random idle emotes.

import { KeyframeClip, VrmaClip } from './animation.js';
import { BUILTIN_ANIMATIONS } from './builtinAnims.js';
import { parseVRMA } from './loaders.js';
import { parseMixamoFBX } from './mixamo.js';
import { Emitter } from '../core/util.js';

export class AnimationRegistry extends Emitter {
  constructor(library) {
    super();
    this.library = library;
    this.builtins = new Map();
    for (const def of BUILTIN_ANIMATIONS) this.builtins.set(def.name, new KeyframeClip(def));
    this.custom = new Map(); // assetId -> clip
    this.errors = new Map();
    this.actionMap = {}; // action -> assetId
    this.emotes = new Set(); // assetIds usable as random idle emotes
  }

  async loadAll() {
    for (const a of this.library.list('animation')) {
      if (!this.custom.has(a.id)) await this.loadAsset(a.id);
    }
  }

  async loadAsset(id) {
    const info = this.library.get(id);
    if (!info) return null;
    try {
      let clip;
      if (info.ext === 'fbx') {
        clip = await parseMixamoFBX(await this.library.getData(id), info.name);
      } else if (info.ext === 'vrma') {
        const anim = await parseVRMA(await this.library.getData(id));
        clip = new VrmaClip(info.name, anim, true);
      } else {
        const def = JSON.parse(await this.library.getText(id));
        clip = new KeyframeClip({ name: info.name, ...def });
      }
      const meta = this.library.getMeta(id);
      if (meta.loop !== undefined) clip.loop = meta.loop;
      clip.assetId = id;
      clip.label = this.library.displayName(id);
      this.custom.set(id, clip);
      this.errors.delete(id);
      this.emit('change');
      return clip;
    } catch (err) {
      console.warn('Failed to load animation', id, err);
      this.errors.set(id, String(err.message || err));
      return null;
    }
  }

  remove(id) {
    this.custom.delete(id);
    for (const [k, v] of Object.entries(this.actionMap)) if (v === id) delete this.actionMap[k];
    this.emotes.delete(id);
    this.emit('change');
  }

  /** Get the clip that should play for an action name or asset id. */
  resolve(action) {
    const mapped = this.actionMap[action];
    if (mapped && this.custom.has(mapped)) return this.custom.get(mapped);
    if (this.builtins.has(action)) return this.builtins.get(action);
    if (this.custom.has(action)) return this.custom.get(action);
    return this.builtins.get('idle');
  }

  /** Guess which built-in action an animation is for from its file name (Mixamo names like "Walking", "Punching"). */
  static guessAction(name) {
    const n = String(name).toLowerCase();
    const rules = [
      [/sad.*walk|walk.*sad|injured walk/, 'walkSad'], [/limp|injured/, 'limp'], [/happy.*walk|skip/, 'walkHappy'],
      [/run|jog|sprint/, 'run'], [/walk/, 'walk'], [/idle.*look|look.*around/, 'idleLook'], [/idle|breath|stand/, 'idle'],
      [/wav(e|ing)|greet/, 'wave'], [/laugh/, 'laugh'], [/cheer|celebrat|victory|fist pump/, 'cheer'], [/danc|samba|hip hop|salsa|twerk|breakdance/, 'dance'],
      [/sit.*ground|sitting idle on ground/, 'sitGround'], [/sit/, 'sit'], [/eat|drink/, 'eatStand'], [/cry|sob/, 'cry'], [/angry|stomp|frustrat/, 'angry'],
      [/argu|yell|shout/, 'argue'], [/talk/, 'talk'], [/think/, 'think'], [/shy|bashful/, 'shy'], [/hug/, 'hug'], [/jab/, 'jab'], [/punch|hook|uppercut|cross/, 'punch'],
      [/kick/, 'kick'], [/push|shove/, 'shove'], [/tackl/, 'tackle'], [/dodg/, 'dodge'], [/block/, 'block'], [/hit|react|impact/, 'hurt'],
      [/knock|fall|death|dying/, 'knockdown'], [/stand(ing)? up|get(ting)? up/, 'getUp'], [/dizz|drunk/, 'dizzy'], [/fight|box|guard|stance/, 'guard'],
      [/taunt/, 'taunt'], [/jump.*jack|exercis|push ?up|squat/, 'exercise'], [/sleep|lying|lay/, 'sleep'], [/point/, 'point'], [/shiver|cold/, 'shiver'], [/surpris|shock|scared|terrif/, 'shocked'],
    ];
    for (const [re, action] of rules) if (re.test(n)) return action;
    return null;
  }

  randomEmote() {
    const ids = [...this.emotes].filter((id) => this.custom.has(id));
    if (!ids.length) return null;
    return ids[Math.floor(Math.random() * ids.length)];
  }

  serialize() {
    return { actionMap: { ...this.actionMap }, emotes: [...this.emotes] };
  }

  restore(data) {
    this.actionMap = { ...(data?.actionMap || {}) };
    this.emotes = new Set(data?.emotes || []);
    this.emit('change');
  }
}
