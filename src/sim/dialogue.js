// Dialogue + the island dictionary.
//
// Like Tomodachi Life, residents ask the player to teach them words
// ("What's something really tasty?") and then use those words in their
// conversations, jokes, insults and news. Every taught word has an
// optional pronunciation used by the text-to-speech voices.

import { pick, chance, rand } from '../core/util.js';
import { FOODS, foodById } from './data.js';

export const TERM_CATEGORIES = {
  food: { label: 'Food', icon: '🍰', ask: 'something super tasty', defaults: ['spicy ramen', 'strawberry cake', 'grilled cheese', 'mochi', 'nachos'] },
  place: { label: 'Place', icon: '🗺️', ask: 'a place you\'d love to visit', defaults: ['Paris', 'the moon', 'a secret beach', 'Hawaii', 'the mountains'] },
  hobby: { label: 'Hobby', icon: '🎨', ask: 'a really fun hobby', defaults: ['karaoke', 'fishing', 'skateboarding', 'knitting', 'stargazing'] },
  animal: { label: 'Animal', icon: '🐾', ask: 'the cutest animal ever', defaults: ['a red panda', 'a corgi', 'an otter', 'a penguin', 'a hamster'] },
  thing: { label: 'Cool thing', icon: '✨', ask: 'the coolest thing in the world', defaults: ['a rocket ship', 'a disco ball', 'a jetpack', 'a giant robot'] },
  scary: { label: 'Scary thing', icon: '👻', ask: 'something really scary', defaults: ['ghosts', 'spiders', 'the dentist', 'thunder', 'clowns'] },
  song: { label: 'Song', icon: '🎵', ask: 'a catchy song', defaults: ['Island Groove', 'Sunshine Bop', 'Rainy Day Blues', 'Dance Dance Party'] },
  sound: { label: 'Silly sound', icon: '📣', ask: 'a silly noise to make when you\'re excited', defaults: ['Wahoo', 'Boing boing', 'Zoinks', 'Yippee'] },
  nickname: { label: 'Nickname', icon: '🏷️', ask: 'a nickname for a best friend', defaults: ['buddy', 'pal', 'bestie', 'champ', 'sunshine'] },
  compliment: { label: 'Compliment', icon: '💐', ask: 'something nice to call someone', defaults: ['a ray of sunshine', 'a total legend', 'a superstar'] },
  insult: { label: 'Insult', icon: '🗯️', ask: 'a (harmless!) insult', defaults: ['a soggy noodle', 'a grumpy potato', 'a clown', 'a sea cucumber'] },
  dream: { label: 'Dream', icon: '💭', ask: 'something you dream of doing someday', defaults: ['becoming a pop star', 'flying a plane', 'opening a bakery', 'writing a novel'] },
};

// Conversation templates. {a}/{b} = speaker/listener names, {c} = someone else,
// {fav} = speaker's favourite food, {weather}, and any dictionary category.
const CHATS = [
  [['Have you ever tried {food}?', '🍽️'], [['Yes! It\'s amazing!', '😋'], ['Ew, no way!', '🤢'], ['Not yet... is it good?', '🤔']]],
  [['I really want to go to {place} someday.', '✈️'], [['Take me with you!', '🙌'], ['Ooh, that sounds fun!', '😊'], ['Why would anyone go there?', '😒']]],
  [['Wanna try {hobby} with me later?', '🎨'], [['Sure, let\'s do it!', '👍'], ['I\'m terrible at {hobby}...', '😅'], ['Maybe some other time.', '😐']]],
  [['I saw {animal} at the beach today!', '🐾'], [['No way! So cute!', '🥰'], ['Pics or it didn\'t happen.', '🤨']]],
  [['Do you think {scary} are real?', '👻'], [['D-don\'t say that!', '😨'], ['Totally. I\'ve seen them.', '😱'], ['Haha, no way.', '😆']]],
  [['♪ {song} ♪ ... it\'s stuck in my head!', '🎵'], [['Now it\'s stuck in MY head!', '🎶'], ['I love that song!', '💃']]],
  [['{sound}! I\'m in such a good mood!', '😄'], [['Haha, what was that?', '😂'], ['{sound}!!', '🤪']]],
  [['If I had {thing}, I\'d be the happiest person alive.', '✨'], [['Same here!', '🤩'], ['That\'s a weird wish.', '🙃']]],
  [['My dream is {dream}.', '💭'], [['You can do it!', '💪'], ['That\'s so cool!', '🤩'], ['Hmm, good luck with that.', '😏']]],
  [['I could eat {fav} every single day.', '🤤'], [['Me too!', '😋'], ['Every day?! Wow.', '😮']]],
  [['Have you talked to {c} lately?', '🗣️'], [['Yeah, {c} is so nice!', '😊'], ['Ugh, don\'t get me started on {c}.', '😤'], ['Not really. Why?', '🤔']]],
  [['Hey {nickname}! What\'s up?', '👋'], [['Not much, {nickname}!', '😄'], ['Did you just call me {nickname}?', '😳']]],
  [['You\'re {compliment}, you know that?', '💐'], [['Aww, stop it!', '☺️'], ['I know, right?', '😎']]],
  [['This {weather} weather is something else.', '🌤️'], [['I kinda like it.', '😌'], ['I wish it would change.', '😩']]],
  [['I had the weirdest dream about {animal} last night.', '😴'], [['That IS weird!', '😂'], ['Tell me everything!', '👂']]],
  [['Did you hear? {c} is into {hobby} now.', '🤫'], [['Seriously? Wow!', '😲'], ['That figures.', '🙄']]],
  [['I\'m thinking of taking up {hobby}.', '🤔'], [['You\'d be great at it!', '👍'], ['You? Really?', '😆']]],
  [['What\'s your favourite food?', '❓'], [['{fav_b}, obviously!', '😋'], ['Hmm... {food}!', '🍽️']]],
];

