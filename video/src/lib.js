import { gsap } from '../node_modules/gsap/index.js';
import { icon } from './icons.js';

export const C = {
  blue: '#7399C6',
  navy: '#00355F',
  sky: '#ACD4F1',
  ink: '#231F20',
  gray: '#58575A',
  white: '#FFFFFF',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function add(parent, html) {
  const node = h(html);
  parent.appendChild(node);
  return node;
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

export function scene(id, cls) {
  return add(document.getElementById('shake'), `<section class="scene ${cls}" id="${id}"></section>`);
}

/**
 * Show a scene from `start` to `end` (hidden again at `end`, if given).
 * Scenes live in nested timelines, so the "show" must not render at build time.
 */
export function showScene(tl, el, start, end, { immediate = false } = {}) {
  if (immediate) gsap.set(el, { autoAlpha: 1 });
  else tl.set(el, { autoAlpha: 1, immediateRender: false }, start);
  if (end != null) tl.set(el, { autoAlpha: 0, immediateRender: false }, end);
}

/**
 * Sound cues. Scenes register sound effects / musical hits at their local time;
 * resolveCues() maps them to video time (through nested, time-scaled timelines)
 * so music/compose.mjs can lay the soundtrack exactly on the picture.
 */
const CUES = [];
export function cue(tl, type, at, opts = {}) {
  CUES.push({ tl, type, at, opts });
}
export function resolveCues(root) {
  const toGlobal = (tl, t) => {
    let node = tl;
    while (node && node !== root) {
      t = node.startTime() + t / node.timeScale();
      node = node.parent;
    }
    return Math.round(t * 1000) / 1000;
  };
  return CUES.map(({ tl, type, at, opts }) => {
    const out = { type, t: toGlobal(tl, at), ...opts };
    if (opts.dur != null) out.dur = Math.round((toGlobal(tl, at + opts.dur) - out.t) * 1000) / 1000;
    return out;
  }).sort((a, b) => a.t - b.t);
}

// Deterministic PRNG so every render of the video is identical.
export function rng(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap every word (or char) of a node's text in an inline-block span, keeping inner tags like <em>. */
function split(node, mode) {
  const out = [];
  const walk = (n) => {
    for (const child of [...n.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        const parts = mode === 'chars' ? [...child.textContent] : child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) {
            frag.appendChild(document.createTextNode(p));
          } else {
            const s = document.createElement('span');
            s.className = mode === 'chars' ? 'ch' : 'word';
            s.textContent = p;
            frag.appendChild(s);
            out.push(s);
          }
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  };
  walk(node);
  return out;
}
export const splitWords = (node) => split(node, 'words');
export const splitChars = (node) => split(node, 'chars');

/** The four-blade claw mark from the clawGS sidebar. */
export function clawLogo(size = 34, color = C.sky) {
  return `<svg width="${size}" height="${Math.round(size * 0.86)}" viewBox="0 0 28 24" aria-hidden="true"><g fill="${color}">
    <path d="M7.60 2.60 Q2.90 12.50 0.60 22.40 Q10.60 11.90 7.60 2.60Z"/>
    <path d="M13.70 0.60 Q9.00 12.10 6.70 23.60 Q16.70 11.50 13.70 0.60Z"/>
    <path d="M19.80 1.60 Q15.10 12.20 12.80 22.80 Q22.80 11.60 19.80 1.60Z"/>
    <path d="M25.90 4.00 Q21.20 12.20 18.90 20.40 Q28.90 11.60 25.90 4.00Z"/></g></svg>`;
}

export function watermark(sceneEl, light = false) {
  return add(sceneEl, `<div class="wm">${clawLogo(34, light ? C.blue : C.sky)}<span>clawGS</span></div>`);
}

/** Scene header: kicker pill, headline (word-split), optional sub line. */
export function header(sceneEl, { num, kicker, headline, sub, top = 96, left = 120, size, subTop }) {
  const k = add(sceneEl, `<div class="kicker abs" style="left:${left}px;top:${top}px"><span class="num">${num}</span>${kicker}</div>`);
  const hl = add(sceneEl, `<h1 class="headline abs" style="left:${left}px;top:${top + 50}px;${size ? `font-size:${size}px` : ''}">${headline}</h1>`);
  const words = splitWords(hl);
  let s = null;
  if (sub) {
    const st = subTop ?? top + 50 + (size || 84) * 1.02 + 22;
    s = add(sceneEl, `<p class="sub abs" style="left:${left}px;top:${st}px;width:1680px">${sub}</p>`);
  }
  return { k, hl, words, s };
}

export function headerIn(tl, hdr, at) {
  tl.fromTo(hdr.k, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, at);
  tl.fromTo(
    hdr.words,
    { y: 70, opacity: 0, rotationX: -60, transformPerspective: 600 },
    { y: 0, opacity: 1, rotationX: 0, duration: 0.6, stagger: 0.06, ease: 'power4.out' },
    at + 0.08
  );
  if (hdr.s) tl.fromTo(hdr.s, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, at + 0.35);
}

/** Lens shape — a tapered "claw scratch" — centred at (cx, cy), lying along the x axis. */
export function lens(cx, cy, half, thick) {
  return `M ${cx - half} ${cy} Q ${cx} ${cy - 2 * thick} ${cx + half} ${cy} Q ${cx} ${cy + 2 * thick} ${cx - half} ${cy} Z`;
}

/**
 * Three parallel claw scratches inside an absolutely positioned SVG.
 * Returns { el, paths }; animate with clawIn().
 */
export function clawMarks(parent, { x, y, w, h, angle = -60, len, spacing, thick = 5, color = C.white, glow = true }) {
  const el = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'claw-marks' });
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (glow) el.style.filter = `drop-shadow(0 0 10px ${C.sky})`;
  const g = svg('g', { transform: `rotate(${angle} ${w / 2} ${h / 2})` });
  const half = (len ?? Math.hypot(w, h) * 0.5) / 2;
  const sp = spacing ?? Math.min(w, h) * 0.22;
  const paths = [-1, 0, 1].map((i) => {
    const p = svg('path', { d: lens(w / 2, h / 2 + i * sp, half * (i === 0 ? 1 : 0.86), thick), fill: color });
    g.appendChild(p);
    return p;
  });
  el.appendChild(g);
  parent.appendChild(el);
  gsap.set(paths, { scaleX: 0, transformOrigin: '100% 50%' });
  return { el, paths };
}

export function clawIn(tl, marks, at, dur = 0.16, sound = 'scratch') {
  tl.to(marks.paths, { scaleX: 1, duration: dur, stagger: 0.05, ease: 'power4.out' }, at);
  if (sound) cue(tl, sound, at);
}

/** Screen shake on the whole stage. */
const SHAKE = [[1, -0.6], [-0.85, 0.9], [0.7, -0.35], [-0.5, 0.6], [0.32, -0.4], [-0.16, 0.2]];
export function shake(tl, at, strength = 16, duration = 0.36) {
  const n = SHAKE.length + 1;
  const keyframes = SHAKE.map(([a, b], i) => {
    const f = strength * (1 - i / n);
    return { x: a * f, y: b * f, rotation: a * f * 0.02, duration: duration / n };
  });
  keyframes.push({ x: 0, y: 0, rotation: 0, duration: duration / n });
  tl.to('#shake', { keyframes, ease: 'none' }, at);
}

/** Animated number. */
export function counter(tl, el, { from = 0, to, at, dur, fmt = (v) => Math.round(v).toLocaleString('en-US'), ease = 'power2.out' }) {
  const o = { v: from };
  el.textContent = fmt(from);
  tl.to(o, { v: to, duration: dur, ease, onUpdate: () => { el.textContent = fmt(o.v); } }, at);
}

/** Pop in (scale + fade). */
export function pop(tl, targets, at, { from = 0.6, dur = 0.5, stagger = 0, ease = 'back.out(2)', y = 0 } = {}) {
  tl.fromTo(targets, { scale: from, opacity: 0, y }, { scale: 1, opacity: 1, y: 0, duration: dur, stagger, ease }, at);
}

/**
 * Full-screen claw-slash wipe: three scratches tear across the frame, swell until they
 * cover it at `cover` (switch scenes there), then thin out again to reveal the next scene.
 */
export function slashWipe(tl, cover, colors = [C.sky, C.white, C.blue]) {
  const at = cover - 1.0;
  const root = document.getElementById('wipe');
  const outer = svg('g', { transform: 'rotate(-62 960 540)' });
  const inner = svg('g');
  outer.appendChild(inner);
  root.appendChild(outer);
  const HALF = 1900;
  const OFFS = [-600, 0, 600];
  const proxies = [];
  const paths = OFFS.map((off, i) => {
    const p = svg('path', { d: lens(960, 540 + off, HALF, 5), fill: colors[i] });
    inner.appendChild(p);
    proxies.push({ t: 5 });
    return p;
  });
  gsap.set(paths, { scaleX: 0, transformOrigin: '100% 50%', visibility: 'hidden' });
  const redraw = (i) => () => paths[i].setAttribute('d', lens(960, 540 + OFFS[i], HALF, proxies[i].t));

  tl.set(paths, { visibility: 'visible' }, at);
  tl.to(paths, { scaleX: 1, duration: 0.38, stagger: 0.08, ease: 'power3.out' }, at);
  paths.forEach((_, i) => {
    tl.to(proxies[i], { t: 1000, duration: 0.6, ease: 'power2.in', onUpdate: redraw(i) }, at + 0.3 + i * 0.05);
  });
  paths.forEach((_, i) => {
    tl.to(proxies[i], { t: 0, duration: 0.85, ease: 'power3.out', onUpdate: redraw(i) }, cover + 0.02 + i * 0.07);
  });
  tl.to(inner, { x: -480, duration: 1.1, ease: 'power2.out' }, cover);
  tl.set(paths, { visibility: 'hidden' }, cover + 1.1);
  cue(tl, 'whoosh', at, { dur: 1.0 });
  return cover;
}

export { gsap, icon };
