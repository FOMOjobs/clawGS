// Procedural sound effects (no samples, no licensing): whooshes, claw scratches,
// impacts and small UI blips, rendered straight into a stereo float buffer.
export const SR = 48000;

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad with cheap per-block retuning for sweeps. */
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }

  set(type, f, q = 0.707) {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let b0; let b1; let b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // band-pass, 0 dB peak
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
    return this;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export class Bus {
  constructor(seconds) {
    const n = Math.ceil(seconds * SR);
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
    this.rand = rng(1234);
  }

  put(i, v, pan = 0) {
    if (i < 0 || i >= this.L.length) return;
    this.L[i] += v * Math.min(1, 1 - pan);
    this.R[i] += v * Math.min(1, 1 + pan);
  }

  noise() { return this.rand() * 2 - 1; }

  /** Air whoosh: band-passed noise sweeping up to a peak at the end of `dur`, then a short tail. */
  whoosh(t, dur, gain = 0.5, { short = false } = {}) {
    const n = Math.floor((dur + 0.35) * SR);
    const peak = dur * SR;
    const bp = new Biquad();
    const lp = new Biquad().set('lp', 500, 0.7);
    const s0 = Math.floor(t * SR);
    for (let i = 0; i < n; i++) {
      const p = i / peak;
      const rise = Math.min(1, p);
      const env = p <= 1 ? rise ** (short ? 1.6 : 2.4) : Math.exp(-(i - peak) / SR * 11);
      if (i % 32 === 0) bp.set('bp', 250 * 18 ** (p <= 1 ? rise : Math.max(0, 1 - (p - 1) * 2)), 0.8);
      const x = this.noise();
      const v = (bp.run(x) * 1.4 + lp.run(x) * 0.35) * env * gain;
      this.put(s0 + i, v, -0.6 + 1.2 * Math.min(1, p));
    }
  }

  /** Claw scratch: three gritty strokes. `big` for the intro tear. */
  scratch(t, gain = 0.35, { big = false, step = 0.0625 } = {}) {
    const strokes = 3;
    for (let k = 0; k < strokes; k++) {
      const len = (big ? 0.2 : 0.085) * SR;
      const s0 = Math.floor((t + k * step) * SR);
      const bp = new Biquad();
      const hp = new Biquad().set('hp', big ? 900 : 1800, 0.7);
      const f0 = big ? 5200 : 7500;
      const f1 = big ? 1300 : 2800;
      for (let i = 0; i < len; i++) {
        const p = i / len;
        if (i % 32 === 0) bp.set('bp', f0 * (f1 / f0) ** p, big ? 2.2 : 3);
        const grit = this.rand() < 0.08 ? 3 : 1;
        const env = Math.min(1, i / (0.004 * SR)) * (1 - p) ** 1.4;
        const v = (bp.run(this.noise()) * 2.2 + hp.run(this.noise()) * 0.25) * grit * env * gain;
        this.put(s0 + i, v, [-0.35, 0, 0.35][k]);
      }
    }
  }

  /** Sub drop + thump + crack. */
  impact(t, gain = 0.9) {
    const n = Math.floor(1.8 * SR);
    const s0 = Math.floor(t * SR);
    const lp = new Biquad().set('lp', 1400, 0.8);
    let ph = 0;
    let ph2 = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      ph += (2 * Math.PI * (36 + 80 * Math.exp(-x * 9))) / SR;
      ph2 += (2 * Math.PI * 150) / SR;
      const sub = Math.sin(ph) * Math.exp(-x * 2.6) * Math.min(1, x * 500);
      const thump = Math.sin(ph2) * Math.exp(-x * 26) * 0.5;
      const crack = lp.run(this.noise()) * Math.exp(-x * 30) * 0.9;
      this.put(s0 + i, Math.tanh((sub + thump + crack) * 1.3) * gain);
    }
  }

  tone(t, dur, freqs, gain, { decay = 28, pan = 0, attack = 0.003 } = {}) {
    const n = Math.floor(dur * SR);
    const s0 = Math.floor(t * SR);
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      let v = 0;
      freqs.forEach(([f, a]) => { v += Math.sin(2 * Math.PI * f * x) * a; });
      this.put(s0 + i, v * Math.min(1, x / attack) * Math.exp(-x * decay) * gain, pan);
    }
  }

  blip(t, pitch = 0, gain = 0.16) {
    const semis = [0, 4, 7, 12, 16, 19, 24][pitch % 7];
    const f = 1046.5 * 2 ** (semis / 12);
    this.tone(t, 0.3, [[f, 1], [f * 2, 0.22], [f * 3, 0.08]], gain, { decay: 26, pan: ((pitch % 5) - 2) * 0.15 });
  }

  deny(t, gain = 0.2) {
    const shaped = (f) => [[f, 1], [f * 3, 0.18], [f * 5, 0.06]];
    this.tone(t, 0.1, shaped(392), gain, { decay: 18 });
    this.tone(t + 0.085, 0.22, shaped(311.1), gain, { decay: 14 });
  }

  pop(t, gain = 0.3, pitch = 0) {
    const n = Math.floor(0.22 * SR);
    const s0 = Math.floor(t * SR);
    const k = 2 ** ((pitch % 5) / 12);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      ph += (2 * Math.PI * (260 + 950 * Math.exp(-x * 45)) * k) / SR;
      this.put(s0 + i, Math.sin(ph) * Math.min(1, x * 1000) * Math.exp(-x * 22) * gain);
    }
  }

  glitch(t, gain = 0.16) {
    const seg = 0.018 * SR;
    const s0 = Math.floor(t * SR);
    const bp = new Biquad().set('bp', 2600, 0.9);
    for (let k = 0; k < 8; k++) {
      const on = this.rand() < 0.7;
      const f = 300 + this.rand() * 2400;
      let hold = 0;
      for (let i = 0; i < seg; i++) {
        if (i % 6 === 0) hold = this.noise();
        const sq = Math.sign(Math.sin((2 * Math.PI * f * i) / SR)) * 0.4;
        const v = on ? bp.run(hold + sq) * gain * 1.6 : 0;
        this.put(s0 + k * seg + i, v, (this.rand() - 0.5) * 0.6);
      }
    }
  }

  click(t, gain = 0.12, f = 3500) {
    const n = Math.floor(0.012 * SR);
    const s0 = Math.floor(t * SR);
    const bp = new Biquad().set('bp', f, 1.1);
    for (let i = 0; i < n; i++) {
      this.put(s0 + i, bp.run(this.noise()) * Math.exp(-i / (0.0025 * SR)) * gain * 2.5);
    }
  }

  typing(t, dur, count, gain = 0.13) {
    for (let k = 0; k < count; k++) {
      const jitter = (this.rand() - 0.5) * (dur / count) * 0.5;
      this.click(t + (k * dur) / count + jitter, gain * (0.7 + this.rand() * 0.5), 2800 + this.rand() * 1800);
    }
  }

  ticks(t, dur, count, gain = 0.06) {
    for (let k = 0; k < count; k++) {
      this.tone(t + (k * dur) / count, 0.04, [[2200 + k * 12, 1]], gain * (0.5 + (0.5 * k) / count), { decay: 90 });
    }
  }

  coin(t, pitch = 0, gain = 0.12) {
    const k = 2 ** ((pitch % 3) / 12);
    this.tone(t, 0.08, [[1568 * k, 1], [3136 * k, 0.2]], gain, { decay: 40 });
    this.tone(t + 0.055, 0.35, [[2093 * k, 1], [4186 * k, 0.15]], gain, { decay: 14 });
  }

  scan(t, dur, gain = 0.08) {
    const n = Math.floor(dur * SR);
    const s0 = Math.floor(t * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      ph += (2 * Math.PI * (420 * 4 ** p)) / SR;
      const trem = 0.6 + 0.4 * Math.sin((2 * Math.PI * 16 * i) / SR);
      this.put(s0 + i, Math.sin(ph) * trem * Math.min(1, p * 8) * gain);
    }
  }

  thud(t, gain = 0.45) {
    const n = Math.floor(0.3 * SR);
    const s0 = Math.floor(t * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const x = i / SR;
      ph += (2 * Math.PI * (60 + 70 * Math.exp(-x * 30))) / SR;
      this.put(s0 + i, Math.sin(ph) * Math.exp(-x * 14) * gain);
    }
  }

  /** Noise riser that ends exactly at `t + dur` (into a drop). */
  riser(t, dur, gain = 0.3) {
    const n = Math.floor(dur * SR);
    const s0 = Math.floor(t * SR);
    const bp = new Biquad();
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      if (i % 32 === 0) bp.set('bp', 300 * 20 ** p, 1.2);
      ph += (2 * Math.PI * (180 * 4 ** p)) / SR;
      const env = p ** 2.2;
      const v = (bp.run(this.noise()) * 1.5 + Math.sin(ph) * 0.12) * env * gain;
      this.put(s0 + i, v, Math.sin(p * Math.PI * 6) * 0.3);
    }
  }

  /** Light stereo ping-pong for a sense of space. */
  ambience(mix = 0.16, fb = 0.28) {
    const dl = Math.floor(0.093 * SR);
    const dr = Math.floor(0.131 * SR);
    const { L, R } = this;
    for (let i = 0; i < L.length; i++) {
      const l = i >= dl ? L[i - dl] : 0;
      const r = i >= dr ? R[i - dr] : 0;
      L[i] += r * fb * mix * 3;
      R[i] += l * fb * mix * 3;
    }
  }

  /** 32-bit float stereo WAV. */
  wav() {
    const n = this.L.length;
    const buf = Buffer.alloc(44 + n * 8);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
    for (let i = 0; i < n; i++) {
      buf.writeFloatLE(this.L[i], 44 + i * 8);
      buf.writeFloatLE(this.R[i], 48 + i * 8);
    }
    return buf;
  }
}
