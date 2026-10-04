// Builds the soundtrack for the promo: an upbeat corporate track (100 BPM, C major)
// composed as MIDI and rendered with FluidSynth + the FluidR3 GM soundfont (MIT),
// plus procedural sound effects placed on the cues exported by the animation.
//
//   node music/compose.mjs                       → assets/soundtrack.m4a
//   node music/compose.mjs --mux clawGS-promo.mp4  → also swap the audio of an existing render
//
// Needs: ffmpeg, fluidsynth, a GM soundfont (default /usr/share/sounds/sf2/FluidR3_GM.sf2,
// override with SOUNDFONT=...). On Debian/Ubuntu: apt install fluidsynth fluid-soundfont-gm
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../serve.mjs';
import { BPM, BEAT, BAR, CUT, END } from '../src/timing.js';
import { Song } from './midi.mjs';
import { Bus, rng } from './sfx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'out', 'music');
const TRACK = path.join(ROOT, 'assets', 'soundtrack.m4a');
const SF2 = process.env.SOUNDFONT || '/usr/share/sounds/sf2/FluidR3_GM.sf2';
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${r.stderr || r.stdout}`);
  return r;
}

// ---------------------------------------------------------------------------
// 1. cues from the animation timeline
// ---------------------------------------------------------------------------
async function loadCues() {
  const { server, port } = await startServer(0);
  const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
  const browser = await chromium.launch(opts);
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`http://127.0.0.1:${port}/index.html?render`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
    return await page.evaluate(() => window.__cues);
  } finally {
    await browser.close();
    server.close();
  }
}

// ---------------------------------------------------------------------------
// 2. the music
// ---------------------------------------------------------------------------
const T = (bar, beat = 0) => bar * BAR + beat * BEAT;

const CHORDS = {
  C: { r: 36, tri: [60, 64, 67], str: [48, 55, 64, 67], pad: [48, 55, 60, 64], arp: [60, 64, 67, 72] },
  G: { r: 31, tri: [59, 62, 67], str: [43, 50, 59, 62], pad: [43, 50, 55, 59], arp: [55, 59, 62, 67] },
  Am: { r: 33, tri: [60, 64, 69], str: [45, 52, 60, 64], pad: [45, 52, 57, 60], arp: [57, 60, 64, 69] },
  F: { r: 29, tri: [60, 65, 69], str: [41, 53, 57, 60], pad: [41, 48, 53, 57], arp: [53, 57, 60, 65] },
};

// one chord per bar, bars 0–34 (see src/timing.js for what is on screen)
const PROG = [
  'Am', 'F', 'G', //                                          intro: claws
  'Am', 'F', 'G', //                                          problem: tension → drop
  'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', //               groove A: drop-in, guardrails
  'C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', //               groove B: guardrails, blocks, MCP
  'Am', 'F', 'C', 'G', 'Am', 'F', 'G', //                    groove C: budgets, reporting
  'C', 'G', 'Am', //                                          chorus: essentials
  'F', 'G', 'C', //                                           outro: resolve on the final clench
];
const section = (b) => (b < 3 ? 'intro' : b < 6 ? 'problem' : b < 14 ? 'A' : b < 22 ? 'B' : b < 29 ? 'C' : b < 32 ? 'chorus' : 'outro');
const chordAt = (t) => CHORDS[PROG[Math.min(PROG.length - 1, Math.floor(t / BAR))]];

const MEL_B = {
  C: [[0, 76, 1], [1, 79, 0.5], [1.5, 76, 0.5], [2, 74, 1], [3, 72, 1]],
  G: [[0, 74, 1], [1, 71, 0.5], [1.5, 74, 0.5], [2, 79, 2]],
  Am: [[0, 72, 1], [1, 76, 0.5], [1.5, 81, 0.5], [2, 79, 1], [3, 76, 1]],
  F: [[0, 77, 1.5], [1.5, 76, 0.5], [2, 72, 2]],
};
const MEL_C = {
  Am: [[0, 81, 1], [1, 79, 0.5], [1.5, 76, 1.5], [3, 72, 1]],
  F: [[0, 77, 1], [1, 81, 0.5], [1.5, 79, 0.5], [2, 77, 1], [3, 76, 1]],
  C: [[0, 76, 1], [1, 79, 1], [2, 84, 2]],
  G: [[0, 83, 1], [1, 81, 0.5], [1.5, 79, 0.5], [2, 74, 2]],
};

