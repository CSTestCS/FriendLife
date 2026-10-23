// Volume channels, underwear & embarrassment, mishap parts, prior relations,
// wet shine, texture-based wardrobe, thin fabric, progression, jobs, culling.
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
  await new Promise((r) => server.listen(5189, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5189/');
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

  // ---------------------------------------------------------------- volume channels
  const vol = await ev(() => {
    const a = window.__friendlife;
    a.audio.start();
    a.audio.setLevel('music', 0.2);
    a.audio.setLevel('voice', 0.5);
    a.audio.setLevel('ambient', 0.3);
    return { music: a.audio.musicBus.gain.value, voice: a.audio.voiceBus.gain.value, ambient: a.audio.ambientBus.gain.value };
  });
  check('separate voice / music / ambient volume', Math.abs(vol.music - 0.2) < 1e-3 && Math.abs(vol.voice - 0.5) < 1e-3 && Math.abs(vol.ambient - 0.3) < 1e-3, JSON.stringify(vol));

  // ---------------------------------------------------------------- underwear / incomplete / embarrassment
  const uw = await ev(async () => {
    const s = window.__friendlife.sim;
    s.settings.conflict = 'off';
    s.clock = Math.floor(s.clock / 1440) * 1440 + 12 * 60;
    const males = s.residents.filter((r) => r.d.gender === 'm');
    const females = s.residents.filter((r) => r.d.gender === 'f');
    const w = females[0] || s.residents[0];
    const m = males[0] || s.residents[1];
    for (const x of [w, m]) { s.social.cancelFor(x); x.engaged = null; x.ko = false; x.errand = null; if (x.inside) x.exit(); x.clearPlan(); x.thinkTimer = 9999; }
    const cur = JSON.parse(JSON.stringify(w.appearance()));
    const mk = (name, tags = [], perception) => ({ name, look: cur.look || w.d.look, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags, perception: perception || { self: [], others: [] } });
    w.d.outfits = [mk('Underwear'), mk('Cute dress', ['default'])];
    w.d.wearing = -1;
    // stripping down to underwear works right here (no trip home)
    const went = s.goChange(w, { index: 0 });
    await new Promise((r) => setTimeout(r, 1500));
    const instant = w.d.wearing === 0 && !w.inside && !w.errand;
    // a male sees her in underwear in public → attracted
    m.placeAt(w.x + 1.2, w.z);
    const before = m.relScore(w.id);
    for (let i = 0; i < 300 && m.relScore(w.id) <= before; i++) { w.seenUndiesAt = -999; s.perMinute(1); }
    const after = m.relScore(w.id);
    return { went, instant, gw: w.d.gender, gm: m.d.gender, before, after, mood: m.mood(), wErrand: w.errand?.kind || null, wIn: w.inside };
  });
  check('changes into "Underwear" anywhere (no wardrobe)', uw.instant, JSON.stringify(uw));
  check('underwear in public gets noticed, opposite gender attracted', uw.after > uw.before, JSON.stringify(uw));
  const emb = await ev(async () => {
    const s = window.__friendlife.sim;
    const r = s.residents.find((x) => !x.inside && !x.engaged && x.d.outfits?.length === 0) || s.residents[3];
    s.social.cancelFor(r); r.engaged = null; if (r.inside) r.exit(); r.clearPlan(); r.thinkTimer = 9999;
    const cur = JSON.parse(JSON.stringify(r.appearance()));
    r.d.outfits = [{ name: 'Clown suit', look: cur.look || r.d.look, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: [], perception: { self: ['embarrassing'], others: ['silly'] } }];
    r.d.wearing = 0;
    const o = s.residents.find((x) => x !== r && !x.inside);
    o.placeAt(r.x + 1, r.z); o.clearPlan(); o.thinkTimer = 9999;
    for (let i = 0; i < 300 && !r.errand; i++) { r.lastDressTrip = -1e9; s.perMinute(1); }
    return { errand: r.errand?.kind, avoid: !!r.errand?.avoidEmbarrassing };
  });
  check('seen in an embarrassing outfit → goes to change', emb.errand === 'dress', JSON.stringify(emb));
  const swimEx = await ev(() => {
    const s = window.__friendlife.sim;
    const r = s.residents.find((x) => x.d.outfits?.[0]?.name === 'Clown suit');
    r.errand = null;
    r.activity = 'swim';
    return { public: r.inside !== r.homeKey && !(r.inWater || r.activity === 'swim') };
  });
  check('swimming is exempt from embarrassment', swimEx.public === false, JSON.stringify(swimEx));

  // ---------------------------------------------------------------- mishap hides chosen parts
  const mh = await ev(async () => {
    const s = window.__friendlife.sim;
    const r = s.residents[5];
    r.d.outfits = [];
    r.d.wearing = -1;
    r.d.custom = { textures: {}, tints: {}, hidden: [], mishapHide: ['top'] };
    r.d.mishap = null;
    r.d.mishap = { type: 'torn', at: s.clock, noticed: true };
    await r.applyLook();
    const look = r.composeLook();
    const visible = r.avatar.kind === 'doll' ? r.avatar.doll.slots.top.visible : null;
    r.d.mishap = null;
    await r.applyLook();
    return { hidden: look.hidden, topVisible: visible, after: r.avatar.kind === 'doll' ? r.avatar.doll.slots.top.visible : null };
  });
  check('mishap hides the parts marked for mishaps', mh.hidden.includes('top') && mh.topVisible === false && mh.after === true, JSON.stringify(mh));

  // ---------------------------------------------------------------- prior relations
  // set through the profile UI
  await ev(() => window.__friendlife.sim.select(window.__friendlife.sim.residents[0]));
  await wait(800);
  await page.locator('#panel button', { hasText: 'Add prior relation' }).click();
  await wait(500);
  await page.screenshot({ path: `${OUT}/b1-prior.png` });
  await page.locator('.modal .tag', { hasText: 'Sibling' }).first().click();
  await page.locator('.modal button', { hasText: 'Save' }).click();
  await wait(500);
  const sib = await ev(() => {
    const s = window.__friendlife.sim;
    const a = s.residents[0];
    const id = Object.keys(a.d.prior || {})[0];
    const b = s.byId(id);
    const kinds = {};
    for (let i = 0; i < 400; i++) { const k = s.social.chooseKind(a, b); kinds[k] = (kinds[k] || 0) + 1; }
    return { mine: a.d.prior?.[id], theirs: b?.d.prior?.[a.id], label: a.relLabel(id).label, score: a.relScore(id), dates: (kinds.date || 0) + (kinds.confess || 0), kinds };
  });
  check('prior relation set on both sides', sib.mine?.variant === 'sibling' && sib.theirs?.variant === 'sibling' && /Sibling/.test(sib.label), JSON.stringify(sib));
  check('relatives never date / confess', sib.dates === 0, JSON.stringify(sib.kinds));

  // ---------------------------------------------------------------- VRM: wet shine, texture-based items, thin fabric
  const vrm = await ev(async () => {
    const s = window.__friendlife.sim;
    const lib = s.library;
    const get = async (f) => (await fetch(`/samples/${encodeURIComponent(f)}`)).arrayBuffer();
    const ch = await lib.add({ name: 'Sample Mannequin', type: 'character', data: await get('Sample Mannequin.vrm'), ext: 'vrm' });
    const r = s.residents[6] || s.residents[2];
    r.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r.d.look.doll };
    r.d.outfits = []; r.d.wearing = -1; r.d.mishap = null;
    await s.rebuildAvatar(r);
    const a = r.avatar;
    // two materials with the same name but different textures (like Onepiece_00_CLOTH)
    const mats = a.materials.filter((m) => m.isMToonMaterial && !/Outline/.test(m.name));
    const tex = (m) => m.userData.origMap ? m.userData.origMap.map : m.map;
    const distinct = mats.filter((m, i, arr) => !tex(m) || arr.findIndex((x) => tex(x) === tex(m)) === i);
    const [m1, m2] = distinct;
    const n0 = a.materialSlots().length;
    if (m1 && m2) { m2.name = m1.name; a._slots = null; }
    const slots = a.materialSlots();
    const dup = slots.filter((x) => x.key.startsWith(m1.name));
    // wet sheen
    r.d.wetness = 1; a.setWetness(1);
    const wetTex = m1.matcapTexture;
    const wetFactor = m1.matcapFactor.r;
    // thin: second item turns see-through when wet
    const thinKey = [...a._slots.values()].find((sl) => sl.mats.includes(m2))?.key;
    r.d.custom = { textures: {}, tints: {}, hidden: [], thin: [thinKey].filter(Boolean) };
    await r.applyLook();
    a.setWetness(0.99); a.setWetness(1);
    const thinOp = m2.opacity, thinTr = m2.transparent, otherOp = m1.opacity;
    a.setWetness(0);
    return { n0, n1: slots.length, dupKeys: dup.map((x) => x.key), labels: dup.map((x) => x.label), wetFactor, wetTexIsWet: !!wetTex && wetTex !== (m1.userData.wetBase.matcap || null), thinOp, thinTr, otherOp, dryOp: m2.opacity, thumb: !!a.slotThumb(dup[0]?.key) };
  });
  check('same-named parts with different textures are separate wardrobe items', vrm.dupKeys.length >= 2 && vrm.dupKeys.some((k) => k.includes('#2')) && vrm.labels.every((l) => /\(\d\/\d\)/.test(l)), JSON.stringify(vrm));
  check('wet sheen applied to VRM (matcap)', vrm.wetFactor > 0.8 && vrm.wetTexIsWet, JSON.stringify(vrm));
  check('"thin" item goes see-through when wet, opaque when dry', vrm.thinTr && vrm.thinOp < 0.6 && vrm.otherOp === 1 && vrm.dryOp === 1, JSON.stringify(vrm));
  // wardrobe UI shows Thin / Mishap columns
  await ev(() => { const a = window.__friendlife; const r = a.sim.residents[6] || a.sim.residents[2]; a.sim.select(r); a.openWardrobe(r); });
  await wait(1200);
  await page.screenshot({ path: `${OUT}/b2-wardrobe.png` });
  const wardrobe = await ev(() => document.querySelector('.modal')?.innerText || '');
  check('wardrobe has Thin + Mishap toggles', /Thin/.test(wardrobe) && /Mishap/.test(wardrobe));
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- progression
  const pg = await ev(() => {
    const s = window.__friendlife.sim;
    const before = { level: s.progress.level, sew: s.progress.isAvailable('items', 'sewkit'), chef: s.progress.isAvailable('jobs', 'chef'), money: s.money };
    s.money = 5000;
    const blocked = before.sew ? null : s.buy('sewkit');
    s.progress.add(1000, 'test');
    const after = { level: s.progress.level, sew: s.progress.isAvailable('items', 'sewkit'), chef: s.progress.isAvailable('jobs', 'chef'), bought: s.buy('sewkit'), allowance: s.progress.allowanceBonus };
    const r = s.residents[0];
    const lv1 = s.residents[0].d.level;
    return { before, after, blocked };
  });
  check('island levels unlock items and jobs', pg.before.sew === false && pg.blocked === false && pg.after.level > pg.before.level && pg.after.sew && pg.after.chef && pg.after.bought, JSON.stringify(pg));
  await page.locator('#hud .chip', { hasText: 'Lv' }).first().click().catch(() => {});
  await wait(600);
  await page.screenshot({ path: `${OUT}/b3-progress.png` });
  const prog = await ev(() => document.querySelector('.modal')?.innerText || '');
  check('island progress window', /Unlocks/i.test(prog), prog.slice(0, 60).replace(/\n/g, ' '));
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- jobs: stay on the clock, police
  const jb = await ev(() => {
    const s = window.__friendlife.sim;
    s.settings.conflict = 'normal';
    s.clock = Math.floor(s.clock / 1440) * 1440 + 14 * 60;
    const [cop, a, b] = s.residents.filter((r) => !r.inside).slice(0, 3);
    for (const x of [cop, a, b]) { s.social.cancelFor(x); x.engaged = null; x.ko = false; x.clearPlan(); x.thinkTimer = 9999; }
    cop.d.problem = null;
    s.problems.offer(cop, 'wantJob', {});
    s.problems.solve(cop, 'pick', { job: 'police' });
    cop.d.job.dayOff = (s.day + 3) % 7;
    cop.working = true;
    // someone tries to chat with the officer on duty: no
    const chat = s.social.start(a, cop, 'chat');
    a.placeAt(cop.x + 4, cop.z); b.placeAt(cop.x + 4.8, cop.z);
    s.settings.conflict = 'spicy';
    const f = s.fights.start(a, b, 'argument');
    window.__fight = f; window.__cop = cop;
    return { chatBlocked: !chat, fight: !!f, job: cop.d.job?.id };
  });
  check('residents on the clock can\'t be pulled into chats', jb.chatBlocked, JSON.stringify(jb));
  let broken = false;
  for (let i = 0; i < 60 && jb.fight && !broken; i++) {
    await wait(1000);
    broken = await ev(() => { const s = window.__friendlife.sim; s.perMinute(1); return window.__fight.done; });
  }
  const news = await ev(() => window.__friendlife.sim.newsLog.slice(0, 5).map((n) => n.text).join(' | '));
  check('police officer breaks up fights', broken && /broke up a fight/.test(news), news);

  // ---------------------------------------------------------------- culling
  const cull = await ev(() => {
    const a = window.__friendlife;
    const s = a.sim;
    const cam = a.stage.camera;
    const c = a.stage.controls;
    c.target.set(200, 0, 200);
    cam.position.set(205, 5, 205);
    c.update();
    s.updateVisibility();
    const hidden = s.residents.filter((r) => !r.inside && r.avatar && !r.avatar.root.visible).length;
    c.target.set(0, 0, 5);
    cam.position.set(0, 30, 45);
    c.update();
    s.updateVisibility();
    const shown = s.residents.filter((r) => !r.inside && r.avatar && r.avatar.root.visible).length;
    return { outside: s.residents.filter((r) => !r.inside).length, hidden, shown };
  });
  check('residents outside the camera view aren\'t rendered', cull.hidden === cull.outside && cull.shown > 0, JSON.stringify(cull));
  // bookshelf screenshot
  await ev(() => { const a = window.__friendlife; a.viewRoom(`home:${a.sim.residents[0].id}`); });
  await wait(1500);
  await page.screenshot({ path: `${OUT}/b4-bookshelf.png` });

  check('no page errors', errors.length === 0, errors.slice(0, 6).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
