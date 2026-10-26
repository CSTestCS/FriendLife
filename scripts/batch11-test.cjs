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
  await new Promise((r) => server.listen(5208, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5208/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const islandCheck = () => ev(() => {
    const s = window.__friendlife.sim;
    const isl = s.island;
    // anything solid (tree, lamp, rock…) overlapping a seat's bench?
    const bad = [];
    for (const seat of isl.seats.filter((st) => !st.table)) {
      for (const o of isl.obstacles) {
        const d = Math.hypot(o.x - seat.x, o.z - seat.z);
        if (d > 0.55 && d < o.r + 0.35 && o.r < 1.2) bad.push({ seat: seat.area, d: +d.toFixed(2), r: o.r });
      }
    }
    return bad;
  });
  let overlaps = await islandCheck();
  for (let k = 0; k < 2; k++) {
    await page.reload();
    await page.waitForSelector('#titleButtons button');
    await page.click('#titleButtons button');
    await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
    overlaps = overlaps.concat(await islandCheck());
  }
  check('no trees / props on top of benches (3 fresh islands)', overlaps.length === 0, JSON.stringify(overlaps.slice(0, 5)));

  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const out = {};
    const [v, h, x, y] = s.residents;
    for (const q of s.residents) { s.social.cancelFor(q); q.engaged = null; q.clearPlan(); if (q.inside) q.exit(); q.thinkTimer = 9999; }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 13 * 60;
    // rescuer with an Underwear outfit strips down before diving in
    h.d.outfits = [{ name: 'Underwear', tags: [], perception: { self: [], others: [] } }];
    h.d.wearing = -1;
    const shore = s.island.shorePoint();
    v.placeAt(shore.x, shore.z + 6);
    h.placeAt(shore.x + 1, shore.z - 1);
    s.swim.distress(v);
    const c = s.swim.cases.find((cc) => cc.victim === v);
    if (c) s.swim.dispatch(c, h, false);
    out.rescue = { wearing: h.d.wearing, rescuing: c?.rescuer === h };
    // conversations wait for the voice to finish
    for (const q of [x, y]) { s.social.cancelFor(q); q.engaged = null; q.clearPlan(); }
    x.placeAt(0, 12); y.placeAt(1, 12);
    let talking = true;
    const orig = x.saying.bind(x);
    x.saying = () => talking;
    const it = s.social.start(x, y, 'chat', { force: true });
    let t = 0;
    while (it && it.phase !== 'script' && t < 2000) { s.update(0.05); t++; }
    const i0 = it?.beatIndex;
    for (let k = 0; k < 160; k++) s.update(0.05); // 8 s, voice still going (longer than the beat)
    out.heldBeat = it?.beatIndex === i0;
    talking = false;
    for (let k = 0; k < 120; k++) s.update(0.05);
    out.movedOn = it?.beatIndex !== i0 || it?.done;
    x.saying = orig;
    // intent: going swimming
    s.social.cancelFor(x); x.engaged = null; x.clearPlan();
    x.d.outfits = []; x.d.wearing = -1;
    s.swim.planSwim(x);
    out.intent = x.describeIntent();
    s.select(x);
    await new Promise((q) => setTimeout(q, 900));
    out.panel = document.querySelector('.intent')?.textContent || '';
    return out;
  });
  check('rescuer strips to their Underwear outfit before diving in', r.rescue.rescuing && r.rescue.wearing === 0, JSON.stringify(r.rescue));
  check('chat waits for the voice to finish, then carries on', r.heldBeat && r.movedOn, JSON.stringify({ held: r.heldBeat, moved: r.movedOn }));
  check('selected resident shows what they\'re trying to do', /swimming/i.test(r.intent.text) && /swimming/i.test(r.panel), JSON.stringify({ intent: r.intent, panel: r.panel }));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
