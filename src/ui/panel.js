// Side panel for the selected resident.
import { $, h, esc, bar, openModal, toast, confirmBox } from './dom.js';
import { personalityLabel, INJURIES, FOODS, foodById, itemById } from '../sim/data.js';
import { PROBLEM_DEFS } from '../sim/problems.js';
import { formatClock } from '../core/util.js';
import { closetSection } from './closet.js';
import { jobSection, openJobPicker } from './rooms.js';
import { openVoiceEditor } from './voiceEditor.js';
import { assignJob } from '../sim/jobs.js';
import { askWord } from './dictionary.js';
import { TERM_CATEGORIES } from '../sim/dialogue.js';

export class Panel {
  constructor(app) {
    this.app = app;
    this.sim = app.sim;
    this.el = $('#panel');
    this.res = null;
    this.timer = 0;
    this.sim.on('select', (r) => this.show(r));
    this.sim.on('problem', (r) => { if (r === this.res) this.render(); });
    this.sim.on('resident', (r) => { if (r === this.res) this.render(); });
    this.sim.on('inventory', () => this.res && this.render());
  }

  show(res) {
    this.res = res;
    this.el.classList.toggle('hidden', !res);
    if (res) this.render();
  }

  render() {
    const r = this.res;
    if (!r) return;
    const sim = this.sim;
    const el = this.el;
    el.innerHTML = '';
    const loc = r.inside ? sim.placeName(r.inside) : r.engaged?.isFight ? 'Fighting!' : 'Outside';
    el.append(h('div', { class: 'panel-head' },
      h('div', { class: 'big' }, r.moodIcon()),
      h('div', {}, h('h2', {}, r.name), h('div', { class: 'meta' }, `${personalityLabel(r.t)} · Lv ${r.d.level} · ${loc}`)),
      h('button', { class: 'close small', onclick: () => sim.select(null) }, '✕'),
    ));

    // problem
    const prob = sim.problems.describe(r);
    if (prob) {
      const box = h('div', { class: 'problem-box' }, h('div', { class: 'q' }, `${prob.icon} “${prob.text}”`));
      const opts = h('div', { class: 'opts' });
      for (const o of prob.options) {
        opts.append(h('button', { class: 'small primary', onclick: () => this.solve(o) }, o.label));
      }
      box.append(opts);
      el.append(box);
    }

    // stats
    this.statsEl = h('div', {});
    el.append(h('h3', {}, 'Status'), this.statsEl);
    this.renderStats();

    // actions
    el.append(h('h3', {}, 'Interact'));
    const fight = sim.fights.fightOf(r);
    const A = (label, fn, opts = {}) => h('button', { title: opts.title || '', disabled: !!opts.disabled, class: opts.cls || '', onclick: fn }, label);
    const inv = sim.inventory;
    el.append(h('div', { class: 'actions' },
      fight ? A('✋ Stop Fight!', () => { sim.fights.stop(fight); sim.alert('You broke up the fight.'); this.render(); }, { cls: 'danger' }) : null,
      A('💬 Talk', () => { const m = sim.talkTo(r); if (m) toast(m); }),
      A('🍙 Feed…', () => this.foodPicker((f) => toast(sim.feed(r, f)))),
      A(`🎁 Gift (${inv.gift || 0})`, () => toast(sim.giveGift(r)), { disabled: !inv.gift }),
      A(`🩹 First Aid (${inv.firstaid || 0})`, () => { if (sim.useItem('firstaid')) { sim.treat(r); toast(`${r.name} was treated.`); } }, { disabled: !inv.firstaid || !r.d.injuries.length }),
      A(`🧺 Towel (${inv.towel || 0})`, () => toast(sim.giveTowel(r)), { disabled: !inv.towel || r.d.wetness < 0.05 }),
      A(r.d.hasUmbrella ? '☂️ Has umbrella' : `☂️ Umbrella (${inv.umbrella || 0})`, () => toast(sim.giveUmbrella(r)), { disabled: r.d.hasUmbrella || !inv.umbrella }),
      A(`💊 Medicine (${inv.medicine || 0})`, () => { if (sim.useItem('medicine')) { r.d.injuries = r.d.injuries.filter((i) => i.type !== 'cold'); r.refreshAttachments(); toast(`${r.name} feels better!`); this.render(); } }, { disabled: !inv.medicine || !r.hasEffect('sneeze') }),
      A('🤗 Comfort', () => toast(sim.comfort(r))),
      A('🤝 Set Up…', () => this.setupInteraction(), { title: 'Make this resident interact with someone' }),
      A('🎬 Animate…', () => this.animPicker()),
      A('🏥 Clinic', () => { sim.sendTo(r, 'clinic', 90, () => sim.clinicTreat(r)); toast(`${r.name} is heading to the clinic.`); }, { disabled: !r.d.injuries.length }),
      A('🏠 Go Home', () => { sim.sendTo(r, `home:${r.id}`, 120); }),
      A('📖 Teach word', () => this.teachWord()),
      A('🎙️ Voice', () => openVoiceEditor(this.app, r.d.voice, { name: r.name, catchphrase: r.d.catchphrase })),
      r.inside && r.room ? A('👀 Look inside', () => this.app.viewRoom(r.inside)) : A('🏡 Their home', () => this.app.viewRoom(`home:${r.id}`)),
      A('👕 Wardrobe', () => this.app.openWardrobe(r)),
      A('✏️ Edit', () => this.app.openCreator(r)),
    ));

    // job
    el.append(h('h3', {}, 'Job'), jobSection(this.app, r, () => this.render()));

    // closet (personal alternate outfits / models)
    el.append(h('h3', {}, 'Closet'), closetSection(this.app, r, () => this.render()));

    // injuries
    if (r.d.injuries.length) {
      el.append(h('h3', {}, 'Injuries'));
      const tags = h('div', { class: 'tagrow' });
      for (const i of r.d.injuries) {
        const def = INJURIES[i.type];
        const hrs = Math.ceil(i.remaining / 60);
        tags.append(h('span', { class: 'tag bad', title: def.effect ? `Effect: ${def.effect}` : '' }, `${def.icon} ${def.label} · ${hrs}h${i.treated ? ' · treated' : ''}`));
      }
      el.append(tags);
    }

    // about
    const fav = r.knownFood?.[r.d.favFood] ? `${foodById(r.d.favFood)?.icon} ${foodById(r.d.favFood)?.name}` : '❓ (feed them to find out)';
    const hate = r.knownFood?.[r.d.hatedFood] ? `${foodById(r.d.hatedFood)?.icon} ${foodById(r.d.hatedFood)?.name}` : '❓';
    el.append(h('h3', {}, 'About'), h('div', { class: 'meta', html: `Favourite food: <b>${esc(fav)}</b><br>Can't stand: <b>${esc(hate)}</b><br>Catchphrase: <b>“${esc(r.d.catchphrase)}”</b><br>Avatar: <b>${r.d.look.kind === 'vrm' ? esc(sim.library.displayName(r.d.look.assetId)) : 'Built-in doll'}</b>${r.d.outfit ? ` · Outfit: <b>${esc(sim.library.displayName(r.d.outfit.assetId))}</b>` : ''}` }));

    // relationships
    el.append(h('h3', {}, 'Relationships'));
    const others = sim.residents.filter((o) => o !== r).sort((a, b) => r.relScore(b.id) - r.relScore(a.id));
    if (!others.length) el.append(h('div', { class: 'meta' }, 'Nobody else lives here yet.'));
    for (const o of others) {
      const rel = r.d.relationships[o.id];
      const lab = r.relLabel(o.id);
      const s = rel?.score ?? 0;
      const fill = s >= 0 ? `left:50%;width:${s / 2}%;background:var(--good)` : `right:50%;width:${-s / 2}%;background:var(--bad)`;
      const extra = [rel?.grudge > 30 ? '😤' : '', rel?.fights ? `🥊${rel.fights}` : ''].join(' ');
      el.append(h('div', { class: 'rel-row', title: `Score ${Math.round(s)}${rel?.grudge ? ` · grudge ${Math.round(rel.grudge)}` : ''}`, onclick: () => sim.select(o) },
        h('span', {}, lab.icon), h('span', {}, h('b', {}, o.name), ` ${lab.label} ${extra}`),
        h('div', { class: 'mini', html: `<i style="${fill}"></i>` })));
    }

    // memories
    if (r.d.memories.length) {
      el.append(h('h3', {}, 'Diary'));
      for (const m of r.d.memories.slice(0, 6)) el.append(h('div', { class: 'meta' }, `Day ${Math.floor(m.at / 1440) + 1} ${formatClock(m.at % 1440)} — ${m.text}`));
    }
    el.append(h('div', { style: { marginTop: '14px' } }, h('button', { class: 'danger small', onclick: async () => { if (await confirmBox(`Say goodbye to ${r.name}? They will move off the island.`, 'Move away')) sim.removeResident(r); } }, '🧳 Move away')));
  }

