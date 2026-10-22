// Headless test of the VRM pipeline using the generated samples.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.SHOTS || 'shots';
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/samples/') ? path.join(base, u) : path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(5179, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  await page.goto('http://localhost:5179/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const a = window.__friendlife;
    const s = a.sim;
    const lib = s.library;
    const get = async (f) => (await fetch(`/samples/${encodeURIComponent(f)}`)).arrayBuffer();
    const ch = await lib.add({ name: 'Sample Mannequin', type: 'character', data: await get('Sample Mannequin.vrm'), ext: 'vrm' });
    const of = await lib.add({ name: 'Sample Hoodie Outfit', type: 'outfit', data: await get('Sample Hoodie Outfit.vrm'), ext: 'vrm' });
    const an = await lib.add({ name: 'Sample Dance', type: 'animation', data: await get('Sample Dance.vrma'), ext: 'vrma' });
    const clip = await s.registry.loadAsset(an.id);
    const out = { clip: clip ? { d: clip.duration, bones: Object.keys(clip.interps).length } : s.registry.errors.get(an.id) };
    const r1 = s.residents[0];
    r1.d.look = { kind: 'vrm', assetId: ch.id, variantId: null, doll: r1.d.look.doll };
    await s.rebuildAvatar(r1);
    const ch0 = await lib.add({ name: 'Sample Mannequin VRM0', type: 'character', data: await get('test/Sample Mannequin VRM0.vrm'), ext: 'vrm' });
    const r2 = s.residents[1];
    r2.d.look = { kind: 'vrm', assetId: ch0.id, variantId: null, doll: r2.d.look.doll };
    r2.d.outfit = { assetId: of.id, variantId: null, parts: null };
    await s.rebuildAvatar(r2);
    // hide base clothing under outfit
    r2.d.custom.hidden = ['N00_000_00_Tops_01_CLOTH', 'N00_000_00_Bottoms_01_CLOTH'];
    await r2.applyLook();
    out.r1 = { kind: r1.avatar.kind, height: r1.avatar.height, slots: r1.avatar.materialSlots().map((x) => `${x.category}:${x.label}`) };
    out.r2 = { vrm0: r2.avatar.isVRM0, kind: r2.avatar.kind, outfitMeshes: r2.avatar.outfit?.meshes.length, slots: r2.avatar.materialSlots().length };
    out.mtoon = r1.avatar.materials.map((m) => m.type);
    // put them side by side in front of the camera, idle
    for (const [i, r] of [r1, r2, s.residents[2]].entries()) { if (r.inside) r.exit(); r.engaged = null; r.clearPlan(); r.placeAt(-1.2 + i * 1.2, 6); r.heading = 0; r.targetHeading = 0; r.play('idle'); r.thinkTimer = 9999; }
    s.residents[2].d.hasUmbrella = true;
    a.setSpeed(1);
    s.select(null); s.followTarget = null; s.settings.follow = false;
    a.stage.controls.target.set(0, 1.0, 6); a.stage.camera.position.set(0.6, 1.9, 10.2);
    // stop brains from moving them during the test
    window.__freeze = [r1, r2, s.residents[2]];
    return out;
  });
  console.log(JSON.stringify(result, null, 1));
  const freeze = () => page.evaluate(() => { for (const r of window.__freeze) { r.thinkTimer = 9999; r.clearPlan(); } });
  await freeze();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/v1-vrm.png` });
  await page.evaluate(() => { const [r1, r2, r3] = window.__freeze; const id = [...window.__friendlife.sim.registry.custom.keys()][0]; r1.play(id); r2.play('punch', { loop: true }); r3.play('walk'); });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/v2-anim.png` });
  await page.evaluate(() => { const a = window.__friendlife; a.sim.weather.set('rain', true); a.sim.weather.p.rain = 0.8; a.sim.weather.p.cloud = 0.95; a.sim.weather.wetness = 1; for (const r of window.__freeze) { r.d.wetness = 1; r.avatar.setWetness(1); r.play('idle'); } });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/v3-wet.png` });
  await page.evaluate(() => { const [r1, r2] = window.__freeze; r1.addInjury('brokenArm'); r1.addInjury('concussion'); r2.addInjury('blackEye'); r2.addInjury('sprain'); r2.play('limp'); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/v4-injuries.png` });
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 30).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
