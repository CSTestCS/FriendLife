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
  await new Promise((r) => server.listen(5205, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5205/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const s = window.__friendlife.sim;
    const app = window.__friendlife;
    while (s.residents.length < 7) await s.addRandomResident({ announce: false });
    const [m, a, b, c, d] = s.residents;
    for (const x of s.residents) { s.social.cancelFor(x); x.engaged = null; x.clearPlan(); x.nightOut = null; x.sleeping = false; x.d.job = null; if (x.inside) x.exit(); }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 9 * 60;
    m.d.problem = null; s.problems.offer(m, 'wantJob', {}); s.problems.solve(m, 'pick', { job: 'mail' });
    m.d.job.dayOff = (s.day + 3) % 7;
    // a and b are home, c's apartment is empty (c is outside), d is asleep
    for (const x of [a, b, d]) { x._enterRoom(x.homeKey, 600); x.thinkTimer = 9999; }
    d.sleeping = true;
    c.placeAt(5, 15); c.thinkTimer = 9999;
    // make sure someone has something to send
    for (const x of [a, b, c]) { x.d.traits.sociability = 1; for (const y of s.residents) if (y !== x) { x.rel(y.id).met = true; x.rel(y.id).score = 50; } }
    m.placeAt(0, -20);
    s.speed = 4;
    const said = [];
    const log = (who) => { const f = who.say.bind(who); who.say = (t, o) => { said.push(`${who.name}: ${typeof t === 'string' ? t : t?.text}`); return f(t, o); }; };
    s.residents.forEach(log);
    const visitsIn = new Set();
    for (let i = 0; i < 900; i++) {
      for (let k = 0; k < 10; k++) s.update(0.1);
      if (m.inside && m.inside.startsWith('home:')) visitsIn.add(m.inside);
      await new Promise((q) => setTimeout(q, 5));
      if (s.mail.seen.has(c.id) && s.mail.knocked.size >= 4 && !s.mail.bag.length && i > 50) break;
    }
    return {
      knocked: [...s.mail.knocked].length, seen: [...s.mail.seen].map((id) => s.byId(id)?.name), visitsIn: [...visitsIn].map((k) => s.byId(k.slice(5))?.name),
      bag: s.mail.bag.map((x) => `${x.kind}→${s.byId(x.to)?.name}`), names: { m: m.name, a: a.name, b: b.name, c: c.name, d: d.name },
      said: said.filter((t) => !/^\S+: \*(brush|yawn)/.test(t)).slice(0, 60),
    };
  });
  console.log(JSON.stringify(r, null, 1));
  check('knocks on every apartment door', r.knocked >= 4, String(r.knocked));
  check('let in where someone is home (not empty / asleep ones)', r.visitsIn.includes(r.names.a) && r.visitsIn.includes(r.names.b) && !r.visitsIn.includes(r.names.c) && !r.visitsIn.includes(r.names.d), JSON.stringify(r.visitsIn));
  check('patrols and finds people outside', r.seen.includes(r.names.c), JSON.stringify(r.seen));
  check('takes and delivers messages', r.said.some((t) => /Any messages to send/.test(t)) && r.said.some((t) => /Got it|Consider it sent|Will do/.test(t)), r.said.slice(0, 6).join(' | '));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
