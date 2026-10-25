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
  await new Promise((r) => server.listen(5204, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5204/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const a = s.residents[0];
    for (const x of s.residents) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); x.thinkTimer = 9999; }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 13 * 60;
    a.d.outfits = [{ name: 'Swimsuit', tags: ['swim'], perception: { self: [], others: [] } }];
    a.d.wearing = -1; a.d.waterFear = 0;
    const out = {};
    // at the condo pool in normal clothes
    if (a.inside) a.exit();
    a._enterRoom('condoPool', 60);
    a.swimDressAt = null;
    const pool = s.swim.planSwim(a);
    out.pool = { ret: pool, errand: a.errand?.kind || null, swimSteps: a.plan.some((p) => p.kind === 'anim' && /float|tread/.test(p.anim)) };
    // outside on the way to the beach
    a.clearPlan(); a.errand = null; if (a.inside) a.exit(); a.placeAt(0, 20); a.swimDressAt = null;
    const beach = s.swim.planSwim(a);
    out.beach = { ret: beach, errand: a.errand?.kind || null, swimSteps: a.plan.some((p) => p.kind === 'anim' && /float|tread/.test(p.anim)) };
    // already in swimwear: straight in
    a.clearPlan(); a.errand = null;
    await s.changeOutfit(a, 0, { quiet: true, force: true });
    s.swim.planSwim(a);
    out.inSwimwear = a.plan.some((p) => p.kind === 'anim' && /float|tread/.test(p.anim));
    return out;
  });
  check('pool: goes to change into swimwear instead of swimming in clothes', r.pool.ret === true && r.pool.errand === 'dress' && !r.pool.swimSteps, JSON.stringify(r.pool));
  check('beach: goes to change into swimwear first', r.beach.ret === true && r.beach.errand === 'dress' && !r.beach.swimSteps, JSON.stringify(r.beach));
  check('in swimwear: swims right away', r.inSwimwear, String(r.inSwimwear));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
