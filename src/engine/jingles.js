// Every jingle, music loop and sound effect, as data (all original). A song is
// { bpm, loop, tracks: { lead, harmony?, bass?, drums? }, voices? }; a track is [note, beats] pairs where
// note is a MIDI number (60 = middle C) or null for a rest, and drums use 'k' | 's' | 'h' | null.
// Default voices: lead = square, harmony = 25% pulse, bass = triangle, drums = noise (`voices` overrides).
// Loops keep every track the same total length so they stay in step when they wrap.

const rep = (n, ...parts) => Array.from({ length: n }, () => parts.flat()).flat();
/** One 4/4 bar of the bass shapes used below, on root `r`. */
const eighths = r => [[r, 0.5], [r + 12, 0.5], [r, 0.5], [r + 12, 0.5], [r, 0.5], [r + 12, 0.5], [r + 7, 0.5], [r + 12, 0.5]];
const rootFifth = r => [[r, 1], [r + 7, 1], [r + 12, 1], [r + 7, 1]];
const pad = (a, b) => [[a, 2], [b, 2]]; // two held chord tones per bar

// ── battle: A minor, driving (Am Am F G | Am Am F E) ─────────────────────────────
const battleRiff = [69, 0.5, 72, 0.5, 76, 0.5, 72, 0.5, 74, 0.5, 76, 1, null, 0.5];
const pairs = flat => flat.reduce((out, v, i) => (i % 2 ? out[out.length - 1].push(v) : out.push([v]), out), []);
const battle = {
  bpm: 150, loop: true,
  tracks: {
    lead: pairs([
      ...battleRiff,
      76, 0.5, 77, 0.5, 76, 0.5, 74, 0.5, 72, 1, 69, 1,
      72, 0.5, 72, 0.5, 77, 1, 76, 0.5, 74, 0.5, 72, 1,
      71, 0.5, 74, 0.5, 79, 1.5, null, 0.5, 79, 0.5, 77, 0.5,
      ...battleRiff,
      76, 0.5, 79, 0.5, 81, 1, 79, 0.5, 76, 0.5, 72, 1,
      77, 0.5, 76, 0.5, 74, 0.5, 72, 0.5, 74, 1, 77, 1,
      76, 1, 75, 0.5, 76, 0.5, 80, 1, null, 1,
    ]),
    harmony: [...pad(64, 60), ...pad(64, 60), ...pad(65, 60), ...pad(62, 67), ...pad(64, 60), ...pad(64, 60), ...pad(65, 60), ...pad(64, 68)],
    bass: [45, 45, 41, 43, 45, 45, 41, 40].flatMap(eighths),
    drums: rep(8, [['k', 0.5], ['h', 0.5], ['s', 0.5], ['h', 0.5], ['k', 0.5], ['k', 0.5], ['s', 0.5], ['h', 0.5]]),
  },
};

// ── title: C major, a 4-bar hook, then again with harmony (C G F G | C G F C) ───────
const titleHook = [72, 1, 76, 0.5, 79, 0.5, 84, 1, 79, 1, 81, 0.5, 79, 0.5, 77, 0.5, 76, 0.5, 74, 2,
  77, 1, 81, 0.5, 84, 0.5, 86, 1, 84, 0.5, 81, 0.5];
const title = {
  bpm: 120, loop: true,
  tracks: {
    lead: pairs([...titleHook, 79, 1.5, 77, 0.5, 74, 2, ...titleHook, 79, 1.5, 76, 0.5, 72, 2]),
    harmony: [[null, 16], ...pairs([64, 1, 67, 0.5, 72, 0.5, 76, 1, 72, 1, 77, 0.5, 76, 0.5, 74, 0.5, 72, 0.5, 71, 2,
      72, 1, 77, 0.5, 81, 0.5, 81, 1, 77, 0.5, 77, 0.5, 76, 1.5, 72, 0.5, 64, 2])],
    bass: [48, 43, 41, 43, 48, 43, 41, 48].flatMap(rootFifth),
    drums: rep(8, [['k', 1], ['h', 1], ['s', 1], ['h', 1]]),
  },
};

// ── overworld: G major walking tune; A = bars 1–8, B = bars 9–16 ───────────────────
const owOpen = [67, 0.5, 71, 0.5, 74, 1, 71, 0.5, 74, 0.5, 79, 1];
const overworld = {
  bpm: 128, loop: true,
  tracks: {
    lead: pairs([
      ...owOpen, 76, 1, 72, 0.5, 76, 0.5, 79, 1.5, null, 0.5,
      74, 0.5, 71, 0.5, 67, 0.5, 71, 0.5, 74, 1, 71, 1, 69, 1, 72, 0.5, 74, 0.5, 78, 2,
      ...owOpen, 76, 0.5, 79, 0.5, 84, 1, 83, 0.5, 81, 0.5, 79, 1,
      78, 0.5, 76, 0.5, 74, 0.5, 72, 0.5, 69, 1, 74, 1, 79, 2, null, 1, 71, 0.5, 74, 0.5,
      // B section
      76, 1.5, 74, 0.5, 76, 1, 79, 1, 79, 0.5, 76, 0.5, 72, 1, 76, 1, 72, 1,
      74, 1.5, 71, 0.5, 74, 1, 79, 1, 78, 2, 74, 1, 69, 1,
      76, 0.5, 79, 0.5, 83, 1, 81, 0.5, 79, 0.5, 76, 1, 72, 0.5, 76, 0.5, 79, 1, 84, 1.5, null, 0.5,
      81, 1, 79, 0.5, 76, 0.5, 73, 1, 76, 1, 74, 0.5, 76, 0.5, 78, 0.5, 81, 0.5, 78, 1, 74, 1,
    ]),
    harmony: [
      ...pad(59, 62), ...pad(60, 64), ...pad(59, 62), ...pad(62, 66), ...pad(59, 62), ...pad(60, 64), ...pad(62, 66), ...pad(59, 62),
      ...pad(59, 64), ...pad(60, 64), ...pad(59, 62), ...pad(62, 66), ...pad(59, 64), ...pad(60, 64), ...pad(61, 67), ...pad(62, 66),
    ],
    bass: [43, 48, 43, 50, 43, 48, 50, 43, 40, 48, 43, 50, 40, 48, 45, 50].flatMap(rootFifth),
    drums: rep(16, [['k', 1], ['h', 0.5], ['h', 0.5], ['s', 1], ['h', 1]]),
  },
};