const PIANO = 0;
const STR = 1;
const BASS = 2;
const PIZZ = 3;
const GLOCK = 4;
const PAD = 5;
const TIMP = 6;
const HIT = 7;
const DR = 9;
const KICK = 36;
const SNARE = 38;
const CLAP = 39;
const CH = 42;
const OH = 46;
const CRASH = 49;
const RIDE = 51;
const SHAKER = 82;
const TOM_HI = 50;
const TOM_MID = 47;
const TOM_LO = 45;

function compose(cues) {
  const song = new Song(BPM);
  const rnd = rng(7);
  const hv = (v) => v + (rnd() - 0.5) * 8;

  song.setup(PIANO, 0, { vol: 96, pan: -0.15, reverb: 55, chorus: 10 });
  song.setup(STR, 48, { vol: 82, pan: 0.1, reverb: 85, chorus: 20 });
  song.setup(BASS, 33, { vol: 104, reverb: 12 });
  song.setup(PIZZ, 45, { vol: 76, pan: 0.3, reverb: 50 });
  song.setup(GLOCK, 9, { vol: 64, pan: -0.3, reverb: 80 });
  song.setup(PAD, 89, { vol: 70, reverb: 90, chorus: 40 });
  song.setup(TIMP, 47, { vol: 112, reverb: 70 });
  song.setup(HIT, 55, { vol: 62, reverb: 70 });
  song.setup(DR, 0, { vol: 96, reverb: 28 });

  const hit = (note, t, vel, dur = 0.12) => song.note(DR, t, dur, note, hv(vel));
  const fill = (end, beats, startVel, endVel, toms = false) => {
    const n = beats * 4;
    for (let i = 0; i < n; i++) {
      const t = end - beats * BEAT + (i * BEAT) / 4;
      const v = startVel + ((endVel - startVel) * i) / n;
      hit(toms ? [TOM_HI, TOM_HI, TOM_MID, TOM_MID, TOM_LO, TOM_LO, SNARE, SNARE][Math.floor((i / n) * 8)] : SNARE, t, v);
    }
  };
  const DROP = CUT.dropIn;

  for (let b = 0; b < PROG.length; b++) {
    const c = CHORDS[PROG[b]];
    const s = section(b);
    const t0 = T(b);
    const groove = ['A', 'B', 'C', 'chorus'].includes(s);
    // the bar right before the drop stops an eighth early: a breath before the claws
    const len = b === 5 ? BAR - BEAT / 2 : BAR;

    // pad — atmosphere for intro, problem and outro
    if (['intro', 'problem', 'outro'].includes(s) && b < 34) song.chord(PAD, t0, len + 0.05, c.pad, hv(s === 'outro' ? 68 : 56));

    // strings
    const sv = { intro: 56, problem: 60, A: 66, B: 72, C: 80, chorus: 92, outro: 86 }[s];
    if (b < 34) {
      const notes = ['C', 'chorus', 'outro'].includes(s) ? [...c.str, c.str[2] + 12, c.str[3] + 12] : c.str;
      song.chord(STR, t0 + (b === 0 ? 0.3 : 0), len - (b === 0 ? 0.3 : 0) + 0.04, notes, hv(sv));
    }

    // bass
    if (s === 'problem') {
      if (b === 3) song.note(BASS, t0, BAR, c.r + 12, hv(60));
      else for (let i = 0; i < 8; i++) if (t0 + i * BEAT / 2 < DROP - BEAT / 2) song.note(BASS, t0 + (i * BEAT) / 2, BEAT * 0.4, c.r + 12, hv(i % 2 ? 46 : 60));
    } else if (groove) {
      const pat = [0, 0, 12, 0, 7, 0, 12, 0];
      const vel = [106, 80, 90, 80, 96, 80, 90, 80];
      pat.forEach((iv, i) => song.note(BASS, t0 + (i * BEAT) / 2, BEAT * 0.42, c.r + iv, hv(vel[i])));
    } else if (s === 'outro' && b < 34) {
      song.note(BASS, t0, BAR, c.r + 12, hv(92));
    }

    // piano
    if (s === 'intro' && b > 0) {
      const motif = b === 1 ? [69, 72, 77, 72] : [71, 74, 79, 74];
      motif.forEach((p, i) => song.note(PIANO, t0 + i * BEAT, BEAT * 0.9, p, hv(52)));
    } else if (groove) {
      [[0, 1.4, 92], [1.5, 1.4, 80], [3, 0.9, 84]].forEach(([beat, dur, v]) => song.chord(PIANO, t0 + beat * BEAT, dur * BEAT, c.tri, hv(v)));
      if (s !== 'A') song.note(PIANO, t0, BEAT * 1.4, c.tri[2] + 12, hv(68));
    } else if (s === 'outro' && b < 34) {
      if (b === 33) {
        song.chord(PIANO, t0, BEAT * 2, [60, 62, 67], hv(74)); // Gsus4 → G
        song.chord(PIANO, t0 + 2 * BEAT, BEAT * 2, [59, 62, 67], hv(70));
      } else {
        song.chord(PIANO, t0, BAR, c.tri, hv(74));
      }
    }

    // pizzicato eighths
    if (s === 'problem' || groove) {
      const idx = [0, 1, 2, 1, 3, 1, 2, 1];
      const base = { problem: 60, A: 56, B: 70, C: 72, chorus: 76 }[s];
      idx.forEach((k, i) => {
        const t = t0 + (i * BEAT) / 2;
        if (t < DROP - BEAT / 2 || t >= DROP) song.note(PIZZ, t, BEAT * 0.4, c.arp[k], hv(i % 2 ? base - 16 : base));
      });
    }

    // glockenspiel melody
    const mel = (s === 'B' && b >= 18) || s === 'chorus' ? MEL_B[PROG[b]] : s === 'C' ? MEL_C[PROG[b]] : null;
    if (mel) {
      mel.forEach(([beat, p, d]) => {
        song.note(GLOCK, t0 + beat * BEAT, d * BEAT, p, hv(s === 'chorus' ? 98 : 86));
        if (s === 'chorus') song.note(STR, t0 + beat * BEAT, d * BEAT, p - 12, hv(80));
      });
    }
    if (s === 'outro' && b < 34) {
      const top = b === 32 ? [77, 81] : [79, 83];
      top.forEach((p, i) => song.note(GLOCK, t0 + i * 2 * BEAT, 2 * BEAT, p, hv(64)));
    }

    // drums
    if (s === 'intro' && b === 2) for (let i = 0; i < 8; i++) hit(CH, t0 + (i * BEAT) / 2, i % 2 ? 22 : 30);
    if (s === 'problem') {
      [0, 2].forEach((beat) => hit(KICK, t0 + beat * BEAT, 72));
      if (b > 3) for (let i = 0; i < 16; i++) if (t0 + (i * BEAT) / 4 < DROP - BEAT) hit(CH, t0 + (i * BEAT) / 4, i % 4 ? 22 : 34);
    }
    if (groove) {
      const chorus = s === 'chorus';
      const kicks = chorus ? [0, 1, 2, 3] : [0, 2, ...(b % 2 ? [2.5] : []), ...(b % 4 === 3 && s !== 'A' ? [3.5] : [])];
      kicks.forEach((beat) => hit(KICK, t0 + beat * BEAT, beat % 1 ? 90 : chorus ? 118 : 112));
      [1, 3].forEach((beat) => hit(CLAP, t0 + beat * BEAT, chorus ? 104 : s === 'C' ? 98 : 92));
      for (let i = 0; i < 8; i++) {
        const t = t0 + (i * BEAT) / 2;
        if (i % 2 && s !== 'A') hit(OH, t, chorus ? 60 : 52, 0.2);
        else hit(CH, t, i % 2 ? 48 : 66);
      }
      for (let i = 0; i < 16; i++) hit(SHAKER, t0 + (i * BEAT) / 4, i % 2 ? 30 : 40);
      if (chorus) for (let i = 0; i < 4; i++) hit(RIDE, t0 + i * BEAT, 44);
    }
    if (s === 'outro') {
      if (b === 32) hit(KICK, t0, 100);
      if (b === 33) [0, 2].forEach((beat) => hit(KICK, t0 + beat * BEAT, 96));
    }
  }

  // drum fills & crashes on the cuts
  fill(DROP, 2, 28, 96);
  [CUT.guard, T(14), CUT.blocks, CUT.budgets, CUT.report].forEach((t) => fill(t, 1, 60, 96));
  fill(CUT.mcp, 1, 64, 92, true);
  fill(CUT.essentials, 2, 56, 116, true);
  fill(T(34), 2, 40, 104);
  [[DROP, 122], [CUT.guard, 92], [T(14), 102], [CUT.blocks, 92], [CUT.mcp, 86], [CUT.budgets, 102],
    [CUT.report, 88], [CUT.essentials, 120], [CUT.outro, 104]].forEach(([t, v]) => hit(CRASH, t, v, 1.5));

  // final chord on bar 34, ringing out under the fade
  const FIN = T(34);
  const ringEnd = END - 0.2;
  song.chord(PIANO, FIN, ringEnd - FIN, [24, 36, 48, 55, 60, 64, 67, 72], 98);
  song.chord(STR, FIN, ringEnd - FIN, [36, 48, 55, 64, 67, 72, 76], 98);
  song.chord(PAD, FIN, ringEnd - FIN, CHORDS.C.pad, 80);
  song.note(BASS, FIN, 2.6, 36, 104);
  song.note(TIMP, FIN, 2.5, 48, 122);
  hit(CRASH, FIN, 124, 2);
  hit(KICK, FIN, 124);
  [72, 76, 79, 84, 88, 91, 96].forEach((p, i) => song.note(GLOCK, FIN + 0.12 + i * 0.07, 1.6, p, 72 - i * 3));
  song.ramp(STR, 11, 127, 0, END - 2.4, END - 0.25);
  song.ramp(PAD, 11, 127, 0, END - 2.4, END - 0.25);

  // intro swells
  song.ramp(PAD, 11, 20, 127, 0, 1.4);
  song.ramp(STR, 11, 30, 127, 0.3, 1.6);

  // musical hits on picture cues
  for (const q of cues) {
    const c = chordAt(q.t);
    if (q.type === 'impact') {
      song.note(TIMP, q.t, 1.6, c.r + 12, 127);
      song.chord(HIT, q.t, 0.35, c.tri, 84);
      song.chord(PIANO, q.t, 2.2, [c.r, c.r + 12], 104);
      song.chord(STR, q.t, 0.45, c.str, 112);
      hit(CRASH, q.t, 116, 1.5);
      hit(KICK, q.t, 127);
    } else if (q.type === 'impactSoft' && q.t < FIN - 0.2) {
      song.note(TIMP, q.t, 1.2, c.r + 12, 104);
      hit(KICK, q.t, 104);
    } else if (q.type === 'letters') {
      const notes = [...c.arp.map((p) => p + 12), c.arp[0] + 24, c.arp[1] + 24];
      notes.forEach((p, i) => song.note(GLOCK, q.t + i * (q.step / 0.8), 0.9, p, 84));
    }
  }
  return song;
}

