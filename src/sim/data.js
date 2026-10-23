// Static game data: foods, items, injuries, personalities and dialogue.
import { pick } from '../core/util.js';

export const FOODS = [
  { id: 'onigiri', name: 'Rice Ball', icon: '🍙', price: 12 },
  { id: 'pizza', name: 'Pizza', icon: '🍕', price: 28 },
  { id: 'ramen', name: 'Ramen', icon: '🍜', price: 30 },
  { id: 'cake', name: 'Strawberry Cake', icon: '🍰', price: 35 },
  { id: 'burger', name: 'Burger', icon: '🍔', price: 25 },
  { id: 'sushi', name: 'Sushi', icon: '🍣', price: 40 },
  { id: 'salad', name: 'Salad', icon: '🥗', price: 18 },
  { id: 'curry', name: 'Curry', icon: '🍛', price: 26 },
  { id: 'donut', name: 'Donut', icon: '🍩', price: 14 },
  { id: 'apple', name: 'Apple', icon: '🍎', price: 8 },
  { id: 'taco', name: 'Taco', icon: '🌮', price: 20 },
  { id: 'pancakes', name: 'Pancakes', icon: '🥞', price: 22 },
  { id: 'icecream', name: 'Ice Cream', icon: '🍦', price: 15 },
  { id: 'fish', name: 'Grilled Fish', icon: '🐟', price: 24 },
  { id: 'dumplings', name: 'Dumplings', icon: '🥟', price: 22 },
  { id: 'broccoli', name: 'Steamed Broccoli', icon: '🥦', price: 10 },
];
export const foodById = (id) => FOODS.find((f) => f.id === id);

export const ITEMS = [
  { id: 'firstaid', name: 'First-Aid Kit', icon: '🩹', price: 60, desc: 'Treats injuries: halves healing time and eases pain.' },
  { id: 'towel', name: 'Fluffy Towel', icon: '🧺', price: 20, desc: 'Dries off a soaked resident instantly.' },
  { id: 'umbrella', name: 'Umbrella', icon: '☂️', price: 80, desc: 'Give to a resident. They keep it and stay dry in the rain.' },
  { id: 'gift', name: 'Gift Box', icon: '🎁', price: 50, desc: 'A present. Great for cheering up or making up after a fight.' },
  { id: 'medicine', name: 'Cold Medicine', icon: '💊', price: 35, desc: 'Cures a cold.' },
  { id: 'sewkit', name: 'Sewing Kit', icon: '🧵', price: 25, desc: 'Fixes torn or split clothes on the spot.' },
  { id: 'lifering', name: 'Life Ring', icon: '🛟', price: 40, desc: 'Throw it to a resident in trouble in the water. Reusable.' },
];
export const itemById = (id) => ITEMS.find((i) => i.id === id);

export const INJURIES = {
  bruise: { label: 'Bruise', icon: '🟣', severity: 1, heal: 8 * 60, pain: 5 },
  blackEye: { label: 'Black Eye', icon: '👁️', severity: 1, heal: 18 * 60, pain: 8, visual: 'plaster' },
  cutLip: { label: 'Split Lip', icon: '🩸', severity: 1, heal: 10 * 60, pain: 6, visual: 'plaster' },
  brokenNose: { label: 'Broken Nose', icon: '👃', severity: 2, heal: 36 * 60, pain: 14, visual: 'plaster' },
  sprain: { label: 'Sprained Ankle', icon: '🦶', severity: 2, heal: 30 * 60, pain: 12, effect: 'limp' },
  concussion: { label: 'Concussion', icon: '💫', severity: 2, heal: 16 * 60, pain: 10, effect: 'dizzy', visual: 'headBandage' },
  brokenArm: { label: 'Broken Arm', icon: '🦴', severity: 3, heal: 72 * 60, pain: 18, effect: 'sling', visual: 'sling' },
  waterlogged: { label: 'Swallowed Water', icon: '🌊', severity: 2, heal: 6 * 60, pain: 9, effect: 'dizzy' },
  cold: { label: 'Cold', icon: '🤧', severity: 1, heal: 20 * 60, pain: 6, effect: 'sneeze', illness: true },
};

export const TRAITS = [
  { key: 'temper', label: 'Temper', lo: 'Calm', hi: 'Hotheaded' },
  { key: 'kindness', label: 'Kindness', lo: 'Blunt', hi: 'Kind' },
  { key: 'sociability', label: 'Sociability', lo: 'Shy', hi: 'Outgoing' },
  { key: 'confidence', label: 'Confidence', lo: 'Timid', hi: 'Bold' },
  { key: 'energy', label: 'Energy', lo: 'Laid-back', hi: 'Hyper' },
  { key: 'quirk', label: 'Quirkiness', lo: 'Normal', hi: 'Quirky' },
];

export function personalityLabel(t) {
  if (t.temper > 0.7 && t.confidence > 0.6) return 'Hothead';
  if (t.temper > 0.7) return 'Short-fused';
  if (t.kindness > 0.7 && t.sociability > 0.6) return 'Sweetheart';
  if (t.sociability > 0.7 && t.energy > 0.6) return 'Social Butterfly';
  if (t.confidence > 0.7) return 'Go-getter';
  if (t.sociability < 0.3 && t.confidence < 0.4) return 'Wallflower';
  if (t.sociability < 0.35) return 'Lone Wolf';
  if (t.quirk > 0.7) return 'Free Spirit';
  if (t.energy < 0.3) return 'Easygoing';
  if (t.kindness < 0.3) return 'Straight Shooter';
  return 'Balanced';
}

