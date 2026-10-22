// Social interactions between residents: friendly chats, jokes, gossip,
// romance, and many kinds of conflict (arguments, insults, pranks,
// jealousy, the cold shoulder, dance-offs, breakups). Heated conflicts
// can escalate into fist fights (fight.js).

import { chance, clamp, pick, rand, weightedPick } from '../core/util.js';
import { line, TOPICS } from './data.js';

const CONFLICT_MUL = { off: 0, mild: 0.6, normal: 1, spicy: 1.8 };

export class Interaction {
  constructor(sim, a, b, kind, opts = {}) {
    this.sim = sim;
    this.a = a;
    this.b = b;
    this.kind = kind;
    this.opts = opts;
    this.phase = 'approach';
    this.t = 0;
    this.beats = [];
    this.beatIndex = -1;
    this.beatT = 0;
    this.done = false;
    this.keepAnim = false;
    this.next = null;
  }

  begin() {
    const { a, b } = this;
    for (const r of [a, b]) {
      r.clearPlan();
      r.leaveSeat();
      r.engaged = this;
    }
    b.faceTo(a.x, a.z);
    b.play('idle');
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    const gap = 0.75 * Math.max(a.displayScale || 1, b.displayScale || 1) + (this.kind === 'hug' ? -0.25 : 0.25);
    if (dist > gap + 0.2) {
      const run = this.kind === 'jealous' || this.kind === 'prank' ? this.kind === 'jealous' : false;
      a.moveTo(b.x, b.z, { stopDist: gap, run });
      if (this.kind === 'prank') a.moving.speed = 0.7; // sneaking
    }
    if (this.kind !== 'prank') a.emote(this.kind === 'jealous' ? '💢' : '👋', 1.5);
  }

  update(dt) {
    const { a, b, sim } = this;
    this.t += dt;
    if (this.phase === 'approach') {
      if (!sim.residents.includes(b) || b.inside || b.ko || !sim.residents.includes(a)) return this.finish(true);
      if (this.kind !== 'prank') b.faceTo(a.x, a.z);
      if (this.t > 30) return this.finish(true);
      if (!a.moving) {
        this.phase = 'script';
        a.faceTo(b.x, b.z);
        b.faceTo(a.x, a.z);
        this.beats = buildScript(this);
        this.beatIndex = -1;
        this.nextBeat();
      }
      return;
    }
    if (this.phase === 'script') {
      a.faceTo(b.x, b.z);
      if (!this.noFaceB) b.faceTo(a.x, a.z);
      this.beatT += dt;
      const beat = this.beats[this.beatIndex];
      if (!beat || this.beatT >= beat.dur) this.nextBeat();
    }
  }

  nextBeat() {
    this.beatIndex++;
    this.beatT = 0;
    const beat = this.beats[this.beatIndex];
    if (!beat) return this.finish(false);
    for (const who of ['a', 'b']) {
      const r = this[who];
      const p = beat[who];
      if (!p) continue;
      if (p.anim) r.play(p.anim, { restart: !!p.restart });
      if (p.expr) r.setExpression(p.expr);
      if (p.say) r.say(p.say, { emoji: p.emoji });
      else if (p.emoji) r.emote(p.emoji, Math.min(beat.dur + 0.5, 3));
      if (p.turnAway) { this.noFaceB = who === 'b'; r.targetHeading = Math.atan2(r.x - this[who === 'a' ? 'b' : 'a'].x, r.z - this[who === 'a' ? 'b' : 'a'].z); }
    }
    if (beat.sfx && this.sim.isNear(this.a)) this.sim.audio[beat.sfx]?.();
    if (beat.fn) beat.fn();
  }

