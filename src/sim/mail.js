// The mail carrier's day.
//
// Rounds: through the condo floor by floor, knocking on every apartment door.
// Anyone home lets them in; empty (or sleeping) apartments are skipped. Then
// they patrol the island and walk up to everyone they haven't seen yet today.
//
// Every visit: they hand over messages waiting for that person, then ask
// "Any messages to send?" The resident may give one for someone else — a
// compliment, an invitation, a gift, an insult, gossip, a thank-you, an
// apology, a love letter, a joke, a question — which the carrier delivers the
// next time they see that person. A message for the carrier is just said to
// them on the spot.

import { chance, clamp, pick, rand } from '../core/util.js';
import { CONDO_UNITS_PER_FLOOR } from '../world/rooms.js';
import { canRomance } from './relations.js';

const ACTIVITIES = ['shoot some hoops', 'have a picnic', 'go stargazing', 'grab a snack', 'sit by the campfire', 'build sandcastles', 'go for a swim', 'dance on the stage'];

export class MailService {
  constructor(sim) {
    this.sim = sim;
    this.bag = []; // {from, to, kind, text, at}
    this.day = -1;
    this.seen = new Set(); // residents visited today
    this.knocked = new Set(); // apartments knocked on today
  }

  newDayCheck() {
    if (this.day === this.sim.day) return;
    this.day = this.sim.day;
    this.seen.clear();
    this.knocked.clear();
    this.bag = this.bag.filter((m) => this.sim.clock - m.at < 3 * 1440 && this.sim.byId(m.to) && this.sim.byId(m.from));
  }

  pendingFor(res) { return this.bag.filter((m) => m.to === res.id); }

  /** Apartments still to knock on today, as {key, owner, floor, door}. */
  doorsLeft(carrier) {
    const sim = this.sim;
    return sim.residents
      .filter((r) => r !== carrier && sim.condo.unitOf(r.id) != null && !this.knocked.has(r.homeKey))
      .map((r) => { const u = sim.condo.unitOf(r.id); return { key: r.homeKey, owner: r, floor: sim.condo.floorOf(u), door: u % CONDO_UNITS_PER_FLOOR }; })
      .sort((a, b) => a.floor - b.floor || a.door - b.door);
  }

  /** Outside: plan the next stop. Returns true if planned. */
  plan(res) {
    const sim = this.sim;
    this.newDayCheck();
    res.working = true;
    const doors = this.doorsLeft(res);
    if (doors.length) {
      // into the condo, up to the first floor with doors left
      const d = sim.locationDoor('condo', res);
      if (!d) return false;
      res.setPlan([
        { kind: 'call', fn: () => { res.activity = 'work'; if (chance(0.4)) res.say('Morning rounds! 📮', { emoji: '📮' }); } },
        { kind: 'walk', x: d[0], z: d[1] },
        { kind: 'enter', loc: `hall:${doors[0].floor}`, minutes: 240 },
      ]);
      return true;
    }
    // patrol: someone not seen today, or someone with mail waiting
    const want = sim.residents.filter((r) => r !== res && !r.inside && !r.engaged && !r.ko && !r.sleeping && (!this.seen.has(r.id) || this.pendingFor(r).length));
    if (want.length) {
      const t = want.sort((a, b) => sim.dist(res, a) - sim.dist(res, b))[0];
      res.setPlan([
        { kind: 'walk', x: t.x, z: t.z, stopDist: 1.6 },
        { kind: 'call', fn: () => this.visit(res, t) },
      ]);
      return true;
    }
    const p = sim.island.randomPoint(6, 34);
    res.setPlan([{ kind: 'walk', x: p.x, z: p.z }, { kind: 'anim', anim: 'idleLook', dur: rand(3, 6), emoji: '📮' }]);
    return true;
  }