export const NAMES = [
  'Aiko', 'Ben', 'Chloe', 'Daichi', 'Emma', 'Felix', 'Gina', 'Hiro', 'Iris', 'Jun', 'Kai', 'Luna', 'Milo', 'Nina',
  'Oscar', 'Pia', 'Quinn', 'Rex', 'Sora', 'Tess', 'Uma', 'Vince', 'Wren', 'Yuki', 'Zane', 'Mika', 'Theo', 'Rin',
];

export const CATCHPHRASES = ['Yahoo!', 'No way!', 'Groovy!', 'Oh snap!', 'Wowee!', 'Fiddlesticks!', 'Let\'s go!', 'Hmm hmm!', 'Booyah!', 'Oh my!'];

export const TOPICS = ['🍕', '🎮', '🌊', '🎵', '📚', '⚽', '🐱', '🌸', '🍰', '🎨', '🚀', '👗', '🌧️', '🎤', '🐟', '🍜'];

export const LINES = {
  greet: ['Hey there!', 'Hi hi!', 'Oh, hello!', 'Yo!', 'Morning!'],
  chat: ['Did you see the sunset yesterday?', 'I tried a new recipe!', 'I had the weirdest dream...', 'The café has a new menu!', 'I love this island.', 'Want to hang out later?'],
  joke: ['Why did the fish blush? It saw the ocean\'s bottom!', 'I told my plant a joke. It didn\'t laugh. Too green.', 'Knock knock!'],
  compliment: ['I love your outfit!', 'You\'re so cool!', 'Your hair looks great today!', 'You always cheer me up!'],
  argue: ['You never returned my umbrella!', 'You ate my pudding, didn\'t you?!', 'That\'s NOT what you said!', 'Stop copying me!', 'You were rude yesterday!', 'Admit it, you were wrong!'],
  argueBack: ['Says YOU!', 'Whatever!', 'As if!', 'That\'s ridiculous!', 'You\'re the problem!', 'Prove it!'],
  insult: ['Nice hair... NOT!', 'Did you dress in the dark?', 'You sing like a seagull!', 'Wow, you\'re SO boring.', 'Who invited you?'],
  hurtReply: ['That\'s so mean...', 'Why would you say that?!', '*sniff*'],
  angryReply: ['Take that back!', 'What did you say?!', 'Say that again!', 'You want to go?!'],
  prank: ['BOO!', 'Gotcha!', 'Surprise!'],
  jealous: ['Stay away from {c}!', 'What are you doing with {c}?!', '{c} is MINE!', 'I saw you with {c}!'],
  cold: ['Hmph!', '...', 'Not talking to you.', 'Go away.'],
  confess: ['I... I really like you!', 'Will you go out with me?', 'You make my heart go doki-doki!'],
  accept: ['Yes! Me too!', 'I thought you\'d never ask!', 'Of course!'],
  reject: ['Sorry... let\'s stay friends.', 'Oh... I don\'t feel the same way.', 'Um... no thanks.'],
  apology: ['I\'m sorry about before...', 'Can we make up?', 'I was wrong. Sorry.'],
  forgive: ['It\'s okay. Friends again?', 'Apology accepted!', 'Let\'s forget about it.'],
  unforgiving: ['Not yet. I\'m still mad.', 'Hmph. Too late.', 'Leave me alone.'],
  breakup: ['I think we should break up.', 'This isn\'t working anymore.', 'It\'s over!'],
  fightStart: ['That\'s it!', 'You asked for it!', 'Put \'em up!', 'Bring it on!', 'Come at me!'],
  fightHit: ['POW!', 'BAM!', 'WHAM!', 'SMACK!', 'THWACK!', 'OOF!'],
  fightMiss: ['Missed!', 'Too slow!', 'Whoosh!'],
  stopFight: ['Stop it, you two!', 'Break it up!', 'Enough!'],
  victory: ['Hah! Who\'s the boss now?', 'And STAY down!', 'Too easy!'],
  defeat: ['Ow ow ow...', 'Not fair...', 'I\'ll get you next time...'],
  hurt: ['Ow...', 'It hurts...', 'Ouch!'],
  soaked: ['I\'m soaked!', 'Brrr...', 'So wet...', 'My clothes!'],
  rain: ['It\'s pouring!', 'Rain, rain, go away...', 'I love the rain!'],
  snow: ['Snow!!', 'It\'s freezing!', 'Let\'s build a snowman!'],
  storm: ['Eek! Thunder!', 'So scary!'],
  hungry: ['I\'m starving...', 'My tummy is rumbling.'],
  sleepy: ['*yawn*', 'So sleepy...'],
  happy: ['Life is good!', 'What a great day!', '♪♪♪'],
  sad: ['*sigh*', 'Today stinks.', 'Nobody likes me...'],
  dance: ['Dance-off!', 'Watch my moves!', 'Groove time!'],
  slip: ['Whoa-!', 'Waaah!', 'Slippery!'],
  sneeze: ['Achoo!', 'Ah-choo!'],
};

export function line(key, vars = {}) {
  const l = pick(LINES[key] || ['...']);
  return l.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const DOLL_PALETTES = {
  skin: ['#ffe0c7', '#f2c9a5', '#e0ac82', '#c68c62', '#9c6a46', '#6e4a31'],
  hair: ['#1e1a1a', '#4a3328', '#7a4a2a', '#c58b4b', '#e8c77a', '#e05a4f', '#5b7bd6', '#e58ad1', '#a0a0a0', '#68c19b'],
  top: ['#5aa9e6', '#ff6b6b', '#ffd166', '#06d6a0', '#9b5de5', '#f15bb5', '#ffffff', '#2d3142', '#ff9f1c', '#8ac926'],
  bottom: ['#34495e', '#2d3142', '#5e548e', '#8d6346', '#1d3557', '#e5e5e5', '#d62828', '#4a4e69'],
  shoes: ['#6b4b3a', '#222222', '#ffffff', '#c1121f', '#3a86ff'],
};