  finish(cancelled) {
    if (this.done) return;
    this.done = true;
    const { a, b, sim } = this;
    for (const r of [a, b]) {
      if (r.engaged === this) r.engaged = null;
      r.stopMoving();
      if (!r.ko) r.play('idle');
      setTimeout(() => r.avatar && !r.engaged && r.setExpression(emotionExpr(r.mood())), 2500);
    }
    if (!cancelled) {
      const now = sim.clock;
      a.rel(b.id).last = now;
      b.rel(a.id).last = now;
      a.cooldowns.social = now + rand(15, 40);
      b.cooldowns.social = now + rand(10, 30);
      if (this.onEnd) this.onEnd();
      if (this.next) this.next();
    }
  }
}

export function emotionExpr(mood) {
  switch (mood) {
    case 'happy': return { happy: 0.55 };
    case 'sad': return { sad: 0.7 };
    case 'angry': return { angry: 0.7 };
    case 'love': return { happy: 0.7, blush: 1 };
    case 'shy': return { blush: 1, relaxed: 0.3 };
    case 'scared': return { surprised: 0.6, sad: 0.3 };
    case 'hurt': return { sad: 0.6, angry: 0.2 };
    case 'smug': return { happy: 0.4, relaxed: 0.5 };
    default: return {};
  }
}

const TALK = (say, emoji, expr) => ({ anim: 'talk', say, emoji, expr });
const LISTEN = (expr, emoji) => ({ anim: 'listen', expr, emoji });

