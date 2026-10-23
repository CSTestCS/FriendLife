// Resident "problems": thought bubbles asking the player for help, like in
// Tomodachi Life. Solving them earns money and makes residents happier.

import { chance, clamp, rand, pick } from '../core/util.js';
import { foodById, INJURIES } from './data.js';
import { TERM_CATEGORIES } from './dialogue.js';
import { JOBS, jobOf, assignJob } from './jobs.js';
import { MISHAPS, fixMishap } from './outfits.js';

const PRIORITY = { drowning: 9, mishap: 2, hurt: 5, sick: 5, heartbroken: 4, revenge: 4, makeUp: 3, sad: 3, confess: 3, soaked: 2, hungry: 2, wantFriend: 1, bored: 1, clothes: 1, teachWord: 1, wantJob: 1, quitJob: 2 };

export const PROBLEM_DEFS = {
  hungry: {
    icon: '🍽️',
    text: (r) => `I'm sooo hungry... Got anything to eat?`,
    options: [{ id: 'feed', label: 'Give food…', needs: 'food' }, { id: 'cafe', label: 'Go eat at the café' }],
  },
  clothes: {
    icon: '👕',
    text: () => `I'm tired of my look. Can I get something new to wear?`,
    options: [{ id: 'wardrobe', label: 'Open wardrobe…', needs: 'wardrobe' }, { id: 'later', label: 'Maybe later' }],
  },
  mishap: {
    icon: '👗',
    text: (r) => {
      const m = r.d.mishap;
      return m ? `${MISHAPS[m.type]?.line || 'Wardrobe mishap!'} Everyone's looking at me...` : 'Never mind!';
    },
    options: [{ id: 'home', label: 'Go home and change' }, { id: 'sew', label: 'Fix it with a Sewing Kit 🧵', needs: 'sewkit' }, { id: 'own', label: 'Own it! 😎' }],
  },
  drowning: {
    icon: '🆘',
    text: () => 'Help! *glub* I can\'t... *glub* swim back!',
    options: [{ id: 'ring', label: 'Throw a Life Ring 🛟', needs: 'lifering' }, { id: 'shout', label: 'Shout for help!' }],
  },
  confess: {
    icon: '💗',
    text: (r, o) => `I have a crush on ${o?.name}... Should I tell them how I feel?`,
    options: [{ id: 'go', label: 'Go for it!' }, { id: 'wait', label: 'Wait a little' }],
  },
  makeUp: {
    icon: '🤝',
    text: (r, o) => `${o?.name} and I had a fight... How can I make up?`,
    options: [{ id: 'apologize', label: 'Apologize' }, { id: 'gift', label: 'Give a gift 🎁', needs: 'gift' }, { id: 'time', label: 'Give it time' }],
  },
  revenge: {
    icon: '😤',
    text: (r, o) => `${o?.name} humiliated me! I want payback!`,
    options: [{ id: 'calm', label: 'Calm down (talk it out)' }, { id: 'payback', label: 'Go get \'em!' }, { id: 'apologize', label: 'Try to make peace' }],
  },
  hurt: {
    icon: '🤕',
    text: (r) => `Ow... I got hurt (${r.d.injuries.map((i) => INJURIES[i.type]?.label).join(', ') || 'bruised'}).`,
    options: [{ id: 'firstaid', label: 'Use First-Aid Kit 🩹', needs: 'firstaid' }, { id: 'clinic', label: 'Go to the clinic' }],
  },
  sick: {
    icon: '🤧',
    text: () => `Achoo! I think I caught a cold from the rain...`,
    options: [{ id: 'medicine', label: 'Give Cold Medicine 💊', needs: 'medicine' }, { id: 'rest', label: 'Rest at home' }],
  },
  soaked: {
    icon: '💦',
    text: () => `I got completely soaked in the rain! Brrr...`,
    options: [{ id: 'towel', label: 'Give a towel 🧺', needs: 'towel' }, { id: 'umbrella', label: 'Give an umbrella ☂️', needs: 'umbrella' }, { id: 'home', label: 'Go home and dry off' }],
  },
  heartbroken: {
    icon: '💔',
    text: (r, o) => `${o?.name}... *sob* My heart hurts...`,
    options: [{ id: 'comfort', label: 'Comfort them' }, { id: 'treat', label: 'Give a treat…', needs: 'food' }],
  },
  sad: {
    icon: '😢',
    text: (r, o) => `${o?.name} was so mean to me...`,
    options: [{ id: 'comfort', label: 'Comfort them' }, { id: 'confront', label: 'Stand up to them!' }],
  },
  wantFriend: {
    icon: '🙋',
    text: (r, o) => `I'd like to be friends with ${o?.name}. Think they'd like me?`,
    options: [{ id: 'go', label: 'Go say hi!' }, { id: 'no', label: 'Not now' }],
  },
  wantJob: {
    icon: '💼',
    text: () => 'I\'m bored of doing nothing all day. Can you help me find a job?',
    options: [{ id: 'pick', label: 'Choose a job…', needs: 'job' }, { id: 'later', label: 'Not right now' }],
  },
  quitJob: {
    icon: '😩',
    text: (r) => `I really don't like being a ${jobOf(r)?.label || 'worker'}... Can I quit?`,
    options: [{ id: 'quit', label: 'Quit the job' }, { id: 'switch', label: 'Try another job…', needs: 'job' }, { id: 'stay', label: 'Hang in there!' }],
  },
  teachWord: {
    icon: '📖',
    text: (r, o, p) => `Hey! Can you teach me a word for ${TERM_CATEGORIES[p?.category]?.ask || 'something fun'}?`,
    options: [{ id: 'teach', label: 'Teach a word…', needs: 'text' }, { id: 'later', label: 'Not now' }],
  },
  bored: {
    icon: '🥱',
    text: () => `I'm bored... What should I do?`,
    options: [{ id: 'dance', label: 'Dance on the stage' }, { id: 'beach', label: 'Relax at the beach' }, { id: 'exercise', label: 'Work out' }],
  },
};

