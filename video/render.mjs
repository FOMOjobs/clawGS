// Renders the promo timeline frame-by-frame with headless Chromium and encodes it with ffmpeg.
//
//   node render.mjs                         → clawGS-promo.mp4 (1920x1080, 30 fps)
//   node render.mjs --fps 60                → smoother motion, 2x render time
//   node render.mjs --audio music.mp3       → mux a soundtrack (trimmed to the video, 2 s fade-out)
//   node render.mjs --stills 1.5,12,24      → PNG stills at those seconds into out/stills/
//   node render.mjs --from 18 --to 31 --out out/part.mp4   → render only part of the timeline
//
// Needs ffmpeg on PATH. Uses the Playwright Chromium (`npx playwright install chromium`),
// or set CHROMIUM_PATH to an existing Chromium/Chrome binary.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

const FPS = Number(arg('fps', 30));
const OUT = path.resolve(ROOT, arg('out', 'clawGS-promo.mp4'));
const AUDIO = arg('audio', null);
const WORKERS = Number(arg('workers', Math.max(1, Math.min(4, os.cpus().length))));
const CRF = arg('crf', '16');
const STILLS = arg('stills', null);

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
  return page;
}

async function grab(page, t) {
  await page.evaluate((time) => window.__seek(time), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

function ffmpegSegment(file) {
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p',
    '-r', String(FPS), file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { ff, done };
}

function write(stream, buf) {
  return stream.write(buf) ? Promise.resolve() : new Promise((r) => stream.once('drain', r));
}

const { server, port } = await startServer(0);
const url = `http://127.0.0.1:${port}/index.html?render`;
const browser = await chromium.launch(launchOpts);

try {
  if (STILLS) {
    const dir = path.join(ROOT, 'out', 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, url);
    for (const s of STILLS.split(',').map(Number)) {
      const file = path.join(dir, `t${s.toFixed(2).padStart(6, '0')}.png`);
      fs.writeFileSync(file, await grab(page, s));
      console.log('still', file);
    }
  } else {
    const probe = await openPage(browser, url);
    const duration = await probe.evaluate(() => window.__duration);
    await probe.close();

    const from = Number(arg('from', 0));
    const to = Math.min(Number(arg('to', duration)), duration);
    const first = Math.round(from * FPS);
    const last = Math.round(to * FPS); // exclusive
    const total = last - first;
    const per = Math.ceil(total / WORKERS);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawgs-render-'));
    console.log(`Rendering ${total} frames (${(total / FPS).toFixed(2)} s @ ${FPS} fps) with ${WORKERS} workers…`);

    let doneFrames = 0;
    const started = Date.now();
    const segments = [];
    await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
      const a = first + w * per;
      const b = Math.min(last, a + per);
      if (a >= b) return;
      const file = path.join(tmp, `seg${String(w).padStart(2, '0')}.mp4`);
      segments[w] = file;
      const page = await openPage(browser, url);
      const { ff, done } = ffmpegSegment(file);
      for (let f = a; f < b; f++) {
        await write(ff.stdin, await grab(page, f / FPS));
        doneFrames++;
        if (doneFrames % 60 === 0) {
          const el = (Date.now() - started) / 1000;
          process.stdout.write(`\r  ${doneFrames}/${total} frames · ${el.toFixed(0)} s elapsed · ~${((el / doneFrames) * (total - doneFrames)).toFixed(0)} s left   `);
        }
      }
      ff.stdin.end();
      await done;
      await page.close();
    }));
    process.stdout.write('\n');

    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segments.filter(Boolean).map((f) => `file '${f}'`).join('\n'));
    const len = total / FPS;
    const ffArgs = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    if (AUDIO) {
      ffArgs.push('-i', path.resolve(process.cwd(), AUDIO), '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-af', `afade=t=out:st=${Math.max(0, len - 2).toFixed(2)}:d=2`, '-c:a', 'aac', '-b:a', '192k', '-t', len.toFixed(3));
    } else {
      ffArgs.push('-c', 'copy');
    }
    ffArgs.push('-movflags', '+faststart', OUT);
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ffArgs, { stdio: 'inherit' });
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg concat failed ${code}`))));
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`Done → ${path.relative(process.cwd(), OUT)} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
  server.close();
}
