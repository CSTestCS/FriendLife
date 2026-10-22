// Draws the FriendLife app icon (256x256 PNG) with a canvas in headless Chromium.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    // background
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#7cc8f2');
    bg.addColorStop(1, '#2f8fc4');
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(8, 8, 240, 240, 56); g.fill();
    // island
    g.fillStyle = '#ecd9a6';
    g.beginPath(); g.ellipse(128, 196, 100, 34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6cc35f';
    g.beginPath(); g.ellipse(128, 188, 86, 26, 0, 0, Math.PI * 2); g.fill();
    // head
    g.fillStyle = '#f6cfa9';
    g.beginPath(); g.arc(128, 112, 62, 0, Math.PI * 2); g.fill();
    // hair
    g.fillStyle = '#ff8a5b';
    g.beginPath(); g.arc(128, 104, 66, Math.PI * 1.02, Math.PI * 1.98); g.fill();
    g.beginPath(); g.ellipse(96, 72, 30, 18, -0.5, 0, Math.PI * 2); g.fill();
    // eyes
    g.fillStyle = '#3a2a24';
    g.beginPath(); g.ellipse(106, 118, 7, 10, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(150, 118, 7, 10, 0, 0, Math.PI * 2); g.fill();
    // blush + smile
    g.fillStyle = 'rgba(255,120,140,0.5)';
    g.beginPath(); g.ellipse(90, 140, 11, 7, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(166, 140, 11, 7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a24'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.arc(128, 136, 14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    // raindrop accent
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(206, 40); g.quadraticCurveTo(224, 66, 206, 76); g.quadraticCurveTo(188, 66, 206, 40); g.fill();
    return c.toDataURL('image/png').split(',')[1];
  });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  fs.copyFileSync(out, path.join(__dirname, '..', 'static', 'icon.png'));
  console.log('wrote', out);
  await browser.close();
})();