const LINES = {
  greet: ['Hey there!', 'Hi hi!', 'Oh, hello {b}!', 'Yo, {b}!', 'Morning!', 'Hey, {nickname}!', '{sound}! Hi!'],
  happy: ['Life is good!', 'What a great day!', '♪♪♪', 'I feel like {hobby} today!', 'I\'m in such a good mood!', '{sound}!'],
  sad: ['*sigh*', 'Today stinks.', 'Nobody likes me...', 'I just want some {food}...', 'I miss {place}...'],
  hungry: ['I\'m starving...', 'My tummy is rumbling.', 'I could really go for some {fav}...', 'Is it lunchtime yet?'],
  sleepy: ['*yawn*', 'So sleepy...', 'Time for bed.', 'Zzz... {animal}... zzz...'],
  insult: ['Nice hair... NOT!', 'Did you dress in the dark?', 'You sing like a seagull!', 'Wow, you\'re SO boring.', 'Who invited you?', 'You\'re such {insult}!', 'You look like {insult}.', 'You smell like {food}!'],
  compliment: ['I love your outfit!', 'You\'re so cool!', 'Your hair looks great today!', 'You always cheer me up!', 'You\'re {compliment}!', 'You\'re as cool as {thing}!'],
  joke: ['Why did the fish blush? It saw the ocean\'s bottom!', 'I told my plant a joke. It didn\'t laugh. Too green.', 'What do you call {animal} in a hat? Fancy!', 'I tried {hobby} once. Once!', 'Knock knock!'],
  argue: ['You never returned my umbrella!', 'You ate my {food}, didn\'t you?!', 'That\'s NOT what you said!', 'Stop copying me!', 'You were rude yesterday!', 'Admit it, you were wrong!', 'You said {hobby} was dumb!', 'You told {c} my secret!'],
  argueBack: ['Says YOU!', 'Whatever!', 'As if!', 'That\'s ridiculous!', 'You\'re the problem!', 'Prove it!', 'Oh yeah?!', 'Go eat some {food}!'],
  taught: ['{term}! I\'ll remember that!', '{term}... {term}... Got it!', 'Ooh, {term}! I love it!', '{term}? Hehe, that\'s a good one!'],
  weatherRain: ['It\'s pouring!', 'Rain, rain, go away...', 'I love the sound of rain.', 'My hair is ruined!'],
  weatherSnow: ['Snow!!', 'It\'s freezing!', 'Let\'s build a snowman!'],
  weatherStorm: ['Eek! Thunder!', 'So scary!', 'Is the island going to blow away?!'],
  weatherSun: ['What a beautiful day!', 'Perfect weather for {hobby}!', 'Sunshine! {sound}!'],
};

const WEATHER_WORD = { sunny: 'sunny', partly: 'cloudy', cloudy: 'gloomy', drizzle: 'drizzly', rain: 'rainy', storm: 'stormy', snow: 'snowy', fog: 'foggy' };

export class Dialogue {
  constructor(sim) {
    this.sim = sim;
    this.terms = {}; // category -> [{id, text, say, by, at}]
    for (const k of Object.keys(TERM_CATEGORIES)) this.terms[k] = [];
  }

