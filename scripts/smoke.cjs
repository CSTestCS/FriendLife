// Headless smoke test: serves dist/, starts a new island, runs the sim for a
// while at high speed, forces weather, and saves screenshots.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.SHOTS || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const root = path.join(__dirname, '..', 'dist');
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(5178, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  await page.goto('http://localhost:5178/');
  await page.waitForSelector('#titleButtons button', { timeout: 60000 });
  await page.screenshot({ path: `${OUT}/0-title.png` });
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const steps = (process.env.STEPS || 'default').split(',');
  const run = (fn, arg) => page.evaluate(fn, arg);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/1-start.png` });
  // fast-forward with a scripted scenario
  await run(() => { const a = window.__friendlife; a.setSpeed(8); });
  await page.waitForTimeout(6000);
  await run(() => { const a = window.__friendlife; const s = a.sim; s.select(s.residents[0]); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/2-selected.png` });
  // force a fight
  await run(() => { const a = window.__friendlife; a.setSpeed(1); const s = a.sim; const [x, y] = s.residents; for (const r of [x, y]) { if (r.inside) r.exit(); r.engaged = null; r.clearPlan(); } y.placeAt(x.x + 1, x.z); s.fights.start(x, y, 'argument'); s.select(x); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/3-fight.png` });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/3b-fight.png` });
  // rain
  await run(() => { const a = window.__friendlife; a.sim.weather.set('storm', true); a.sim.weather.p.rain = 1; a.sim.weather.p.cloud = 1; a.sim.weather.wetness = 0.9; for (const r of a.sim.residents) { r.d.wetness = 0.9; r.avatar?.setWetness(0.9); } a.sim.select(null); a.sim.followTarget = null; a.stage.controls.target.set(0, 0, 6); a.stage.camera.position.set(8, 9, 22); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/4-storm.png` });
  await run(() => { const a = window.__friendlife; a.sim.weather.set('snow', true); a.sim.weather.p.rain = 0; a.sim.weather.p.snow = 0.8; a.sim.weather.snowCover = 0.8; a.sim.weather.wetness = 0.3; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/5-snow.png` });
  await run(() => { const a = window.__friendlife; a.sim.weather.set('sunny', true); a.sim.weather.p.snow = 0; a.sim.weather.snowCover = 0; a.sim.weather.wetness = 0; a.sim.clock = Math.floor(a.sim.clock / 1440) * 1440 + 1440 + 21.5 * 60; });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/6-night.png` });
  // simulate a full day at high speed to shake out logic errors
  await run(() => { const a = window.__friendlife; a.sim.weather.locked = false; a.sim.settings.conflict = 'spicy'; a.setSpeed(8); });
  for (let i = 0; i < Number(process.env.SIM_SECONDS || 30); i++) await page.waitForTimeout(1000);
  const stats = await run(() => { const s = window.__friendlife.sim; return { day: s.day, clock: s.clock, news: s.newsLog.slice(0, 25).map((n) => n.text), fights: s.fights.total, residents: s.residents.map((r) => ({ n: r.name, inj: r.d.injuries.map((i) => i.type), hap: Math.round(r.d.happiness), prob: r.d.problem?.type, inside: r.inside })) }; });
  console.log(JSON.stringify(stats, null, 1));
  await page.screenshot({ path: `${OUT}/7-later.png` });
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 40).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