// ---------------------------------------------------------------------------
// 3. sound effects on cues
// ---------------------------------------------------------------------------
function effects(cues) {
  const bus = new Bus(END + 1);
  for (const q of cues) {
    switch (q.type) {
      case 'whoosh': bus.whoosh(q.t, q.dur, q.short ? 0.14 : 0.2, { short: q.short }); break;
      case 'swish': bus.whoosh(q.t, 0.32, 0.12, { short: true }); break;
      case 'scratchBig': bus.scratch(q.t, 0.2, { big: true, step: 0.0625 }); break;
      case 'scratch': bus.scratch(q.t, 0.14); break;
      case 'impact': bus.impact(q.t, 0.4); break;
      case 'impactSoft': bus.impact(q.t, 0.22); break;
      case 'blip': bus.blip(q.t, q.pitch ?? 0, 0.06); break;
      case 'deny': bus.deny(q.t, 0.07); break;
      case 'pop': bus.pop(q.t, q.soft ? 0.04 : 0.09, q.pitch ?? 0); break;
      case 'glitch': bus.glitch(q.t, 0.06); break;
      case 'tick': bus.click(q.t, 0.07); break;
      case 'typing': bus.typing(q.t, q.dur, q.n, 0.06); break;
      case 'ticks': bus.ticks(q.t, q.dur, q.n, 0.025); break;
      case 'coin': bus.coin(q.t, q.pitch ?? 0, 0.045); break;
      case 'scan': bus.scan(q.t, q.dur, 0.03); break;
      case 'thud': bus.thud(q.t, 0.18); break;
      default: break;
    }
  }
  bus.riser(CUT.dropIn - 2.6, 2.6, 0.085);
  bus.riser(CUT.essentials - 1.8, 1.8, 0.07);
  bus.ambience();
  return bus;
}

