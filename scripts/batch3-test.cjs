// Condo-only housing, night fixes, night mischief, venues & activities,
// economy, underwear reactions, metallic/silk shine, variant → closet,
// night brightness.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.SHOTS || 'shots';
const base = path.join(__dirname, '..');
const ct = (p) => (p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/test-samples/') ? path.join(base, 'samples/test', u.slice(14)) : path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': ct(p) });
  fs.createReadStream(p).pipe(res);
});
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(5198, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5198/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);

  // ---------------------------------------------------------------- everyone lives in the condo
  const housing = await ev(() => {
    const s = window.__friendlife.sim;
    return { n: s.residents.length, condo: s.residents.filter((r) => s.condo.unitOf(r.id) != null).length, houses: s.island.houses.filter((h) => h.owner).length, shown: !!s.island.condoShown, venues: Object.keys(s.locations).filter((k) => s.locations[k].venue) };
  });
  check('everyone lives in the condo (no houses)', housing.condo === housing.n && housing.houses === 0 && housing.shown, JSON.stringify(housing));
  check('freed land has new venues', ['court', 'playground', 'picnic', 'onsen', 'campfire', 'lookout', 'foodtruck'].every((k) => housing.venues.includes(k)), housing.venues.join(','));

  // ---------------------------------------------------------------- night: home in the evening → stays in, goes to bed
  const night = await ev(() => {
    const s = window.__friendlife.sim;
    const r = s.residents[0];
    s.social.cancelFor(r); r.engaged = null; r.clearPlan(); r.d.job = null;
    if (r.inside) r.exit();
    r._enterRoom(r.homeKey, 5);
    r.sleeping = false; r.nightOut = null; r.errand = null; r.route = null;
    s.clock = Math.floor(s.clock / 1440) * 1440 + 23.8 * 60;
    r.insideUntil = s.clock - 1;
    r.update(0.05, 0.05);
    const stayed = { inside: r.inside === r.homeKey, sleeping: r.sleeping, until: r.insideUntil - s.clock };
    // caught in sleepwear at night → back to bed, not day clothes
    r.d.outfits = [{ name: 'Underwear', tags: ['sleep'], perception: { self: [], others: [] } }, { name: 'Day clothes', tags: [], perception: { self: [], others: [] } }];
    r.d.wearing = 0;
    r.d.outfitPurpose = { why: 'sleep', index: 0 };
    r.exit();
    r.sleeping = false;
    const sw = s.inSleepwearAtNight(r);
    s.coverUp(r);
    const plan = r.plan.map((p) => p.kind);
    return { stayed, sw, plan, errand: r.errand?.kind || null, last: r.plan[r.plan.length - 1]?.loc };
  });
  check('home at bedtime: stays in and goes to bed (doesn\'t wander out)', night.stayed.inside && night.stayed.sleeping && night.stayed.until > 60, JSON.stringify(night.stayed));
  check('caught in sleepwear at night → back to bed, not day clothes', night.sw && !night.errand && night.plan.includes('enter') && /^home:/.test(night.last), JSON.stringify(night));

  // ---------------------------------------------------------------- night mischief
  const mis = await ev(() => {
    const s = window.__friendlife.sim;
    const [a, b, c, d] = s.residents.slice(1, 5);
    for (const r of [a, b, c, d]) { s.social.cancelFor(r); r.engaged = null; r.clearPlan(); if (r.inside) r.exit(); r._enterRoom(r.homeKey, 600); r.sleeping = true; r.nightOut = null; r.d.injuries = []; r.d.job = null; }
    a.rel(b.id).score = 90; b.rel(a.id).score = 90; b.d.traits.quirk = 0.9;
    s.clock = Math.floor(s.clock / 1440) * 1440 + 24 * 60 + 30;
    const o = s.night.start(a, 'dare');
    const crew = o.crew.map((r) => r.name);
    const out = { crew, aOut: !!a.nightOut, leaving: a.leaving || !a.inside, intent: null };
    out.intent = window.__friendlifeOutfits.underwearIntent(s, a);
    // a close friend catches them → tags along
    c.rel(a.id).score = 80; c.rel(b.id).score = 80;
    c.exit(); c.sleeping = false; c.nightOut = null;
    s.night.caughtBy(o, c);
    out.friendJoined = o.crew.includes(c) && !o.caught;
    // someone else catches them → scolded, sent home
    d.rel(a.id).score = 0; d.rel(b.id).score = 0; d.rel(c.id).score = 0;
    d.exit(); d.sleeping = false;
    s.night.caughtBy(o, d);
    out.caught = o.caught && !a.nightOut && !b.nightOut;
    out.news = s.newsLog.slice(0, 3).map((n) => n.text);
    return out;
  });
  check('night mischief: sneaks out with a close friend', mis.crew.length >= 2 && mis.aOut && mis.leaving && mis.intent === 'mischief', JSON.stringify(mis));
  check('caught by a close friend → they tag along', mis.friendJoined, JSON.stringify(mis));
  check('caught by anyone else → scolded and sent home', mis.caught && mis.news.some((t) => /caught/.test(t)), JSON.stringify(mis.news));

  // ---------------------------------------------------------------- venues + economy
  const eco = await ev(() => {
    const s = window.__friendlife.sim;
    const e = s.economy;
    const L = s.locations;
    const before = { courtOpen: e.isOpen('court'), courtVisible: L.court.obj.visible, picnicOpen: e.isOpen('picnic') };
    s.money = 50;
    const tooPoor = e.buyVenue('court');
    s.money = 1000;
    const err = e.buyVenue('court');
    const after = { courtOpen: e.isOpen('court'), courtVisible: L.court.obj.visible, money: s.money };
    // hoops at the court
    const r = s.residents[5] || s.residents[0];
    s.social.cancelFor(r); r.engaged = null; r.clearPlan(); if (r.inside) r.exit(); r.nightOut = null;
    const { planActivity } = window.__friendlifeActivities || {};
    // morning bills: rent for every apartment
    const m0 = s.money;
    e.newDay();
    const billed = m0 - s.money;
    return { before, tooPoor, err, after, billed, apartments: s.residents.length };
  });
  check('venues start closed (picnic lawn free) and can be built', !eco.before.courtOpen && !eco.before.courtVisible && eco.before.picnicOpen && !!eco.tooPoor && !eco.err && eco.after.courtOpen && eco.after.courtVisible && eco.after.money === 700, JSON.stringify(eco));
  check('daily rent + upkeep billed each morning', eco.billed >= eco.apartments * 12, JSON.stringify(eco));
  await page.locator('#topbar .chip', { hasText: '🪙' }).first().click();
  await wait(600);
  await page.screenshot({ path: `${OUT}/c1-budget.png` });
  const budget = await ev(() => document.querySelector('.modal')?.innerText || '');
  check('budget window (ledger + venues)', /Island Budget/.test(budget) && /Venues/.test(budget) && /Hot Spring/.test(budget), budget.slice(0, 80).replace(/\n/g, ' '));
  await page.keyboard.press('Escape');

  const act = await ev(async () => {
    const s = window.__friendlife.sim;
    const r = s.residents[5] || s.residents[0];
    s.clock = Math.floor(s.clock / 1440) * 1440 + 14 * 60;
    const out = {};
    for (const k of ['hoops', 'picnic', 'jog', 'selfie', 'sandcastle', 'peoplewatch']) {
      r.clearPlan();
      out[k] = window.__friendlifeActivities.planActivity(r, s, k) && r.plan.length > 0;
    }
    return out;
  });
  check('new daytime activities plan', Object.values(act).every(Boolean), JSON.stringify(act));

  // ---------------------------------------------------------------- underwear reactions vary
  const reac = await ev(() => {
    const s = window.__friendlife.sim;
    const [w, o] = s.residents;
    const said = [];
    const say = o.say.bind(o);
    o.say = (t, x) => { said.push(t); return say(t, x); };
    w.d.outfits = [{ name: 'Underwear', tags: [], perception: { self: [], others: [] } }]; w.d.wearing = 0; w.d.outfitPurpose = null; w.nightOut = null;
    const { reactToUndies } = window.__friendlifeOutfits;
    // best friend, then kind stranger, then prankster
    o.rel(w.id).score = 90; reactToUndies(s, o, w);
    o.rel(w.id).score = 0; o.d.traits.kindness = 0.9; reactToUndies(s, o, w);
    o.d.traits.kindness = 0.2; o.d.traits.quirk = 0.9; reactToUndies(s, o, w);
    o.say = say;
    return said;
  });
  check('underwear reactions vary (bestie / jacket / laugh)', new Set(reac).size === 3, JSON.stringify(reac));

  // ---------------------------------------------------------------- metallic / silk shine
  const shine = await ev(async () => {
    const s = window.__friendlife.sim;
    const lib = s.library;
    const ch = await lib.add({ name: 'Textured Mannequin', type: 'character', data: await (await fetch('/test-samples/Textured%20Mannequin.vrm')).arrayBuffer(), ext: 'vrm' });
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#d4af37'; g.fillRect(0, 0, 16, 16);
    const png = await new Promise((res) => c.toBlob((b) => b.arrayBuffer().then(res), 'image/png'));
    const metal = await lib.add({ name: 'Gold Metallic', type: 'texture', data: png, ext: 'png' });
    const silk = await lib.add({ name: 'Red Silk', type: 'texture', data: png.slice(0), ext: 'png' });
    const r = s.residents[2];
    r.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r.d.look.doll };
    r.d.outfits = []; r.d.wearing = -1; r.d.mishap = null;
    await s.rebuildAvatar(r);
    const slots = r.avatar.materialSlots();
    r.d.custom = { textures: { [slots[0].key]: metal.id, [slots[1].key]: silk.id }, tints: {}, hidden: [], thin: [] };
    await r.applyLook();
    const mA = r.avatar._materialsForSlot(slots[0].key)[0];
    const mB = r.avatar._materialsForSlot(slots[1].key)[0];
    const mC = r.avatar._materialsForSlot(slots[2]?.key)?.[0];
    const dry = { metal: mA.matcapFactor.r, silk: mB.matcapFactor.r, plain: mC?.matcapFactor.r };
    r.avatar.setWetness(1);
    const wet = { metal: mA.matcapFactor.r, silk: mB.matcapFactor.r, plain: mC?.matcapFactor.r, metalTex: mA.matcapTexture === mB.matcapTexture };
    r.avatar.setWetness(0);
    return { dry, wet, kinds: [mA.userData.shine, mB.userData.shine] };
  });
  check('"metallic" / "silk" textures always shiny (silk softer)', shine.kinds[0] === 'metallic' && shine.kinds[1] === 'silk' && shine.dry.metal > shine.dry.silk && shine.dry.silk > 0.2 && (shine.dry.plain ?? 0) < 0.05, JSON.stringify(shine));
  check('shine unchanged by the wet look (plain parts still get wet)', Math.abs(shine.wet.metal - shine.dry.metal) < 1e-6 && Math.abs(shine.wet.silk - shine.dry.silk) < 1e-6 && shine.wet.plain > 0.5 && !shine.wet.metalTex, JSON.stringify(shine));

  // ---------------------------------------------------------------- "Save as character variant" → new closet outfit
  await ev(() => {
    const s = window.__friendlife.sim;
    const r = s.residents[2];
    r.d.outfits = [{ name: 'Gym Kit', look: null, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: ['exercise'], perception: { self: ['cool'], others: [] } }];
    r.d.wearing = 0;
    return s.rebuildAvatar(r);
  });
  await ev(() => { const a = window.__friendlife; a.openWardrobe(a.sim.residents[2]); });
  await wait(800);
  // tint one part, then save as a character variant
  await ev(() => { const inp = document.querySelector('.modal input[type=color]'); inp.value = '#ff0000'; inp.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('.modal button', { hasText: 'Save as character variant' }).click();
  await wait(400);
  await page.locator('.modal input[type=text]').last().fill('Red Gym');
  await page.locator('.modal button', { hasText: 'OK' }).last().click();
  await wait(600);
  const closetName = await ev(() => document.querySelector('.modal input[type=text]')?.value || '');
  await page.locator('.modal button', { hasText: 'OK' }).last().click();
  await wait(1200);
  const v2c = await ev(() => {
    const r = window.__friendlife.sim.residents[2];
    return { names: r.d.outfits.map((o) => o.name), tags: r.d.outfits.map((o) => o.tags), wearing: r.d.wearing, origTint: Object.keys(r.d.outfits[0].custom?.tints || {}).length, newVariant: !!r.d.outfits[1]?.look?.variantId };
  });
  check('variant saved into the closet (same name + tags), original untouched', closetName === 'Gym Kit' && v2c.names.length === 2 && v2c.names[1] === 'Gym Kit' && v2c.tags[1].includes('exercise') && v2c.wearing === 1 && v2c.origTint === 0 && v2c.newVariant, JSON.stringify({ closetName, ...v2c }));
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- night brightness
  const nb = await ev(() => {
    const a = window.__friendlife;
    const st = a.stage;
    const w = a.weather.p;
    st.nightBrightness = 0; st.updateEnvironment(0.016, 1 * 60, w);
    const dark = st.hemi.intensity;
    st.nightBrightness = 1; st.updateEnvironment(0.016, 1 * 60, w);
    const bright = st.hemi.intensity;
    st.nightBrightness = 1; st.updateEnvironment(0.016, 13 * 60, w);
    const noonB = st.hemi.intensity;
    st.nightBrightness = 0; st.updateEnvironment(0.016, 13 * 60, w);
    const noonD = st.hemi.intensity;
    st.nightBrightness = a.sim.settings.nightBrightness;
    return { dark, bright, noonB, noonD };
  });
  check('night brightness slider lifts the night (not the day)', nb.bright > nb.dark + 0.5 && Math.abs(nb.noonB - nb.noonD) < 1e-6, JSON.stringify(nb));
  await ev(() => window.__friendlife.openSettings());
  await wait(500);
  const settings = await ev(() => [...document.querySelectorAll('.modal')].map((m) => m.innerText).join('\n'));
  check('settings: night brightness, night mischief, cost of living', /Night brightness/i.test(settings) && /Night mischief/i.test(settings) && /Cost of living/i.test(settings), settings.slice(0, 300).replace(/\n/g, ' '));
  await page.keyboard.press('Escape');

  // ---------------------------------------------------------------- the island with its venues
  await ev(() => { const s = window.__friendlife.sim; for (const k of ['playground', 'onsen', 'campfire', 'lookout', 'foodtruck']) { s.money += 2000; s.economy.buyVenue(k); } s.clock = Math.floor(s.clock / 1440) * 1440 + 15 * 60; const c = window.__friendlife.stage; c.controls.target.set(0, 0, -18); c.camera.position.set(0, 42, 14); });
  await wait(2500);
  await page.screenshot({ path: `${OUT}/c2-venues.png` });

  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
