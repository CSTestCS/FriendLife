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
  await new Promise((r) => server.listen(5201, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5201/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const out = {};
    const [a, b, c] = s.residents;
    for (const x of s.residents) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); x.thinkTimer = 9999; }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 13 * 60;
    // romance: men and women only
    const { canRomance } = window.__friendlifeRel;
    a.d.gender = 'm'; b.d.gender = 'm'; c.d.gender = 'f';
    a.rel(b.id).score = 95; a.rel(b.id).crush = false;
    for (let i = 0; i < 200; i++) s.social.maybeCrush(a, b);
    out.romance = { mm: canRomance(a, b), mf: canRomance(a, c), crushMM: a.rel(b.id).crush };
    // drying: wet in underwear → waits until dry
    a.d.outfits = [{ name: 'Underwear', tags: [], perception: { self: [], others: [] } }, { name: 'Clothes', tags: [], perception: { self: [], others: [] } }];
    if (a.inside) a.exit(); a._enterRoom(a.homeKey, 600);
    await s.changeOutfit(a, 0, { quiet: true, force: true });
    a.d.wetness = 1;
    await s.changeOutfit(a, 1, { quiet: true });
    const waiting = { wearing: a.d.wearing, wet: a.d.wetness, pending: !!a.pendingChange };
    a.d.wetness = 0.1; s.perMinute(0.1);
    await new Promise((q) => setTimeout(q, 1500));
    out.dry = { waiting, after: a.d.wearing };
    // visiting inside the condo never leaves the building
    if (b.inside) b.exit(); b._enterRoom(b.homeKey, 600); b.sleeping = false;
    if (c.inside) c.exit(); c._enterRoom(c.homeKey, 600);
    c.thinkTimer = 0; b.thinkTimer = 9999;
    c.enter(b.homeKey, 60);
    const seen = [c.inside];
    for (let i = 0; i < 4000 && c.inside !== b.homeKey; i++) { s.update(0.1); if (seen[seen.length - 1] !== (c.inside || 'outside')) seen.push(c.inside || 'outside'); }
    out.visit = { seen, target: b.homeKey, plan: c.plan.map((x) => x.kind), leaving: c.leaving, route: c.route?.keys, step: c.step?.kind, eng: !!c.engaged };
    // avoidance: two walking at each other pass without bumping
    const [p, q] = s.residents.slice(3, 5);
    for (const x of [p, q]) { if (x.inside) x.exit(); x.clearPlan(); }
    p.placeAt(-6, 18); q.placeAt(6, 18);
    p.moveTo(6, 18); q.moveTo(-6, 18);
    let minD = 99;
    for (let i = 0; i < 300; i++) { s.update(0.05); minD = Math.min(minD, Math.hypot(p.x - q.x, p.z - q.z)); }
    out.avoid = { minD: +minD.toFixed(2), pArrived: Math.hypot(p.x - 6, p.z - 18) < 1 };
    // teleport
    s.teleport(p, 'beach');
    const t1 = { inside: p.inside, d: Math.hypot(p.x - s.locations.beach.x, p.z - s.locations.beach.z) };
    s.teleport(p, 'cafe');
    out.teleport = { t1, t2: p.inside };
    return out;
  });
  check('romance only between men and women', !r.romance.mm && r.romance.mf && !r.romance.crushMM, JSON.stringify(r.romance));
  check('wet: waits until dry, then dresses (no towel)', r.dry.waiting.wearing === 0 && r.dry.waiting.wet === 1 && r.dry.waiting.pending && r.dry.after === 1, JSON.stringify(r.dry));
  check('condo visit stays inside the building', r.visit.seen[r.visit.seen.length - 1] === r.visit.target && !r.visit.seen.includes('outside'), JSON.stringify(r.visit));
  check('residents steer around each other', r.avoid.minD > 0.5, JSON.stringify(r.avoid));
  check('teleport outside / into a room', r.teleport.t1.inside === null && r.teleport.t1.d < 3 && r.teleport.t2 === 'cafe', JSON.stringify(r.teleport));

  // shine on a VRoid-style material (rim mask) + outline untouched
  const sh = await ev(async () => {
    const s = window.__friendlife.sim;
    const lib = s.library;
    const ch = await lib.add({ name: 'Textured Mannequin', type: 'character', data: await (await fetch('/test-samples/Textured%20Mannequin.vrm')).arrayBuffer(), ext: 'vrm' });
    const r = s.residents[2];
    r.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r.d.look.doll };
    r.d.outfits = []; r.d.wearing = -1;
    await s.rebuildAvatar(r);
    const slots = r.avatar.materialSlots();
    const mats = r.avatar._materialsForSlot(slots[0].key);
    const main = mats.find((m) => !m.isOutline);
    // a built-in texture named like a silk fabric, and a rim mask like VRoid's
    main.userData.origMap.map.name = 'Dress_Silk_01';
    main.rimMultiplyTexture = main.userData.origMap.map;
    await r.applyLook();
    const out = { shine: main.userData.shine, matcap: main.matcapFactor.r, mask: !!main.rimMultiplyTexture, outline: mats.filter((m) => m.isOutline).map((m) => m.matcapFactor.r) };
    // export → import round trip
    let saved = null;
    window.__dl = (n, t) => { saved = t; };
    return out;
  });
  check('built-in "silk" texture shines (rim mask lifted, outline untouched)', sh.shine === 'silk' && sh.matcap >= 0.5 && !sh.mask && sh.outline.every((v) => v < 0.5), JSON.stringify(sh));

  const io = await ev(async () => {
    const s = window.__friendlife.sim;
    const r = s.residents[2];
    const { exportCharacter, importForTest } = window.__friendlifeCharIO;
    let text = null;
    await exportCharacter(window.__friendlife, r, (n, t) => { text = t; });
    const file = JSON.parse(text);
    const n0 = s.residents.length;
    await importForTest(window.__friendlife, file);
    const nr = s.residents[s.residents.length - 1];
    return { assets: file.assets.length, n0, n1: s.residents.length, name: nr.name, look: nr.d.look.kind, sameModel: !!s.library.get(nr.d.look.assetId), condo: s.condo.unitOf(nr.id) != null };
  });
  check('export → import a character (with its model)', io.n1 === io.n0 + 1 && io.assets >= 1 && io.look === 'vrm' && io.sameModel && io.condo, JSON.stringify(io));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