function buildScript(it) {
  const { a, b, sim, kind } = it;
  const ra = a.rel(b.id);
  const rb = b.rel(a.id);
  ra.met = rb.met = true;
  const topic = () => pick(TOPICS);
  const S = [];
  const news = (text, icon) => sim.news(text, icon);
  const conflictMul = CONFLICT_MUL[sim.settings.conflict] ?? 1;
  // dictionary-aware lines ({food}, {hobby}, {insult}… use words the player taught)
  const D = (key, swap) => sim.dialogue.line(key, swap ? { a: b, b: a } : { a, b });

  const maybeEscalate = (heat) => {
    if (conflictMul <= 0.6) return false; // 'mild' never escalates into fists
    const avgTemper = (a.t.temper + b.t.temper) / 2;
    const avgKind = (a.t.kindness + b.t.kindness) / 2;
    const grudge = Math.max(ra.grudge, rb.grudge);
    let p = 0.04 + avgTemper * 0.35 + grudge / 260 + sim.weather.irritability() * 0.15 + (ra.score < -40 ? 0.12 : 0) - avgKind * 0.22 + heat;
    p *= conflictMul;
    if (!a.canFight || !b.canFight) return false;
    return chance(clamp(p, 0, 0.85));
  };

  switch (kind) {
    case 'chat': {
      S.push({ dur: 1.8, a: TALK(D('greet'), '👋', { happy: 0.5 }), b: LISTEN({ happy: 0.4 }) });
      const rounds = chance(0.5) ? 2 : 1;
      for (let r = 0; r < rounds; r++) {
        for (const ln of sim.dialogue.chat(r % 2 ? b : a, r % 2 ? a : b)) {
          const speaker = (ln.who === 'a') === (r % 2 === 0) ? 'a' : 'b';
          const mood = /😤|🙄|😒|🤢|😏/.test(ln.emoji) ? { angry: 0.3 } : { happy: 0.5 };
          S.push({ dur: Math.min(4.5, 1.6 + ln.text.length * 0.045), [speaker]: TALK(ln, ln.emoji, mood), [speaker === 'a' ? 'b' : 'a']: LISTEN({ happy: 0.3 }) });
        }
      }
      const fun = chance(0.4 + (a.t.quirk + b.t.quirk) * 0.2);
      if (fun) S.push({ dur: 2, a: { anim: 'laugh', expr: { happy: 1 }, emoji: '😆' }, b: { anim: 'laugh', expr: { happy: 1 } } });
      S.push({
        dur: 0.1,
        fn: () => {
          const g = rand(3, 6) + (fun ? 2 : 0);
          a.changeRel(b.id, g);
          b.changeRel(a.id, g);
          a.d.needs.social = clamp(a.d.needs.social + 25, 0, 100);
          b.d.needs.social = clamp(b.d.needs.social + 20, 0, 100);
          a.d.needs.fun = clamp(a.d.needs.fun + 5, 0, 100);
          sim.social.maybeCrush(a, b);
          sim.social.maybeCrush(b, a);
          sim.social.checkJealousy(a, b);
        },
      });
      break;
    }
    case 'joke': {
      S.push({ dur: 3, a: TALK(D('joke'), '😜', { happy: 0.6 }), b: LISTEN() });
      const lands = chance(0.45 + b.t.quirk * 0.3 + b.t.energy * 0.2);
      if (lands) {
        S.push({ dur: 2.2, a: { anim: 'laugh', expr: { happy: 1 } }, b: { anim: 'laugh', expr: { happy: 1 }, emoji: '🤣' } });
        S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 5); b.changeRel(a.id, 6); b.d.needs.fun = clamp(b.d.needs.fun + 12, 0, 100); } });
      } else {
        S.push({ dur: 2, a: { anim: 'idle', expr: { surprised: 0.4 } }, b: { anim: 'idle', expr: {}, emoji: '😐', say: '...' } });
        S.push({ dur: 1.5, a: { anim: 'shy', expr: { blush: 1 }, emoji: '💦' } });
        S.push({ dur: 0.1, fn: () => b.changeRel(a.id, -1) });
      }
      break;
    }
    case 'compliment': {
      S.push({ dur: 2.8, a: TALK(D('compliment'), '✨', { happy: 0.6 }), b: LISTEN({ surprised: 0.3 }) });
      S.push({ dur: 2.5, b: { anim: 'shy', expr: { happy: 0.6, blush: 1 }, emoji: '☺️' }, a: { anim: 'idle', expr: { happy: 0.6 } } });
      S.push({ dur: 0.1, fn: () => { b.changeRel(a.id, 7); a.changeRel(b.id, 3); b.d.happiness = clamp(b.d.happiness + 5, 0, 100); sim.social.maybeCrush(b, a); } });
      break;
    }
    case 'gossip': {
      const c = it.opts.c;
      S.push({ dur: 3, a: TALK(`Did you hear about ${c.name}?`, '🤫', { happy: 0.3 }), b: LISTEN() });
      S.push({ dur: 2.5, a: TALK('', '🗣️'), b: { anim: 'shocked', expr: { surprised: 1 }, emoji: '😱' } });
      S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 3); b.changeRel(a.id, 2); b.changeRel(c.id, -6); a.changeRel(c.id, -2); } });
      break;
    }
    case 'hug': {
      S.push({ dur: 1.5, a: TALK(D('greet'), '🤗', { happy: 0.8 }), b: { anim: 'idle', expr: { happy: 0.7 } } });
      S.push({ dur: 2.5, a: { anim: 'hug', expr: { happy: 1 } }, b: { anim: 'hug', expr: { happy: 1 }, emoji: '💕' } });
      S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 6); b.changeRel(a.id, 6); a.d.happiness = clamp(a.d.happiness + 5, 0, 100); b.d.happiness = clamp(b.d.happiness + 5, 0, 100); } });
      break;
    }
    case 'date': {
      S.push({ dur: 2.5, a: TALK('', '💕', { happy: 1, blush: 1 }), b: TALK('', '💖', { happy: 1, blush: 1 }) });
      S.push({ dur: 6, a: { anim: 'dance', expr: { happy: 1 } }, b: { anim: 'dance', expr: { happy: 1 }, emoji: '🎶' } });
      S.push({ dur: 2.5, a: { anim: 'hug', expr: { happy: 1, blush: 1 } }, b: { anim: 'hug', expr: { happy: 1, blush: 1 }, emoji: '💞' } });
      S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 5); b.changeRel(a.id, 5); a.d.happiness = clamp(a.d.happiness + 8, 0, 100); b.d.happiness = clamp(b.d.happiness + 8, 0, 100); a.d.needs.social = 100; b.d.needs.social = 100; } });
      break;
    }
    case 'confess': {
      S.push({ dur: 2.5, a: { anim: 'shy', expr: { blush: 1, happy: 0.3 }, emoji: '💓' }, b: LISTEN() });
      S.push({ dur: 3, a: { anim: 'talk', say: line('confess'), expr: { blush: 1, happy: 0.5 } }, b: { anim: 'idle', expr: { surprised: 0.8 }, emoji: '❗' } });
      S.push({ dur: 2.5, b: { anim: 'think', expr: { relaxed: 0.3 }, emoji: '💭' }, a: { anim: 'shy', expr: { blush: 1 } } });
      const p = clamp(0.25 + (rb.score - 35) / 70 + (b.partnerId() ? -0.6 : 0) + (it.opts.boost || 0), 0.03, 0.95);
      const yes = chance(p);
      if (yes) {
        S.push({ dur: 3, b: { anim: 'cheer', say: line('accept'), expr: { happy: 1, blush: 1 }, emoji: '💖' }, a: { anim: 'cheer', expr: { happy: 1, blush: 1 } } });
        S.push({ dur: 2.5, a: { anim: 'hug', expr: { happy: 1 } }, b: { anim: 'hug', expr: { happy: 1 } }, sfx: 'chime' });
        S.push({
          dur: 0.1,
          fn: () => {
            const prevB = b.partnerId();
            if (prevB) sim.social.breakUp(b, sim.byId(prevB), false);
            const prevA = a.partnerId();
            if (prevA) sim.social.breakUp(a, sim.byId(prevA), false);
            ra.partner = rb.partner = true;
            ra.crush = rb.crush = true;
            a.changeRel(b.id, 15); b.changeRel(a.id, 15);
            a.setEmotion('love', 240); b.setEmotion('love', 240);
            news(`${a.name} confessed to ${b.name}... and ${b.name} said YES! 💞`, '💞');
            a.addMemory(`Started dating ${b.name}`);
            b.addMemory(`Started dating ${a.name}`);
          },
        });
      } else {
        S.push({ dur: 3, b: { anim: 'idle', say: line('reject'), expr: { sad: 0.4 } }, a: { anim: 'shocked', expr: { surprised: 1 } } });
        S.push({ dur: 3, a: { anim: 'cry', expr: { sad: 1 }, emoji: '💔' }, b: { anim: 'shy', expr: { sad: 0.3 } }, sfx: 'sad' });
        S.push({
          dur: 0.1,
          fn: () => {
            ra.crush = false;
            a.changeRel(b.id, -4);
            a.d.happiness = clamp(a.d.happiness - 25, 0, 100);
            a.setEmotion('sad', 300);
            news(`${a.name} confessed to ${b.name}, but got turned down... 💔`, '💔');
            a.addMemory(`Was rejected by ${b.name}`);
            sim.problems.offer(a, 'heartbroken', { other: b.id });
          },
        });
      }
      break;
    }
    case 'argue': {
      const rounds = 2 + Math.floor(rand(0, 2));
      S.push({ dur: 2.4, a: { anim: 'argue', say: D('argue'), expr: { angry: 0.9 }, emoji: '💢' }, b: { anim: 'idle', expr: { surprised: 0.5 } }, sfx: 'angry' });
      for (let i = 0; i < rounds; i++) {
        S.push({ dur: 2.2, b: { anim: 'argue', say: D('argueBack', true), expr: { angry: 0.9 }, emoji: '💢' }, a: { anim: 'angry', expr: { angry: 1 } } });
        S.push({ dur: 2.2, a: { anim: 'argue', say: D('argue'), expr: { angry: 1 }, emoji: '💢' }, b: { anim: 'angry', expr: { angry: 1 } } });
      }
      const fight = maybeEscalate(0.05);
      S.push({
        dur: 0.1,
        fn: () => {
          a.changeRel(b.id, -rand(6, 12)); b.changeRel(a.id, -rand(6, 12));
          ra.grudge = clamp(ra.grudge + 10, 0, 100); rb.grudge = clamp(rb.grudge + 12, 0, 100);
          a.setEmotion('angry', 60); b.setEmotion('angry', 60);
          sim.witness(a, '😮');
          if (!fight) {
            if (chance(0.3)) news(`${a.name} and ${b.name} had a heated argument.`, '💢');
            if (chance(0.35)) sim.problems.offer(b, 'makeUp', { other: a.id });
          }
        },
      });
      if (fight) it.next = () => sim.fights.start(a, b, 'argument');
      break;
    }
    case 'insult': {
      S.push({ dur: 2.6, a: { anim: 'taunt', say: D('insult'), expr: { happy: 0.5, angry: 0.3 }, emoji: '😏' }, b: { anim: 'idle', expr: { surprised: 0.8 } } });
      const timid = b.t.confidence < 0.45 && b.t.temper < 0.6;
      if (timid) {
        S.push({ dur: 3, b: { anim: 'cry', say: line('hurtReply'), expr: { sad: 1 }, emoji: '😢' }, a: { anim: 'laugh', expr: { happy: 0.8 } }, sfx: 'sad' });
        S.push({
          dur: 0.1,
          fn: () => {
            b.changeRel(a.id, -14); a.changeRel(b.id, -2);
            rb.grudge = clamp(rb.grudge + 18, 0, 100);
            b.d.happiness = clamp(b.d.happiness - 18, 0, 100);
            b.setEmotion('sad', 120);
            sim.witness(a, '😠', (w) => w.changeRel(a.id, -4));
            news(`${a.name} made fun of ${b.name} and made them cry.`, '😢');
            sim.problems.offer(b, chance(b.t.temper) ? 'revenge' : 'sad', { other: a.id });
          },
        });
      } else {
        S.push({ dur: 2.4, b: { anim: 'angry', say: line('angryReply'), expr: { angry: 1 }, emoji: '💢' }, a: { anim: 'taunt', expr: { happy: 0.6 } }, sfx: 'angry' });
        const fight = maybeEscalate(0.15);
        S.push({ dur: 0.1, fn: () => { b.changeRel(a.id, -14); a.changeRel(b.id, -4); rb.grudge = clamp(rb.grudge + 20, 0, 100); b.setEmotion('angry', 90); } });
        if (fight) it.next = () => sim.fights.start(b, a, 'insult');
      }
      break;
    }
    case 'prank': {
      it.noFaceB = true;
      S.push({ dur: 1.2, a: { anim: 'shy', expr: { happy: 0.7 }, emoji: '🤫' } });
      S.push({ dur: 1.6, a: { anim: 'cheer', say: line('prank'), expr: { happy: 1 } }, b: { anim: 'shocked', expr: { surprised: 1 }, emoji: '😱', restart: true }, sfx: 'pop' });
      const funny = rb.score > 30 || b.t.quirk > 0.65 || chance(0.25);
      if (funny) {
        S.push({ dur: 2.2, a: { anim: 'laugh', expr: { happy: 1 } }, b: { anim: 'laugh', expr: { happy: 1 }, emoji: '😂' } });
        S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 4); b.changeRel(a.id, 4); } });
      } else {
        S.push({ dur: 2.4, a: { anim: 'laugh', expr: { happy: 1 } }, b: { anim: 'angry', say: 'Not funny!', expr: { angry: 1 }, emoji: '💢' }, sfx: 'angry' });
        const fight = b.t.temper > 0.7 && maybeEscalate(0);
        S.push({ dur: 0.1, fn: () => { b.changeRel(a.id, -9); rb.grudge = clamp(rb.grudge + 8, 0, 100); b.setEmotion('angry', 60); } });
        if (fight) it.next = () => sim.fights.start(b, a, 'prank');
      }
      break;
    }
    case 'jealous': {
      const c = it.opts.c;
      S.push({ dur: 2.8, a: { anim: 'argue', say: line('jealous', { c: c.name }), expr: { angry: 1 }, emoji: '😤' }, b: { anim: 'shocked', expr: { surprised: 1 } }, sfx: 'angry' });
      const meek = b.t.kindness > 0.6 && b.t.temper < 0.5;
      if (meek) {
        S.push({ dur: 2.5, b: { anim: 'shy', say: 'We were just talking!', expr: { sad: 0.6 } }, a: { anim: 'angry', expr: { angry: 1 } } });
        S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, -8); b.changeRel(a.id, -5); ra.grudge = clamp(ra.grudge + 10, 0, 100); news(`${a.name} got jealous and confronted ${b.name} about ${c.name}.`, '😤'); } });
      } else {
        S.push({ dur: 2.4, b: { anim: 'argue', say: D('argueBack', true), expr: { angry: 1 }, emoji: '💢' }, a: { anim: 'angry', expr: { angry: 1 } } });
        const fight = maybeEscalate(0.2);
        S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, -14); b.changeRel(a.id, -12); ra.grudge = clamp(ra.grudge + 20, 0, 100); rb.grudge = clamp(rb.grudge + 15, 0, 100); news(`Love triangle! ${a.name} blew up at ${b.name} over ${c.name}.`, '💥'); } });
        if (fight) it.next = () => sim.fights.start(a, b, 'jealousy');
      }
      break;
    }
    case 'cold': {
      S.push({ dur: 1.6, a: TALK(D('greet'), '👋', { happy: 0.3 }), b: { anim: 'idle', expr: { angry: 0.5 } } });
      S.push({ dur: 2.5, b: { anim: 'sulk', say: line('cold'), expr: { angry: 0.7 }, emoji: '😤', turnAway: true }, a: { anim: 'idle', expr: { sad: 0.6 } } });
      S.push({ dur: 1.5, a: { anim: 'idle', expr: { sad: 0.8 }, emoji: '😞' } });
      S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, -3); a.d.happiness = clamp(a.d.happiness - 6, 0, 100); } });
      break;
    }
    case 'apology': {
      S.push({ dur: 3, a: { anim: 'shy', say: line('apology'), expr: { sad: 0.6 }, emoji: '🙏' }, b: { anim: 'idle', expr: { angry: 0.3 } } });
      S.push({ dur: 2.2, b: { anim: 'think', expr: {}, emoji: '💭' }, a: { anim: 'shy', expr: { sad: 0.5 } } });
      const gift = it.opts.gift ? 0.25 : 0;
      const yes = chance(clamp(0.3 + b.t.kindness * 0.45 - rb.grudge / 220 + gift + (it.opts.boost || 0) + (rb.score > -50 ? 0.1 : -0.15), 0.05, 0.97));
      if (it.opts.gift) S.splice(1, 0, { dur: 2, a: { anim: 'eatStand', emoji: '🎁', say: 'This is for you.' }, b: { anim: 'idle', expr: { surprised: 0.6 } } });
      if (yes) {
        S.push({ dur: 2.6, b: { anim: 'talk', say: line('forgive'), expr: { happy: 0.8 }, emoji: '😊' }, a: { anim: 'idle', expr: { happy: 0.8 } } });
        S.push({ dur: 2.5, a: { anim: 'hug', expr: { happy: 1 } }, b: { anim: 'hug', expr: { happy: 1 }, emoji: '🤝' }, sfx: 'chime' });
        S.push({
          dur: 0.1,
          fn: () => {
            ra.grudge = rb.grudge = 0;
            a.changeRel(b.id, 22); b.changeRel(a.id, 22);
            a.setEmotion('happy', 120); b.setEmotion('happy', 120);
            news(`${a.name} and ${b.name} made up! 🤝`, '🤝');
            it.success = true;
          },
        });
      } else {
        S.push({ dur: 2.6, b: { anim: 'sulk', say: line('unforgiving'), expr: { angry: 0.8 }, emoji: '😤', turnAway: true }, a: { anim: 'idle', expr: { sad: 1 }, emoji: '😞' }, sfx: 'sad' });
        S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, -2); a.d.happiness = clamp(a.d.happiness - 8, 0, 100); it.success = false; } });
      }
      break;
    }
    case 'danceOff': {
      S.push({ dur: 2, a: { anim: 'point', say: line('dance'), expr: { happy: 0.6 }, emoji: '🕺' }, b: { anim: 'idle', expr: { happy: 0.5 } } });
      S.push({ dur: 5, a: { anim: 'dance', expr: { happy: 1 } }, b: { anim: 'dance', expr: { happy: 1 } } });
      const aWins = rand(0, 1) + a.t.energy * 0.4 > rand(0, 1) + b.t.energy * 0.4;
      const [w, l] = aWins ? [a, b] : [b, a];
      const wKey = aWins ? 'a' : 'b', lKey = aWins ? 'b' : 'a';
      const sore = l.t.temper > 0.6;
      S.push({ dur: 3, [wKey]: { anim: 'victory', say: 'I win!', expr: { happy: 1 }, emoji: '🏆' }, [lKey]: sore ? { anim: 'angry', expr: { angry: 0.8 }, emoji: '💢' } : { anim: 'laugh', expr: { happy: 0.7 } } });
      S.push({ dur: 0.1, fn: () => { const d = sore ? -5 : 3; l.changeRel(w.id, d); w.changeRel(l.id, 2); w.d.needs.fun = 100; l.d.needs.fun = clamp(l.d.needs.fun + 30, 0, 100); } });
      break;
    }
    case 'breakup': {
      S.push({ dur: 3, a: { anim: 'talk', say: line('breakup'), expr: { sad: 0.5 } }, b: { anim: 'shocked', expr: { surprised: 1 } } });
      S.push({ dur: 3.2, b: { anim: 'cry', expr: { sad: 1 }, emoji: '💔' }, a: { anim: 'sulk', expr: { sad: 0.5 }, turnAway: true }, sfx: 'sad' });
      S.push({ dur: 0.1, fn: () => sim.social.breakUp(a, b, true) });
      break;
    }
    default:
      S.push({ dur: 2, a: TALK(D('greet')), b: LISTEN() });
  }
  return S;
}

