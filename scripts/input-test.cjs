// Tests camera follow while rotating, keyboard actions, rebinding, and gamepad
// (mocked Gamepad API): virtual cursor, buttons, on-screen keyboard.
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
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
(async () => {
  await new Promise((r) => server.listen(5185, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  await page.addInitScript(() => {
    window.__pad = { connected: true, index: 0, id: 'Mock Xbox Controller (STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });
  });
  await page.goto('http://localhost:5185/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  // hold the button until the game has polled it (frames are slow in software rendering), then release
  const press = async (i) => {
    await ev((b) => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, i);
    await page.waitForFunction((b) => window.__friendlife.pad.prev[b] === true, i, { timeout: 15000 });
    await ev((b) => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, i);
    await page.waitForFunction((b) => !window.__friendlife.pad.prev[b], i, { timeout: 15000 });
    await wait(150);
  };

  // ---- 1. follow keeps going while rotating
  await ev(() => { const a = window.__friendlife; a.setSpeed(1); const r = a.sim.residents.find((x) => !x.inside); a.sim.select(r); window.__sel = r; });
  await wait(800);
  const cx = 640, cy = 450;
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'left' }); await page.mouse.move(cx + 120, cy + 10, { steps: 6 }); await page.mouse.up({ button: 'left' });
  await wait(400);
  check('follow survives left-drag rotate', await ev(() => window.__friendlife.sim.followTarget === window.__sel));
  await page.keyboard.down('KeyQ'); await wait(600); await page.keyboard.up('KeyQ');
  check('follow survives Q rotate', await ev(() => window.__friendlife.sim.followTarget === window.__sel));
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 100, cy + 40, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await wait(300);
  check('right-drag pan stops follow', await ev(() => window.__friendlife.sim.followTarget === null));
  await page.keyboard.press('KeyC'); await wait(300);
  check('C re-follows', await ev(() => window.__friendlife.sim.followTarget === window.__sel));
  await page.keyboard.down('KeyW'); await page.waitForFunction(() => window.__friendlife.sim.followTarget === null, null, { timeout: 15000 }).catch(() => {}); await page.keyboard.up('KeyW');
  check('W pan stops follow', await ev(() => window.__friendlife.sim.followTarget === null));
  await page.keyboard.press('Space'); await wait(200);
  check('Space pauses', await ev(() => window.__friendlife.sim.speed === 0));
  await page.keyboard.press('Space');

  // ---- 2. rebinding pause to P via the controls screen
  await ev(() => window.__friendlife.openControls());
  await wait(500);
  await page.screenshot({ path: `${OUT}/in-1-controls.png` });
  const slot = page.locator('.slot-row', { hasText: 'Pause / resume' }).locator('button').first();
  await slot.click();
  await page.keyboard.press('KeyP');
  await wait(300);
  check('rebind pause → P', await ev(() => window.__friendlife.input.keysOf('pause').includes('KeyP') && !window.__friendlife.input.keysOf('pause').includes('Space')));
  await page.keyboard.press('Escape');
  await wait(300);
  await page.keyboard.press('KeyP'); await wait(200);
  check('P now pauses', await ev(() => window.__friendlife.sim.speed === 0));
  await page.keyboard.press('KeyP');
  await ev(() => { window.__friendlife.input.reset(); window.__friendlife.applyControls(); });

  // ---- 3. gamepad: cursor, select via A, menus via Start/B
  await ev(() => { window.__pad.axes = [1, 0, 0, 0]; });
  await page.waitForFunction(() => window.__friendlife.pad.cursor.x > 680, null, { timeout: 15000 }).catch(() => {});
  await ev(() => { window.__pad.axes = [0, 0, 0, 0]; });
  const cur = await ev(() => ({ ...window.__friendlife.pad.cursor, active: window.__friendlife.lastDevice }));
  check('left stick moves cursor', cur.x > 660 && cur.active === 'pad', JSON.stringify(cur));
  // put the cursor on the 3rd resident card and press A
  const card = await page.locator('.res-card').nth(2).boundingBox();
  await ev(([x, y]) => { window.__friendlife.pad.cursor.x = x; window.__friendlife.pad.cursor.y = y; }, [card.x + 40, card.y + 20]);
  await wait(300);
  await press(0);
  check('Ⓐ on resident card selects', await ev(() => window.__friendlife.sim.selected === window.__friendlife.sim.residents[2]));
  await press(5);
  check('RB next resident', await ev(() => window.__friendlife.sim.selected === window.__friendlife.sim.residents[3]));
  await page.screenshot({ path: `${OUT}/in-2-pad-cursor.png` });
  await press(9);
  check('Start opens settings', await ev(() => !!document.querySelector('.modal h2')?.textContent.includes('Settings')));
  await press(1);
  check('Ⓑ closes it', await ev(() => !document.querySelector('.modal')));

  // ---- 4. on-screen keyboard
  await ev(() => window.__friendlife.openDictionary());
  await wait(500);
  const plus = await page.locator('.modal .card').first().locator('button').first().boundingBox();
  await ev(([x, y]) => { window.__friendlife.pad.cursor.x = x; window.__friendlife.pad.cursor.y = y; }, [plus.x + 10, plus.y + 10]);
  await wait(300);
  await press(0);
  await wait(400);
  const input = await page.locator('.modal').last().locator('input[type=text]').first().boundingBox();
  await ev(([x, y]) => { window.__friendlife.pad.cursor.x = x; window.__friendlife.pad.cursor.y = y; }, [input.x + 20, input.y + 10]);
  await wait(300);
  await press(0);
  check('text box opens on-screen keyboard', await ev(() => window.__friendlife.osk.open));
  await ev(() => { const o = window.__friendlife.osk; o.target.value = ''; o.row = 1; o.col = 0; o.highlight(); });
  await ev(() => { const o = window.__friendlife.osk; window.__log = []; const orig = o.pressSelected.bind(o); o.pressSelected = () => { window.__log.push(`${o.keys[o.row][o.col].k}@${JSON.stringify(window.__pad.buttons.map((b) => +b.pressed).join(''))}|prev${window.__friendlife.pad.prev.map(Number).join('')}`); orig(); }; window.__log.push('val:' + o.target.value); });
  // type: A (current key), move right, A, shift + A
  await press(0);
  await press(15);
  await press(0);
  await press(3); // shift
  await press(0);
  await press(2); // space
  await page.screenshot({ path: `${OUT}/in-3-osk.png` });
  const typed = await ev(() => window.__friendlife.osk.target?.value);
  console.log(await ev(() => window.__log.join('\n')));
  check('typed with gamepad', typed === 'qwW ', JSON.stringify(typed));
  await press(9); // done
  check('Start closes keyboard', await ev(() => !window.__friendlife.osk.open));
  await press(1);
  await press(1);
  // ---- 5. right stick orbit keeps follow
  await ev(() => { const a = window.__friendlife; a.sim.followTarget = a.sim.selected; window.__camBefore = a.stage.camera.position.clone(); a.pad.cursor.x = 640; a.pad.cursor.y = 450; window.__pad.axes = [0, 0, 1, 0]; });
  await page.waitForFunction(() => window.__friendlife.stage.camera.position.distanceTo(window.__camBefore) > 0.2, null, { timeout: 15000 }).catch(() => {});
  await ev(() => { window.__pad.axes = [0, 0, 0, 0]; });
  check('right stick rotates camera & keeps follow', await ev(() => window.__friendlife.sim.followTarget === window.__friendlife.sim.selected && window.__friendlife.stage.camera.position.distanceTo(window.__camBefore) > 0.2));
  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 20).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e.message.split('\n')[0]); process.exit(1); });
