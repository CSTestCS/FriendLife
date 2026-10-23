// Performance probe: many VRM residents, frame-time breakdown, GPU/heap memory.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/test-samples/') ? path.join(base, 'samples/test', u.slice(14)) : path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
const N = +(process.env.N || 14);
(async () => {
  await new Promise((r) => server.listen(5191, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5191/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const out = await ev(async (N) => {
    const app = window.__friendlife;
    const s = app.sim;
    const lib = s.library;
    const get = async (f) => (await fetch(`/samples/${encodeURIComponent(f)}`)).arrayBuffer();
    // a mannequin with real (embedded) textures, so texture sharing shows up
    const ch = await lib.add({ name: 'Textured Mannequin', type: 'character', data: await (await fetch('/test-samples/Textured%20Mannequin.vrm')).arrayBuffer(), ext: 'vrm' });
    const of = await lib.add({ name: 'Sample Hoodie Outfit', type: 'outfit', data: await get('Sample Hoodie Outfit.vrm'), ext: 'vrm' });
    while (s.residents.length < N) await s.addRandomResident();
    for (const r of s.residents) {
      r.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r.d.look.doll };
      r.d.outfits = [{ name: 'Hoodie', look: null, outfit: { assetId: of.id, parts: null }, tags: [], perception: { self: [], others: [] } }];
      r.d.wearing = -1;
      await s.rebuildAvatar(r);
    }
    const mem = () => ({ tex: app.stage.renderer.info.memory.textures, geo: app.stage.renderer.info.memory.geometries, heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6), progs: app.stage.renderer.info.programs?.length });
    await new Promise((r) => setTimeout(r, 800));
    const built = mem();
    // swap outfits back and forth like a few days of changing would
    for (let k = 0; k < 3; k++) for (const r of s.residents) { await s.changeOutfit(r, 0, { quiet: true }); await new Promise((q) => requestAnimationFrame(q)); await s.changeOutfit(r, -1, { quiet: true }); await new Promise((q) => requestAnimationFrame(q)); }
    window.gc?.();
    await new Promise((r) => setTimeout(r, 800));
    const before = mem();
    // frame breakdown
    const T = {};
    const wrap = (obj, name, label) => { const f = obj[name].bind(obj); obj[name] = function (...a) { const t = performance.now(); const r = f(...a); T[label] = (T[label] || 0) + performance.now() - t; return r; }; };
    wrap(s, 'update', 'sim.update');
    wrap(s, 'perMinute', ' perMinute');
    wrap(app.stage, 'render', 'stage.render');
    wrap(app.hud, 'update', 'hud');
    wrap(app.panel, 'update', 'panel');
    for (const r of s.residents) wrap(r, 'update', ' residents.update');
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { frames++; if (performance.now() - t0 < 8000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const ms = performance.now() - t0;
    // every resident uses the same file: their textures should share one image each
    const sources = new Set(), texs = new Set();
    for (const r of s.residents) r.avatar.root.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) { const t = m.userData.origMap?.map || m.map; if (t?.isTexture && t.source?.data) { texs.add(t); sources.add(t.source); } } });
    const sharing = { textures: texs.size, images: sources.size };
    const per = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +(v / frames).toFixed(2)]));
    return { residents: s.residents.length, sharing, built, afterSwaps: before, fps: +(frames / ms * 1000).toFixed(1), perFrameMs: per, calls: app.stage.renderer.info.render.calls, tris: app.stage.renderer.info.render.triangles };
  }, N);
  console.log(JSON.stringify(out, null, 1));
  if (errors.length) console.log('ERRORS', errors.slice(0, 5));
  await browser.close(); server.close();
})();