export class Social {
  constructor(sim) {
    this.sim = sim;
    this.active = [];
    this.stats = {};
  }

  start(a, b, kind, opts = {}) {
    if (!a || !b || a === b) return null;
    if (a.engaged || b.engaged || a.inside || b.inside || a.ko || b.ko) return null;
    const it = new Interaction(this.sim, a, b, kind, opts);
    this.stats[kind] = (this.stats[kind] || 0) + 1;
    this.active.push(it);
    it.begin();
    return it;
  }

  update(dt) {
    for (const it of this.active) it.update(dt);
    this.active = this.active.filter((it) => !it.done);
  }

  cancelFor(res) {
    for (const it of this.active) if (it.a === res || it.b === res) it.finish(true);
  }

  /** Called by the brain: find someone and do something social. */
  trySocialize(a) {
    const sim = this.sim;
    if ((a.cooldowns.social || 0) > sim.clock) return false;
    const cands = sim.residents.filter((b) => b !== a && b.available && sim.dist(a, b) < 32 && (b.cooldowns.social || 0) < sim.clock + 10);
    if (!cands.length) return false;
    const w = cands.map((b) => {
      const r = a.relScore(b.id);
      let weight = 1 + Math.max(0, r) / 25 + (a.rel(b.id).partner ? 3 : 0);
      if (r < -30) weight = a.t.temper > 0.6 ? 0.8 : 0.15;
      weight *= 1 / (1 + sim.dist(a, b) / 12);
      return [b, weight];
    });
    const b = weightedPick(w);
    if (!b) return false;
    const kind = this.chooseKind(a, b);
    if (!kind) return false;
    const opts = {};
    if (kind === 'gossip') {
      const c = sim.residents.find((c) => c !== a && c !== b && a.relScore(c.id) < 5 && a.rel(c.id).met);
      if (!c) return !!this.start(a, b, 'chat');
      opts.c = c;
    }
    return !!this.start(a, b, kind, opts);
  }

