// More kinds of everyday interaction, so residents don't just chat and argue:
// high fives, rock-paper-scissors, advice, bragging, playful teasing, secrets,
// sharing a snack, stories, selfies together, complaining about the day,
// outfit talk, comforting a sad friend, a game of tag, thumb wars, a duet —
// and invitations to go and do something together.

import { chance, clamp, pick, rand } from '../core/util.js';
import { activityChoices, planActivity } from './activities.js';

export const EXTRA_FRIENDLY = ['highfive', 'rps', 'advice', 'brag', 'tease', 'secret', 'snack', 'story', 'selfie', 'complain', 'outfitTalk', 'comfort', 'tag', 'thumbwar', 'duet', 'invite'];

/** Weights for the extra kinds (multiplied into chooseKind). */
export function extraWeights(a, b, r, sim) {
  const t = a.t;
  const sad = b.d.happiness < 35 || ['sad', 'hurt'].includes(b.mood?.());
  const hour = sim.minuteOfDay / 60;
  return [
    ['highfive', r > 15 ? 0.8 + t.energy : 0.2],
    ['rps', 0.5 + t.quirk],
    ['advice', 0.4 + (1 - t.confidence) * 1.2],
    ['brag', t.confidence * 1.1],
    ['tease', r > 30 ? 0.4 + t.quirk * 1.2 : 0],
    ['secret', r > 45 ? 0.9 : 0],
    ['snack', a.d.needs.hunger < 70 ? 0.4 + t.kindness : 0.2],
    ['story', 0.4 + t.quirk * 0.8],
    ['selfie', 0.3 + t.sociability * 0.8],
    ['complain', 0.3 + (sim.weather.raining ? 1 : 0) + (a.d.happiness < 40 ? 0.8 : 0)],
    ['outfitTalk', 0.5 + t.sociability * 0.5],
    ['comfort', sad && r > 0 ? 2 + t.kindness * 2 : 0],
    ['tag', r > 20 && !a.inside && !b.inside ? t.energy * 1.2 + t.quirk * 0.5 : 0],
    ['thumbwar', r > 0 ? 0.4 + t.quirk * 0.4 : 0],
    ['duet', r > 25 ? t.sociability * 0.6 + t.quirk * 0.4 : 0],
    ['invite', r > 15 && !a.inside && !b.inside && hour > 8 && hour < 21 ? 1.4 + t.sociability : 0],
  ];
}

const TALK = (say, emoji, expr = { happy: 0.5 }) => ({ anim: 'talk', say, emoji, expr });
const LISTEN = (expr = { happy: 0.3 }, emoji) => ({ anim: 'listen', expr, emoji });
const bond = (a, b, n) => { a.changeRel(b.id, n); b.changeRel(a.id, n); a.d.needs.social = clamp(a.d.needs.social + 15, 0, 100); b.d.needs.social = clamp(b.d.needs.social + 12, 0, 100); };
const fun = (r, n) => { r.d.needs.fun = clamp(r.d.needs.fun + n, 0, 100); };

