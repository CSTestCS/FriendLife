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
  await new Promise((r) => server.listen(5203, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5203/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const [a, b, c] = s.residents;
    for (const x of s.residents) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); x.nightOut = null; x.sleeping = false; }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 13 * 60;
    s.speed = 4;
    const run = async (cond, max) => { for (let i = 0; i < max && !cond(); i++) { for (let k = 0; k < 20; k++) s.update(0.1); await new Promise((q) => setTimeout(q, 30)); } return cond(); };
    const out = {};
    // a is outside, b is home in their apartment
    if (a.inside) a.exit();
    a.placeAt(0, 10);
    if (b.inside) b.exit();
    b._enterRoom(b.homeKey, 600);
    b.thinkTimer = 9999; // stays put
    const path = [];
    const track = () => { const w = a.inside || 'outside'; if (path[path.length - 1] !== w) path.push(w); };
    s.goInteract(a, b, 'chat');
    const talked = await run(() => { track(); return a.engaged && a.engaged === b.engaged; }, 400);
    out.outsideToApartment = { talked, path, inside: a.inside, target: b.homeKey };
    // c is in the café; b goes from their apartment to find them
    for (const x of [a, b]) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); }
    b.thinkTimer = 0;
    if (c.inside) c.exit();
    c._enterRoom('cafe', 600);
    c.thinkTimer = 9999;
    const p2 = [b.inside || 'outside'];
    s.goInteract(b, c, 'joke');
    const t2 = await run(() => { const w = b.inside || 'outside'; if (p2[p2.length - 1] !== w) p2.push(w + (w === 'cafe' || p2[p2.length - 1] === 'cafe' ? JSON.stringify({ plan: b.plan.map((x) => x.kind), lv: b.leaving, until: +(b.insideUntil - s.clock).toFixed(1), eng: b.engaged?.kind, cIn: c.inside, cEng: c.engaged?.kind, room: !!b.room, act: b.activity, err: b.errand?.kind }) : '')); return b.engaged && b.engaged === c.engaged; }, 400);
    out.apartmentToCafe = { talked: t2, path: p2 };
    return out;
  });
  check('goes into the condo and up to the apartment to talk', r.outsideToApartment.talked && r.outsideToApartment.path.includes('condo') && r.outsideToApartment.inside === r.outsideToApartment.target, JSON.stringify(r.outsideToApartment));
  check('leaves their apartment to find someone in the café', r.apartmentToCafe.talked && r.apartmentToCafe.path.some((w) => w.startsWith('cafe')), JSON.stringify(r.apartmentToCafe));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