function r_home(sim, res) {
  // back to the wardrobe for fresh clothes (that fixes it)
  if (res.d.mishap) res.d.mishap.owned = false;
  return sim.goChange(res, {});
}

export class Problems {
  constructor(sim) {
    this.sim = sim;
    this.checkTimer = 0;
  }

  offer(res, type, data = {}) {
    if (!res || !PROBLEM_DEFS[type]) return false;
    const cur = res.d.problem;
    if (cur && (PRIORITY[cur.type] || 0) >= (PRIORITY[type] || 0)) return false;
    if (data.other && !this.sim.byId(data.other)) return false;
    res.d.problem = { type, other: data.other || null, category: data.category || null, created: this.sim.clock, expires: this.sim.clock + 60 * 18 };
    this.sim.emit('problem', res);
    this.sim.alert(`${PROBLEM_DEFS[type].icon} ${res.name} has a problem!`, () => this.sim.select(res), 'problem');
    return true;
  }

  describe(res) {
    const p = res.d.problem;
    if (!p) return null;
    const def = PROBLEM_DEFS[p.type];
    const other = p.other ? this.sim.byId(p.other) : null;
    return { ...p, icon: def.icon, text: def.text(res, other, p), options: def.options, other };
  }

  /** Periodic checks for need-based problems. */
  update(gameMin) {
    this.checkTimer -= gameMin;
    if (this.checkTimer > 0) return;
    this.checkTimer = 20;
    const sim = this.sim;
    for (const r of sim.residents) {
      const p = r.d.problem;
      if (p?.type === 'mishap' && !r.d.mishap) { r.d.problem = null; sim.emit('problem', r); }
      if (p && sim.clock > p.expires) {
        r.d.problem = null;
        r.d.happiness = clamp(r.d.happiness - 6, 0, 100);
      }
      if (r.d.problem || r.inside || r.engaged) continue;
      const n = r.d.needs;
      if (n.hunger < 28 && chance(0.4)) this.offer(r, 'hungry');
      else if (r.d.injuries.some((i) => i.type === 'cold')) this.offer(r, 'sick');
      else if (r.d.injuries.length && !r.d.injuries.every((i) => i.treated) && chance(0.3)) this.offer(r, 'hurt');
      else if (r.d.wetness > 0.65 && !r.d.swimWet && chance(0.4)) this.offer(r, 'soaked');
      else if (n.fun < 25 && chance(0.3)) this.offer(r, 'bored');
      else if (chance(0.015)) this.offer(r, 'clothes');
      else if (!jobOf(r) && sim.day > 1 && chance(0.012)) this.offer(r, 'wantJob');
      else if (chance(0.03)) {
        // ask about categories the dictionary has few words for
        const cats = Object.keys(TERM_CATEGORIES).filter((c) => c !== 'insult' || sim.settings.conflict !== 'off');
        cats.sort((x, y) => (sim.dialogue.terms[x]?.length || 0) - (sim.dialogue.terms[y]?.length || 0) + Math.random() * 2 - 1);
        this.offer(r, 'teachWord', { category: cats[0] });
      }
      else if (n.social < 40 && chance(0.12)) {
        const cand = sim.residents.filter((o) => o !== r && r.relScore(o.id) >= 0 && r.relScore(o.id) < 30);
        if (cand.length) this.offer(r, 'wantFriend', { other: cand[Math.floor(Math.random() * cand.length)].id });
      }
    }
  }