  /** Inside the condo (hallways, apartments) during rounds. Returns true if it planned something. */
  thinkIndoors(res, room) {
    const sim = this.sim;
    this.newDayCheck();
    res.working = true;
    if (room.kind === 'home' && res.inside === res.homeKey) return false; // their own place: normal routine
    if (room.kind === 'home') {
      // done here (the visit happens on the way in): back out to the hallway
      res.setPlan([{ kind: 'walk', x: room.entry[0], z: room.entry[1] }, { kind: 'call', fn: () => res.stepOut() }]);
      return true;
    }
    if (room.kind !== 'hall' && room.kind !== 'lobby') return false;
    const doors = this.doorsLeft(res);
    if (!doors.length) { res.leaving = true; res.route = null; res.insideUntil = Infinity; return false; }
    const floor = room.kind === 'hall' ? +room.key.slice(5) : null;
    const here = doors.filter((d) => d.floor === floor);
    if (!here.length) {
      // next floor (via the lift)
      res.enter(`hall:${doors[0].floor}`, 240);
      return true;
    }
    const d = here[0];
    const spot = room.doorSpot(d.door);
    if (!spot) { this.knocked.add(d.key); return false; }
    res.setPlan([
      { kind: 'walk', x: spot.x, z: spot.z },
      { kind: 'anim', anim: 'point', dur: 1.6, heading: spot.rot, say: pick(['*knock knock* Mail!', '*knock knock* Mail carrier!', 'Knock knock! 📮']), emoji: '🚪' },
      { kind: 'call', fn: () => this.answerDoor(res, d) },
    ]);
    return true;
  }

  /** Someone home lets them in; empty or asleep: on to the next door. */
  answerDoor(res, d) {
    const sim = this.sim;
    this.knocked.add(d.key);
    const o = d.owner;
    const home = o.inside === d.key && !o.sleeping && !o.ko && !o.nightOut;
    if (!home) {
      res.say(pick(['Nobody home.', 'No answer... next!', '*slips a note under the door*']), { emoji: '📭', sound: false });
      return;
    }
    o.say(pick(['Come in!', 'Oh, the mail! Come on in!', 'It\'s open~']), { emoji: '🚪' });
    // step inside (still in the hallway, right at their door), then the visit;
    // the room brain walks them back out to the hallway afterwards
    res.setPlan([
      { kind: 'wait', dur: 1 },
      { kind: 'call', fn: () => {
        if (o.inside !== d.key || res.engaged) return;
        res.goInto(d.key);
        if (res.inside !== d.key) return;
        res.insideUntil = Infinity;
        const r = o.room;
        res.setPlan([{ kind: 'walk', x: o.x + 0.9, z: o.z + 0.4, stopDist: 0.8 }, { kind: 'call', fn: () => { if (!o.engaged) this.visit(res, o); } }]);
        void r;
      } },
    ]);
  }

  /** Walk up to someone and do the mail exchange. */
  visit(res, o) {
    const sim = this.sim;
    if (!o || o.engaged || o.ko || o === res) return false;
    this.seen.add(o.id);
    return !!sim.social.start(res, o, 'mail', { force: true, indoor: !!o.inside });
  }

  /** Make up a message from `from` for someone (or null if they have nothing to say). */
  compose(from, carrier) {
    const sim = this.sim;
    if (!chance(0.45 + from.t.sociability * 0.4)) return null;
    const known = sim.residents.filter((x) => x !== from && from.rel(x.id).met);
    if (!known.length) return null;
    const to = pick(known);
    const r = from.relScore(to.id);
    const rel = from.rel(to.id);
    const w = [
      ['compliment', r > 20 ? 2 : 0.4],
      ['invite', r > 15 ? 1.6 : 0.2],
      ['gift', r > 40 ? 1.2 : 0],
      ['thanks', r > 30 ? 1 : 0],
      ['joke', 0.6 + from.t.quirk],
      ['question', 0.8],
      ['love', sim.settings.romance && rel.crush && canRomance(from, to) ? 2.5 : 0],
      ['insult', r < -10 ? 1.5 + (1 - from.t.kindness) : (1 - from.t.kindness) * 0.2],
      ['apology', (r < 0 || rel.grudge > 20) ? from.t.kindness * 2 : 0],
      ['gossip', 0.4 + (1 - from.t.kindness) * 0.8],
    ];
    let total = w.reduce((s, e) => s + e[1], 0);
    let x = Math.random() * total;
    let kind = 'question';
    for (const [k, v] of w) { if ((x -= v) <= 0) { kind = k; break; } }
    const D = (key) => sim.dialogue.line(key, { a: from, b: to }).text;
    const third = pick(sim.residents.filter((y) => y !== from && y !== to)) || null;
    if (kind === 'gossip' && !third) kind = 'joke';
    const text = {
      compliment: () => pick([`Tell ${to.name} they're the nicest person on the island!`, `Tell ${to.name} I love their style!`, `Let ${to.name} know they always make me smile.`]),
      invite: () => `Ask ${to.name} if they want to ${pick(ACTIVITIES)} with me!`,
      gift: () => `Could you give ${to.name} this little gift from me? 🎁`,
      thanks: () => `Tell ${to.name} thanks for everything!`,
      joke: () => `Tell ${to.name} this joke: "${D('joke')}"`,
      question: () => `Ask ${to.name} ${pick(['what their favourite food is', 'if they\'re free this weekend', 'how they\'re doing', 'if they\'ve seen my sunglasses'])}.`,
      love: () => `Can you... give ${to.name} this letter? 💌 Don't read it!`,
      insult: () => `Tell ${to.name}: "${D('insult')}"`,
      apology: () => `Tell ${to.name} I'm sorry. I mean it.`,
      gossip: () => `Did you hear about ${third.name}? ...tell ${to.name} too!`,
    }[kind]();
    const direct = {
      compliment: () => pick(['You\'re the nicest person on the island, you know that?', 'I love your style!']),
      invite: () => `Want to ${pick(ACTIVITIES)} with me sometime?`,
      gift: () => 'This is for you! 🎁',
      thanks: () => 'Thanks for everything, really!',
      joke: () => `Here's one for you: "${D('joke')}"`,
      question: () => pick(['What\'s your favourite food?', 'Are you free this weekend?', 'How are you doing, really?']),
      love: () => 'I... wrote you a letter. 💌 Read it later!',
      insult: () => D('insult'),
      apology: () => 'I\'m sorry. I mean it.',
      gossip: () => `Did you hear about ${third.name}?!`,
    }[kind]();
    return { from: from.id, to: to.id, kind, text, direct, about: kind === 'gossip' ? third?.id : null, at: sim.clock };
  }

