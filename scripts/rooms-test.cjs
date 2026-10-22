// Rooms, jobs and voice customization test.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.SHOTS || 'shots';
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
(async () => {
  await new Promise((r) => server.listen(5186, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5186/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);

  // ---- jobs: give jobs, jump to 9:00, run the sim quickly so they commute
  await ev(() => {
    const a = window.__friendlife;
    const s = a.sim;
    const [r0, r1, r2, r3] = s.residents;
    // assign via the job problem flow (exercises problems.js + jobs.js)
    for (const [r, id] of [[r0, 'barista'], [r1, 'doctor'], [r2, 'performer'], [r3, 'clerk']]) {
      r.d.problem = null;
      s.problems.offer(r, 'wantJob', {});
      s.problems.solve(r, 'pick', { job: id });
      r.d.job.dayOff = (s.day + 3) % 7;
    }
    s.clock = Math.floor(s.clock / 1440) * 1440 + 8 * 60 + 50;
    a.started = false; // drive the sim manually
    s.speed = 4;
    const end = s.clock + 90;
    let n = 0;
    while (s.clock < end && n < 20000) { s.update(0.05); n++; }
    a.started = true;
    s.speed = 1;
  });
  const work = await ev(() => window.__friendlife.sim.residents.slice(0, 4).map((r) => ({ name: r.name, job: r.d.job?.id, inside: r.inside, working: !!r.working, seat: r.seat?.type })));
  console.log(JSON.stringify(work));
  check('barista working inside café', work[0].inside === 'cafe' && work[0].working, JSON.stringify(work[0]));
  check('doctor working inside clinic', work[1].inside === 'clinic' && work[1].working, JSON.stringify(work[1]));
  // ---- view the café
  await ev(() => window.__friendlife.viewRoom('cafe'));
  await ev(() => { const s = window.__friendlife.sim; const c = s.residents[4]; if (c.inside) c.exit(); c.enter('cafe', 120); });
  await wait(3000);
  await page.screenshot({ path: `${OUT}/r1-cafe.png` });
  console.log('barista', JSON.stringify(await ev(() => { const s = window.__friendlife.sim; const b = s.residents[0]; const room = s.rooms.get('cafe'); return { seat: b.seat?.type, x: +(b.x - room.ox).toFixed(2), z: +b.z.toFixed(2), anim: b.player.action }; })));
  check('room view active', await ev(() => window.__friendlife.sim.viewRoom?.key === 'cafe'));
  // ---- home at night
  await ev(() => {
    const a = window.__friendlife;
    const s = a.sim;
    const r = s.residents[5];
    if (r.inside) r.exit();
    s.clock = Math.floor(s.clock / 1440) * 1440 + 23 * 60;
    r.sleeping = true;
    r.enter(`home:${r.id}`, 300);
    const friend = s.residents[4];
    if (friend.inside) friend.exit();
    a.viewRoom(`home:${r.id}`);
    window.__homeRes = r;
  });
  await page.waitForFunction(() => window.__homeRes.seat?.type === 'bed', null, { timeout: 60000 }).catch(() => {});
  await wait(1500);
  await page.screenshot({ path: `${OUT}/r2-home-night.png` });
  const home = await ev(() => ({ seat: window.__homeRes.seat?.type, y: +window.__homeRes.group.position.y.toFixed(2), anim: window.__homeRes.player.action }));
  check('sleeping in bed', home.seat === 'bed' && home.y > 0.3, JSON.stringify(home));
  // ---- daytime home with a visitor + decorate
  await ev(async () => {
    const a = window.__friendlife;
    const s = a.sim;
    s.clock = Math.floor(s.clock / 1440) * 1440 + 1440 + 14 * 60;
    const r = window.__homeRes;
    r.sleeping = false;
    r.clearPlan(); r.leaveSeat();
    r.insideUntil = s.clock + 200;
    const v = s.residents[4];
    if (v.inside) v.exit();
    v.clearPlan();
    v.enter(`home:${r.id}`, 120);
    await s.rooms.setStyle(`home:${r.id}`, { wall: '#ffe3ec', floor: '#f2c9d6', decor: ['piano', 'aquarium', 'teddy'] });
  });
  await wait(5000);
  await page.screenshot({ path: `${OUT}/r3-home-day.png` });
  // ---- outside: click on the clinic building to look inside
  await ev(() => window.__friendlife.leaveRoom());
  check('left room view', await ev(() => !window.__friendlife.sim.viewRoom));
  // ---- voices
  const v = await ev(() => {
    const s = window.__friendlife.sim;
    const r = s.residents[0];
    Object.assign(r.d.voice, { tic: 'nya', ticChance: 1, stutter: 1 });
    r.say('I love cake!');
    const shown = r.bubble.text;
    s.voice.speak('Hello there, how are you today?', r.d.voice, { mode: 'babble', force: true, mood: 'happy' });
    return { shown };
  });
  check('verbal tic + stutter', v.shown === 'I-I love cake, nya!', JSON.stringify(v));
  await page.locator('.res-card').first().click();
  await wait(800);
  await page.locator('#panel button', { hasText: 'Voice' }).click();
  await wait(600);
  await page.locator('.modal button', { hasText: 'Cute' }).click();
  await wait(400);
  await page.screenshot({ path: `${OUT}/r4-voice.png` });
  check('preset applied', await ev(() => window.__friendlife.sim.residents[0].d.voice.pitch === 1.8));
  await page.keyboard.press('Escape');
  await page.locator('#panel').evaluate((el) => { el.scrollTop = 520; });
  await wait(500);
  await page.screenshot({ path: `${OUT}/r5-panel-job.png` });
  // ---- save / load keeps jobs & room styles
  await ev(() => window.__friendlife.save());
  await wait(800);
  await page.reload();
  await page.waitForSelector('#titleButtons button');
  await page.locator('#titleButtons button').first().click();
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const after = await ev(() => ({ job: window.__friendlife.sim.residents[0].d.job?.id, style: window.__friendlife.sim.rooms.styles[`home:${window.__friendlife.sim.residents[5].id}`]?.decor, voice: window.__friendlife.sim.residents[0].d.voice.tic }));
  check('save keeps jobs, decor, voice', after.job === 'barista' && after.style?.[0] === 'piano' && after.voice === 'nya', JSON.stringify(after));
  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 20).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
