import {
  gsap, icon, C, add, svg, scene, showScene, splitWords, splitChars, clawLogo, watermark, header, headerIn,
  clawMarks, clawIn, shake, counter, pop, rng, cue,
} from './lib.js';
import { COPY } from './copy.js';

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------

function claws(sceneEl) {
  const left = add(sceneEl, '<div class="claw left"></div>');
  const right = add(sceneEl, '<div class="claw right"></div>');
  return { left, right };
}

/** Packet pill that travels along a horizontal track (positioned by its centre). */
function packet(parent, { text, y, w, iconName = 'file-text', response = false }) {
  const p = add(parent, `<div class="packet${response ? ' response' : ''}" style="left:0;top:${y}px;width:${w}px">
    <span class="dot">${icon(iconName, { size: 17, width: 2.4 })}</span><span class="txt">${text}</span></div>`);
  gsap.set(p, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.3 });
  return p;
}

/** A blocked packet: shudder, get clawed, go dark, fall off the track. */
function blockPacket(tl, p, w, at, hl) {
  if (hl) tl.to(hl, { backgroundColor: C.sky, color: C.navy, duration: 0.15 }, at);
  tl.to(p, {
    keyframes: [
      { x: '+=9', duration: 0.04 }, { x: '-=18', duration: 0.06 }, { x: '+=13', duration: 0.05 }, { x: '-=4', duration: 0.04 },
    ],
  }, at + 0.05);
  const marks = clawMarks(p, { x: -20, y: -46, w: w + 40, h: 150, angle: -62, len: 150, spacing: 44, thick: 4.2, color: C.white });
  clawIn(tl, marks, at + 0.3);
  tl.to(p, { backgroundColor: C.ink, color: C.gray, borderColor: C.ink, duration: 0.15 }, at + 0.38);
  if (hl) tl.to(hl, { backgroundColor: C.gray, color: C.ink, duration: 0.15 }, at + 0.38);
  tl.to(p, { y: '+=180', rotation: 10, opacity: 0, duration: 0.6, ease: 'power2.in' }, at + 0.8);
}