  /** How the carrier reads a message out to its recipient. */
  readOut(m) {
    const from = this.sim.byId(m.from)?.name || 'Someone';
    switch (m.kind) {
      case 'compliment': return `Message from ${from}: they think you're wonderful! ✨`;
      case 'invite': return `${from} asks: ${m.text.replace(/^Ask \S+ if they want to /, 'want to ').replace(/ with me!$/, ' together?')}`;
      case 'gift': return `A gift from ${from}! 🎁`;
      case 'thanks': return `${from} says thanks for everything!`;
      case 'joke': return `${from} sent a joke: ${m.text.replace(/^Tell \S+ this joke: /, '')}`;
      case 'question': return `${from} wants to know ${m.text.replace(/^Ask \S+ /, '').replace(/\.$/, '')}.`;
      case 'love': return `A letter from ${from}... it smells like perfume 💌`;
      case 'insult': return `Uh... ${from} says: ${m.text.replace(/^Tell \S+: /, '')} Their words, not mine!`;
      case 'apology': return `${from} says they're sorry. They mean it.`;
      case 'gossip': return `${from} wanted you to hear the latest about ${this.sim.byId(m.about)?.name || 'someone'}! 🤫`;
      default: return `A message from ${from}!`;
    }
  }

  /** The recipient's reaction + effects. Returns {say, emoji, anim}. */
  receive(to, m) {
    const sim = this.sim;
    const from = sim.byId(m.from);
    if (!from) return { say: 'Huh, who?', emoji: '❓', anim: 'think' };
    const R = (n) => { to.changeRel(from.id, n); };
    switch (m.kind) {
      case 'compliment': R(5); to.d.happiness = clamp(to.d.happiness + 4, 0, 100); return { say: pick(['Aww, really?!', 'That made my day!']), emoji: '🥰', anim: 'cheer' };
      case 'invite': {
        R(3);
        const yes = to.relScore(from.id) > 0 && chance(0.7);
        if (yes) setTimeout(() => { if (!to.engaged && !from.engaged && sim.residents.includes(to)) sim.goInteract(to, from, 'invite'); }, 2500);
        return yes ? { say: 'Sure! I\'ll go find them!', emoji: '😄', anim: 'cheer' } : { say: 'Hmm, maybe another time.', emoji: '🤔', anim: 'think' };
      }
      case 'gift': R(6); to.d.happiness = clamp(to.d.happiness + 6, 0, 100); return { say: pick(['For me?! How sweet!', 'Wow, thank you!']), emoji: '🎁', anim: 'cheer' };
      case 'thanks': R(4); return { say: 'Aw, tell them anytime!', emoji: '😊', anim: 'wave' };
      case 'joke': R(2); to.d.needs.fun = clamp(to.d.needs.fun + 8, 0, 100); return { say: pick(['HAHAHA! Classic.', 'Pfft, that\'s so bad. I love it.']), emoji: '😂', anim: 'laugh' };
      case 'question': R(2); return { say: pick(['Tell them... pizza! Obviously.', 'I\'m doing great, thanks for asking!', 'Haha, I\'ll answer in person!']), emoji: '💬', anim: 'talk' };
      case 'love':
        R(8);
        if (sim.settings.romance && canRomance(to, from)) sim.social.maybeCrush(to, from);
        return { say: pick(['W-wait, a love letter?! 😳', 'From... them? My heart!', '*reads it twice*']), emoji: '💌', anim: 'shy' };
      case 'insult': R(-7); to.setEmotion('angry', 30); return { say: pick(['EXCUSE me?!', 'Oh, they did NOT.', 'Tell them that\'s rude!']), emoji: '😠', anim: 'angry' };
      case 'apology': { R(5); const rr = to.rel(from.id); rr.grudge = Math.max(0, (rr.grudge || 0) - 25); return { say: pick(['...okay. I forgive them.', 'Tell them apology accepted.']), emoji: '🤝', anim: 'wave' }; }
      case 'gossip': R(2); if (m.about) to.changeRel(m.about, -3); return { say: pick(['No WAY!', 'I knew it!', 'Ooh, juicy!']), emoji: '😮', anim: 'shocked' };
      default: R(1); return { say: 'Thanks!', emoji: '✉️', anim: 'wave' };
    }
  }

