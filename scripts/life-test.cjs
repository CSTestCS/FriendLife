// Swimming, rescues, outfits/perception, condo, routines and mishaps.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.SHOTS || 'shots';
const ONLY = process.env.ONLY || '';
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(5188, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5188/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const waitFor = async (fn, ms, label) => {
    try { await page.waitForFunction(fn, null, { timeout: ms, polling: 500 }); return true; } catch (e) {
      console.log('TIMEOUT', label, await ev(() => { const s = window.__friendlife.sim; return JSON.stringify({ cases: s.swim.cases.map((c) => [c.victim.name, c.phase, c.t, c.rescuer?.name]), r0: [s.residents[0].x, s.residents[0].z, s.residents[0].player.action, s.residents[0].engaged?.kind], speed: s.speed, rt: s.realTime }); }));
      return false;
    }
  };
  const run = (name) => !ONLY || ONLY.split(',').includes(name);

  if (run('swim')) {
    // ---- swimming
    await ev(() => {
      const s = window.__friendlife.sim;
      s.clock = Math.floor(s.clock / 1440) * 1440 + 12 * 60;
      s.weather.set('sunny', true);
      const r = s.residents[0];
      r.clearPlan();
      const p = s.island.swimSpot();
      r.placeAt(p.x, p.z);
      s.select(r);
    });
    await wait(1500);
    const sw = await ev(() => { const r = window.__friendlife.sim.residents[0]; return { inWater: r.inWater, y: +r.group.position.y.toFixed(2), anim: r.player.action, wet: r.d.wetness }; });
    check('in water → swimming', sw.inWater && sw.y < -0.5 && ['tread', 'swim'].includes(sw.anim) && sw.wet === 1, JSON.stringify(sw));
    await page.screenshot({ path: `${OUT}/l1-swim.png` });
    // distress without a lifeguard → washes ashore
    await ev(() => { const s = window.__friendlife.sim; s.swim.distress(s.residents[0]); s.speed = 8; });
    await ev(() => { const s = window.__friendlife.sim; const c = s.swim.cases.find((x) => x.victim === s.residents[0]); if (c) c.t = 40; });
    const d0 = await ev(() => { const r = window.__friendlife.sim.residents[0]; return { problem: r.d.problem?.type, anim: r.player.action }; });
    check('distress → struggling + problem', d0.problem === 'drowning' && d0.anim === 'struggle', JSON.stringify(d0));
    await page.screenshot({ path: `${OUT}/l2-struggle.png` });
    await waitFor(() => !window.__friendlife.sim.swim.cases.some((c) => c.victim === window.__friendlife.sim.residents[0]), 90000, 'swim case');
    const d1 = await ev(() => { const s = window.__friendlife.sim; const r = s.residents[0]; return { injured: r.d.injuries.map((i) => i.type), ko: r.ko, inWater: r.inWater, news: s.newsLog.slice(0, 3).map((n) => n.text) }; });
    check('rescued or washed ashore', !d1.inWater, JSON.stringify(d1));
    // with a lifeguard on duty
    await ev(() => {
      const s = window.__friendlife.sim;
      s.speed = 1;
      const [v, , , g] = s.residents;
      for (const r of s.residents) { r.ko = false; r.clearPlan(); }
      g.d.problem = null;
      s.problems.offer(g, 'wantJob', {});
      s.problems.solve(g, 'pick', { job: 'lifeguard' });
      g.d.job.dayOff = (s.day + 3) % 7;
      for (const x of [v, g]) { s.social.cancelFor(x); x.engaged = null; x.errand = null; x.sleeping = false; x.morningPending = false; if (x.inside) x.exit(); }
      g.working = true;
      const post = s.island.lifeguardPost;
      g.placeAt(post.x, post.z);
      v.d.waterFear = 0;
      v.d.injuries = [];
      const p = s.island.swimSpot();
      v.placeAt(p.x, p.z);
    });
    await wait(500);
    const relBefore = await ev(() => { const s = window.__friendlife.sim; s.swim.distress(s.residents[0]); return s.residents[0].relScore(s.residents[3].id); });
    await waitFor(() => window.__friendlife.sim.swim.cases[0]?.phase !== 'struggle', 150000, 'guard dispatch') || true;
    const g0 = await ev(() => { const s = window.__friendlife.sim; const c = s.swim.cases[0]; return { phase: c?.phase, rescuer: c?.rescuer?.name, guard: s.residents[3].name, onShift: s.residents[3].working }; });
    check('lifeguard responds', g0.rescuer === g0.guard, JSON.stringify(g0));
    await ev(() => { window.__friendlife.sim.speed = 4; });
    await waitFor(() => !window.__friendlife.sim.swim.cases.some((c) => c.victim === window.__friendlife.sim.residents[0]), 90000, 'swim case');
    const g1 = await ev(() => { const s = window.__friendlife.sim; const [v, , , g] = s.residents; return { rel: v.relScore(g.id), news: s.newsLog.slice(0, 2).map((n) => n.text), inWater: v.inWater }; });
    check('lifeguard rescue completes', g1.rel >= relBefore + 15 && /rescued/.test(g1.news.join(' ')) && !g1.inWater, JSON.stringify(g1));
    await ev(() => { window.__friendlife.sim.speed = 1; });
  }

  if (run('wardrobe')) {
    // ---- the pier is solid ground again; fishers stay dry
    await ev(() => {
      const s = window.__friendlife.sim;
      s.clock = Math.floor(s.clock / 1440) * 1440 + 9 * 60;
      s.settings.conflict = 'off'; // keep the test residents out of arguments
      for (const x of s.residents) s.social.cancelFor(x);
      const f = s.residents[1];
      s.social.cancelFor(f); f.engaged = null; f.ko = false; if (f.inside) f.exit(); f.clearPlan();
      f.d.problem = null;
      s.problems.offer(f, 'wantJob', {});
      s.problems.solve(f, 'pick', { job: 'fisher' });
      f.d.job.dayOff = (s.day + 3) % 7;
      f.d.job.start = 0; f.d.job.end = 24;
      f.placeAt(0, 30);
      window.__fisher = f;
      window.__wet = 0;
      s.speed = 4;
    });
    let atTip = false;
    for (let i = 0; i < 200 && !atTip; i++) {
      await wait(1000);
      const st = await ev(() => { const s = window.__friendlife.sim; const f = window.__fisher; if (f.inWater) window.__wet++; const p = s.locations.pier; return { d: Math.hypot(f.x - p.x, f.z - p.z), wet: window.__wet, y: f.group.position.y, working: f.working }; });
      if (st.d < 1.2) atTip = st;
      if (i % 50 === 49) console.log('  fisher', await ev(() => { const f = window.__fisher; return JSON.stringify({ x: f.x.toFixed(1), z: f.z.toFixed(1), plan: f.plan.map((p) => p.kind), step: f.step?.kind, eng: f.engaged?.kind, in: f.inside, act: f.player.action, job: f.d.job?.id, working: f.working }); }));
    }
    check('fisher reaches the pier tip without swimming', atTip && atTip.wet === 0 && atTip.y > 0.2, JSON.stringify(atTip));
    // ---- changing clothes happens at the wardrobe at home
    await ev(() => {
      const s = window.__friendlife.sim;
      s.speed = 4;
      s.clock = Math.floor(s.clock / 1440) * 1440 + 12 * 60;
      const r = s.residents[4];
      s.social.cancelFor(r); r.engaged = null; r.ko = false; if (r.inside) r.exit(); r.clearPlan();
      const cur = JSON.parse(JSON.stringify(r.appearance()));
      r.d.outfits = [{ name: 'Swimsuit', look: cur.look || r.d.look, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: ['swim'] }];
      r.d.wearing = -1;
      r.d.waterFear = 0;
      const home = s.homeOf(r);
      r.placeAt(home.door[0] + 3, home.door[1] + 3);
      window.__swimmer = r;
      window.__log = [];
      // what the brain does when it picks "swim"
      if (!s.dressFirst(r, 'swim', () => s.swim.planSwim(r))) s.swim.planSwim(r);
    });
    let changedAtHome = false, swam = false, changedOutside = false;
    for (let i = 0; i < 300 && !(changedAtHome && swam); i++) {
      await wait(1000);
      const st = await ev(() => { const r = window.__swimmer; return { in: r.inside, home: r.inside === r.homeKey, w: r.d.wearing, water: r.inWater, seat: r.seat?.type }; });
      if (st.w === 0 && st.home) changedAtHome = true;
      if (st.w === 0 && !st.in && !changedAtHome) changedOutside = true;
      if (st.water && st.w === 0) swam = true;
    }
    check('goes home to the wardrobe for swimwear', changedAtHome && !changedOutside, JSON.stringify({ changedAtHome, changedOutside }));
    check('then goes swimming in it', swam);
    // ---- someone points out a mishap
    const told = await ev(async () => {
      const s = window.__friendlife.sim;
      const [a, b] = s.residents.filter((r) => !r.inside && !r.engaged && !r.ko && r !== window.__swimmer).slice(0, 2);
      for (const x of [a, b]) { s.social.cancelFor(x); x.clearPlan(); }
      b.placeAt(a.x + 1.2, a.z);
      a.d.mishap = null;
      a.d.problem = null;
      const { causeMishap } = window.__friendlife.outfits || {};
      a.d.mishap = { type: 'shoes', at: s.clock, noticed: false };
      a.applyLook();
      for (let i = 0; i < 60 && !a.d.mishap?.telling && !a.d.mishap?.noticed; i++) s.perMinute(1);
      await new Promise((r) => setTimeout(r, 2500));
      return { telling: !!a.d.mishap?.telling, noticed: !!a.d.mishap?.noticed || !a.d.mishap, goingToChange: a.errand?.kind === 'dress', asked: a.d.problem?.type };
    });
    check('mishap gets noticed / pointed out', told.noticed && (told.goingToChange || told.asked === 'mishap'), JSON.stringify(told));
    await ev(() => { const s = window.__friendlife.sim; s.speed = 1; s.settings.conflict = 'normal'; });
  }

  if (run('outfits')) {
    // ---- outfit conditions, random pick, perception, mishaps, routines
    const o = await ev(async () => {
      const s = window.__friendlife.sim;
      const r = s.residents[2];
      s.social.cancelFor(r);
      if (r.inside) r.exit();
      r.clearPlan();
      const cur = JSON.parse(JSON.stringify(r.appearance()));
      const mk = (name, tags, perception) => ({ name, look: JSON.parse(JSON.stringify(cur.look || r.d.look)), outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags, perception });
      r.d.outfits = [mk('Swimsuit', ['swim'], { self: ['cute'], others: ['cute'] }), mk('PJs A', ['sleep'], { self: ['comfortable'], others: ['silly'] }), mk('PJs B', ['sleep'], { self: ['comfortable'], others: [] }), mk('Suit', ['work'], { self: ['powerful'], others: ['embarrassing'] })];
      r.d.mainOutfit = { tags: ['default'], perception: { self: ['cool'], others: [] } };
      r.d.wearing = -1;
      const picks = {};
      r.activity = 'sleep';
      for (let i = 0; i < 40; i++) { r.d.wearing = -1; const p = s.preferredOutfit(r); picks[p] = (picks[p] || 0) + 1; }
      r.activity = 'swim';
      const swim = s.preferredOutfit(r);
      r.activity = 'work';
      const work = s.preferredOutfit(r);
      r.activity = null;
      r.d.wearing = 3;
      const nothing = s.preferredOutfit(r); // nothing special → main look (tagged default)
      r.d.wearing = -1;
      return { picks, swim, work, nothing };
    });
    check('sleep: random between the two PJs', Object.keys(o.picks).sort().join(',') === '1,2', JSON.stringify(o.picks));
    check('swim / work / default outfits', o.swim === 0 && o.work === 3 && o.nothing === -1, JSON.stringify(o));
    // perception: wearing the suit (self powerful, others embarrassing) near others → reactions
    const pr = await ev(async () => {
      const s = window.__friendlife.sim;
      const r = s.residents[2];
      r.d.autoOutfits = false; // keep the suit on even though they aren't working
      await s.changeOutfit(r, 3, { quiet: true });
      const others = s.residents.filter((x) => x !== r && !x.inside).slice(0, 3);
      for (const x of others) { s.social.cancelFor(x); x.clearPlan(); x.placeAt(r.x + 1.5, r.z + Math.random()); }
      const before = others.map((x) => x.relScore(r.id));
      const { updateOutfitPerception } = window.__friendlife.debug || {};
      // run perception many times
      for (let i = 0; i < 400; i++) s.perMinute(1);
      return { before, after: others.map((x) => x.relScore(r.id)), bias: s.social.chooseKind ? 'ok' : '' };
    });
    check('outward "embarrassing" makes others tease', pr.after.some((v, i) => v < pr.before[i]), JSON.stringify(pr));
    // mishap from a fight
    const mh = await ev(async () => {
      const s = window.__friendlife.sim;
      const r = s.residents[2];
      s.settings.conflict = 'spicy';
      r.d.mishap = null;
      const o = s.residents.find((x) => x !== r && !x.inside && !x.ko);
      for (const x of [r, o]) { s.social.cancelFor(x); x.clearPlan(); x.engaged = null; x.ko = false; }
      o.placeAt(r.x + 1, r.z);
      const f = s.fights.start(r, o, 'argument');
      for (let i = 0; i < 20 && !r.d.mishap; i++) { r.d.mishap = null; f.done = false; f.end(0, 'ko'); await new Promise((res) => setTimeout(res, 2700)); if (!r.d.mishap) { for (const x of [r, o]) { x.engaged = null; x.ko = false; } } }
      return { mishap: r.d.mishap?.type, problem: r.d.problem?.type };
    });
    check('fights can tear clothes (mishap + request)', ['torn', 'seam'].includes(mh.mishap), JSON.stringify(mh));
    await page.screenshot({ path: `${OUT}/l8-mishap.png` });
    // fixing: changing clothes fixes it
    const fx = await ev(async () => { const s = window.__friendlife.sim; const r = s.residents[2]; await s.changeOutfit(r, 0, { quiet: true }); return r.d.mishap; });
    check('changing clothes fixes a mishap', fx === null, String(fx));
    // routines: bedtime → pyjamas, morning → dressed (or forgot)
    const rt = await ev(async () => {
      const s = window.__friendlife.sim;
      const r = s.residents[2];
      r.d.autoOutfits = true;
      r.d.mishap = null;
      s.social.cancelFor(r); r.engaged = null; r.ko = false; r.clearPlan();
      if (r.inside) r.exit();
      r.enter(r.homeKey, 600);
      r.sleeping = true; r.bedtimeDone = false; r.wakeAt = s.clock + 12;
      s.speed = 8;
      window.__rtLog = [];
      return r.inside;
    });
    let sawSleep = false, sawMorning = false, wearing = [];
    for (let i = 0; i < 240 && !(sawSleep && sawMorning); i++) {
      await wait(1000);
      const st = await ev(() => { const r = window.__friendlife.sim.residents[2]; return { act: r.activity, w: r.d.wearing, sleeping: r.sleeping, anim: r.player.action, inside: r.inside, mishap: r.d.mishap?.type }; });
      wearing.push(st.w);
      if (st.act === 'sleep' && (st.w === 1 || st.w === 2)) sawSleep = true;
      if (sawSleep && !st.sleeping && st.act !== 'sleep' && (st.w !== 1 && st.w !== 2 || st.mishap === 'pajamas')) sawMorning = true;
    }
    check('bedtime routine changes into sleepwear', sawSleep, [...new Set(wearing)].join(','));
    if (!sawMorning) console.log('  state', await ev(() => { const s = window.__friendlife.sim; const r = s.residents[2]; return JSON.stringify({ clk: s.clock % 1440, wake: r.wakeAt, act: r.activity, sl: r.sleeping, bd: r.bedtimeDone, plan: r.plan.map((p) => p.kind), step: r.step?.kind, seat: r.seat?.type, ins: r.inside, eng: r.engaged?.kind, ko: r.ko, until: r.insideUntil - s.clock, speed: s.speed, rt: s.realTime }); }));
    check('morning routine gets dressed', sawMorning, [...new Set(wearing)].join(','));
    await ev(() => { const s = window.__friendlife.sim; s.speed = 1; s.select(s.residents[2]); });
    await wait(1500);
    await page.locator('#panel button[title="Edit settings"]').first().click();
    await wait(800);
    await page.screenshot({ path: `${OUT}/l9-outfit-settings.png` });
    const modal = await ev(() => document.querySelector('.modal')?.innerText || '');
    check('main look settings editable (conditions + perception)', /Main look/i.test(modal) && /Swimming/i.test(modal) && /How everyone else sees it/i.test(modal), modal.slice(0, 80).replace(/\n/g, ' '));
    await page.keyboard.press('Escape');
  }

  if (run('condo')) {
    // ---- condo for residents 11+
    await ev(async () => { const s = window.__friendlife.sim; s.speed = 1; while (s.residents.length < 13) await s.addRandomResident({ announce: true }); });
    const c0 = await ev(() => {
      const s = window.__friendlife.sim;
      const condoFolks = s.residents.filter((r) => s.condo.unitOf(r.id) != null);
      return { n: s.residents.length, houses: s.island.houses.filter((h) => h.owner).length, condo: condoFolks.map((r) => `${r.name}#${s.condo.unitLabel(s.condo.unitOf(r.id))}`), shown: !!s.island.condoShown, chain: s.rooms.chain(`home:${condoFolks[0]?.id}`) };
    });
    check('houses capped at 10, rest in condo', c0.houses === 10 && c0.condo.length === 3 && c0.shown, JSON.stringify(c0));
    check('apartment reached via lobby + hallway', c0.chain.join('>') === 'condo>hall:1>' + c0.chain[2], c0.chain.join('>'));
    // send one home and follow them through the rooms
    await ev(() => {
      const s = window.__friendlife.sim;
      const r = s.residents.find((x) => s.condo.unitOf(x.id) != null);
      window.__condoRes = r;
      s.social.cancelFor(r);
      if (r.inside) r.exit();
      r.ko = false;
      r.engaged = null;
      r.clearPlan();
      const door = s.locationDoor(r.homeKey);
      r.placeAt(door[0] + 1, door[1] + 1);
      r.setPlan([{ kind: 'walk', x: door[0], z: door[1] }, { kind: 'enter', loc: r.homeKey, minutes: 60 }]);
      s.select(r);
      s.speed = 4;
    });
    const seen = new Set();
    for (let i = 0; i < 120; i++) {
      await wait(1000);
      const where = await ev(() => window.__condoRes.inside || 'outside');
      if (i % 20 === 19) console.log('  …', await ev(() => { const r = window.__condoRes; return JSON.stringify({ in: r.inside, plan: r.plan.map((p) => p.kind), step: r.step?.kind, eng: r.engaged?.kind, x: r.x.toFixed(1), z: r.z.toFixed(1), route: r.route?.keys, leaving: r.leaving }); }));
      seen.add(where);
      if (where.startsWith('home:')) break;
    }
    check('walks lobby → hallway → apartment', seen.has('condo') && [...seen].some((k) => k.startsWith('hall:')) && [...seen].some((k) => k.startsWith('home:')), [...seen].join(' > '));
    await ev(() => window.__friendlife.viewRoom(window.__condoRes.inside));
    await wait(1500);
    await page.screenshot({ path: `${OUT}/l3-apartment.png` });
    // now leave: time is up → walks back out
    await ev(() => { const r = window.__condoRes; r.insideUntil = window.__friendlife.sim.clock; });
    const seenOut = new Set();
    for (let i = 0; i < 120; i++) {
      await wait(1000);
      const where = await ev(() => window.__condoRes.inside || 'outside');
      seenOut.add(where);
      if (where === 'outside') break;
    }
    check('walks back out through hallway + lobby', seenOut.has('outside') && seenOut.has('condo'), [...seenOut].join(' > '));
    // sent somewhere (clinic) from the apartment: still walks out through the hallway and lobby
    await ev(() => {
      const s = window.__friendlife.sim;
      const r = window.__condoRes;
      s.social.cancelFor(r); r.engaged = null; r.clearPlan();
      if (r.inside) r.exit();
      r._enterRoom(r.homeKey, 600);
      s.sendTo(r, 'clinic', 30);
      window.__sentPath = [r.inside || 'outside'];
    });
    for (let i = 0; i < 120; i++) {
      await wait(1000);
      const where = await ev(() => { const r = window.__condoRes; const w = r.inside || 'outside'; const p = window.__sentPath; if (p[p.length - 1] !== w) p.push(w); return w; });
      if (where === 'clinic') break;
    }
    const sentPath = await ev(() => window.__sentPath);
    const iOut = sentPath.indexOf('outside');
    check('sent out from an apartment: hallway → lobby → outside (no shortcut)', iOut > 0 && sentPath.slice(0, iOut).some((k) => k.startsWith('hall:')) && sentPath[iOut - 1] === 'condo', sentPath.join(' > '));
    // views of the hallway, lobby and pool
    for (const [key, shot] of [['hall:1', 'l4-hall'], ['condo', 'l5-lobby'], ['condoPool', 'l6-pool']]) {
      await ev((k) => window.__friendlife.viewRoom(k), key);
      await wait(1200);
      await page.screenshot({ path: `${OUT}/${shot}.png` });
    }
    // pool: swim + pool lifeguard
    const pool = await ev(async () => {
      const s = window.__friendlife.sim;
      const [a, b] = s.residents.filter((r) => s.condo.unitOf(r.id) != null);
      for (const r of [a, b]) { r.clearPlan(); r.ko = false; r.engaged = null; r.d.waterFear = 0; r.d.injuries = []; if (r.inside) r.exit(); r.enter('condoPool', 60); }
      b.d.problem = null;
      s.problems.offer(b, 'wantJob', {});
      s.problems.solve(b, 'pick', { job: 'poolguard' });
      b.d.job.dayOff = (s.day + 3) % 7;
      s.clock = Math.floor(s.clock / 1440) * 1440 + 12 * 60;
      return { aIn: a.inside, bIn: b.inside };
    });
    await waitFor(() => { const s = window.__friendlife.sim; return s.residents.filter((r) => s.condo.unitOf(r.id) != null).slice(0, 2).every((r) => r.inside === 'condoPool'); }, 120000, 'reach pool');
    await wait(3000);
    await ev(() => { const s = window.__friendlife.sim; const [a] = s.residents.filter((r) => s.condo.unitOf(r.id) != null); a.route = null; a.clearPlan(); const sp = a.room.swimSpot(); a.placeAt(sp.x, sp.z); });
    await wait(800);
    const p1 = await ev(() => { const s = window.__friendlife.sim; const [a, b] = s.residents.filter((r) => s.condo.unitOf(r.id) != null); return { aWater: a.inWater, aY: +a.group.position.y.toFixed(2), bWorking: b.working, bIn: b.inside, aIn: a.inside }; });
    check('swimming in the condo pool', p1.aWater && p1.aIn === 'condoPool', JSON.stringify(p1));
    await ev(() => window.__friendlife.viewRoom('condoPool'));
    await wait(800);
    await page.screenshot({ path: `${OUT}/l7-pool-swim.png` });
    check('pool lifeguard at work', p1.bWorking, JSON.stringify(p1));
  }

  check('no page errors', errors.length === 0, errors.slice(0, 6).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
