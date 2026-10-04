// Minimal Standard MIDI File (type 1) writer. Times are given in seconds and
// converted to ticks at a fixed tempo, so notes can sit exactly on picture cues.
const PPQ = 480;

function vlq(n) {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

export class Song {
  constructor(bpm) {
    this.bpm = bpm;
    this.beat = 60 / bpm;
    this.channels = new Map(); // ch -> [{tick, order, bytes}]
  }

  tick(sec) {
    return Math.max(0, Math.round((sec / this.beat) * PPQ));
  }

  ev(ch, sec, bytes, order = 1) {
    if (!this.channels.has(ch)) this.channels.set(ch, []);
    this.channels.get(ch).push({ tick: this.tick(sec), order, bytes });
  }

  /** Set up a channel: GM program, volume, pan (-1..1), reverb & chorus sends. */
  setup(ch, program, { vol = 100, pan = 0, reverb = 40, chorus = 0 } = {}) {
    if (ch !== 9) this.ev(ch, 0, [0xc0 | ch, program], 0);
    this.cc(ch, 0, 7, vol, 0);
    this.cc(ch, 0, 10, Math.round(64 + pan * 63), 0);
    this.cc(ch, 0, 91, reverb, 0);
    this.cc(ch, 0, 93, chorus, 0);
    this.cc(ch, 0, 11, 127, 0);
  }

  cc(ch, sec, num, val, order = 1) {
    this.ev(ch, sec, [0xb0 | ch, num, Math.max(0, Math.min(127, Math.round(val)))], order);
  }

  /** Linear controller ramp (e.g. CC11 expression swells). */
  ramp(ch, num, from, to, t0, t1, steps = 24) {
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      this.cc(ch, t0 + (t1 - t0) * p, num, from + (to - from) * p);
    }
  }

  note(ch, sec, dur, pitch, vel) {
    const v = Math.max(1, Math.min(127, Math.round(vel)));
    this.ev(ch, sec, [0x90 | ch, pitch, v], 2);
    this.ev(ch, sec + Math.max(0.02, dur), [0x80 | ch, pitch, 0], 0);
  }

  chord(ch, sec, dur, pitches, vel) {
    pitches.forEach((p) => this.note(ch, sec, dur, p, vel));
  }

  toBuffer(endSec) {
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, this.channels.size + 1, PPQ >> 8, PPQ & 0xff];
    const uspb = Math.round(this.beat * 1e6);
    const tracks = [[{ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (uspb >> 16) & 0xff, (uspb >> 8) & 0xff, uspb & 0xff] }]];
    for (const evs of this.channels.values()) tracks.push(evs);
    const endTick = this.tick(endSec);
    const chunks = tracks.map((evs) => {
      const sorted = [...evs].sort((a, b) => a.tick - b.tick || a.order - b.order);
      const data = [];
      let last = 0;
      for (const e of sorted) {
        data.push(...vlq(e.tick - last), ...e.bytes);
        last = e.tick;
      }
      data.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0x00);
      const len = data.length;
      return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...data];
    });
    return Buffer.from([...header, ...chunks.flat()]);
  }
}
