// Capture a scripted demo of the dotted globe and turn it into a GIF.
//
// Requires:
//   - dev server running at http://localhost:5190
//   - Google Chrome installed at /Applications/Google Chrome.app
//   - ffmpeg on PATH
//
// Usage:
//   npm run dev &           # in another terminal
//   node scripts/generate-gif.mjs

import puppeteer from 'puppeteer-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = 'http://localhost:5190';
const VIEWPORT = { width: 1100, height: 680 };
const OUT_DIR = resolve('docs/media/frames');
const GIF_PATH = resolve('docs/media/globe-demo.gif');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 30 frames at 30 fps = 1 second per "segment". We capture 30 frames over a
// ~3-second choreography to get a smooth 10-fps GIF after sampling.
const FRAMES = 30;

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith('.png')) unlinkSync(resolve(OUT_DIR, f));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  defaultViewport: VIEWPORT,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle'],
});

const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('canvas', { timeout: 10_000 });

// Settle: let auto-rotation tick a few frames
await new Promise((r) => setTimeout(r, 600));

const rect = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return { l: r.left, t: r.top, w: r.width, h: r.height };
});

const cx = rect.l + rect.w * 0.5;
const cy = rect.t + rect.h * 0.5;
const lerp = (a, b, t) => a + (b - a) * t;

// Choreography over `FRAMES` steps. Each step:
//   1. Dispatch the cursor event for the current step
//   2. Wait one animation frame so R3F re-renders
//   3. Capture a PNG from the canvas only (no surrounding DOM chrome)
async function capture(idx) {
  await page.screenshot({
    path: `${OUT_DIR}/frame-${String(idx).padStart(3, '0')}.png`,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
  });
}

async function step(idx) {
  // Phases (FRAMES = 30):
  //   0–4   idle
  //   4–11  slow hover, sweep into globe
  //   11–17 fast flick (circle)
  //   17–22 drag start + drag right
  //   22–30 release + relax
  if (idx === 0) {
    await page.mouse.move(0, 0);
  } else if (idx >= 4 && idx < 11) {
    const t = (idx - 4) / 7;
    await page.mouse.move(
      lerp(rect.l + rect.w * 0.30, rect.l + rect.w * 0.46, t),
      lerp(rect.t + rect.h * 0.45, rect.t + rect.h * 0.52, t),
    );
  } else if (idx >= 11 && idx < 17) {
    const t = (idx - 11) / 6;
    const a = t * Math.PI * 2;
    await page.mouse.move(
      cx + Math.cos(a) * rect.w * 0.18,
      cy + Math.sin(a) * rect.h * 0.20,
    );
  } else if (idx === 17) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
  } else if (idx > 17 && idx < 22) {
    const t = (idx - 17) / 4;
    await page.mouse.move(cx + t * rect.w * 0.28, cy);
  } else if (idx === 22) {
    await page.mouse.up();
    await page.mouse.move(0, 0);
  }
  // Sleep for ~70ms — long enough for R3F to render one or two frames
  await new Promise((r) => setTimeout(r, 70));
}

for (let i = 0; i < FRAMES; i++) {
  await step(i);
  await capture(i);
  process.stdout.write(`  frame ${i + 1}/${FRAMES}\r`);
}
console.log('\n  captured', FRAMES, 'frames');

await browser.close();

// Stitch with ffmpeg → palette pass for nicer color quantization.
console.log('  encoding GIF…');
const palette = resolve(OUT_DIR, 'palette.png');
const opts = (cmd) => spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });

const r1 = opts([
  'ffmpeg', '-y',
  '-framerate', '12',
  '-i', `${OUT_DIR}/frame-%03d.png`,
  '-vf', 'fps=12,scale=720:-1:flags=lanczos,palettegen',
  palette,
]);
if (r1.status !== 0) process.exit(r1.status ?? 1);

const r2 = opts([
  'ffmpeg', '-y',
  '-framerate', '12',
  '-i', `${OUT_DIR}/frame-%03d.png`,
  '-i', palette,
  '-lavfi', 'fps=12,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse',
  GIF_PATH,
]);
if (r2.status !== 0) process.exit(r2.status ?? 1);

console.log('  wrote', GIF_PATH);
