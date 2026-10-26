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
  await new Promise((r) => server.listen(5206, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5206/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  const r = await ev(async () => {
    const app = window.__friendlife;
    const s = app.sim;
    const lib = s.library;
    const data = await (await fetch('/samples/Sample%20Dance.vrma')).arrayBuffer();
    const asset = await lib.add({ name: 'Sample Dance', type: 'animation', data, ext: 'vrma' });
    const clip = await s.registry.loadAsset(asset.id);
    s.registry.actionMap.dance = asset.id;
    const { bakeClip } = window.__friendlifeStudio;
    const doc = bakeClip(clip, 'Dance (edited)');
    // the baked keyframes reproduce the original
    const { KeyframeClip, makePose } = window.__friendlifeAnim;
    const kc = new KeyframeClip(doc);
    const p1 = makePose(), p2 = makePose();
    let maxErr = 0;
    for (const t of [0.1, doc.duration * 0.37, doc.duration * 0.71]) {
      clip.sample(t, p1); kc.sample(t, p2);
      for (const b of Object.keys(p1.rot)) maxErr = Math.max(maxErr, p1.rot[b].angleTo(p2.rot[b]));
    }
    // open it in the Studio (from the Library's Edit button) and save
    app.openStudio(asset.id);
    await new Promise((q) => setTimeout(q, 2500));
    const title = [...document.querySelectorAll('.modal')].map((m) => m.innerText).join(' ');
    const nameInput = [...document.querySelectorAll('.modal input[type=text]')].pop();
    const saveBtn = [...document.querySelectorAll('.modal button')].find((b) => /Save/.test(b.textContent));
    saveBtn?.click();
    await new Promise((q) => setTimeout(q, 1500));
    const mapped = s.registry.actionMap.dance;
    return { keys: doc.keys.length, dur: doc.duration, maxErrDeg: +(maxErr * 180 / Math.PI).toFixed(2), studio: /Animation Studio/.test(title), name: nameInput?.value, mappedToNew: mapped && mapped !== asset.id && lib.get(mapped)?.ext === 'json', originalKept: !!lib.get(asset.id) };
  });
  check('library animation bakes into keyframes that match it', r.keys > 5 && r.maxErrDeg < 3, JSON.stringify(r));
  check('opens in the Studio from the Library', r.studio && /edited/.test(r.name || ''), JSON.stringify(r));
  check('saving the edit takes over the original\'s in-game use (original kept)', r.mappedToNew && r.originalKept, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
