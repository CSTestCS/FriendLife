// Headless test of the VRM pipeline using the generated samples.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const OUT = process.env.SHOTS || 'shots';
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/samples/') ? path.join(base, u) : u.startsWith('/extra/') && process.env.EXTRA_DIR ? path.join(process.env.EXTRA_DIR, u.slice(7)) : path.join(base, 'dist', u === '/' ? 'index.html' : u);
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
  // ---- new features: Mixamo FBX, personal outfits, stage IK, dialogue
  const extra = await page.evaluate(async (hasFbx) => {
    const a = window.__friendlife;
    const s = a.sim;
    const lib = s.library;
    const out = {};
    const [r1, r2, r3] = window.__freeze;
    if (hasFbx) {
      const data = await (await fetch('/extra/samba.fbx')).arrayBuffer();
      const asset = await lib.add({ name: 'Samba Dancing', type: 'animation', data, ext: 'fbx' });
      const clip = await s.registry.loadAsset(asset.id);
      out.fbx = clip ? { dur: +clip.duration.toFixed(2), bones: Object.keys(clip.interps).length } : s.registry.errors.get(asset.id);
      if (clip) { r3.play(asset.id); r1.play(asset.id); }
    }
    // personal outfit: r3 (doll) gets the VRM0 mannequin as an alternate outfit, tagged for rain
    const v0 = lib.list('character').find((c) => c.name.includes('VRM0'));
    r3.d.outfits.push({ name: 'Rain gear', look: { kind: 'vrm', assetId: v0.id, variantId: null }, outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: ['rain'] });
    await s.changeOutfit(r3, 0);
    out.outfit = { wearing: r3.d.wearing, kind: r3.avatar.kind, cached: r3.avatarCache.size };
    await s.changeOutfit(r3, -1);
    out.back = { wearing: r3.d.wearing, kind: r3.avatar.kind };
    await s.changeOutfit(r3, 0);
    // dialogue
    s.dialogue.addTerm('food', 'Space Tacos', 'space tah-cohs', r1.id);
    s.dialogue.addTerm('insult', 'a soggy waffle', '', null);
    out.lines = [s.dialogue.chat(r1, r2).map((l) => `${l.who}: ${l.text}`).join(' / '), s.dialogue.line('insult', { a: r1, b: r2 }).text, s.dialogue.taught(r1, { text: 'Space Tacos' }).text];
    s.problems.offer(r2, 'teachWord', { category: 'hobby' });
    out.problem = s.problems.describe(r2)?.text;
    return out;
  }, !!process.env.EXTRA_DIR);
  console.log(JSON.stringify(extra, null, 1));
  await page.evaluate(() => { const a = window.__friendlife; a.sim.weather.set('sunny', true); a.sim.weather.p.rain = 0; a.sim.weather.wetness = 0; for (const r of window.__freeze) { r.d.wetness = 0; r.avatar.setWetness(0); } });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/v5-fbx-outfit.png` });
  // stage: put residents on the stage, one straddling the front edge
  await page.evaluate(() => {
    const a = window.__friendlife;
    const st = a.island.locations.stage;
    const [r1, r2, r3] = window.__freeze;
    const on = a.island.localToWorld(st.x, st.z, st.rotY, -0.8, 0);
    const edge = a.island.localToWorld(st.x, st.z, st.rotY, 2.25, 0.3);
    const off = a.island.localToWorld(st.x, st.z, st.rotY, 2.0, 2.4);
    for (const [r, p] of [[r1, on], [r2, edge], [r3, off]]) { r.placeAt(p.x, p.z); r.heading = st.rotY; r.targetHeading = st.rotY; r.play('idle'); }
    window.__ik = { on: a.island.heightAt(on.x, on.z), edge: a.island.heightAt(edge.x, edge.z), off: a.island.heightAt(off.x, off.z) };
    const fwd = { x: Math.sin(st.rotY), z: Math.cos(st.rotY) };
    a.stage.controls.target.set(edge.x, 1.0, edge.z);
    a.stage.camera.position.set(edge.x + fwd.x * 5 - fwd.z * 2.5, 1.9, edge.z + fwd.z * 5 + fwd.x * 2.5);
  });
  await page.waitForTimeout(2500);
  const ik = await page.evaluate(() => {
    const [, r2] = window.__freeze;
    const V = r2.group.position.constructor;
    const l = new V(), rr = new V();
    r2.avatar.getBone('leftFoot').getWorldPosition(l);
    r2.avatar.getBone('rightFoot').getWorldPosition(rr);
    const isl = window.__friendlife.island;
    return { heights: window.__ik, rootY: +r2.group.position.y.toFixed(2), drop: +(r2.avatar.ikDrop || 0).toFixed(2),
      left: { y: +l.y.toFixed(2), ground: +isl.heightAt(l.x, l.z).toFixed(2) }, right: { y: +rr.y.toFixed(2), ground: +isl.heightAt(rr.x, rr.z).toFixed(2) } };
  });
  console.log('IK', JSON.stringify(ik));
  await page.screenshot({ path: `${OUT}/v6-stage-ik.png` });
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 30).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