// ---------------------------------------------------------------------------
// S1 — claws intro
// ---------------------------------------------------------------------------
export function buildIntro(tl, start, end) {
  const s = scene('s-intro', 'bg-navy grid');
  showScene(tl, s, start, end, { immediate: true });

  const black = add(s, `<div class="abs" style="inset:0;background:${C.ink}"></div>`);
  const marks = clawMarks(s, { x: 0, y: 0, w: 1920, h: 1080, angle: -58, len: 1500, spacing: 125, thick: 9, color: C.sky });
  const ring = add(s, `<div class="abs" style="left:960px;top:590px;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;border:6px solid ${C.sky};opacity:0"></div>`);
  const { left, right } = claws(s);
  const kick = add(s, `<div class="abs" style="left:0;width:1920px;top:452px;text-align:center;font:600 24px/1 var(--mono);letter-spacing:.42em;text-transform:uppercase;color:${C.sky}">${COPY.intro.kicker}</div>`);
  const logo = add(s, '<div class="logo abs" style="left:0;width:1920px;top:494px;text-align:center">claw<span class="gs">GS</span></div>');
  const chars = splitChars(logo);
  const tag = add(s, `<div class="abs" style="left:0;width:1920px;top:706px;text-align:center;font:500 36px/1 var(--sans);color:rgba(255,255,255,.85);letter-spacing:-.01em">${COPY.intro.tagline}</div>`);
  const tagWords = splitWords(tag);
  const sticker = add(s, `<div class="sticker" style="left:1585px;top:120px">${COPY.intro.sticker}</div>`);

  gsap.set(left, { x: -1150, y: -60, rotation: -18, scale: 0.95 });
  gsap.set(right, { x: 1150, y: -60, rotation: 18, scale: 0.95 });
  gsap.set([kick, ...chars, ...tagWords, sticker], { opacity: 0 });

  const t = start;
  // scratches tear through the dark
  clawIn(tl, marks, t + 0.25, 0.22, 'scratchBig');
  shake(tl, t + 0.4, 14, 0.32);
  tl.to(black, { opacity: 0, duration: 0.45, ease: 'power2.out' }, t + 0.62);
  tl.to(marks.el, { opacity: 0.2, duration: 0.6 }, t + 0.9);

  // claws slam in
  tl.to(left, { x: 0, rotation: 0, duration: 0.48, ease: 'back.out(1.25)' }, t + 1.0);
  tl.to(right, { x: 0, rotation: 0, duration: 0.48, ease: 'back.out(1.25)' }, t + 1.0);
  shake(tl, t + 1.3, 26, 0.45);
  cue(tl, 'impact', t + 1.3);
  tl.fromTo(ring, { scale: 0.2, opacity: 1 }, { scale: 3.4, opacity: 0, duration: 0.7, ease: 'power2.out', immediateRender: false }, t + 1.3);

  // wordmark
  tl.fromTo(chars, { y: -150, rotation: (i) => (i % 2 ? 14 : -12) }, {
    y: 0, rotation: 0, opacity: 1, duration: 0.55, stagger: 0.055, ease: 'back.out(2.2)',
  }, t + 1.55);
  cue(tl, 'letters', t + 1.55, { step: 0.055 });
  tl.fromTo(kick, { letterSpacing: '0.95em' }, { letterSpacing: '0.42em', opacity: 1, duration: 0.8, ease: 'power3.out' }, t + 2.0);
  tl.fromTo(tagWords, { y: 26 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'power3.out' }, t + 2.3);

  // the joke
  tl.fromTo(sticker, { scale: 0, rotation: -35 }, { scale: 1, rotation: 8, opacity: 1, duration: 0.5, ease: 'back.out(3)' }, t + 3.0);
  cue(tl, 'pop', t + 3.0);
  tl.to(sticker, { keyframes: [{ rotation: -6, duration: 0.09 }, { rotation: 10, duration: 0.09 }, { rotation: -3, duration: 0.09 }, { rotation: 8, duration: 0.1 }] }, t + 3.6);

  // claws breathe, wind up, swipe
  tl.to(left, { rotation: -2.5, scale: 0.975, duration: 1.2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + 1.9);
  tl.to(right, { rotation: 2.5, scale: 0.975, duration: 1.2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + 1.9);
  tl.to(left, { x: -80, rotation: -7, duration: 0.3, ease: 'power2.out' }, t + 4.42);
  tl.to(right, { x: 80, rotation: 7, duration: 0.3, ease: 'power2.out' }, t + 4.42);
  tl.to(left, { x: 640, rotation: 26, duration: 0.34, ease: 'power3.in' }, t + 4.76);
  cue(tl, 'swish', t + 4.76);
  tl.to(right, { x: -640, rotation: -26, duration: 0.34, ease: 'power3.in' }, t + 4.76);
  tl.to([kick, logo, tag, sticker], { scale: 0.9, opacity: 0, duration: 0.28, ease: 'power2.in' }, t + 4.86);
}

// ---------------------------------------------------------------------------
// S2 — the problem
// ---------------------------------------------------------------------------
export function buildProblem(tl, start, end) {
  const s = scene('s-problem', 'bg-ink grid');
  showScene(tl, s, start, end);
  const P = COPY.problem;

  const h1 = add(s, `<h1 class="headline abs" style="left:0;width:1920px;text-align:center;top:108px">${P.headline}</h1>`);
  const w1 = splitWords(h1);
  const h2 = add(s, `<h1 class="headline abs" style="left:0;width:1920px;text-align:center;top:108px">${P.turn}</h1>`);
  const w2 = splitWords(h2);
  gsap.set([...w1, ...w2], { opacity: 0 });

  const CX = 960;
  const CY = 610;
  const nodes = [
    { x: 330, y: 420, ic: 'cpu' },
    { x: 330, y: 820, ic: 'wrench' },
    { x: 1590, y: 420, ic: 'plug' },
    { x: 1590, y: 820, ic: 'database' },
  ];

  const lines = add(s, '<svg class="abs" style="left:0;top:0" width="1920" height="1080" viewBox="0 0 1920 1080"></svg>');
  const lineEls = nodes.map((n) => {
    const l = svg('line', { x1: CX, y1: CY, x2: n.x, y2: n.y, stroke: C.sky, 'stroke-width': 3, 'stroke-opacity': 0.55, 'stroke-dasharray': '2 10', 'stroke-linecap': 'round' });
    lines.appendChild(l);
    return l;
  });
  const solid = nodes.map((n) => {
    const l = svg('line', { x1: CX, y1: CY, x2: n.x, y2: n.y, stroke: C.sky, 'stroke-width': 2, 'stroke-opacity': 0.35 });
    lines.appendChild(l);
    return l;
  });
  const pulses = nodes.map(() => {
    const c = svg('circle', { cx: CX, cy: CY, r: 8, fill: C.sky });
    c.style.filter = `drop-shadow(0 0 8px ${C.sky})`;
    lines.appendChild(c);
    return c;
  });
  gsap.set(pulses, { opacity: 0 });

  const nodeEls = nodes.map((n, i) => {
    const el = add(s, `<div class="node" style="left:${n.x - 64}px;top:${n.y - 64}px;width:128px;height:128px;border-radius:30px;background:color-mix(in srgb, var(--navy) 70%, transparent)">${icon(n.ic, { size: 56, stroke: C.sky, width: 1.8 })}</div>`);
    const lbl = add(s, `<div class="node-label" style="left:${n.x}px;top:${n.y + 82}px">${P.nodes[i]}</div>`);
    gsap.set([el, lbl], { opacity: 0 });
    return [el, lbl];
  });

  const agent = add(s, `<div class="node" style="left:${CX - 92}px;top:${CY - 92}px;width:184px;height:184px;border-radius:50%;border-width:3px;box-shadow:0 0 60px color-mix(in srgb, var(--sky) 35%, transparent)">${icon('bot', { size: 84, stroke: C.white, width: 1.7 })}</div>`);
  const agentLbl = add(s, `<div class="node-label" style="left:${CX}px;top:${CY + 112}px;color:${C.white}">${P.agent}</div>`);
  gsap.set([agent, agentLbl], { opacity: 0 });

  const chipPos = [[640, 318], [1290, 318], [560, 628], [1360, 628], [640, 950], [1290, 950]];
  const chips = P.threats.map((txt, i) => {
    const [x, y] = chipPos[i];
    const chip = add(s, `<div class="chip abs" style="left:${x}px;top:${y}px;height:64px;padding:0 26px 0 18px;font-size:28px;background:${C.gray};color:${C.white};box-shadow:0 12px 30px rgba(0,0,0,.35)">${icon('zap', { size: 28, stroke: C.sky, width: 2.2 })}<span class="t"></span></div>`);
    gsap.set(chip, { xPercent: -50, yPercent: -50, opacity: 0 });
    return { chip, txt, t: chip.querySelector('.t') };
  });

  // peeking claws
  const { left, right } = claws(s);
  gsap.set(left, { x: -120, y: 1100, rotation: 10 });
  gsap.set(right, { x: 120, y: 1100, rotation: -10 });

  const t = start;
  tl.fromTo(w1, { y: 70, rotationX: -60, transformPerspective: 600 }, { y: 0, rotationX: 0, opacity: 1, duration: 0.6, stagger: 0.07, ease: 'power4.out' }, t + 0.3);
  pop(tl, [agent, agentLbl], t + 0.45, { from: 0.4, dur: 0.6 });
  tl.fromTo([...lineEls, ...solid], { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.55, stagger: 0.06, ease: 'power2.out' }, t + 0.8);
  nodeEls.forEach((pair, i) => pop(tl, pair, t + 1.05 + i * 0.08, { from: 0.5 }));
  pulses.forEach((c, i) => {
    const n = nodes[i];
    tl.set(c, { opacity: 1 }, t + 1.3 + i * 0.18);
    tl.fromTo(c, { attr: { cx: CX, cy: CY } }, { attr: { cx: n.x, cy: n.y }, duration: 0.85, repeat: 2, ease: 'power1.in' }, t + 1.3 + i * 0.18);
    tl.set(c, { opacity: 0 }, t + 1.3 + i * 0.18 + 2.55);
  });
  chips.forEach(({ chip, txt, t: tx }, i) => {
    const at = t + 1.75 + i * 0.2;
    tl.fromTo(chip, { scale: 0.7 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.5)' }, at);
    tl.to(tx, { duration: 0.55, scrambleText: { text: txt, chars: 'X#%&@!?01', speed: 1.2 } }, at);
    cue(tl, 'glitch', at);
    tl.to(chip, { keyframes: [{ x: 6, duration: 0.04 }, { x: -5, duration: 0.04 }, { x: 0, duration: 0.04 }] }, at + 0.62);
  });
  // lines go nervous
  tl.to(lineEls, { attr: { 'stroke-opacity': 0.9 }, duration: 0.1, repeat: 5, yoyo: true }, t + 2.9);

  // turn
  tl.to(w1, { y: -50, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, t + 3.5);
  tl.to(chips.map((c) => c.chip), { scale: 0.6, opacity: 0, duration: 0.3, stagger: 0.03, ease: 'power2.in' }, t + 3.5);
  tl.to([...lineEls, ...solid], { attr: { 'stroke-opacity': 0.12 }, duration: 0.4 }, t + 3.6);
  tl.fromTo(w2, { y: 70, rotationX: -60, transformPerspective: 600 }, { y: 0, rotationX: 0, opacity: 1, duration: 0.6, stagger: 0.07, ease: 'power4.out' }, t + 3.85);
  tl.to(left, { y: 520, rotation: 0, duration: 0.45, ease: 'back.out(1.6)' }, t + 4.45);
  tl.to(right, { y: 520, rotation: 0, duration: 0.45, ease: 'back.out(1.6)' }, t + 4.45);
  shake(tl, t + 4.75, 12, 0.3);
  cue(tl, 'impactSoft', t + 4.75);
  const em = h2.querySelector('em');
  tl.to(em, { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1, transformOrigin: '0% 60%' }, t + 4.75);
}

// ---------------------------------------------------------------------------
// S3 — drop-in gateway
// ---------------------------------------------------------------------------
export function buildDropIn(tl, start, end) {
  const s = scene('s-dropin', 'bg-light grid');
  showScene(tl, s, start, end);
  const D = COPY.dropIn;
  const hdr = header(s, { num: D.num, kicker: D.kicker, headline: D.headline, sub: D.sub, top: 104 });
  watermark(s, true);

  const lines = [
    '<span class="c"># your agent — unchanged</span>',
    '<span class="k">from</span> openai <span class="k">import</span> OpenAI',
    '',
    'client = OpenAI(',
    '    base_url=<span class="s">"<span id="url">https://api.openai.com/v1</span><span class="caret" id="caret"></span>"</span>,',
    '    api_key=os.environ[<span class="s">"API_KEY"</span>],',
    ')',
  ];
  const card = add(s, `<div class="card dark" style="left:120px;top:400px;width:960px;height:470px">
    <div class="abs" style="left:28px;top:26px;display:flex;gap:10px">
      <i style="width:14px;height:14px;border-radius:50%;background:${C.gray}"></i>
      <i style="width:14px;height:14px;border-radius:50%;background:${C.gray}"></i>
      <i style="width:14px;height:14px;border-radius:50%;background:${C.gray}"></i></div>
    <div class="abs mono" style="left:110px;top:21px;padding:4px 14px;border-radius:8px;background:color-mix(in srgb, var(--white) 8%, transparent);font:500 17px/1.2 var(--mono);color:${C.sky}">agent.py</div>
    <div class="abs" id="lineHl" style="left:0;right:0;top:${92 + 4 * 44}px;height:44px;background:color-mix(in srgb, var(--sky) 14%, transparent);border-left:5px solid ${C.sky};opacity:0"></div>
    <div class="code abs" style="left:40px;top:92px;font-size:27px;line-height:44px">${lines.join('\n')}</div>
  </div>`);
  const url = card.querySelector('#url');
  const caret = card.querySelector('#caret');
  const lineHl = card.querySelector('#lineHl');
  gsap.set(caret, { opacity: 0 });

  const badge = add(s, `<div class="chip abs" style="left:120px;top:900px;height:58px;padding:0 26px 0 14px;font-size:22px;background:${C.navy};color:${C.white}">
    <span style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${C.sky};color:${C.navy}">${icon('check', { size: 20, width: 3 })}</span>${D.badge}</div>`);

  const rows = D.protocols.map(([name, ep], i) => add(s, `<div class="abs" style="left:1150px;top:${400 + i * 95}px;width:650px;height:80px;border-radius:18px;background:${C.white};border:2px solid ${C.sky};box-shadow:0 8px 24px rgba(0,53,95,.08);display:flex;align-items:center;gap:16px;padding:0 20px">
      <span class="ok" style="flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:${C.sky};color:${C.navy}">${icon('check', { size: 20, width: 3 })}</span>
      <b style="flex:none;width:170px;font:800 23px/1 var(--sans);letter-spacing:-.01em;color:${C.navy}">${name}</b>
      <span style="font:500 17px/1 var(--mono);color:${C.gray};white-space:nowrap">${ep}</span></div>`));
  const oks = rows.map((r) => r.querySelector('.ok'));
  gsap.set([card, badge, ...rows], { opacity: 0 });
  gsap.set(oks, { scale: 0 });

  const t = start;
  headerIn(tl, hdr, t + 0.35);
  tl.fromTo(card, { y: 60 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, t + 0.75);
  rows.forEach((r, i) => tl.fromTo(r, { x: 90 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, t + 1.0 + i * 0.14));

  // select → delete → type the new base_url
  tl.to(url, { backgroundColor: 'rgba(115,153,198,.55)', duration: 0.2 }, t + 1.65);
  tl.to(url, { text: '', duration: 0.12, ease: 'none' }, t + 2.05);
  cue(tl, 'tick', t + 2.05);
  tl.set(url, { backgroundColor: 'rgba(0,0,0,0)' }, t + 2.17);
  tl.set(caret, { opacity: 1 }, t + 2.05);
  tl.to(url, { text: D.newUrl, duration: 0.75, ease: 'none' }, t + 2.2);
  cue(tl, 'typing', t + 2.2, { dur: 0.75, n: D.newUrl.length });
  tl.to(caret, { opacity: 0, duration: 0.01, repeat: 3, yoyo: true, repeatDelay: 0.22 }, t + 3.0);
  tl.set(caret, { opacity: 0 }, t + 3.75);
  tl.to(lineHl, { opacity: 1, duration: 0.3 }, t + 3.0);
  tl.fromTo(badge, { y: 20, scale: 0.9 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' }, t + 3.15);
  cue(tl, 'pop', t + 3.15);

  oks.forEach((o, i) => {
    tl.to(o, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, t + 3.35 + i * 0.13);
    cue(tl, 'blip', t + 3.35 + i * 0.13, { pitch: i });
  });
  tl.to(rows, { keyframes: [{ borderColor: C.blue, backgroundColor: 'rgba(172,212,241,.35)', duration: 0.18 }, { borderColor: C.sky, backgroundColor: 'rgba(255,255,255,1)', duration: 0.35 }], stagger: 0.12 }, t + 4.35);
}

// ---------------------------------------------------------------------------
// S4 — hybrid guardrails pipeline
// ---------------------------------------------------------------------------
export function buildGuardrails(tl, start, end) {
  const s = scene('s-guard', 'bg-navy grid');
  showScene(tl, s, start, end);
  const G = COPY.guardrails;
  const hdr = header(s, { num: G.num, kicker: G.kicker, headline: G.headline, sub: G.sub, top: 80, size: 72 });

  const Y = 520;
  const AGENT = 120;
  const LLM = 1290;
  const APP = 1790;
  const gates = [
    { x: 600, b: 'REGEX', sp: 'PII · secrets' },
    { x: 820, b: 'KEYWORDS', sp: 'deny-lists' },
    { x: 1040, b: 'DECISION MODEL', sp: 'AI · semantic' },
    { x: 1540, b: 'OUTPUT SCAN', sp: 'regex · keywords · AI' },
  ];

  const track = add(s, `<div class="abs" style="left:${AGENT}px;top:${Y - 2}px;width:${APP - AGENT}px;height:4px;border-radius:2px;background:repeating-linear-gradient(90deg, color-mix(in srgb, var(--sky) 45%, transparent) 0 14px, transparent 14px 26px)"></div>`);
  const brackets = [
    [520, 1120, 'PRE-FLIGHT'],
    [1450, 1630, 'POST-FLIGHT'],
  ].map(([a, b, label]) => add(s, `<div class="abs" style="left:${a}px;top:304px;width:${b - a}px;height:16px;border:2px solid ${C.sky};border-bottom:0;border-radius:8px 8px 0 0;opacity:.7">
      <span style="position:absolute;left:50%;top:-30px;transform:translateX(-50%);padding:0 10px;font:700 17px/1 var(--mono);letter-spacing:.2em;color:${C.sky};white-space:nowrap">${label}</span></div>`));

  const gateEls = gates.map((g) => {
    const label = add(s, `<div class="gate-label" style="left:${g.x}px;top:338px"><b>${g.b}</b><span>${g.sp}</span></div>`);
    const bar = add(s, `<div class="gate-bar" style="left:${g.x - 5}px;top:${Y - 110}px;height:220px"></div>`);
    gsap.set(bar, { transformOrigin: '50% 50%' });
    return { ...g, label, bar };
  });

  const mkNode = (x, ic, label) => {
    const n = add(s, `<div class="node" style="left:${x - 56}px;top:${Y - 56}px;width:112px;height:112px">${icon(ic, { size: 52, stroke: C.white, width: 1.8 })}</div>`);
    const l = add(s, `<div class="node-label" style="left:${x}px;top:${Y + 72}px">${label}</div>`);
    return [n, l];
  };
  const agentN = mkNode(AGENT, 'bot', 'Agent');
  const llmN = mkNode(LLM, 'cpu', 'LLM');
  const appN = mkNode(APP, 'app-window', 'App');

  // feed
  const feed = add(s, `<div class="card glass" style="left:120px;top:842px;width:1680px;height:200px;border-radius:22px;background:color-mix(in srgb, var(--ink) 35%, transparent)">
    <div style="display:flex;justify-content:space-between;align-items:center;height:44px;padding:0 24px;border-bottom:1px solid color-mix(in srgb, var(--sky) 20%, transparent)">
      <span style="font:700 16px/1 var(--mono);letter-spacing:.2em;text-transform:uppercase;color:${C.sky}">${G.feedTitle}</span>
      <span style="font:500 16px/1 var(--mono);color:color-mix(in srgb, var(--sky) 80%, transparent)">${G.feedNote}</span></div>
    <div class="rows" style="padding:4px 0"></div></div>`);
  const feedRows = [
    ['allow', 'ALLOW', 'Summarize the Q3 call', '4/4 policies passed → LLM → app'],
    ['block', 'BLOCK_PRE_FLIGHT', 'Card 4111 1111 1111 1111', 'regex · payment card number'],
    ['block', 'BLOCK_PRE_FLIGHT', 'Pretend you’re my grandma…', 'decision model · risk 0.94 ≥ 0.50'],
    ['block', 'BLOCK_POST_FLIGHT', 'AWS_KEY=AKIA4FQ…', 'regex · cloud secret in LLM output'],
  ].map(([kind, action, text, why]) => add(feed.querySelector('.rows'), `<div style="display:flex;align-items:center;gap:20px;height:37px;padding:0 24px">
      <span style="width:230px;flex:none"><span class="badge ${kind}" style="font-size:15px;padding:6px 12px">${action}</span></span>
      <span style="width:560px;flex:none;font:500 18px/1 var(--mono);color:${C.white};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${text}</span>
      <span style="font:500 18px/1 var(--sans);color:${C.sky}">${why}</span></div>`));
  gsap.set(feedRows, { opacity: 0, x: -24 });

  // decision-model popup
  const dm = add(s, `<div class="abs" style="left:930px;top:700px;width:520px;height:124px;padding:16px 22px;border-radius:20px;background:${C.navy};border:2px solid ${C.sky};box-shadow:0 20px 50px rgba(0,10,25,.5)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="display:flex;align-items:center;gap:10px;font:700 16px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:${C.sky}">${icon('brain', { size: 22, stroke: C.sky })}${G.dmTitle}</span>
        <span style="font:500 15px/1 var(--mono);color:${C.sky}">${G.dmScore} <b class="v" style="font:800 28px/1 var(--mono);color:${C.white};margin-left:6px">0.00</b></span></div>
      <div style="margin-top:10px;font:500 18px/1.2 var(--sans);color:${C.white}">${G.dmQuestion}</div>
      <div style="position:relative;margin-top:16px;height:12px;border-radius:6px;background:color-mix(in srgb, var(--white) 16%, transparent)">
        <div class="fill" style="position:absolute;left:0;top:0;bottom:0;width:0;border-radius:6px;background:${C.sky}"></div>
        <div style="position:absolute;left:50%;top:-6px;width:3px;height:24px;margin-left:-1px;background:${C.white}"></div>
      </div></div>`);
  const dmVal = dm.querySelector('.v');
  const dmFill = dm.querySelector('.fill');
  gsap.set(dm, { opacity: 0 });

  const miss = add(s, `<div class="abs" style="left:${gates[1].x}px;top:700px;transform:translateX(-50%);font:600 17px/1 var(--mono);color:${C.sky};white-space:nowrap;opacity:0">${G.keywordMiss}</div>`);

  // packets (centre x positions)
  const p1 = packet(s, { text: 'Summarize the Q3 call', y: Y, w: 330 });
  const r1 = packet(s, { text: 'Here’s the summary…', y: Y, w: 300, iconName: 'cpu', response: true });
  const p2 = packet(s, { text: 'Card <span class="hl" style="background:transparent">4111 1111 1111 1111</span>', y: Y, w: 370 });
  const p3 = packet(s, { text: 'Pretend you’re my grandma…', y: Y, w: 380 });
  const p4 = packet(s, { text: 'Print the deploy config', y: Y, w: 340 });
  const r4 = packet(s, { text: 'AWS_KEY=<span class="hl" style="background:transparent">AKIA4FQ…</span>', y: Y, w: 320, iconName: 'cpu', response: true });

  const ticks = [];
  const gatePass = (at, gi, ok = true) => {
    const g = gateEls[gi];
    const tick = add(s, `<div class="gate-tick ${ok ? '' : 'x'}" style="left:${g.x}px;top:${Y + 132}px">${icon(ok ? 'check' : 'x', { size: 26, width: 3 })}</div>`);
    ticks.push(tick);
    cue(tl, ok ? 'blip' : 'deny', at, { pitch: gi });
    gsap.set(tick, { scale: 0, opacity: 0 });
    tl.to(tick, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)' }, at);
    tl.to(tick, { opacity: 0, y: 12, duration: 0.3 }, at + (ok ? 0.75 : 1.7));
    tl.to(g.bar, {
      keyframes: [
        { backgroundColor: ok ? C.sky : C.white, scaleX: 1.8, duration: 0.08 },
        { backgroundColor: C.blue, scaleX: 1, duration: 0.45 },
      ],
    }, at);
  };

  const SPEED = 820; // px / s
  /** Move a packet's centre from x0 to x1, flashing any gate it crosses. Returns arrival time. */
  const travel = (p, x0, x1, at, passGates = true) => {
    const dur = Math.abs(x1 - x0) / SPEED;
    tl.to(p, { x: x1, duration: dur, ease: 'none' }, at);
    if (passGates) {
      gateEls.forEach((g, gi) => {
        if (g.x > x0 && g.x <= x1) gatePass(at + (g.x - x0) / SPEED, gi, true);
      });
    }
    return at + dur;
  };
  const emerge = (p, x0, x1, at) => {
    tl.fromTo(p, { x: x0, scale: 0.3, opacity: 0 }, { x: x1, scale: 1, opacity: 1, duration: 0.32, ease: 'power2.out' }, at);
    return at + 0.32;
  };
  const absorb = (p, node, x, at) => {
    tl.to(p, { x, scale: 0.3, opacity: 0, duration: 0.24, ease: 'power2.in' }, at);
    tl.to(node[0], { keyframes: [{ scale: 1.14, borderColor: C.white, duration: 0.12 }, { scale: 1, borderColor: C.sky, duration: 0.3 }] }, at + 0.2);
    return at + 0.3;
  };
  const showRow = (i, at) => tl.to(feedRows[i], { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, at);

  const t = start;
  headerIn(tl, hdr, t + 0.25);
  tl.fromTo(track, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.8, ease: 'power3.out' }, t + 0.4);
  [agentN, llmN, appN].forEach((n, i) => pop(tl, n, t + 0.45 + i * 0.12, { from: 0.4 }));
  gateEls.forEach((g, i) => {
    tl.fromTo(g.bar, { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: 'back.out(2)' }, t + 0.55 + i * 0.1);
    tl.fromTo(g.label, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, t + 0.65 + i * 0.1);
  });
  tl.fromTo(brackets, { opacity: 0, y: 10 }, { opacity: 0.7, y: 0, duration: 0.4, stagger: 0.1 }, t + 0.9);
  tl.fromTo(feed, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, t + 1.0);

  // P1 — allowed all the way
  let a = emerge(p1, AGENT, 300, t + 1.4);
  a = travel(p1, 300, LLM, a);
  a = absorb(p1, llmN, LLM, a);
  a = emerge(r1, LLM, LLM + 60, a + 0.12);
  a = travel(r1, LLM + 60, APP, a);
  absorb(r1, appN, APP, a);
  showRow(0, a + 0.1);

  // P2 — regex catches a card number at gate A
  a = emerge(p2, AGENT, 300, t + 3.05);
  a = travel(p2, 300, gates[0].x - 185 - 14, a, false);
  gatePass(a, 0, false);
  blockPacket(tl, p2, 370, a, p2.querySelector('.hl'));
  showRow(1, a + 0.5);

  // P3 — sails past regex & keywords, the decision model nails it
  a = emerge(p3, AGENT, 300, t + 4.75);
  a = travel(p3, 300, gates[2].x - 190 - 14, a);
  tl.to(miss, { opacity: 1, duration: 0.2 }, a - 0.5);
  tl.to(miss, { opacity: 0, duration: 0.3 }, a + 1.6);
  tl.fromTo(dm, { y: 20, scale: 0.94 }, { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, a + 0.05);
  const dmO = { v: 0 };
  cue(tl, 'scan', a + 0.3, { dur: 1.15 });
  tl.to(dmO, {
    v: 0.94, duration: 1.15, ease: 'power2.inOut',
    onUpdate: () => {
      dmVal.textContent = dmO.v.toFixed(2);
      dmFill.style.width = `${dmO.v * 100}%`;
      dmFill.style.background = dmO.v >= 0.5 ? C.white : C.sky;
    },
  }, a + 0.3);
  gatePass(a + 1.5, 2, false);
  blockPacket(tl, p3, 380, a + 1.5);
  showRow(2, a + 1.9);
  tl.to(dm, { opacity: 0, y: 14, duration: 0.35 }, a + 2.7);

  // P4 — clean prompt, but the LLM answer leaks a secret → post-flight
  a = emerge(p4, AGENT, 300, t + 8.0);
  a = travel(p4, 300, LLM, a);
  a = absorb(p4, llmN, LLM, a);
  a = emerge(r4, LLM, LLM + 40, a + 0.15);
  a = travel(r4, LLM + 40, gates[3].x - 160 - 14, a);
  gatePass(a, 3, false);
  blockPacket(tl, r4, 320, a, r4.querySelector('.hl'));
  showRow(3, a + 0.5);
}

// ---------------------------------------------------------------------------
// S5 — protocol-native block responses
// ---------------------------------------------------------------------------
export function buildBlocks(tl, start, end) {
  const s = scene('s-blocks', 'bg-light grid');
  showScene(tl, s, start, end);
  const B = COPY.blocks;
  const hdr = header(s, { num: B.num, kicker: B.kicker, headline: B.headline, sub: B.sub, top: 104 });
  watermark(s, true);

  const msg = `<span class="msg">"${B.message}"</span>`;
  const k = (x) => `<span class="p">"${x}"</span>`;
  const v = (x) => `<span class="s">"${x}"</span>`;
  const cards = [
    ['OpenAI', 'POST /v1/chat/completions', [
      '{',
      `  ${k('object')}: ${v('chat.completion')},`,
      `  ${k('choices')}: [{`,
      `    ${k('message')}: {`,
      `      ${k('role')}: ${v('assistant')},`,
      `      ${k('content')}: ${msg}`,
      '    },',
      `    ${k('finish_reason')}: ${v('stop')}`,
      '  }]',
      '}',
    ]],
    ['Anthropic', 'POST /v1/messages', [
      '{',
      `  ${k('type')}: ${v('message')},`,
      `  ${k('role')}: ${v('assistant')},`,
      `  ${k('content')}: [{`,
      `    ${k('type')}: ${v('text')},`,
      `    ${k('text')}: ${msg}`,
      '  }],',
      `  ${k('stop_reason')}: ${v('end_turn')}`,
      '}',
    ]],
    ['Gemini', 'POST …:generateContent', [
      '{',
      `  ${k('candidates')}: [{`,
      `    ${k('content')}: {`,
      `      ${k('role')}: ${v('model')},`,
      `      ${k('parts')}: [{`,
      `        ${k('text')}: ${msg}`,
      '      }]',
      '    },',
      `    ${k('finishReason')}: ${v('STOP')}`,
      '  }]',
      '}',
    ]],
  ].map(([name, ep, code], i) => {
    const c = add(s, `<div class="card dark" style="left:${120 + i * 572}px;top:372px;width:536px;height:450px">
      <div class="abs" style="left:30px;top:26px;font:800 26px/1 var(--sans);letter-spacing:-.01em">${name}</div>
      <div class="abs" style="left:30px;top:62px;font:500 16px/1 var(--mono);color:${C.blue}">${ep}</div>
      <div class="abs" style="left:0;right:0;top:96px;height:1px;background:color-mix(in srgb, var(--white) 12%, transparent)"></div>
      <div class="code abs" style="left:30px;top:116px;font-size:18px;line-height:1.62">${code.map((l) => `<div class="ln">${l || ' '}</div>`).join('')}</div></div>`);
    return c;
  });
  const chipRow = add(s, '<div class="abs" style="left:120px;top:858px;display:flex;gap:16px"></div>');
  const chips = B.chips.map((txt) => add(chipRow, `<div class="chip" style="background:${C.navy};color:${C.white};height:52px;font-size:21px;padding:0 22px 0 14px">
      <span style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:${C.sky};color:${C.navy}">${icon('check', { size: 18, width: 3 })}</span>${txt}</div>`));
  gsap.set([...cards, ...chips], { opacity: 0 });

  const t = start;
  headerIn(tl, hdr, t + 0.4);
  cards.forEach((c, i) => {
    tl.fromTo(c, { y: 70, rotationY: -12 }, { y: 0, rotationY: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, t + 0.8 + i * 0.15);
    tl.fromTo(c.querySelectorAll('.ln'), { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.2, stagger: 0.035 }, t + 1.05 + i * 0.15);
  });
  const msgs = cards.map((c) => c.querySelector('.msg'));
  tl.to(msgs, { backgroundColor: C.sky, color: C.navy, borderRadius: 6, duration: 0.25, stagger: 0.15 }, t + 2.3);
  msgs.forEach((_, i) => cue(tl, 'blip', t + 2.3 + i * 0.15, { pitch: 2 + i }));
  tl.to(msgs, { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1, stagger: 0.15 }, t + 2.3);
  chips.forEach((c, i) => tl.fromTo(c, { y: 20, scale: 0.9 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' }, t + 2.9 + i * 0.14));
}

// ---------------------------------------------------------------------------
// S6 — MCP firewall
// ---------------------------------------------------------------------------
export function buildMcp(tl, start, end) {
  const s = scene('s-mcp', 'bg-ink grid');
  showScene(tl, s, start, end);
  const M = COPY.mcp;
  const hdr = header(s, { num: M.num, kicker: M.kicker, headline: M.headline, sub: M.sub, top: 96, size: 76 });
  watermark(s);

  const Y = 640;
  const AG = 200;
  const GX = 780;
  const agent = add(s, `<div class="node" style="left:${AG - 66}px;top:${Y - 66}px;width:132px;height:132px;border-radius:32px">${icon('bot', { size: 62, stroke: C.white, width: 1.7 })}</div>`);
  const agentL = add(s, `<div class="node-label" style="left:${AG}px;top:${Y + 86}px">Agent</div>`);
  const track = add(s, `<div class="abs" style="left:${AG}px;top:${Y - 2}px;width:${1180 - AG}px;height:4px;background:repeating-linear-gradient(90deg, color-mix(in srgb, var(--sky) 45%, transparent) 0 14px, transparent 14px 26px)"></div>`);

  const tools = [['search_code', true], ['read_file', true], ['create_issue', true], ['delete_repo', false]];
  const server = add(s, `<div class="card" style="left:1180px;top:400px;width:620px;height:470px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:16px;height:96px;padding:0 30px;border-bottom:1px solid #E5E9EF">
      <span style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--sky-faint);border:2px solid ${C.sky};color:${C.navy}">${icon('server', { size: 28 })}</span>
      <span><b style="display:block;font:800 28px/1 var(--sans);letter-spacing:-.02em">${M.server}</b>
      <span style="display:block;margin-top:6px;font:500 16px/1 var(--mono);color:${C.gray}">${M.serverNote}</span></span></div>
    ${tools.map(([name, ok]) => `<div class="tool" style="display:flex;align-items:center;gap:16px;height:93px;padding:0 30px;border-bottom:1px solid #E5E9EF">
      <span style="color:${ok ? C.blue : C.gray}">${icon('wrench', { size: 24 })}</span>
      <span style="flex:1;font:600 24px/1 var(--mono);color:${ok ? C.navy : C.gray};${ok ? '' : 'text-decoration:line-through'}">${name}</span>
      <span class="badge ${ok ? 'allow' : 'block on-light'}" style="font-size:14px">${ok ? M.allowed : M.denied}</span></div>`).join('')}
  </div>`);
  const toolRows = [...server.querySelectorAll('.tool')];

  const pills = [
    packet(s, { text: 'tools/call · search_code', y: Y, w: 350, iconName: 'wrench' }),
    packet(s, { text: 'tools/call · delete_repo', y: Y, w: 350, iconName: 'wrench' }),
    packet(s, { text: 'read_file · <span class="hl" style="background:transparent">~/.ssh/id_rsa</span>', y: Y, w: 370, iconName: 'wrench' }),
  ];

  const gate = add(s, `<div class="abs" style="left:${GX - 82}px;top:${Y - 160}px;width:164px;height:320px;border-radius:30px;background:${C.navy};border:3px solid ${C.sky};box-shadow:0 0 60px color-mix(in srgb, var(--sky) 30%, transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      ${clawLogo(64, C.sky)}
      <b style="font:800 26px/1 var(--sans);letter-spacing:-.02em">clawGS</b>
      <span style="font:600 14px/1 var(--mono);letter-spacing:.12em;color:${C.sky}">MCP PROXY</span></div>`);

  const err = add(s, `<div class="card dark" style="left:500px;top:836px;width:620px;height:150px;padding:22px 26px;border:2px solid ${C.gray}">
      <div style="display:flex;justify-content:space-between;align-items:center"><span style="font:600 15px/1 var(--mono);letter-spacing:.14em;color:${C.blue}">JSON-RPC ERROR -32000</span>
      <span class="b1 badge block" style="font-size:14px">BLOCK_WHITELIST</span></div>
      <div class="m1 code" style="margin-top:16px;font-size:18px;line-height:1.5;white-space:normal">"message": <span class="s">"Tool 'delete_repo' is not whitelisted on this server."</span></div>
      <div class="m2 code" style="position:absolute;left:26px;right:26px;top:60px;font-size:18px;line-height:1.5;white-space:normal;opacity:0">"message": <span class="s">"Blocked by clawGS policy: MCP pre-flight guardrail: Private keys"</span></div>
    </div>`);
  const b1 = err.querySelector('.b1');
  gsap.set([err, server, gate, agent, agentL], { opacity: 0 });

  const t = start;
  headerIn(tl, hdr, t + 0.3);
  pop(tl, [agent, agentL], t + 0.55, { from: 0.4 });
  tl.fromTo(track, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.7, ease: 'power3.out' }, t + 0.6);
  tl.fromTo(gate, { scaleY: 0.2 }, { scaleY: 1, opacity: 1, duration: 0.55, ease: 'back.out(1.8)' }, t + 0.75);
  tl.fromTo(server, { x: 80 }, { x: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, t + 0.85);
  tl.fromTo(toolRows, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.08 }, t + 1.05);

  const emerge = (p, at) => {
    tl.fromTo(p, { x: AG, scale: 0.3, opacity: 0 }, { x: AG + 250, scale: 1, opacity: 1, duration: 0.32, ease: 'power2.out' }, at);
    return at + 0.32;
  };
  const gateGlow = (at, ok) => {
    cue(tl, ok ? 'blip' : 'deny', at, { pitch: 1 });
    tl.to(gate, {
      keyframes: [
        { borderColor: ok ? C.sky : C.white, scale: 1.06, duration: 0.1 },
        { borderColor: C.sky, scale: 1, duration: 0.4 },
      ],
    }, at);
  };

  // call 1 — whitelisted → passes behind the gate and lands on the tool
  let a = emerge(pills[0], t + 1.4);
  tl.to(pills[0], { x: GX, duration: 0.45, ease: 'none' }, a);
  gateGlow(a + 0.3, true);
  tl.to(pills[0], { x: 1110, y: -97, scale: 0.4, opacity: 0, duration: 0.5, ease: 'power2.in' }, a + 0.45);
  tl.to(toolRows[0], { keyframes: [{ backgroundColor: 'rgba(172,212,241,.6)', duration: 0.15 }, { backgroundColor: 'rgba(172,212,241,0)', duration: 0.6 }] }, a + 0.9);
  cue(tl, 'blip', a + 0.9, { pitch: 4 });

  // call 2 — not on the whitelist
  a = emerge(pills[1], t + 2.5);
  a += 0.12;
  tl.to(pills[1], { x: GX - 82 - 175 - 12, duration: 0.15, ease: 'power1.out' }, a - 0.12);
  gateGlow(a, false);
  blockPacket(tl, pills[1], 350, a);
  tl.fromTo(err, { y: 20 }, { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, a + 0.2);
  tl.to(toolRows[3], { keyframes: [{ backgroundColor: 'rgba(88,87,90,.18)', duration: 0.15 }, { backgroundColor: 'rgba(88,87,90,0)', duration: 0.6 }] }, a + 0.2);

  // call 3 — allowed tool, forbidden argument → MCP pre-flight policy
  a = emerge(pills[2], t + 3.85);
  a += 0.12;
  tl.to(pills[2], { x: GX - 82 - 185 - 12, duration: 0.15, ease: 'power1.out' }, a - 0.12);
  gateGlow(a, false);
  blockPacket(tl, pills[2], 370, a, pills[2].querySelector('.hl'));
  tl.to(err.querySelector('.m1'), { opacity: 0, duration: 0.2 }, a + 0.2);
  tl.to(err.querySelector('.m2'), { opacity: 1, duration: 0.25 }, a + 0.3);
  tl.to(b1, { text: 'BLOCK_POLICY', duration: 0.25, ease: 'none' }, a + 0.25);
  tl.to(err, { keyframes: [{ scale: 1.03, duration: 0.1 }, { scale: 1, duration: 0.25 }] }, a + 0.25);
}

// ---------------------------------------------------------------------------
// S7 — budgets & rate limits
// ---------------------------------------------------------------------------
export function buildBudgets(tl, start, end) {
  const s = scene('s-budget', 'bg-light grid');
  showScene(tl, s, start, end);
  const B = COPY.budgets;
  const hdr = header(s, { num: B.num, kicker: B.kicker, headline: B.headline, sub: B.sub, top: 104 });
  watermark(s, true);

  const L = add(s, `<div class="card" style="left:120px;top:378px;width:810px;height:540px;border:2px solid ${C.sky}">
    <div class="abs" style="left:40px;top:38px;display:flex;align-items:center;gap:16px">
      <span style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--sky-faint);border:2px solid ${C.sky}">${icon('key-round', { size: 28, stroke: C.navy })}</span>
      <b style="font:800 32px/1 var(--mono);letter-spacing:-.02em">${B.keyName}</b>
      <span class="chip" style="height:38px;font-size:17px;background:var(--sky-faint);border:1.5px solid ${C.sky};color:${C.navy}">${B.costCenter}</span></div>
    <div class="abs" style="left:40px;top:142px;font:700 15px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:${C.gray}">${B.budgetLabel}</div>
    <div class="abs" style="left:40px;top:172px;display:flex;align-items:baseline;gap:12px">
      <span class="amt" style="font:800 84px/1 var(--sans);letter-spacing:-.04em;color:${C.navy}">$37.20</span>
      <span style="font:600 34px/1 var(--sans);color:${C.gray}">/ $50.00</span></div>
    <span class="pct abs" style="right:40px;top:212px;font:800 34px/1 var(--mono);color:${C.blue}">74%</span>
    <div class="abs" style="left:40px;top:290px;width:730px;height:30px;border-radius:15px;background:var(--sky-faint);border:1.5px solid ${C.sky};overflow:hidden">
      <div class="fill" style="width:74%;height:100%;border-radius:15px;background:${C.blue}"></div></div>
    <div class="pops abs" style="left:0;top:0"></div>
    <div class="blk abs" style="left:40px;top:372px;display:flex;align-items:center;gap:18px;opacity:0">
      <span class="badge block on-light" style="font-size:22px;padding:12px 20px">BLOCK_BUDGET</span>
      <span style="font:500 22px/1.25 var(--sans);color:${C.gray}">next call gets a polite “no”,<br>not a surprise invoice</span></div>
  </div>`);
  const amt = L.querySelector('.amt');
  const pct = L.querySelector('.pct');
  const fill = L.querySelector('.fill');

  const R = add(s, `<div class="card" style="left:990px;top:378px;width:810px;height:540px;border:2px solid ${C.sky}">
    <div class="abs" style="left:40px;top:38px;display:flex;align-items:center;gap:16px">
      <span style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:var(--sky-faint);border:2px solid ${C.sky}">${icon('gauge', { size: 28, stroke: C.navy })}</span>
      <b style="font:800 32px/1 var(--sans);letter-spacing:-.02em">${B.rateTitle}</b>
      <span class="chip" style="height:38px;font-size:17px;background:${C.navy};color:${C.white}">${B.rateChip}</span></div>
    <div class="abs" style="left:40px;top:128px;display:flex;align-items:baseline;gap:12px">
      <span class="cnt" style="font:800 72px/1 var(--sans);letter-spacing:-.04em;color:${C.navy}">0</span>
      <span style="font:600 30px/1 var(--sans);color:${C.gray}">/ 60 this minute</span></div>
    <div class="abs" style="left:40px;top:216px;font:500 17px/1 var(--mono);color:${C.gray}">${B.rateNote}</div>
    <div class="dots abs" style="left:137px;top:270px;width:536px;display:grid;grid-template-columns:repeat(12, 30px);gap:16px"></div>
    <div class="abs extra" style="left:40px;top:${270 + 2 * 46}px;width:30px;height:30px;border-radius:50%;background:${C.white};border:3px solid ${C.ink}"></div>
    <div class="blk2 abs" style="left:0;right:0;top:300px;display:flex;justify-content:center;opacity:0">
      <span class="badge block on-light" style="font-size:22px;padding:12px 20px;box-shadow:0 12px 30px rgba(0,20,40,.35)">BLOCK_RATE_LIMIT</span></div>
  </div>`);
  const dotsWrap = R.querySelector('.dots');
  const dots = Array.from({ length: 60 }, () => add(dotsWrap, `<i style="width:30px;height:30px;border-radius:50%;background:var(--sky-faint);border:2px solid ${C.sky}"></i>`));
  const cnt = R.querySelector('.cnt');
  const extra = R.querySelector('.extra');
  gsap.set([L, R], { opacity: 0 });
  gsap.set(extra, { opacity: 0, x: -60 });

  const t = start;
  headerIn(tl, hdr, t + 0.4);
  tl.fromTo([L, R], { y: 60 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.14, ease: 'power3.out' }, t + 0.8);

  // spend ticks up to the cap
  const spend = [0.42, 1.1, 2.75, 0.88, 3.4, 1.95, 2.3];
  const pops = L.querySelector('.pops');
  let at = t + 1.35;
  let total = 37.2;
  spend.forEach((d, i) => {
    const prev = total;
    total = Math.min(50, total + d);
    const pctPrev = (prev / 50) * 100;
    const pctNow = (total / 50) * 100;
    const p = add(pops, `<span class="abs" style="left:${40 + (pctNow / 100) * 730 - 40}px;top:262px;font:800 22px/1 var(--mono);color:${C.blue};opacity:0">+$${d.toFixed(2)}</span>`);
    tl.fromTo(p, { y: 0, opacity: 0 }, { y: -40, opacity: 1, duration: 0.25 }, at);
    cue(tl, 'coin', at, { pitch: i });
    tl.to(p, { y: -70, opacity: 0, duration: 0.3 }, at + 0.25);
    const o = { v: prev, w: pctPrev };
    tl.to(o, {
      v: total, w: pctNow, duration: 0.3, ease: 'power2.out',
      onUpdate: () => {
        amt.textContent = `$${o.v.toFixed(2)}`;
        pct.textContent = `${Math.round(o.w)}%`;
        fill.style.width = `${o.w}%`;
      },
    }, at);
    at += 0.36 - i * 0.012;
  });
  const capAt = at + 0.1;
  tl.to(fill, { backgroundColor: C.ink, duration: 0.2 }, capAt);
  cue(tl, 'deny', capAt);
  tl.to([amt, pct], { color: C.ink, duration: 0.2 }, capAt);
  const lm = clawMarks(L, { x: 420, y: 196, w: 360, h: 170, angle: -58, len: 210, spacing: 52, thick: 5.5, color: C.navy, glow: false });
  clawIn(tl, lm, capAt + 0.05);
  tl.fromTo(L.querySelector('.blk'), { x: -20 }, { x: 0, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, capAt + 0.1);
  tl.to(L, { keyframes: [{ x: 8, duration: 0.05 }, { x: -6, duration: 0.05 }, { x: 0, duration: 0.05 }] }, capAt + 0.05);

  // rate limit dots fill, request #61 bounces
  tl.to(dots, { backgroundColor: C.blue, borderColor: C.navy, duration: 0.12, stagger: 0.034 }, t + 1.3);
  counter(tl, cnt, { from: 0, to: 60, at: t + 1.3, dur: 60 * 0.034 + 0.1, ease: 'none' });
  cue(tl, 'ticks', t + 1.3, { dur: 60 * 0.034, n: 60 });
  const bounceAt = t + 1.3 + 60 * 0.034 + 0.35;
  tl.to(extra, { opacity: 1, x: 40, duration: 0.25, ease: 'power2.in' }, bounceAt);
  tl.to(extra, { x: -30, rotation: -40, opacity: 0, duration: 0.45, ease: 'power2.out' }, bounceAt + 0.25);
  cue(tl, 'thud', bounceAt + 0.25);
  cue(tl, 'deny', bounceAt + 0.35);
  tl.to(dotsWrap, { keyframes: [{ x: 6, duration: 0.05 }, { x: -4, duration: 0.05 }, { x: 0, duration: 0.05 }] }, bounceAt + 0.25);
  tl.to(dots, { opacity: 0.35, duration: 0.3 }, bounceAt + 0.35);
  tl.fromTo(R.querySelector('.blk2'), { scale: 0.7 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.5)' }, bounceAt + 0.35);
}

// ---------------------------------------------------------------------------
// S8 — live audit & dashboard
// ---------------------------------------------------------------------------
export function buildReporting(tl, start, end) {
  const s = scene('s-report', 'bg-navy grid');
  showScene(tl, s, start, end);
  const R = COPY.reporting;
  const hdr = header(s, { num: R.num, kicker: R.kicker, headline: R.headline, sub: R.sub, top: 64, size: 76 });

  const nav = [
    ['Monitor'], ['activity', 'Overview', true], ['file-text', 'Live and audit'],
    ['Control'], ['shield-check', 'Policy'], ['ban', 'Block Responses'], ['key-round', 'API Keys'],
    ['System'], ['database', 'Models'], ['server', 'MCP Servers'], ['webhook', 'Webhooks'], ['download', 'Data Export'],
  ];
  const dash = add(s, `<div class="dash" style="left:120px;top:318px;width:1680px;height:800px">
    <div class="side">
      <div style="display:flex;align-items:center;gap:12px;padding:0 8px 18px">${clawLogo(32, '#2F5F95')}
        <span><b style="display:block;font:800 21px/1 var(--sans);color:${C.navy}">clawGS</b>
        <span style="display:block;margin-top:4px;font:500 12px/1 var(--sans);color:${C.gray}">Fence. Redact. Protect. Log.</span></span></div>
      ${nav.map(([a, b, on]) => (b
    ? `<div class="nav${on ? ' on' : ''}">${icon(a, { size: 18, stroke: C.navy })}${b}</div>`
    : `<div style="margin:14px 0 6px 12px;font:700 12px/1 var(--sans);color:#2F5F95">${a}</div>`)).join('')}
    </div>
    <div class="panel hero" style="left:280px;top:26px;width:1370px;height:116px">
      <div class="abs" style="left:32px;top:28px;font:800 34px/1 var(--sans);letter-spacing:-.02em;color:${C.navy}">All traffic is protected</div>
      <div class="abs" style="left:32px;top:74px;font:500 17px/1 var(--sans);color:${C.gray}">clawGS is intercepting, logging, and securing all gateway calls.</div>
      <div class="abs" style="right:330px;top:30px;text-align:right"><div class="lbl">Incidents today</div><div class="inc" style="margin-top:8px;font:800 40px/1 var(--sans);color:${C.ink}">0</div></div>
      <div class="abs" style="right:300px;top:26px;width:1px;height:64px;background:#E5E9EF"></div>
      <div class="abs" style="right:32px;top:30px;text-align:right"><div class="lbl">Threats stopped</div><div class="thr" style="margin-top:8px;font:800 40px/1 var(--sans);color:${C.navy}">0</div></div>
    </div>
    ${['Total gateway cost', 'Total requests', 'Tokens processed'].map((l, i) => `<div class="panel kpi" style="left:${280 + i * 463}px;top:162px;width:443px;height:116px">
      <div class="lbl abs" style="left:28px;top:26px">${l}</div><div class="big abs k${i}" style="left:28px;top:54px">0</div></div>`).join('')}
    <div class="panel chart" style="left:280px;top:298px;width:850px;height:420px">
      <div class="abs" style="left:28px;top:24px;font:700 19px/1 var(--sans);color:${C.ink}">Traffic &amp; cost over time</div>
      <svg class="abs" style="left:24px;top:70px" width="800" height="320" viewBox="0 0 800 320"></svg>
    </div>
    <div class="panel live" style="left:1150px;top:298px;width:500px;height:420px;overflow:hidden">
      <div class="abs" style="left:24px;top:24px;display:flex;align-items:center;gap:10px;font:700 19px/1 var(--sans);color:${C.ink}">
        <i class="pulse" style="width:12px;height:12px;border-radius:50%;background:${C.blue}"></i>Live audit</div>
      <div class="rows abs" style="left:0;right:0;top:62px;bottom:0;display:flex;flex-direction:column"></div>
    </div>
    <div class="dim abs" style="inset:0;background:color-mix(in srgb, var(--navy) 40%, transparent);opacity:0"></div>
  </div>`);

  // chart
  const chart = dash.querySelector('.chart svg');
  const rand = rng(42);
  const N = 48;
  const req = [];
  const cost = [];
  for (let i = 0; i < N; i++) {
    const trend = 0.25 + 0.6 * (i / N);
    req.push(Math.min(0.95, trend + 0.18 * Math.sin(i / 2.6) * rand() + 0.08 * rand()));
    cost.push(Math.min(0.9, trend * 0.7 + 0.1 * rand()));
  }
  const pts = (arr) => arr.map((v, i) => [10 + (i * 780) / (N - 1), 300 - v * 270]);
  const pathOf = (p) => p.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  for (let gy = 0; gy < 4; gy++) chart.appendChild(svg('line', { x1: 10, x2: 790, y1: 30 + gy * 90, y2: 30 + gy * 90, stroke: '#E5E9EF', 'stroke-dasharray': '4 6' }));
  const defs = svg('defs');
  defs.innerHTML = `<linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.blue}" stop-opacity=".35"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></linearGradient>`;
  chart.appendChild(defs);
  const rp = pts(req);
  const area = svg('path', { d: `${pathOf(rp)} L790 300 L10 300 Z`, fill: 'url(#ga)' });
  const line = svg('path', { d: pathOf(rp), fill: 'none', stroke: C.blue, 'stroke-width': 4, 'stroke-linejoin': 'round' });
  const cline = svg('path', { d: pathOf(pts(cost)), fill: 'none', stroke: C.navy, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  chart.append(area, line, cline);

  // live rows (DOM order = newest first)
  const feed = [
    ['12:04:39', 'research-agent', 'claude-sonnet', 'BLOCK_BUDGET'],
    ['12:04:38', 'bob_research', 'gpt-4o', 'ALLOW'],
    ['12:04:36', 'alice_dev', 'gemini-pro', 'BLOCK_RATE_LIMIT'],
    ['12:04:35', 'diana_analytics', 'llama3', 'ALLOW'],
    ['12:04:33', 'charlie_prod', 'gpt-4o', 'BLOCK_PRE_FLIGHT'],
    ['12:04:31', 'bob_research', 'claude-sonnet', 'ALLOW'],
    ['12:04:30', 'mcp_agent', 'mcp:github', 'BLOCK_WHITELIST'],
    ['12:04:28', 'alice_dev', 'gpt-4o', 'ALLOW'],
  ];
  const rowsWrap = dash.querySelector('.live .rows');
  const rowEls = feed.map(([tm, who, model, act]) => add(rowsWrap, `<div class="row" style="flex:none;height:0;opacity:0;overflow:hidden;font-size:15px">
      <span style="color:${C.gray};width:70px">${tm}</span>
      <span style="width:150px;font-weight:700;overflow:hidden;text-overflow:ellipsis">${who}</span>
      <span style="flex:1;color:${C.gray};overflow:hidden;text-overflow:ellipsis">${model}</span>
      <span class="badge ${act === 'ALLOW' ? 'allow' : 'block on-light'}" style="font-size:12px;padding:5px 9px">${act.replace('BLOCK_', '✕ ')}</span></div>`));

  // details modal
  const modal = add(dash, `<div class="abs" style="left:520px;top:110px;width:660px;height:500px;border-radius:24px;background:${C.white};box-shadow:0 30px 80px rgba(0,20,40,.45);padding:30px 34px;color:${C.ink};opacity:0">
    <div style="display:flex;justify-content:space-between;align-items:center"><b style="font:800 28px/1 var(--sans);letter-spacing:-.02em;color:${C.navy}">Request details</b>
      <span class="badge block on-light" style="font-size:14px">BLOCK_PRE_FLIGHT</span></div>
    <div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;padding:18px 22px;border-radius:14px;background:#F2F4F7">
      ${[['Owner · cost center', 'charlie_prod · Trading'], ['Tokens (prompt / completion)', '412 / 0'], ['Cost', '$0.0000'], ['Latency (GW + LLM)', '138 ms + 0 ms']]
    .map(([a, b]) => `<div><div style="font:500 14px/1 var(--sans);color:${C.gray}">${a}</div><div style="margin-top:6px;font:700 18px/1 var(--sans)">${b}</div></div>`).join('')}
    </div>
    <div style="margin:22px 0 10px;font:700 14px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:${C.gray}">Policies evaluated</div>
    ${[['PII · payment card', true], ['Jailbreak keywords', true], ['Decision model · risk 0.94', false]].map(([n, ok]) => `<div class="pol" style="display:flex;align-items:center;gap:12px;height:40px;font:600 18px/1 var(--sans)">
      <span style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:${ok ? C.sky : C.ink};color:${ok ? C.navy : C.white}">${icon(ok ? 'check' : 'x', { size: 16, width: 3 })}</span>
      <span style="flex:1">${n}</span><span style="font:600 15px/1 var(--mono);color:${ok ? C.blue : C.ink}">${ok ? 'pass' : 'fail'}</span></div>`).join('')}
    <div class="wh" style="margin-top:16px;display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--sky-faint);border:1.5px solid ${C.sky};font:600 16px/1 var(--mono);color:${C.navy}">
      ${icon('webhook', { size: 20, stroke: C.navy })} SECURITY_BLOCK → webhook delivered</div>
  </div>`);
  const pols = [...modal.querySelectorAll('.pol')];
  const wh = modal.querySelector('.wh');
  gsap.set(dash, { opacity: 0 });
  gsap.set([...pols, wh], { opacity: 0 });

  const t = start;
  headerIn(tl, hdr, t + 0.25);
  tl.fromTo(dash, { y: 120 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out' }, t + 0.55);
  counter(tl, dash.querySelector('.thr'), { to: 118204, at: t + 1.2, dur: 2.2 });
  counter(tl, dash.querySelector('.inc'), { to: 37, at: t + 1.2, dur: 2.2 });
  counter(tl, dash.querySelector('.k0'), { to: 8640.12, at: t + 1.3, dur: 2.0, fmt: (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` });
  counter(tl, dash.querySelector('.k1'), { to: 1000000, at: t + 1.3, dur: 2.0, fmt: (v) => (v >= 999500 ? '1.00M' : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : Math.round(v)) });
  counter(tl, dash.querySelector('.k2'), { to: 862.4, at: t + 1.3, dur: 2.0, fmt: (v) => `${v.toFixed(1)}M` });
  tl.fromTo(line, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut' }, t + 1.2);
  tl.fromTo(cline, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut' }, t + 1.35);
  tl.fromTo(area, { opacity: 0 }, { opacity: 1, duration: 0.8 }, t + 2.2);
  tl.to(dash.querySelector('.pulse'), { scale: 1.6, opacity: 0.4, duration: 0.4, repeat: 9, yoyo: true }, t + 1.2);
  [...rowEls].reverse().forEach((r, i) => {
    tl.to(r, { height: 44, opacity: 1, duration: 0.3, ease: 'power2.out' }, t + 1.5 + i * 0.36);
  });
  const mAt = t + 4.7;
  tl.to(dash.querySelector('.dim'), { opacity: 1, duration: 0.3 }, mAt);
  tl.fromTo(modal, { y: 40, scale: 0.94 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.8)' }, mAt + 0.05);
  cue(tl, 'pop', mAt + 0.05);
  tl.fromTo(pols, { x: -16 }, { x: 0, opacity: 1, duration: 0.3, stagger: 0.18 }, mAt + 0.45);
  ['blip', 'blip', 'deny'].forEach((k, i) => cue(tl, k, mAt + 0.45 + i * 0.18, { pitch: i }));
  tl.fromTo(wh, { y: 10 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(2)' }, mAt + 1.2);
  cue(tl, 'blip', mAt + 1.2, { pitch: 5 });
}

// ---------------------------------------------------------------------------
// S9 — essentials grid
// ---------------------------------------------------------------------------
export function buildEssentials(tl, start, end) {
  const s = scene('s-ess', 'bg-navy grid');
  showScene(tl, s, start, end);
  const E = COPY.essentials;
  const hdr = header(s, { num: E.num, kicker: E.kicker, headline: E.headline, top: 112 });
  watermark(s);

  const tiles = E.tiles.map(([ic, title, desc], i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    return add(s, `<div class="tile" style="left:${140 + col * 420}px;top:${330 + row * 254}px">
      <div class="shine"></div>
      <div class="ico">${icon(ic, { size: 34, stroke: C.navy, width: 2 })}</div>
      <h3>${title}</h3><p>${desc}</p></div>`);
  });
  const icos = tiles.map((tile) => tile.querySelector('.ico'));
  const shines = tiles.map((tile) => tile.querySelector('.shine'));
  gsap.set(tiles, { opacity: 0 });

  const t = start;
  headerIn(tl, hdr, t + 0.3);
  tl.fromTo(tiles, { y: 70, scale: 0.75, rotation: (i) => (i % 2 ? 4 : -4) }, {
    y: 0, scale: 1, rotation: 0, opacity: 1, duration: 0.6, stagger: 0.09, ease: 'back.out(1.7)',
  }, t + 0.75);
  tl.fromTo(icos, { scale: 0, rotation: -40 }, { scale: 1, rotation: 0, duration: 0.45, stagger: 0.09, ease: 'back.out(3)' }, t + 0.95);
  tiles.forEach((_, i) => cue(tl, 'pop', t + 0.75 + i * 0.09, { soft: true, pitch: i }));
  tl.fromTo(shines, { x: 0 }, { x: 760, duration: 0.8, stagger: 0.07, ease: 'power2.inOut' }, t + 2.25);
  tl.to(tiles, { keyframes: [{ y: -14, duration: 0.18 }, { y: 0, duration: 0.3, ease: 'bounce.out' }], stagger: 0.06 }, t + 3.2);
  tl.to(tiles, { scale: 0.6, opacity: 0, duration: 0.35, stagger: { each: 0.03, from: 'center' }, ease: 'power2.in' }, end - 0.55);
  tl.to([hdr.k, hdr.hl], { opacity: 0, y: -20, duration: 0.3 }, end - 0.5);
}

// ---------------------------------------------------------------------------
// S10 — outro
// ---------------------------------------------------------------------------
export function buildOutro(tl, start, end) {
  const s = scene('s-outro', 'bg-navy grid');
  tl.fromTo(s, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, start);
  const O = COPY.outro;

  const ring = add(s, `<div class="abs" style="left:960px;top:590px;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;border:6px solid ${C.sky};opacity:0"></div>`);
  const { left, right } = claws(s);
  const logo = add(s, '<div class="logo abs" style="left:0;width:1920px;top:470px;text-align:center">claw<span class="gs">GS</span></div>');
  const chars = splitChars(logo);
  const line = add(s, `<div class="abs" style="left:0;width:1920px;top:676px;text-align:center;font:700 44px/1 var(--sans);letter-spacing:-.02em">${O.line}</div>`);
  line.querySelector('em').style.cssText = `font-style:normal;color:${C.sky}`;
  const lw = splitWords(line);
  const tag = add(s, `<div class="abs" style="left:0;width:1920px;top:756px;text-align:center;font:600 24px/1 var(--mono);letter-spacing:.32em;text-transform:uppercase;color:${C.sky}">${O.tagline}</div>`);
  const sticker = add(s, `<div class="sticker" style="left:1585px;top:120px">${O.sticker}</div>`);
  const black = add(s, `<div class="abs" style="inset:0;background:${C.ink};opacity:0"></div>`);

  gsap.set(left, { x: -1150, y: -60, rotation: -18, scale: 0.95 });
  gsap.set(right, { x: 1150, y: -60, rotation: 18, scale: 0.95 });
  gsap.set([...chars, ...lw, tag, sticker], { opacity: 0 });

  const t = start;
  tl.to(left, { x: 0, rotation: 0, duration: 0.48, ease: 'back.out(1.25)' }, t + 0.2);
  tl.to(right, { x: 0, rotation: 0, duration: 0.48, ease: 'back.out(1.25)' }, t + 0.2);
  shake(tl, t + 0.5, 22, 0.4);
  cue(tl, 'impact', t + 0.5);
  tl.fromTo(ring, { scale: 0.2, opacity: 1 }, { scale: 3.4, opacity: 0, duration: 0.7, ease: 'power2.out', immediateRender: false }, t + 0.5);
  tl.fromTo(chars, { y: -150, rotation: (i) => (i % 2 ? 14 : -12) }, {
    y: 0, rotation: 0, opacity: 1, duration: 0.55, stagger: 0.05, ease: 'back.out(2.2)',
  }, t + 0.7);
  cue(tl, 'letters', t + 0.7, { step: 0.05 });
  tl.fromTo(lw, { y: 30 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, t + 1.3);
  tl.fromTo(tag, { letterSpacing: '0.7em' }, { letterSpacing: '0.32em', opacity: 1, duration: 0.8, ease: 'power3.out' }, t + 1.9);
  tl.to(left, { rotation: -2.5, scale: 0.975, duration: 0.9, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + 1.0);
  tl.to(right, { rotation: 2.5, scale: 0.975, duration: 0.9, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + 1.0);
  tl.fromTo(sticker, { scale: 0, rotation: -35 }, { scale: 1, rotation: 8, opacity: 1, duration: 0.5, ease: 'back.out(3)' }, t + 2.6);
  cue(tl, 'pop', t + 2.6);
  tl.to(sticker, { keyframes: [{ rotation: -6, duration: 0.09 }, { rotation: 10, duration: 0.09 }, { rotation: -3, duration: 0.09 }, { rotation: 8, duration: 0.1 }] }, t + 3.1);
  // claws clench on the logo, then lights out
  tl.to(left, { x: 70, rotation: 6, duration: 0.25, ease: 'power2.in' }, t + 3.55);
  tl.to(right, { x: -70, rotation: -6, duration: 0.25, ease: 'power2.in' }, t + 3.55);
  shake(tl, t + 3.8, 10, 0.25);
  cue(tl, 'impactSoft', t + 3.8);
  tl.to(black, { opacity: 1, duration: 0.7, ease: 'power2.in' }, end - 0.75);
}
