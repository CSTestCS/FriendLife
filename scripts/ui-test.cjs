// Opens every UI screen and clicks through common actions, screenshotting each.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const OUT = process.env.SHOTS || 'shots';
const base = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/samples/') ? path.join(base, u) : path.join(base, 'dist', u === '/' ? 'index.html' : u);
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(5183, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.stack || e.message}`));
  await page.goto('http://localhost:5183/');
  await page.waitForSelector('#titleButtons button');
  await page.click('#titleButtons button');
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 6, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const s = window.__friendlife.sim;
    const get = async (f) => (await fetch(`/samples/${encodeURIComponent(f)}`)).arrayBuffer();
    await s.library.add({ name: 'Sample Mannequin', type: 'character', data: await get('Sample Mannequin.vrm'), ext: 'vrm' });
    await s.library.add({ name: 'Sample Hoodie Outfit', type: 'outfit', data: await get('Sample Hoodie Outfit.vrm'), ext: 'vrm' });
    const an = await s.library.add({ name: 'Sample Dance', type: 'animation', data: await get('Sample Dance.vrma'), ext: 'vrma' });
    await s.registry.loadAsset(an.id);
    window.__friendlife.setSpeed(1);
  });
  const shot = (n) => page.screenshot({ path: `${OUT}/ui-${n}.png` });
  const clickText = async (sel, text) => { const el = page.locator(sel, { hasText: text }).first(); await el.click(); await page.waitForTimeout(600); };
  const closeModal = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(300); };
  // select resident via list
  await page.locator('.res-card').first().click();
  await page.waitForTimeout(800);
  await shot('01-panel');
  // shop: buy stuff
  await clickText('#topbar button', 'Shop');
  await shot('02-shop');
  for (let i = 0; i < 3; i++) await page.locator('.shop-item button').first().click();
  await page.locator('.shop-item', { hasText: 'First-Aid' }).locator('button').click();
  await page.locator('.shop-item', { hasText: 'Umbrella' }).locator('button').click();
  await page.locator('.shop-item', { hasText: 'Gift' }).locator('button').click();
  await closeModal();
  // feed
  await clickText('#panel button', 'Feed');
  await shot('03-feed');
  await page.locator('.shop-item button').first().click();
  await page.waitForTimeout(800);
  await clickText('#panel button', 'Umbrella');
  // set up interaction
  await clickText('#panel button', 'Set Up');
  await shot('04-setup');
  await clickText('.modal button', 'Argue');
  await page.locator('.modal .row').nth(1).locator('button').first().click();
  await page.waitForTimeout(500);
  // creator (edit)
  await clickText('#panel button', 'Edit');
  await shot('05-edit');
  await clickText('.modal button', 'VRoid / VRM model');
  await page.waitForTimeout(800);
  await page.locator('.modal select').nth(4).selectOption({ index: 1 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot('06-edit-vrm');
  await clickText('.modal-foot button', 'Save');
  await page.waitForTimeout(3000);
  // wardrobe
  await clickText('#panel button', 'Wardrobe');
  await page.waitForTimeout(800);
  await shot('07-wardrobe');
  await page.locator('.slot-row input[type=color]').first().evaluate((el) => { el.value = '#ff4466'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500);
  await clickText('.modal-foot button', 'Done');
  // library
  await clickText('#topbar button', 'Library');
  await shot('08-library');
  await clickText('.modal .tabs button', 'Animations');
  await shot('09-library-anims');
  await closeModal();
  // studio
  await clickText('#topbar button', 'Studio');
  await page.waitForTimeout(2500);
  await shot('10-studio');
  await closeModal();
  // settings
  await clickText('#topbar button', '⚙️');
  await shot('11-settings');
  await clickText('.modal button', 'Thunderstorm');
  await closeModal();
  // dictionary + teach a word
  await clickText('#topbar button', 'Words');
  await page.locator('.modal .card').first().locator('button').first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal input[type=text]').last().fill('x');
  await page.locator('.modal').last().locator('input[type=text]').first().fill('Bubble Tea');
  await page.locator('.modal').last().locator('.modal-foot button', { hasText: 'Teach' }).click();
  await page.waitForTimeout(400);
  await shot('12a-words');
  await closeModal();
  await page.locator('.res-card').first().click();
  await page.waitForTimeout(500);
  await clickText('#panel button', 'Teach word');
  await clickText('.modal button', 'Hobby');
  await page.locator('.modal').last().locator('input[type=text]').first().fill('extreme ironing');
  await page.locator('.modal').last().locator('.modal-foot button', { hasText: 'Teach' }).click();
  await page.waitForTimeout(600);
  await page.locator('#panel').evaluate((el) => { el.scrollTop = 600; });
  await shot('12b-closet');
  // news
  await clickText('#topbar button', 'News');
  await shot('12-news');
  await closeModal();
  // build mode
  await clickText('#topbar button', 'Build');
  await page.mouse.move(700, 500);
  await page.mouse.move(720, 520);
  await page.waitForTimeout(800);
  await page.mouse.click(720, 520);
  await page.waitForTimeout(800);
  await shot('13-build');
  await page.keyboard.press('Escape');
  // new resident
  await page.locator('.res-card.add').click();
  await page.waitForTimeout(800);
  await shot('14-new');
  await clickText('.modal-foot button', 'Move in');
  await page.waitForTimeout(3000);
  await shot('15-after');
  // save & reload & continue
  await page.evaluate(() => window.__friendlife.save());
  await page.waitForTimeout(1000);
  await page.reload();
  await page.waitForSelector('#titleButtons button');
  await shot('16-title');
  await page.locator('#titleButtons button').first().click();
  await page.waitForFunction(() => window.__friendlife?.sim?.residents?.length >= 7, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot('17-continued');
  const info = await page.evaluate(() => ({ n: window.__friendlife.sim.residents.length, kinds: window.__friendlife.sim.residents.map((r) => r.avatar?.kind), money: window.__friendlife.sim.money, inv: window.__friendlife.sim.inventory, props: window.__friendlife.island.props.length, terms: window.__friendlife.sim.dialogue.terms }));
  console.log(JSON.stringify(info));
  console.log('ERRORS:', errors.length);
  console.log(errors.slice(0, 30).join('\n'));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