  /** Apply the player's choice. Returns a short message for the UI. */
  /**
   * Something new for this resident's closet / look (an added outfit, a
   * restyle, a saved variant, wearing another outfit): answers "I'm tired of
   * my look" however the player got there.
   */
  newLook(res) {
    if (res?.d.problem?.type !== 'clothes') return null;
    const out = this.solve(res, 'wardrobe');
    if (out?.msg) this.sim.toast(`👕 ${out.msg}`);
    return out;
  }

  solve(res, optionId, payload = {}) {
    const sim = this.sim;
    const p = res.d.problem;
    if (!p) return null;
    const other = p.other ? sim.byId(p.other) : null;
    let msg = '';
    let solved = true;
    const reward = () => {
      const coins = Math.round(rand(20, 60));
      sim.money += coins;
      sim.gainXp(res, 25);
      res.d.happiness = clamp(res.d.happiness + 10, 0, 100);
      return coins;
    };
    switch (`${p.type}:${optionId}`) {
      case 'hungry:feed':
      case 'heartbroken:treat': {
        const food = foodById(payload.food);
        if (!food || !sim.useItem(payload.food)) return { error: 'You don\'t have that food.' };
        msg = sim.feed(res, food, true);
        break;
      }
      case 'hungry:cafe':
        res.d.needs.hunger = Math.max(res.d.needs.hunger, 5);
        sim.sendTo(res, 'cafe', 40, () => { res.d.needs.hunger = 100; });
        msg = `${res.name} heads to the café.`;
        solved = true;
        break;
      case 'clothes:wardrobe':
        msg = `${res.name} loves the new look!`;
        res.setEmotion?.('happy', 90);
        res.say?.(pick(['I love it!', 'So fresh!', 'Do I look good? I look good!', 'A whole new me!']));
        break;
      case 'mishap:home':
        if (!r_home(sim, res)) break;
        msg = `${res.name} hurries home to change.`;
        break;
      case 'mishap:sew':
        if (!sim.useItem('sewkit')) return { error: 'You need a 🧵 Sewing Kit (buy one at the shop).' };
        fixMishap(sim, res, true);
        res.say('Good as new! Thank you!', { emoji: '🧵' });
        msg = `${res.name}'s clothes are fixed.`;
        break;
      case 'mishap:own':
        if (res.d.mishap) res.d.mishap.owned = true;
        res.setEmotion('smug', 90);
        res.say('You know what? This is a LOOK.', { emoji: '😎' });
        msg = `${res.name} is rocking the mishap.`;
        break;
      case 'drowning:ring':
        if (!sim.hasItem('lifering')) return { error: 'You need a 🛟 Life Ring (buy one at the shop).' };
        sim.swim?.rescue(res, null, 'ring');
        msg = `You threw ${res.name} a life ring!`;
        break;
      case 'drowning:shout':
        if (!sim.swim?.callForHelp(res)) { solved = false; msg = 'Nobody nearby heard you...'; res.d.problem = { ...p }; return { msg }; }
        msg = 'Someone is swimming out to help!';
        break;
      case 'clothes:later':
        solved = false;
        msg = 'Okay...';
        res.d.happiness -= 3;
        break;
      case 'confess:go':
        if (!other) break;
        sim.goInteract(res, other, 'confess', { boost: 0.1 });
        msg = `${res.name} is going to confess to ${other.name}!`;
        break;
      case 'confess:wait':
        msg = `${res.name} will wait for the right moment.`;
        res.rel(other?.id).crush = true;
        solved = false;
        break;
      case 'makeUp:apologize':
      case 'revenge:apologize':
        if (!other) break;
        sim.goInteract(res, other, 'apology', { boost: 0.15 });
        msg = `${res.name} goes to apologize to ${other.name}.`;
        break;
      case 'makeUp:gift':
        if (!other) break;
        if (!sim.useItem('gift')) return { error: 'You need a 🎁 Gift Box (buy one at the shop).' };
        sim.goInteract(res, other, 'apology', { gift: true, boost: 0.2 });
        msg = `${res.name} brings ${other.name} a gift to make up.`;
        break;
      case 'makeUp:time':
        if (other) res.rel(other.id).grudge = Math.max(0, res.rel(other.id).grudge - 20);
        msg = 'Time heals all wounds... hopefully.';
        break;
      case 'revenge:calm':
        if (other) res.rel(other.id).grudge = Math.max(0, res.rel(other.id).grudge - 40);
        res.setEmotion('neutral', 1);
        msg = `${res.name} took a deep breath and calmed down.`;
        break;
      case 'revenge:payback':
        if (!other) break;
        if (sim.settings.conflict === 'off') { msg = 'Conflicts are turned off in Settings.'; break; }
        sim.goInteract(res, other, 'argue', { revenge: true });
        res.rel(other.id).grudge = 100;
        msg = `${res.name} storms off to confront ${other.name}! Uh oh...`;
        sim.news(`${res.name} went looking for revenge on ${other.name}.`, '😤');
        break;
      case 'hurt:firstaid':
        if (!sim.useItem('firstaid')) return { error: 'You need a 🩹 First-Aid Kit (buy one at the shop).' };
        sim.treat(res);
        msg = `${res.name} feels much better after first aid.`;
        break;
      case 'hurt:clinic':
        sim.sendTo(res, 'clinic', 90, () => sim.clinicTreat(res));
        msg = `${res.name} goes to the clinic.`;
        break;
      case 'sick:medicine':
        if (!sim.useItem('medicine')) return { error: 'You need 💊 Cold Medicine (buy it at the shop).' };
        res.d.injuries = res.d.injuries.filter((i) => i.type !== 'cold');
        res.refreshAttachments();
        msg = `${res.name}'s cold is gone!`;
        break;
      case 'sick:rest': {
        const home = sim.homeOf(res);
        if (home) sim.sendTo(res, `home:${res.id}`, 240, () => { const c = res.d.injuries.find((i) => i.type === 'cold'); if (c) c.remaining *= 0.4; });
        msg = `${res.name} goes home to rest.`;
        break;
      }
      case 'soaked:towel':
        if (!sim.useItem('towel')) return { error: 'You need a 🧺 Towel (buy one at the shop).' };
        res.d.wetness = 0;
        res.d.soakedMinutes = 0;
        res.avatar?.setWetness(0);
        msg = `${res.name} is warm and dry!`;
        break;
      case 'soaked:umbrella':
        if (!sim.useItem('umbrella')) return { error: 'You need a ☂️ Umbrella (buy one at the shop).' };
        res.d.hasUmbrella = true;
        msg = `${res.name} got an umbrella! No more soggy days.`;
        break;
      case 'soaked:home':
        sim.sendTo(res, `home:${res.id}`, 60, () => { res.d.wetness = 0; });
        msg = `${res.name} runs home to dry off.`;
        break;
      case 'heartbroken:comfort':
      case 'sad:comfort':
        res.d.happiness = clamp(res.d.happiness + 15, 0, 100);
        res.setEmotion('neutral', 1);
        res.play('cry');
        res.say('Thank you... I feel a bit better.', { emoji: '🥲' });
        msg = `You comforted ${res.name}.`;
        break;
      case 'sad:confront':
        if (!other) break;
        sim.goInteract(res, other, 'argue', {});
        msg = `${res.name} goes to stand up to ${other.name}.`;
        break;
      case 'wantFriend:go':
        if (!other) break;
        sim.goInteract(res, other, chance(0.5) ? 'chat' : 'compliment', {});
        res.changeRel(other.id, 5);
        other.changeRel(res.id, 8);
        msg = `${res.name} goes to say hi to ${other.name}.`;
        break;
      case 'teachWord:teach': {
        const term = sim.dialogue.addTerm(p.category, payload.text, payload.say, res.id);
        if (!term) return { error: 'Type a word first.' };
        const reply = sim.dialogue.taught(res, term);
        res.clearPlan();
        res.setPlan([{ kind: 'anim', anim: 'cheer', dur: 2.5, expr: { happy: 1 }, emoji: '📖' }]);
        res.say(reply);
        res.addMemory(`Learned the word “${term.text}”`);
        msg = `${res.name} learned “${term.text}” (${TERM_CATEGORIES[p.category].label}).`;
        break;
      }
      case 'wantJob:pick':
      case 'quitJob:switch':
        if (!JOBS[payload.job]) return { error: 'Pick a job first.' };
        assignJob(sim, res, payload.job);
        res.say(`I'm a ${JOBS[payload.job].label} now! ${JOBS[payload.job].icon}`, { emoji: '💼' });
        msg = `${res.name} is now a ${JOBS[payload.job].label}.`;
        break;
      case 'wantJob:later':
        solved = false;
        msg = 'Okay...';
        break;
      case 'quitJob:quit':
        assignJob(sim, res, 'none');
        res.d.happiness = clamp(res.d.happiness + 10, 0, 100);
        msg = `${res.name} quit and feels free!`;
        break;
      case 'quitJob:stay':
        res.d.happiness = clamp(res.d.happiness - 4, 0, 100);
        res.say('*sigh* Okay, I\'ll try my best.', { emoji: '😓' });
        msg = `${res.name} will keep at it.`;
        break;
      case 'teachWord:later':
        msg = 'Maybe next time!';
        solved = false;
        break;
      case 'wantFriend:no':
        msg = 'Okay...';
        break;
      case 'bored:dance':
      case 'bored:beach':
      case 'bored:exercise': {
        const anim = optionId === 'dance' ? 'dance' : optionId === 'beach' ? 'sitGround' : 'exercise';
        const loc = optionId === 'dance' ? sim.locations.stage : optionId === 'beach' ? sim.locations.beach : sim.locations.park;
        res.clearPlan();
        if (optionId === 'dance') {
          const spot = sim.island.stageSpot();
          res.setPlan([{ kind: 'walk', x: spot.entry[0], z: spot.entry[1] }, { kind: 'walk', x: spot.x, z: spot.z }, { kind: 'anim', anim, dur: 15, heading: spot.heading, expr: { happy: 1 } }]);
        } else res.setPlan([{ kind: 'walk', x: loc.x + rand(-1, 1), z: loc.z + rand(-1, 1) }, { kind: 'anim', anim, dur: 15, expr: { happy: 1 } }]);
        res.d.needs.fun = 100;
        msg = `${res.name} is having fun!`;
        break;
      }
      default:
        msg = 'Hmm.';
    }
    res.d.problem = null;
    if (solved) {
      const coins = reward();
      if (sim.isNear(res)) sim.audio.chime();
      msg += ` (+${coins} 🪙)`;
    }
    sim.emit('problem', res);
    return { msg };
  }
}