  addTerm(category, text, say = '', byId = null) {
    text = String(text || '').trim().slice(0, 40);
    if (!text || !TERM_CATEGORIES[category]) return null;
    const list = (this.terms[category] ||= []);
    const existing = list.find((t) => t.text.toLowerCase() === text.toLowerCase());
    if (existing) { if (say) existing.say = say; return existing; }
    const term = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text, say: String(say || '').trim().slice(0, 60), by: byId, at: this.sim.clock };
    list.push(term);
    this.sim.emit('terms');
    return term;
  }

  removeTerm(category, id) {
    this.terms[category] = (this.terms[category] || []).filter((t) => t.id !== id);
    this.sim.emit('terms');
  }

  /** A word from the dictionary. Residents prefer words they were taught themselves. */
  term(category, res = null) {
    const list = this.terms[category] || [];
    if (list.length && (chance(0.85) || !TERM_CATEGORIES[category]?.defaults?.length)) {
      const mine = res ? list.filter((t) => t.by === res.id) : [];
      const t = mine.length && chance(0.6) ? pick(mine) : pick(list);
      return { text: t.text, say: t.say || t.text };
    }
    const d = pick(TERM_CATEGORIES[category]?.defaults || ['something']);
    return { text: d, say: d };
  }

  /** Fill {placeholders}. Returns {text, say} where say uses pronunciations. */
  fill(template, ctx = {}) {
    let say = template;
    const text = template.replace(/\{(\w+)\}/g, (m, key) => {
      let v;
      if (key === 'a') v = { text: ctx.a?.name || '', say: ctx.a?.d.sayName || ctx.a?.name || '' };
      else if (key === 'b') v = { text: ctx.b?.name || 'friend', say: ctx.b?.d.sayName || ctx.b?.name || 'friend' };
      else if (key === 'c') v = { text: ctx.c?.name || 'someone', say: ctx.c?.d.sayName || ctx.c?.name || 'someone' };
      else if (key === 'fav') { const f = foodById(ctx.a?.d.favFood) || pick(FOODS); v = { text: f.name.toLowerCase(), say: f.name }; }
      else if (key === 'fav_b') { const f = foodById(ctx.b?.d.favFood) || pick(FOODS); v = { text: f.name, say: f.name }; }
      else if (key === 'weather') { const w = WEATHER_WORD[this.sim.weather.type] || 'nice'; v = { text: w, say: w }; }
      else if (key === 'term') v = ctx.term || { text: '', say: '' };
      else if (TERM_CATEGORIES[key]) {
        ctx.cache ||= {};
        v = ctx.cache[key] ||= this.term(key, ctx.a);
      } else v = { text: m, say: m };
      say = say.replace(m, v.say);
      return v.text;
    });
    return { text, say };
  }

  line(key, ctx = {}) {
    const pool = LINES[key];
    if (!pool) return { text: '...', say: '' };
    return this.fill(pick(pool), ctx);
  }

  /** Reaction line when the player teaches a word. */
  taught(res, term) {
    return this.fill(pick(LINES.taught), { a: res, term: { text: term.text, say: term.say || term.text } });
  }

  /** A multi-line exchange for a friendly chat: [{who:'a'|'b', text, say, emoji}] */
  chat(a, b) {
    const sim = this.sim;
    const others = sim.residents.filter((r) => r !== a && r !== b);
    const ctx = { a, b, c: others.length ? pick(others) : null };
    let pool = CHATS;
    if (!ctx.c) pool = pool.filter(([q]) => !q[0].includes('{c}'));
    const rel = b.relScore(a.id);
    const [q, answers] = pick(pool);
    const first = this.fill(q[0], ctx);
    // answer tone depends on how b feels about a
    let ans;
    if (answers.length > 1) ans = rel > 30 || chance(0.6) ? answers[0] : pick(answers.slice(1));
    else ans = answers[0];
    const second = this.fill(ans[0], { ...ctx, a: b, b: a, cache: ctx.cache });
    const out = [{ who: 'a', ...first, emoji: q[1] }, { who: 'b', ...second, emoji: ans[1] }];
    if (chance(0.4)) {
      const extra = this.fill(pick(['Haha!', 'Right?', 'Totally!', 'Anyway...', '{sound}!', 'You\'re funny, {b}.', 'Let\'s hang out more!']), ctx);
      out.push({ who: 'a', ...extra, emoji: '' });
    }
    return out;
  }

  serialize() { return { terms: this.terms }; }

  restore(d) {
    if (!d?.terms) return;
    for (const k of Object.keys(TERM_CATEGORIES)) this.terms[k] = Array.isArray(d.terms[k]) ? d.terms[k] : [];
  }
}
