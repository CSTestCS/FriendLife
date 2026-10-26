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
  await new Promise((r) => server.listen(5207, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5207/');
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
    await s.registry.loadAsset(asset.id);
    s.registry.actionMap.sleep = asset.id;
    // stretch it into a long one so the key list is big
    app.openStudio(asset.id);
    await new Promise((q) => setTimeout(q, 2500));
    const modal = () => [...document.querySelectorAll('.modal')].pop();
    const keyBtns = () => [...modal().querySelectorAll('.keys button')].length;
    const out = { keyButtonsShown: keyBtns(), header: modal().innerText.match(/Keyframes \((\d+)\)/)?.[1] };
    // expand / collapse
    const toggle = [...modal().querySelectorAll('button')].find((b) => b.textContent === '▸' || b.textContent === '▾');
    toggle.click(); await new Promise((q) => setTimeout(q, 200));
    out.afterToggle = keyBtns();
    // turn the whole animation around
    const btn = (txt) => [...modal().querySelectorAll('button')].find((b) => b.textContent.includes(txt));
    btn('Whole animation').click(); await new Promise((q) => setTimeout(q, 100));
    btn('Turn around 180').click(); await new Promise((q) => setTimeout(q, 100));
    out.sections = /Rotation/i.test(modal().innerText) && /Position/i.test(modal().innerText);
    btn('Save to Library').click();
    await new Promise((q) => setTimeout(q, 1500));
    const id = s.registry.actionMap.sleep;
    const saved = JSON.parse(await lib.getText(id));
    // in game: the clip is turned 180° compared with the original
    const { makePose } = window.__friendlifeAnim;
    const a = makePose(), b = makePose();
    s.registry.custom.get(asset.id).sample(0.3, a);
    s.registry.resolve('sleep').sample(0.3, b);
    out.offset = saved.offset;
    out.turnDeg = +(a.rot.hips.angleTo(b.rot.hips) * 180 / Math.PI).toFixed(1);
    return out;
  });
  check('key list collapses / expands (long ones start collapsed)', (+r.header > 24 ? r.keyButtonsShown === 0 && r.afterToggle === +r.header : r.keyButtonsShown === +r.header && r.afterToggle === 0), JSON.stringify(r));
  check('body position + rotation controls', r.sections, JSON.stringify(r));
  check('whole-animation rotation saved and used in game', r.offset?.rot?.[1] === 180 && Math.abs(r.turnDeg - 180) < 1, JSON.stringify(r));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join('\n'));
  await browser.close();
  server.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})();
