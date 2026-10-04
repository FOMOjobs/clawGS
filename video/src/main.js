import { gsap } from '../node_modules/gsap/index.js';
import { TextPlugin } from '../node_modules/gsap/TextPlugin.js';
import { ScrambleTextPlugin } from '../node_modules/gsap/ScrambleTextPlugin.js';
import { DrawSVGPlugin } from '../node_modules/gsap/DrawSVGPlugin.js';
import { C, slashWipe, cue, resolveCues } from './lib.js';
import { CUT, END, BPM } from './timing.js';
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

// Zoom through the frame; the new scene lands on `cut`.
function zoomThrough(tl, from, to, cut) {
  tl.to(from, { scale: 1.2, opacity: 0, duration: 0.7, ease: 'power2.in' }, cut - 0.5);
  tl.fromTo(to, { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.85, ease: 'power3.out', immediateRender: false }, cut - 0.1);
  tl.fromTo('#flash', { opacity: 0 }, { opacity: 0.5, duration: 0.12, yoyo: true, repeat: 1, immediateRender: false }, cut - 0.1);
  cue(tl, 'whoosh', cut - 0.75, { dur: 0.75, short: true });
}

// Push the old scene out while the new one slides in; `cut` is the middle of the move.
function push(tl, from, to, cut, axis = 'x') {
  const d = axis === 'x' ? 1920 : 1080;
  tl.to(from, { [axis]: -d, duration: 1.0, ease: 'power3.inOut' }, cut - 0.5);
  tl.fromTo(to, { [axis]: d }, { [axis]: 0, duration: 1.0, ease: 'power3.inOut', immediateRender: false }, cut - 0.5);
  cue(tl, 'whoosh', cut - 0.5, { dur: 0.6, short: true });
}

function build() {
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);

  // Each scene is built on its own timeline (local time from 0) and slowed down by `pace`
  // (< 1 = calmer); `hideAt` is the video time at which the scene is removed.
  const addScene = (builder, start, pace, hideAt) => {
    const sub = gsap.timeline();
    builder(sub, 0, (hideAt - start) * pace);
    sub.timeScale(pace);
    tl.add(sub, start);
  };

  // S1 intro → claw wipe → S2 problem → claw wipe (music drop) → S3 drop-in
  addScene(buildIntro, 0, 0.8, CUT.problem);
  slashWipe(tl, CUT.problem, [C.sky, C.white, C.blue]);
  addScene(buildProblem, CUT.problem, 0.8, CUT.dropIn);
  slashWipe(tl, CUT.dropIn, [C.white, C.sky, C.navy]);

  // S3 → zoom → S4 guardrails
  addScene(buildDropIn, CUT.dropIn, 0.85, CUT.guard + 0.25);
  addScene(buildGuardrails, CUT.guard - 0.1, 0.8, CUT.blocks);
  zoomThrough(tl, $('s-dropin'), $('s-guard'), CUT.guard);

  // S4 → claw wipe → S5 block responses → push → S6 MCP
  slashWipe(tl, CUT.blocks, [C.sky, C.navy, C.white]);
  addScene(buildBlocks, CUT.blocks, 0.75, CUT.mcp + 0.5);
  addScene(buildMcp, CUT.mcp - 0.5, 0.9, CUT.budgets);
  push(tl, $('s-blocks'), $('s-mcp'), CUT.mcp, 'x');

  // S6 → claw wipe → S7 budgets → push up → S8 reporting
  slashWipe(tl, CUT.budgets, [C.blue, C.white, C.sky]);
  addScene(buildBudgets, CUT.budgets, 0.8, CUT.report + 0.5);
  addScene(buildReporting, CUT.report - 0.5, 0.8, CUT.essentials);
  push(tl, $('s-budget'), $('s-report'), CUT.report, 'y');

  // S8 → claw wipe → S9 essentials → S10 outro (final clench lands on bar 34)
  slashWipe(tl, CUT.essentials, [C.white, C.blue, C.sky]);
  addScene(buildEssentials, CUT.essentials, 0.8, CUT.outro + 0.15);
  addScene(buildOutro, CUT.outro + 0.05, 0.8, END);
  tl.set({}, {}, END); // pin the total duration
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
window.__cues = resolveCues(tl);
window.__music = { bpm: BPM, cut: CUT, end: END };
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
