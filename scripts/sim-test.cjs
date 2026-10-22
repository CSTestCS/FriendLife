// Runs the simulation for several in-game days without rendering and prints what happened.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(5184, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5184/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const days = Number(process.env.DAYS || 3);
  const conflict = process.env.CONFLICT || 'normal';
  const out = await page.evaluate(async ({ days, conflict }) => {
    const a = window.__friendlife;
    const s = a.sim;
    a.started = false; // stop the render loop from also updating the sim
    s.settings.conflict = conflict;
    s.speed = 8;
    const t0 = performance.now();
    const target = s.clock + days * 1440;
    let frames = 0;
    let maxFrame = 0;
    while (s.clock < target) {
      const f0 = performance.now();
      s.update(0.05);
      s.weather.update(0.4, 0.4, s.minuteOfDay);
      maxFrame = Math.max(maxFrame, performance.now() - f0);
      frames++;
      if (frames % 400 === 0) await new Promise((r) => setTimeout(r, 0)); // let timers fire
    }
    const ms = performance.now() - t0;
    return {
      stats: s.social.stats, frames, msPerFrame: +(ms / frames).toFixed(3), maxFrame: +maxFrame.toFixed(1), day: s.day, fights: s.fights.total, money: s.money,
      weather: s.weather.history,
      news: s.newsLog.map((n) => `D${n.day} ${String(Math.floor(n.time / 60)).padStart(2, '0')}:${String(Math.floor(n.time % 60)).padStart(2, '0')} ${n.icon} ${n.text}`).reverse(),
      residents: s.residents.map((r) => ({ name: r.name, hap: Math.round(r.d.happiness), lvl: r.d.level, inj: r.d.injuries.map((i) => i.type).join(','), prob: r.d.problem?.type, wet: +r.d.wetness.toFixed(2), rel: Object.entries(r.d.relationships).map(([id, x]) => `${s.byId(id)?.name}:${Math.round(x.score)}${x.partner ? '♥' : x.crush ? '♡' : ''}${x.grudge > 20 ? `g${Math.round(x.grudge)}` : ''}`).join(' ') })),
    };
  }, { days, conflict });
  console.log(`frames=${out.frames} ms/frame=${out.msPerFrame} max=${out.maxFrame} day=${out.day} fights=${out.fights} money=${out.money}`);
  console.log('weather:', out.weather.join(' → '));
  console.log('interactions:', JSON.stringify(out.stats));
  console.log(out.news.join('\n'));
  for (const r of out.residents) console.log(JSON.stringify(r));
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 20).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
