// Builds scripts/sample-assets.js and runs it in headless Chromium to write
// the sample VRM/VRMA files into samples/.
const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PW_PATH || 'playwright');

(async () => {
  const outDir = path.join(__dirname, '..', 'samples');
  fs.mkdirSync(outDir, { recursive: true });
  const res = await build({ entryPoints: [path.join(__dirname, 'sample-assets.js')], bundle: true, format: 'iife', write: false });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: res.outputFiles[0].text });
  const files = await page.evaluate(() => window.makeSamples());
  for (const [name, b64] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(outDir, name)), { recursive: true });
    fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
    console.log('wrote', name, Math.round(Buffer.from(b64, 'base64').length / 1024), 'KB');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
