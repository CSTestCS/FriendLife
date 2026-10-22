// Voice test: built-in synth renders in a worker, pitch reaches the extremes,
// and intonation / emotion audibly change the pitch and timing of a line.
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
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
(async () => {
  await new Promise((r) => server.listen(5187, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:5187/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });

  const out = await page.evaluate(async () => {
    const sim = window.__friendlife.sim;
    const eng = sim.voice;
    sim.audio.start();
    // render a line into an offline context and return a pitch track
    async function renderLine(text, voice, mood) {
      const sr = 22050;
      const off = new OfflineAudioContext(1, sr * 8, sr);
      const realAudio = eng.audio;
      eng.audio = { ctx: off, master: off.destination, volume: 1 };
      const t0 = performance.now();
      const res = await eng.speakBuiltin(eng.plan(text, voice, mood), { ...voice, volume: 1 }, { key: 'test' });
      const ms = performance.now() - t0;
      eng.audio = realAudio;
      eng.playing.clear();
      const buf = await off.startRendering();
      const d = buf.getChannelData(0);
      const f0 = [];
      const W = 900;
      for (let st = 0; st + W + 1100 < d.length; st += 600) {
        let e = 0;
        for (let i = 0; i < W; i++) e += d[st + i] * d[st + i];
        if (e / W < 2e-4) continue;
        const c = new Float32Array(1100);
        let mx = 0;
        for (let l = 18; l < 1100; l++) {
          let xy = 0; let yy = 0;
          for (let i = 0; i < W; i++) { const y = d[st + i + l]; xy += d[st + i] * y; yy += y * y; }
          c[l] = xy / Math.sqrt(e * yy + 1e-9);
          if (c[l] > mx) mx = c[l];
        }
        if (mx < 0.6) continue;
        for (let l = 19; l < 1099; l++) if (c[l] >= 0.88 * mx && c[l] >= c[l - 1] && c[l] >= c[l + 1]) { f0.push(sr / l); break; }
      }
      let last = 0;
      for (let i = d.length - 1; i > 0; i--) if (Math.abs(d[i]) > 0.01) { last = i; break; }
      f0.sort((a, b) => a - b);
      const semis = f0.length > 8 ? 12 * Math.log2(f0[Math.floor(f0.length * 0.9)] / f0[Math.floor(f0.length * 0.1)]) : 0; // pitch range (10th–90th percentile)
      return { ms, dur: last / sr, median: f0[f0.length >> 1] || 0, spread: semis, frames: f0.length, res };
    }
    const base = { pitch: 1, rate: 1, intonation: 0, emotion: 0, synthVoice: 'm3', accent: 'en-us' };
    const line = 'Have you ever tried strawberry cake at the café? It is really amazing!';
    const r = {};
    r.normal = await renderLine(line, base, 'neutral');
    r.high = await renderLine(line, { ...base, pitch: 4 }, 'neutral');
    r.low = await renderLine(line, { ...base, pitch: 0.25 }, 'neutral');
    r.flat = await renderLine(line, { ...base, intonation: 0 }, 'neutral');
    r.lively = await renderLine(line, { ...base, intonation: 1 }, 'neutral');
    r.sadE0 = await renderLine(line, { ...base, emotion: 0 }, 'sad');
    r.sadE1 = await renderLine(line, { ...base, emotion: 1 }, 'sad');
    r.happyE0 = await renderLine(line, { ...base, emotion: 0 }, 'happy');
    r.happyE1 = await renderLine(line, { ...base, emotion: 1 }, 'happy');
    // many lines in a row (the engine used to break after ~80 renders)
    let okCount = 0;
    for (let i = 0; i < 70; i++) {
      const res = await eng.builtin.render([{ text: `Line number ${i}, hello`, pitch: 30 + (i % 40), speed: 120 + i, variant: 'f2', accent: i % 2 ? 'en-us' : 'en-sc' }, { text: 'and more words here.', pitch: 50, speed: 175, variant: 'm1' }]);
      if (res.every((x) => x.samples.length > 1000)) okCount++;
    }
    r.manyOk = okCount;
    r.usedWorker = !!eng.builtin.worker && !eng.builtin.fallback;
    // regular speak() path + babble with extreme pitch should not throw
    eng.speak('Hello there! How are you?', { ...base, pitch: 4, intonation: 1, emotion: 1 }, { mode: 'speech', force: true, mood: 'happy' });
    eng.speak('Hello there! How are you?', { ...base, pitch: 0.25 }, { mode: 'babble', force: true, mood: 'sad' });
    return r;
  });
  for (const [k, v] of Object.entries(out)) if (typeof v === 'object') console.log(k, JSON.stringify({ ms: Math.round(v.ms), dur: +v.dur.toFixed(2), median: Math.round(v.median), spread: +v.spread.toFixed(2), frames: v.frames }));
  check('worker renders speech', out.usedWorker);
  check('speech produced', out.normal.frames > 20 && out.normal.dur > 1, `${out.normal.dur.toFixed(2)}s`);
  check('pitch ×4 is much higher', out.high.median > out.normal.median * 2.5, `${Math.round(out.normal.median)}→${Math.round(out.high.median)} Hz`);
  check('pitch ×0.25 is much lower', out.low.median < out.normal.median * 0.45, `${Math.round(out.normal.median)}→${Math.round(out.low.median)} Hz`);
  check('extreme pitch keeps roughly the same speed', Math.abs(out.high.dur / out.normal.dur - 1) < 0.45 && Math.abs(out.low.dur / out.normal.dur - 1) < 0.45, `${out.low.dur.toFixed(2)} / ${out.normal.dur.toFixed(2)} / ${out.high.dur.toFixed(2)}s`);
  check('intonation widens pitch movement', out.lively.spread > out.flat.spread * 1.3, `${out.flat.spread.toFixed(2)}→${out.lively.spread.toFixed(2)} semitones`);
  check('emotion widens pitch movement', out.happyE1.spread > out.happyE0.spread * 1.2, `${out.happyE0.spread.toFixed(2)}→${out.happyE1.spread.toFixed(2)} semitones`);
  check('140 renders in a row all work', out.manyOk === 70, `${out.manyOk}/70`);
  check('intonation changes timing', Math.abs(out.lively.dur - out.flat.dur) > 0.15, `${out.flat.dur.toFixed(2)}→${out.lively.dur.toFixed(2)}s`);
  check('sad emotion lowers + slows', out.sadE1.median < out.sadE0.median * 0.9 && out.sadE1.dur > out.sadE0.dur * 1.15, `${Math.round(out.sadE0.median)}Hz ${out.sadE0.dur.toFixed(2)}s → ${Math.round(out.sadE1.median)}Hz ${out.sadE1.dur.toFixed(2)}s`);
  check('happy emotion raises pitch', out.happyE1.median > out.sadE0.median * 1.12, `${Math.round(out.happyE1.median)}Hz`);
  // "tired of my look": adding to the closet solves it
  const look = await page.evaluate(async () => {
    const sim = window.__friendlife.sim;
    const r = sim.residents[0];
    r.d.problem = null;
    sim.problems.offer(r, 'clothes', {});
    const before = r.d.problem?.type;
    const money = sim.money;
    r.d.outfits.push({ name: 'Test', look: JSON.parse(JSON.stringify(r.d.look)), outfit: null, custom: { textures: {}, tints: {}, hidden: [] }, tags: [] });
    sim.problems.newLook(r);
    // with a different problem, nothing happens
    const r2 = sim.residents[1];
    r2.d.problem = null;
    sim.problems.offer(r2, 'hungry', {});
    sim.problems.newLook(r2);
    return { before, after: r.d.problem?.type || null, paid: sim.money > money, other: r2.d.problem?.type };
  });
  check('closet addition fulfils "tired of my look"', look.before === 'clothes' && look.after === null && look.paid && look.other === 'hungry', JSON.stringify(look));
  const ed = await page.evaluate(() => ({ voice: window.__friendlife.sim.residents[0].d.voice }));
  check('resident voices upgraded', ed.voice.engine && ed.voice.synthVoice && ed.voice.pitch >= 0.25, JSON.stringify(ed.voice).slice(0, 120));
  await page.waitForTimeout(1500);
  check('no page errors', errors.length === 0, errors.slice(0, 5).join('\n'));
  console.log(results.join('\n'));
  await browser.close();
  server.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