// ---------------------------------------------------------------------------
// 4. render + mix
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('Reading cues from the animation…');
const cues = await loadCues();
console.log(`  ${cues.length} cues, video ends at ${END}s`);

const mid = path.join(OUT_DIR, 'score.mid');
const musicWav = path.join(OUT_DIR, 'music.wav');
const sfxWav = path.join(OUT_DIR, 'sfx.wav');
fs.writeFileSync(mid, compose(cues).toBuffer(END + 1.5));
console.log('Rendering score with FluidSynth…');
run('fluidsynth', ['-ni', '-q', '-r', '48000', '-O', 'float', '-T', 'wav', '-F', musicWav, '-g', '0.45',
  '-o', 'synth.reverb.room-size=0.62', '-o', 'synth.reverb.damp=0.35', '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.75',
  SF2, mid]);
console.log('Synthesising sound effects…');
fs.writeFileSync(sfxWav, effects(cues).wav());

console.log('Mixing (two-pass loudness normalisation to -16 LUFS)…');
const pre = `[0:a]volume=1.0[m];[1:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0:duration=first,atrim=0:${END},asetpts=N/SR/TB,afade=t=out:st=${(END - 1.6).toFixed(2)}:d=1.6`;
const probe = run('ffmpeg', ['-hide_banner', '-i', musicWav, '-i', sfxWav, '-filter_complex', `${pre},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
const m = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{'), probe.stderr.lastIndexOf('}') + 1));
const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
run('ffmpeg', ['-y', '-loglevel', 'error', '-i', musicWav, '-i', sfxWav, '-filter_complex', `${pre},${ln},aresample=48000`, '-c:a', 'aac', '-b:a', '192k', TRACK]);
console.log(`Soundtrack → ${path.relative(process.cwd(), TRACK)} (input ${m.input_i} LUFS → -16 LUFS)`);

const muxTarget = arg('mux');
if (muxTarget) {
  const video = path.resolve(process.cwd(), muxTarget);
  const tmp = `${video}.tmp.mp4`;
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', TRACK, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', '-movflags', '+faststart', tmp]);
  fs.renameSync(tmp, video);
  console.log(`Muxed into ${path.relative(process.cwd(), video)}`);
}