// ── credits: F major, slow and warm, the melody on the triangle ────────────────────
const credits = {
  bpm: 80, loop: true, voices: { lead: 'triangle' },
  tracks: {
    lead: pairs([72, 2, 69, 1, 72, 1, 76, 3, 74, 1, 74, 1.5, 72, 0.5, 70, 2, 67, 3, null, 1,
      72, 2, 77, 1, 76, 1, 74, 3, 72, 1, 70, 1, 72, 1, 74, 1, 76, 1, 77, 4]),
    bass: [[41, 4], [45, 4], [46, 4], [48, 4], [41, 4], [38, 4], [46, 2], [48, 2], [41, 4]],
  },
};

export const SONGS = {
  battle, title, overworld, credits,
  encounter: {
    bpm: 160, loop: false,
    tracks: {
      lead: [[84, 0.25], [83, 0.25], [81, 0.25], [79, 0.25], [78, 0.25], [76, 0.25], [75, 0.25], [72, 0.25],
        [71, 0.5], [null, 0.25], [71, 0.25], [72, 1]],
      bass: [[40, 1], [null, 1], [35, 0.5], [null, 0.5], [36, 1]],
      drums: [['k', 1], [null, 1], ['k', 0.5], ['s', 0.5], ['k', 1]],
    },
  },
  victory: {
    bpm: 120, loop: false,
    tracks: {
      lead: [[67, 0.25], [67, 0.25], [67, 0.25], [72, 0.75], [76, 0.5], [79, 2]],
      harmony: [[null, 0.75], [64, 0.75], [67, 0.5], [72, 2]],
      bass: [[null, 0.75], [48, 0.75], [43, 0.5], [48, 2]],
      drums: [['h', 0.25], ['h', 0.25], ['h', 0.25], ['k', 0.75], ['s', 0.5], ['k', 2]],
    },
  },
  heal: { bpm: 150, loop: false, tracks: { lead: [[72, 0.5], [76, 0.5], [79, 0.5], [84, 0.5], [88, 0.5]] } },
  levelup: {
    bpm: 150, loop: false,
    tracks: { lead: [[72, 0.25], [76, 0.25], [79, 1.5]], harmony: [[64, 0.25], [67, 0.25], [72, 1.5]] },
  },
  badge: {
    bpm: 160, loop: false,
    tracks: {
      lead: [[72, 0.5], [72, 0.25], [72, 0.25], [77, 0.5], [81, 0.5], [84, 2]],
      harmony: [[65, 0.5], [65, 0.25], [65, 0.25], [72, 0.5], [77, 0.5], [81, 2]],
      bass: [[41, 1], [36, 1], [41, 2]],
      drums: [['k', 0.5], ['h', 0.25], ['h', 0.25], ['s', 0.5], ['s', 0.5], ['k', 2]],
    },
  },
  caught: {
    bpm: 150, loop: false,
    tracks: {
      lead: [[96, 0.125], [null, 0.375], [96, 0.125], [null, 0.375], [76, 0.25], [79, 0.25], [84, 1.5]],
      harmony: [[null, 1], [72, 0.25], [76, 0.25], [79, 1.5]],
      bass: [[null, 1], [48, 0.5], [36, 1.5]],
    },
  },

  // ── sfx: tiny one-shots (and the skateboard's loop) ──
  select: { bpm: 240, loop: false, tracks: { lead: [[88, 0.1], [93, 0.15]] } },
  bump: { bpm: 240, loop: false, tracks: { lead: [[31, 0.3]], drums: [['k', 0.5]] } },
  textTick: { bpm: 240, loop: false, tracks: { lead: [[96, 0.06]] } },
  hpTick: { bpm: 240, loop: false, tracks: { lead: [[91, 0.1]] } },
  ballThrow: { bpm: 240, loop: false, tracks: { lead: [[72, 0.25], [76, 0.25], [79, 0.25], [84, 0.25]] } },
  wobble: { bpm: 240, loop: false, tracks: { lead: [[60, 0.25], [55, 0.25]], drums: [['h', 0.25]] } },
  click: { bpm: 240, loop: false, tracks: { lead: [[100, 0.1]], drums: [['h', 0.2]] } },
  pop: { bpm: 240, loop: false, tracks: { lead: [[79, 0.1], [91, 0.15]], drums: [['s', 0.2]] } },
  flee: { bpm: 240, loop: false, tracks: { lead: [[84, 0.2], [79, 0.2], [74, 0.2], [69, 0.2], [64, 0.4]] } },
  skate: { bpm: 240, loop: true, voices: { lead: 'triangle' }, tracks: { lead: [[36, 1], [37, 1]] } },
  sauce: { bpm: 240, loop: false, tracks: { lead: [[76, 0.25], [81, 0.25], [88, 0.5]], harmony: [[72, 0.25], [76, 0.25], [84, 0.5]] } },
};
