// Single source of truth for scene cuts, shared by the animation (src/main.js)
// and the soundtrack (music/compose.mjs). Every cut lands on a bar line at 100 BPM,
// so transitions hit the downbeat of the music.
export const BPM = 100;
export const BEAT = 60 / BPM; // 0.6 s
export const BAR = 4 * BEAT; // 2.4 s
export const bar = (n) => Math.round(n * BAR * 1000) / 1000;

export const CUT = {
  problem: bar(3), //   7.2  intro → problem          (claw wipe)
  dropIn: bar(6), //   14.4  problem → drop-in        (claw wipe, music drop)
  guard: bar(9), //    21.6  drop-in → guardrails     (zoom)
  blocks: bar(16), //  38.4  guardrails → blocks      (claw wipe)
  mcp: bar(19), //     45.6  blocks → MCP             (push)
  budgets: bar(22), // 52.8  MCP → budgets            (claw wipe)
  report: bar(25), //  60.0  budgets → reporting      (push up)
  essentials: bar(29), // 69.6 reporting → essentials (claw wipe)
  outro: bar(32), //   76.8  essentials → outro
};

// Final chord lands on bar 34 and rings out over the fade to black.
export const END = bar(35) + 1.2; // 85.2 s