  /** Script beats for the carrier (a) visiting someone (b). */
  script(a, b) {
    const sim = this.sim;
    const S = [];
    const T = (say, emoji, expr = { happy: 0.5 }) => ({ anim: 'talk', say, emoji, expr });
    S.push({ dur: 1.8, a: T(pick([`Hi ${b.name}! Mail! 📮`, `Morning, ${b.name}!`, `Special delivery for ${b.name}!`]), '📮'), b: { anim: 'wave', expr: { happy: 0.5 } } });
    // 1) deliver what's waiting for them
    const mine = this.pendingFor(b);
    this.bag = this.bag.filter((m) => m.to !== b.id);
    for (const m of mine.slice(0, 3)) {
      S.push({ dur: Math.min(4.2, 1.8 + this.readOut(m).length * 0.035), a: T(this.readOut(m), '✉️'), b: { anim: 'listen', expr: { surprised: 0.3 } } });
      const re = this.receive(b, m);
      S.push({ dur: 2.2, b: { anim: re.anim, say: re.say, emoji: re.emoji, expr: re.anim === 'angry' ? { angry: 0.8 } : { happy: 0.7 } }, a: { anim: 'idle' } });
    }
    if (!mine.length) S.push({ dur: 1.4, a: T('Nothing for you today, sorry!', '📭') });
    // 2) anything to send?
    S.push({ dur: 1.8, a: T('Any messages to send?', '✉️'), b: { anim: 'think', expr: { happy: 0.2 } } });
    const m = this.compose(b, a);
    if (!m) {
      S.push({ dur: 1.6, b: T(pick(['Not today, thanks!', 'Nope, all good!', 'Hmm... nothing.']), '🙂') });
    } else if (m.to === a.id) {
      // it's for the carrier: just say it
      const re = this.receive(a, m);
      S.push({ dur: Math.min(4, 1.8 + m.direct.length * 0.035), b: T(`Actually, it's for you. ${m.direct}`, m.kind === 'love' ? '💌' : m.kind === 'insult' ? '😤' : '💬'), a: { anim: 'listen', expr: { surprised: 0.6 } } });
      S.push({ dur: 2.2, a: { anim: re.anim, say: re.say, emoji: re.emoji, expr: re.anim === 'angry' ? { angry: 0.8 } : { happy: 0.7 } } });
    } else {
      S.push({ dur: Math.min(4.2, 1.8 + m.text.length * 0.035), b: T(m.text, m.kind === 'love' ? '💌' : m.kind === 'insult' ? '😤' : '✉️'), a: { anim: 'listen' } });
      S.push({ dur: 1.4, a: T(pick(['Got it! I\'ll deliver it.', 'Consider it sent! 📮', 'Will do!']), '👍'), fn: () => { this.bag.push(m); } });
    }
    S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, 2); b.changeRel(a.id, 2); sim.gainXp?.(a, 3); } });
    return S;
  }

  serialize() { return { bag: this.bag, day: this.day, seen: [...this.seen], knocked: [...this.knocked] }; }
  restore(d) {
    if (!d) return;
    this.bag = d.bag || [];
    this.day = d.day ?? -1;
    this.seen = new Set(d.seen || []);
    this.knocked = new Set(d.knocked || []);
  }
}
