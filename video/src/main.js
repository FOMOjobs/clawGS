import { gsap } from '../node_modules/gsap/index.js';
import { TextPlugin } from '../node_modules/gsap/TextPlugin.js';
import { ScrambleTextPlugin } from '../node_modules/gsap/ScrambleTextPlugin.js';
import { DrawSVGPlugin } from '../node_modules/gsap/DrawSVGPlugin.js';
import { C, slashWipe } from './lib.js';
import {
  buildIntro, buildProblem, buildDropIn, buildGuardrails, buildBlocks, buildMcp, buildBudgets, buildReporting,
  buildEssentials, buildOutro,
} from './scenes.js';

gsap.registerPlugin(TextPlugin, ScrambleTextPlugin, DrawSVGPlugin);

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');

const stage = document.getElementById('stage');
const shakeEl = document.getElementById('shake');
shakeEl.insertAdjacentHTML('beforeend', '<svg id="wipe" viewBox="0 0 1920 1080"></svg><div id="flash"></div>');

function zoomThrough(tl, from, to, at) {
  tl.to(from, { scale: 1.18, opacity: 0, duration: 0.45, ease: 'power2.in' }, at);
  tl.fromTo(to, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: 'power3.out', immediateRender: false }, at + 0.3);
  tl.fromTo('#flash', { opacity: 0 }, { opacity: 0.5, duration: 0.09, yoyo: true, repeat: 1, immediateRender: false }, at + 0.3);
}

function push(tl, from, to, at, axis = 'x') {
  const d = axis === 'x' ? 1920 : 1080;
  tl.to(from, { [axis]: -d, duration: 0.6, ease: 'power3.inOut' }, at);
  tl.fromTo(to, { [axis]: d }, { [axis]: 0, duration: 0.6, ease: 'power3.inOut', immediateRender: false }, at);
}

function build() {
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);

  // S1 intro → claw wipe → S2 problem → claw wipe → S3 drop-in
  const w1 = slashWipe(tl, 5.0, [C.sky, C.white, C.blue]);
  buildIntro(tl, 0, w1);
  const w2 = slashWipe(tl, 10.9, [C.white, C.sky, C.navy]);
  buildProblem(tl, w1, w2);

  // S3 → zoom → S4 guardrails
  const z3 = 17.9;
  buildDropIn(tl, w2, z3 + 0.45);
  buildGuardrails(tl, z3 + 0.3, null);
  zoomThrough(tl, $('s-dropin'), $('s-guard'), z3);

  // S4 → claw wipe → S5 block responses → push → S6 MCP
  const w4 = slashWipe(tl, 30.3, [C.sky, C.navy, C.white]);
  tl.set($('s-guard'), { autoAlpha: 0 }, w4);
  const p5 = 35.8;
  buildBlocks(tl, w4, p5 + 0.6);
  buildMcp(tl, p5, null);
  push(tl, $('s-blocks'), $('s-mcp'), p5, 'x');

  // S6 → claw wipe → S7 budgets → push up → S8 reporting
  const w6 = slashWipe(tl, 41.9, [C.blue, C.white, C.sky]);
  tl.set($('s-mcp'), { autoAlpha: 0 }, w6);
  const p7 = 48.2;
  buildBudgets(tl, w6, p7 + 0.6);
  buildReporting(tl, p7, null);
  push(tl, $('s-budget'), $('s-report'), p7, 'y');

  // S8 → claw wipe → S9 essentials → S10 outro
  const w8 = slashWipe(tl, 55.3, [C.white, C.blue, C.sky]);
  tl.set($('s-report'), { autoAlpha: 0 }, w8);
  const o = 61.5;
  buildEssentials(tl, w8, o + 0.4);
  buildOutro(tl, o, 66.6);
  tl.set({}, {}, 66.6); // pin the total duration
  return tl;
}

async function ready() {
  const img = new Image();
  img.src = 'assets/claws.png';
  await img.decode();
  await Promise.all([
    document.fonts.load('800 84px "Inter Variable"'),
    document.fonts.load('400 30px "Inter Variable"'),
    document.fonts.load('600 22px "JetBrains Mono Variable"'),
  ]);
  await document.fonts.ready;
}

await ready();
const tl = build();
const DURATION = tl.duration();

window.__duration = DURATION;
window.__seek = (t) => {
  tl.seek(t, false);
};

// ---- preview mode (open in a browser) -------------------------------------
if (!RENDER) {
  const fit = () => {
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${k})`;
  };
  fit();
  addEventListener('resize', fit);

  const hud = document.getElementById('hud');
  const showHud = params.has('debug');
  hud.hidden = !showHud;
  gsap.ticker.add(() => {
    if (!hud.hidden) hud.textContent = `${tl.time().toFixed(2)}s / ${DURATION.toFixed(1)}s ${tl.paused() ? '⏸' : '▶'}`;
  });

  const start = Number(params.get('t') || 0);
  tl.seek(start, false);
  if (!params.has('t')) tl.play();

  addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.code === 'Space') tl.paused(!tl.paused());
    if (e.code === 'ArrowRight') tl.seek(Math.min(DURATION, tl.time() + step), false);
    if (e.code === 'ArrowLeft') tl.seek(Math.max(0, tl.time() - step), false);
    if (e.code === 'KeyD') hud.hidden = !hud.hidden;
    if (e.code === 'KeyR') tl.restart();
  });
}

window.__ready = true;