/** Script steps for one of the extra kinds (or null if it isn't one). */
export function buildExtra(kind, { a, b, sim }) {
  const S = [];
  switch (kind) {
    case 'highfive':
      S.push({ dur: 1.6, a: TALK(pick(['Up top!', 'Gimme five!', 'Yeah! ✋']), '✋', { happy: 0.9 }), b: LISTEN({ happy: 0.7 }) });
      S.push({ dur: 1.4, a: { anim: 'cheer', expr: { happy: 1 }, emoji: '🙌' }, b: { anim: 'cheer', expr: { happy: 1 }, say: pick(['*SMACK*', 'Woo!', 'Nice!']) } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 3); fun(a, 4); fun(b, 4); } });
      break;
    case 'rps': {
      const hands = ['✊ Rock', '✋ Paper', '✌️ Scissors'];
      const ha = pick(hands), hb = pick(hands);
      const win = ha === hb ? 0 : (hands.indexOf(ha) - hands.indexOf(hb) + 3) % 3 === 1 ? 1 : -1;
      S.push({ dur: 1.8, a: TALK('Rock, paper, scissors... shoot!', '✊'), b: TALK('Shoot!', '✊') });
      S.push({ dur: 1.6, a: TALK(ha, ''), b: TALK(hb, '') });
      const winner = win > 0 ? 'a' : 'b';
      if (win === 0) S.push({ dur: 1.8, a: { anim: 'laugh', say: 'A tie?! Again!', expr: { happy: 0.8 } }, b: { anim: 'laugh', expr: { happy: 0.8 } } });
      else S.push({ dur: 2, [winner]: { anim: 'victory', say: pick(['YES! I win!', 'Too easy~', 'Undefeated!']), expr: { happy: 1 }, emoji: '🏆' }, [winner === 'a' ? 'b' : 'a']: { anim: 'sulk', say: pick(['Best two out of three!', 'No fair!', 'Ugh!']), expr: { sad: 0.4 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 2); fun(a, 8); fun(b, 6); } });
      break;
    }
    case 'advice': {
      const topic = pick(['my job', 'what to wear tomorrow', 'a crush', 'saving money', 'learning to cook', 'my sleep schedule']);
      S.push({ dur: 2.6, a: TALK(`Can I ask your advice about ${topic}?`, '🤔', { surprised: 0.2 }), b: LISTEN() });
      const good = b.t.kindness + b.t.confidence > 0.9;
      S.push({ dur: 2.8, b: TALK(good ? pick(['Just be yourself, honestly.', 'Take it one step at a time!', 'Trust your gut on that one.']) : pick(['Uh... flip a coin?', 'No idea. Good luck!', 'Have you tried not worrying about it?']), good ? '💡' : '🤷'), a: LISTEN() });
      S.push({ dur: 1.8, a: TALK(good ? 'That really helps, thanks!' : 'Gee... thanks.', good ? '🙏' : '😑') });
      S.push({ dur: 0.1, fn: () => { bond(a, b, good ? 5 : 1); if (good) a.d.happiness = clamp(a.d.happiness + 4, 0, 100); } });
      break;
    }
    case 'brag': {
      const what = pick(['I hit level ' + a.d.level + ' you know!', 'I caught a HUGE fish yesterday!', 'I did fifty push-ups this morning.', 'Everyone says my outfit is the best on the island.', 'I\'m basically famous around here.']);
      S.push({ dur: 2.6, a: TALK(what, '😎', { happy: 0.7 }), b: LISTEN({ surprised: 0.3 }) });
      const impressed = b.t.kindness > 0.55 || chance(0.4);
      S.push({ dur: 2, b: impressed ? TALK(pick(['Wow, impressive!', 'No way! Cool!']), '🤩') : { anim: 'think', say: pick(['Uh-huh. Sure.', 'Okay, show-off.', '*rolls eyes*']), expr: { angry: 0.2 }, emoji: '🙄' }, a: { anim: impressed ? 'cheer' : 'shy', expr: impressed ? { happy: 1 } : { sad: 0.3 } } });
      S.push({ dur: 0.1, fn: () => { a.changeRel(b.id, impressed ? 3 : -1); b.changeRel(a.id, impressed ? 1 : -2); fun(a, 5); } });
      break;
    }
    case 'tease':
      S.push({ dur: 2.4, a: TALK(pick(['Nice hair. Did you style it with a blender?', 'Is that your serious face? Adorable.', 'You walk like a penguin, you know that?']), '😜', { happy: 0.7 }), b: LISTEN({ surprised: 0.4 }) });
      S.push({ dur: 2, b: { anim: 'laugh', say: pick(['Oh, you\'re one to talk!', 'HEY! Haha.', 'Rude! ...but fair.']), expr: { happy: 0.8 }, emoji: '😆' }, a: { anim: 'laugh', expr: { happy: 1 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 3); fun(a, 6); fun(b, 4); } });
      break;
    case 'secret': {
      const c = sim.residents.find((x) => x !== a && x !== b && a.rel(x.id).met);
      S.push({ dur: 2.2, a: TALK('Psst... can you keep a secret? 🤫', '🤫', { blush: 0.4 }), b: { anim: 'listen', expr: { surprised: 0.4 }, emoji: '👂' } });
      S.push({ dur: 2.6, a: TALK(c ? pick([`I think ${c.name} sings in the shower. Loudly.`, `I once saw ${c.name} talking to a seagull.`, `${c.name} still sleeps with a teddy bear!`]) : 'I\'m secretly scared of fish!', '🤭'), b: { anim: 'shocked', expr: { surprised: 1 }, emoji: '😮' } });
      S.push({ dur: 1.8, b: TALK('My lips are sealed!', '🤐') });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 6); } });
      break;
    }
    case 'snack':
      S.push({ dur: 2.2, a: TALK(sim.dialogue.fill(pick(['Want some of my {food}?', 'I brought extra {food}, here!']), { a, b }), '🍙'), b: LISTEN({ happy: 0.6 }) });
      S.push({ dur: 2.4, a: { anim: 'eatStand', expr: { happy: 0.7 } }, b: { anim: 'eatStand', say: pick(['Mmm, thanks!', 'So good!', 'You\'re the best!']), expr: { happy: 0.9 }, emoji: '😋' } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 5); b.d.needs.hunger = clamp(b.d.needs.hunger + 15, 0, 100); a.d.needs.hunger = clamp(a.d.needs.hunger + 10, 0, 100); } });
      break;
    case 'story':
      S.push({ dur: 3, a: TALK(pick(['So there I was, on the pier, when suddenly...', 'You won\'t believe what happened at the café...', 'Once upon a time, on this very island...']), '📖', { happy: 0.6 }), b: LISTEN({ surprised: 0.3 }) });
      S.push({ dur: 3, a: TALK(pick(['...and then a seagull stole my sandwich!', '...and it turned out it was my own reflection!', '...and that\'s why I don\'t trust ducks.']), '🦆'), b: { anim: 'laugh', expr: { happy: 1 }, emoji: '🤣' } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 4); fun(b, 8); fun(a, 5); } });
      break;
    case 'selfie':
      S.push({ dur: 1.8, a: TALK('Selfie together! Squeeze in!', '📸', { happy: 0.9 }), b: TALK('Okay okay!', '😄') });
      S.push({ dur: 2.2, a: { anim: 'wave', say: 'Say cheese~', expr: { happy: 1 }, emoji: '📸' }, b: { anim: 'cheer', expr: { happy: 1 } } });
      S.push({ dur: 1.6, b: TALK(pick(['Ugh, my eyes were closed!', 'Send me that!', 'We look great!']), '🤳') });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 4); fun(a, 5); fun(b, 5); } });
      break;
    case 'complain': {
      const why = sim.weather.raining ? 'this rain' : pick(['Mondays', 'how hungry I am', 'the seagulls', 'my back', 'how slow the shop line was']);
      S.push({ dur: 2.6, a: TALK(`Ugh, can we talk about ${why}?`, '😩', { sad: 0.4 }), b: LISTEN({ sad: 0.2 }) });
      S.push({ dur: 2.2, b: TALK(pick(['RIGHT?! The worst.', 'Tell me about it...', 'Could be worse, I guess!']), '😮‍💨'), a: { anim: 'sulk', expr: { sad: 0.3 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 3); a.d.happiness = clamp(a.d.happiness + 2, 0, 100); } });
      break;
    }
    case 'outfitTalk': {
      const like = b.t.kindness > 0.4 || chance(0.6);
      S.push({ dur: 2.4, a: TALK(pick(['Where did you get that outfit?', 'Ooh, is that new?', 'I\'ve been thinking about changing my look...']), '👗'), b: LISTEN() });
      S.push({ dur: 2.4, b: TALK(like ? pick(['Thanks! I picked it myself~', 'You should try this style too!', 'Want to go shopping later?']) : pick(['Why, what\'s wrong with it?!', 'It was on sale, okay?']), like ? '😊' : '😤'), a: { anim: like ? 'cheer' : 'shy', expr: like ? { happy: 0.8 } : { surprised: 0.4 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, like ? 4 : -1); } });
      break;
    }
    case 'comfort':
      S.push({ dur: 2.4, a: TALK(pick(['Hey... you okay? You seem down.', 'Want to talk about it?', 'I\'m here for you, you know.']), '🫂', { sad: 0.3 }), b: { anim: 'sulk', expr: { sad: 0.6 } } });
      S.push({ dur: 2.4, a: { anim: 'hug', expr: { happy: 0.5 } }, b: { anim: 'hug', say: pick(['Thanks... I needed that.', '*sniff* You\'re a good friend.']), expr: { happy: 0.4, sad: 0.3 }, emoji: '🥹' } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 8); b.d.happiness = clamp(b.d.happiness + 12, 0, 100); } });
      break;
    case 'thumbwar':
      S.push({ dur: 2, a: TALK('One, two, three, four, I declare a thumb war!', '👍'), b: TALK('You\'re going down!', '👍') });
      S.push({ dur: 2.2, a: { anim: 'argue', expr: { angry: 0.2, happy: 0.5 } }, b: { anim: 'argue', expr: { angry: 0.2, happy: 0.5 } } });
      S.push({ dur: 1.8, [chance(0.5) ? 'a' : 'b']: { anim: 'victory', say: 'PINNED! 👍', expr: { happy: 1 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 3); fun(a, 6); fun(b, 6); } });
      break;
    case 'duet':
      S.push({ dur: 2, a: TALK('Sing with me! You know this one!', '🎤'), b: LISTEN({ happy: 0.6 }) });
      S.push({ dur: 3.2, a: { anim: 'dance', say: '🎵 La la laaa~ 🎵', expr: { happy: 1 } }, b: { anim: 'dance', say: '🎶 Oooh yeah~ 🎶', expr: { happy: 1 } } });
      S.push({ dur: 1.6, a: { anim: 'laugh', expr: { happy: 1 } }, b: { anim: 'laugh', say: 'We should start a band!', expr: { happy: 1 } } });
      S.push({ dur: 0.1, fn: () => { bond(a, b, 5); fun(a, 10); fun(b, 10); } });
      break;
    case 'tag':
      S.push({ dur: 1.4, a: { anim: 'point', say: 'Tag! You\'re it! 😆', expr: { happy: 1 }, emoji: '🏃' }, b: { anim: 'shocked', say: 'Hey! Get back here!', expr: { surprised: 0.8, happy: 0.5 } } });
      S.push({ dur: 0.1, fn: () => {
        bond(a, b, 4); fun(a, 12); fun(b, 12);
        // a runs off, b chases
        const ang = rand(0, Math.PI * 2);
        const tx = a.x + Math.cos(ang) * 8, tz = a.z + Math.sin(ang) * 8;
        const p = sim.island.isBlocked(tx, tz, 1) ? sim.island.randomPoint(4, 30) : { x: tx, z: tz };
        setTimeout(() => {
          if (a.engaged || b.engaged) return;
          a.setPlan([{ kind: 'walk', x: p.x, z: p.z, run: true }, { kind: 'anim', anim: 'laugh', dur: 2.5, emoji: '😆' }]);
          b.setPlan([{ kind: 'walk', x: p.x + 0.8, z: p.z + 0.8, run: true }, { kind: 'anim', anim: 'cheer', dur: 2.5, say: 'Got you! 😆', emoji: '🏃' }]);
        }, 300);
      } });
      break;
    case 'invite': {
      // go and do something together
      const opts = activityChoices(a, sim).filter(([k, w]) => w > 0 && ['hoops', 'playground', 'picnic', 'campfire', 'lookout', 'snack', 'kite', 'sandcastle', 'onsen'].includes(k));
      const pickAct = opts.length ? pick(opts)[0] : 'sandcastle';
      const label = { hoops: 'shoot some hoops', playground: 'hit the playground', picnic: 'have a picnic', campfire: 'sit by the campfire', lookout: 'go stargazing', snack: 'grab a snack', kite: 'fly kites', sandcastle: 'build sandcastles', onsen: 'soak in the hot spring' }[pickAct];
      const yes = b.relScore(a.id) > 10 && (b.d.needs.fun < 85 || chance(0.5));
      S.push({ dur: 2.2, a: TALK(`Hey, wanna ${label} with me?`, '🙋', { happy: 0.7 }), b: LISTEN() });
      S.push({ dur: 1.8, b: TALK(yes ? pick(['Sure, let\'s go!', 'I\'d love to!', 'Race you there!']) : pick(['Maybe later, sorry!', 'Not right now...']), yes ? '😄' : '🙏'), a: { anim: yes ? 'cheer' : 'shy', expr: yes ? { happy: 1 } : { sad: 0.3 } } });
      S.push({ dur: 0.1, fn: () => {
        if (!yes) { a.changeRel(b.id, -1); return; }
        bond(a, b, 5);
        setTimeout(() => {
          if (a.engaged || b.engaged) return;
          a.clearPlan(); b.clearPlan();
          planActivity(a, sim, pickAct);
          planActivity(b, sim, pickAct);
          a.addMemory(`Went to ${label} with ${b.name}`);
        }, 300);
      } });
      break;
    }
    default:
      return null;
  }
  return S;
}
