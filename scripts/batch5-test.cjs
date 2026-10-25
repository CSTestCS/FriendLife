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
  await new Promise((r) => server.listen(5202, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5202/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const O = window.__friendlifeOutfits;
    const out = {};
    const [a, b, c] = s.residents;
    for (const x of s.residents) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); x.thinkTimer = 9999; if (x.inside) x.exit(); x.nightOut = null; }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 13 * 60;
    // drying: "mostly dry" isn't dry
    a.d.outfits = [{ name: 'Swimsuit', tags: ['swim'], perception: { self: [], others: [] } }, { name: 'Clothes', tags: [], perception: { self: [], others: [] } }];
    a._enterRoom(a.homeKey, 600);
    await s.changeOutfit(a, 0, { quiet: true, force: true, purpose: 'swim' });
    a.d.wetness = 0.2; a.d.swimWet = true;
    await s.changeOutfit(a, 1, { quiet: true });
    out.dry = { at02: a.d.wearing };
    a.d.wetness = 0.01; s.perMinute(0.05);
    await new Promise((q) => setTimeout(q, 1200));
    out.dry.dry = a.d.wearing;
    // swimming is remembered even if the outfit's reason was lost
    await s.changeOutfit(a, 0, { quiet: true, force: true });
    a.d.outfitPurpose = null; a.d.swimWet = true; a.d.wetness = 0.6; a.exit();
    out.intent = O.underwearIntent(s, a);
    // an onlooker comments once, not over and over
    b.placeAt(a.x + 1, a.z);
    const said = [];
    const sayB = b.say.bind(b); b.say = (t, o) => { said.push(t); return sayB(t, o); };
    b.saidUndies = {}; a.seenUndiesAt = -1e9;
    a.d.outfits[0].name = 'Underwear'; a.d.outfitPurpose = null; a.d.swimWet = false; a.d.lastSwamAt = -1e9; a.d.wetness = 0;
    for (let i = 0; i < 400; i++) { a.seenUndiesAt = -1e9; O.updateExposure(s, 1); }
    b.say = sayB;
    out.comments = said.length;
    // every new interaction kind plays through
    const kinds = ['highfive', 'rps', 'advice', 'brag', 'tease', 'secret', 'snack', 'story', 'selfie', 'complain', 'outfitTalk', 'comfort', 'tag', 'thumbwar', 'duet', 'invite'];
    out.kinds = {};
    for (const k of kinds) {
      for (const x of [b, c]) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); }
      c.placeAt(b.x + 1.2, b.z);
      const steps = window.__friendlifeSocial2.buildExtra(k, { a: b, b: c, sim: s });
      let ok = Array.isArray(steps) && steps.length > 0;
      // run the end-of-script effects too (relationship changes, plans)
      try { for (const st of steps || []) st.fn?.(); } catch (e) { ok = false; }
      out.kinds[k] = ok;
    }
    // shine = the fully-wet look
    const { applyMToonShine, applyMToonWet } = window.__friendlifeMats || {};
    return out;
  });
  check('mostly dry is not dry: waits for all of it', r.dry.at02 === 0 && r.dry.dry === 1, JSON.stringify(r.dry));
  check('remembers they were swimming', r.intent === 'swim', r.intent);
  check('an onlooker comments on underwear once (not repeatedly)', r.comments === 1, String(r.comments));
  check('16 new interaction kinds play', Object.values(r.kinds).every(Boolean), JSON.stringify(r.kinds));

  const sh = await ev(async () => {
    const s = window.__friendlife.sim;
    const lib = s.library;
    const ch = await lib.add({ name: 'Textured Mannequin', type: 'character', data: await (await fetch('/test-samples/Textured%20Mannequin.vrm')).arrayBuffer(), ext: 'vrm' });
    const r = s.residents[3];
    r.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r.d.look.doll };
    r.d.outfits = []; r.d.wearing = -1; r.d.wetness = 0;
    await s.rebuildAvatar(r);
    const slots = r.avatar.materialSlots();
    const [m1, m2] = [r.avatar._materialsForSlot(slots[0].key).find((m) => !m.isOutline), r.avatar._materialsForSlot(slots[1].key).find((m) => !m.isOutline)];
    m1.userData.origMap.map.name = 'Belt_Metallic';
    await r.applyLook();
    const metal = { f: m1.matcapFactor.r, rimP: m1.parametricRimFresnelPowerFactor, col: m1.color.r };
    // a plain part made fully wet for comparison
    r.avatar.setWetness(1);
    const wet = { f: m2.matcapFactor.r, rimP: m2.parametricRimFresnelPowerFactor, sameTex: m1.matcapTexture === m2.matcapTexture };
    r.avatar.setWetness(0);
    return { metal, wet, metalAfterDry: m1.matcapFactor.r };
  });
  check('metallic = the fully-wet look (and stays when dry)', Math.abs(sh.metal.f - sh.wet.f) < 1e-6 && Math.abs(sh.metal.rimP - sh.wet.rimP) < 1e-6 && sh.wet.sameTex && Math.abs(sh.metalAfterDry - sh.wet.f) < 1e-6, JSON.stringify(sh));

  const v = await ev(() => {
    const a = window.__friendlife;
    const s = a.sim;
    const r = s.residents[0];
    if (s.viewRoom) a.leaveRoom();
    s.social.cancelFor(r); r.engaged = null;
    if (r.inside) r.exit();
    s.select(r);
    a.stage.controls.target.set(r.x, 0, r.z);
    a.stage.camera.position.set(r.x, 15, r.z + 20);
    s.speed = 1;
    s.settings.voice = 'babble';
    const calls = [];
    const orig = a.voice.speak.bind(a.voice);
    a.voice.speak = (text) => { calls.push(text); };
    r.say('First line here!'); r.say('Second line right after!');
    a.voice.speak = orig;
    return calls;
  });
  check('every line is voiced (bubble and voice match)', v.length === 2 && /Second/.test(v[1]), JSON.stringify(v));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