  chooseKind(a, b) {
    const sim = this.sim;
    const ra = a.rel(b.id);
    const r = ra.score;
    const rb = b.relScore(a.id);
    const t = a.t;
    const cm = CONFLICT_MUL[sim.settings.conflict] ?? 1;
    const irritable = sim.weather.irritability() + (a.d.happiness < 30 ? 0.5 : 0) + (a.d.needs.hunger < 25 ? 0.4 : 0) + (a.painLevel > 10 ? 0.3 : 0);
    if (rb < -40 && chance(0.6)) return 'cold';
    const w = [
      ['chat', 5 + Math.max(0, r) / 20],
      ['joke', 0.6 + t.quirk * 2],
      ['compliment', t.kindness * 1.6 + (ra.crush ? 1.5 : 0)],
      ['gossip', 0.5 + (1 - t.kindness) * 0.8],
      ['hug', r > 50 ? 1.5 + t.kindness : 0],
      ['date', ra.partner ? 4 : 0],
      ['prank', (t.quirk * 1.2 + t.temper * 0.3) * (cm > 0 ? 1 : 0.3)],
      ['danceOff', t.energy * 0.8 + (r < 0 ? 0.6 : 0)],
      ['argue', cm * (0.25 + t.temper * 1.6 + (r < 0 ? -r / 25 : 0) + irritable * 1.5 + ra.grudge / 30)],
      ['insult', cm * ((1 - t.kindness) * 0.9 + (r < 0 ? 0.8 : 0)) * (t.kindness < 0.45 ? 1 : 0.25)],
      ['apology', (r < -10 || ra.grudge > 25) ? t.kindness * 2.5 : 0],
      ['breakup', ra.partner && r < 15 ? 3 : 0],
      // bold residents with a big crush may confess without asking the player first
      ['confess', sim.settings.romance && ra.crush && !ra.partner && r > 65 ? t.confidence * 1.2 : 0],
    ];
    return weightedPick(w);
  }