  renderStats() {
    const r = this.res;
    if (!r || !this.statsEl) return;
    const n = r.d.needs;
    this.statsEl.innerHTML = [
      bar('😊 Happiness', r.d.happiness, '#ff8a5b'),
      bar('🍙 Fullness', n.hunger),
      bar('⚡ Energy', n.energy),
      bar('🎈 Fun', n.fun),
      bar('💬 Social', n.social),
      bar('❤️ Health', r.health),
      bar('💧 Wetness', r.d.wetness * 100, '#4fb3e8'),
      bar('⭐ Level XP', r.d.xp, '#f2b134'),
    ].join('');
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0 && this.res) {
      this.timer = 0.5;
      this.renderStats();
      if (!this.sim.residents.includes(this.res)) this.show(null);
    }
  }

  solve(option) {
    const r = this.res;
    const sim = this.sim;
    const finish = (payload) => {
      const out = sim.problems.solve(r, option.id, payload);
      if (out?.error) toast(out.error);
      else if (out?.msg) toast(out.msg);
      this.render();
    };
    if (option.needs === 'food') return this.foodPicker((f) => finish({ food: f.id }), true);
    if (option.needs === 'wardrobe') { this.app.openWardrobe(r, () => finish({})); return; }
    if (option.needs === 'job') {
      openJobPicker(this.app, r, (id) => finish({ job: id }));
      return;
    }
    if (option.needs === 'text') {
      const cat = TERM_CATEGORIES[r.d.problem?.category];
      askWord(this.app, `${r.name} wants to learn a word`, `“${sim.problems.describe(r)?.text}”`).then((w) => { if (w) finish(w); });
      return;
    }
    finish({});
  }

  teachWord() {
    const r = this.res;
    const sim = this.sim;
    const m = openModal({
      title: `Teach ${r.name} a word`,
      body: (b) => {
        b.append(h('p', { class: 'hint' }, 'Pick what kind of word it is. They\'ll use it when they talk!'));
        const grid = h('div', { class: 'row' });
        for (const [cat, def] of Object.entries(TERM_CATEGORIES)) {
          grid.append(h('button', { class: 'small', onclick: async () => {
            m.close();
            const w = await askWord(this.app, `${def.icon} ${def.label}`, `${r.name}: “What's ${def.ask}?”`);
            if (!w) return;
            const term = sim.dialogue.addTerm(cat, w.text, w.say, r.id);
            if (!term) return;
            if (!r.inside && !r.engaged) { r.clearPlan(); r.setPlan([{ kind: 'anim', anim: 'cheer', dur: 2.5, expr: { happy: 1 }, emoji: '📖' }]); }
            r.say(sim.dialogue.taught(r, term));
            r.addMemory(`Learned the word “${term.text}”`);
            sim.gainXp(r, 8);
            toast(`${r.name} learned “${term.text}”.`);
          } }, `${def.icon} ${def.label}`));
        }
        b.append(grid);
      },
    });
  }

  foodPicker(cb, onlyOwned = false) {
    const sim = this.sim;
    const m = openModal({
      title: `Feed ${this.res.name}`,
      body: (b) => {
        const owned = FOODS.filter((f) => sim.inventory[f.id]);
        if (!owned.length) b.append(h('div', { class: 'empty' }, 'You have no food. Buy some at the 🛍️ Shop!'));
        const grid = h('div', { class: 'grid3' });
        for (const f of owned) {
          grid.append(h('div', { class: 'shop-item' }, h('div', { class: 'ic' }, f.icon), h('b', {}, f.name), h('div', { class: 'hint' }, `x${sim.inventory[f.id]}`),
            h('button', { class: 'primary small', onclick: () => { m.close(); cb(f); } }, 'Give')));
        }
        b.append(grid);
      },
      foot: (f) => f.append(h('button', { onclick: () => { m.close(); this.app.openShop(); } }, '🛍️ Go to shop')),
    });
  }

  animPicker() {
    const r = this.res;
    const reg = this.sim.registry;
    openModal({
      title: `Play an animation on ${r.name}`,
      body: (b) => {
        const grid = h('div', { class: 'row' });
        const play = (name) => { if (r.inside) return toast(`${r.name} is inside.`); if (r.engaged) return toast(`${r.name} is busy.`); r.clearPlan(); r.setPlan([{ kind: 'anim', anim: name, dur: 6, expr: { happy: 0.4 } }]); };
        for (const name of reg.builtins.keys()) grid.append(h('button', { class: 'small', onclick: () => play(name) }, name));
        b.append(h('div', { class: 'lbl' }, 'Built-in'), grid);
        const custom = h('div', { class: 'row' });
        for (const [id, clip] of reg.custom) custom.append(h('button', { class: 'small blue', onclick: () => play(id) }, clip.label || clip.name));
        b.append(h('div', { class: 'lbl', style: { marginTop: '10px' } }, 'Imported / custom'), reg.custom.size ? custom : h('div', { class: 'hint' }, 'Import .vrma or make one in the 🎬 Studio.'));
      },
    });
  }

  setupInteraction() {
    const r = this.res;
    const sim = this.sim;
    const kinds = [
      ['chat', '💬 Chat'], ['compliment', '✨ Compliment'], ['joke', '😜 Tell a joke'], ['hug', '🤗 Hug'], ['gossip', '🤫 Gossip'],
      ['danceOff', '🕺 Dance-off'], ['prank', '😈 Prank'], ['argue', '💢 Argue'], ['insult', '😏 Insult'],
      ['apology', '🙏 Apologize'], ['confess', '💗 Confess love'], ['breakup', '💔 Break up'],
    ];
    let kind = 'chat';
    const m = openModal({
      title: `${r.name} should…`,
      body: (b) => {
        const kRow = h('div', { class: 'row' });
        const btns = kinds.map(([k, label]) => h('button', { class: `small ${k === kind ? 'active' : ''}`, onclick: () => { kind = k; btns.forEach((x, i) => x.classList.toggle('active', kinds[i][0] === k)); } }, label));
        kRow.append(...btns);
        b.append(kRow, h('div', { class: 'lbl', style: { marginTop: '12px' } }, '…with'));
        const list = h('div', { class: 'row' });
        for (const o of sim.residents) {
          if (o === r) continue;
          list.append(h('button', { onclick: () => {
            m.close();
            const opts = {};
            if (kind === 'gossip') {
              const c = sim.residents.find((c) => c !== r && c !== o);
              if (!c) return toast('Gossip needs a third resident.');
              opts.c = c;
            }
            if ((kind === 'argue' || kind === 'insult' || kind === 'prank') && sim.settings.conflict === 'off') return toast('Conflict is turned off in Settings.');
            sim.goInteract(r, o, kind, opts);
            toast(`${r.name} is going to ${kinds.find((k) => k[0] === kind)[1].slice(2).toLowerCase()} with ${o.name}.`);
          } }, `${r.relLabel(o.id).icon} ${o.name}`));
        }
        b.append(list);
        b.append(h('p', { class: 'hint' }, 'Outcomes depend on personalities, moods, the weather and how they feel about each other. Heated conflicts can turn into fights!'));
      },
    });
  }
}