  maybeCrush(a, b) {
    if (!this.sim.settings.romance) return;
    const r = a.rel(b.id);
    if (r.crush || r.partner || r.score < 50) return;
    if (chance(0.1 + (r.score - 50) / 250)) {
      r.crush = true;
      a.addMemory(`Developed a crush on ${b.name}`);
      // Residents ask the player before confessing (like Tomodachi Life)
      this.sim.problems.offer(a, 'confess', { other: b.id });
    }
  }

  /** a and b just talked. Is anyone watching who is in love with one of them? */
  checkJealousy(a, b) {
    const sim = this.sim;
    if ((CONFLICT_MUL[sim.settings.conflict] ?? 1) === 0) return;
    for (const z of sim.residents) {
      if (z === a || z === b || !z.available) continue;
      for (const [lover, rival] of [[a, b], [b, a]]) {
        const rz = z.d.relationships[lover.id];
        if (!rz || !(rz.partner || rz.crush)) continue;
        if (sim.dist(z, lover) > 14) continue;
        if (lover.rel(rival.id).partner) continue;
        const p = (rz.partner ? 0.4 : 0.2) * (0.4 + z.t.temper) * (1.2 - z.t.kindness * 0.6);
        if (chance(p)) {
          setTimeout(() => this.start(z, rival, 'jealous', { c: lover }), 1500);
          return;
        }
      }
    }
  }

  breakUp(a, b, announce) {
    if (!a || !b) return;
    const ra = a.rel(b.id), rb = b.rel(a.id);
    ra.partner = rb.partner = false;
    ra.crush = rb.crush = false;
    ra.ex = rb.ex = true;
    a.changeRel(b.id, -20); b.changeRel(a.id, -25);
    rb.grudge = clamp(rb.grudge + 25, 0, 100);
    b.d.happiness = clamp(b.d.happiness - 30, 0, 100);
    b.setEmotion('sad', 400);
    a.addMemory(`Broke up with ${b.name}`);
    b.addMemory(`Got dumped by ${a.name}`);
    if (announce) {
      this.sim.news(`${a.name} broke up with ${b.name}. 💔`, '💔');
      this.sim.problems.offer(b, 'heartbroken', { other: a.id });
    }
  }
}
