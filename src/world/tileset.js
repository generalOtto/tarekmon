// Procedural 16×16 tileset, drawn once into an offscreen canvas with fillRect only.
// The only DOM-touching module in src/world/ — tiles.js stays pure.
import * as P from './palette.js';
import { LEGEND, TILE_SIZE } from './tiles.js';

const S = TILE_SIZE;
const COLS = 8;

/** Fill a w×h rect of `color` at (x, y) inside the current cell. */
export function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Linear blend of two #rrggbb colors (t = 0 → a, 1 → b). */
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/** Fill horizontal spans: rows = [[y, x0, x1], ...] (x1 inclusive). */
function spans(ctx, rows, color) {
  for (const [y, x0, x1] of rows) px(ctx, x0, y, x1 - x0 + 1, 1, color);
}

// ---- shared backgrounds ----------------------------------------------------

function grass(ctx) {
  px(ctx, 0, 0, S, S, P.GRASS_L);
  // fixed specks (Gen 2 style little blade marks)
  px(ctx, 2, 2, 2, 1, P.GRASS_D);
  px(ctx, 11, 3, 1, 2, P.GRASS_D);
  px(ctx, 6, 7, 2, 1, P.GRASS_D);
  px(ctx, 13, 10, 1, 1, P.GRASS_D);
  px(ctx, 3, 12, 1, 2, P.GRASS_D);
  px(ctx, 9, 13, 2, 1, P.GRASS_D);
}

function floor(ctx) {
  px(ctx, 0, 0, S, S, P.FLOOR);
  const line = mix(P.FLOOR, P.PATH_D, 0.55);
  px(ctx, 0, 7, S, 1, line);
  px(ctx, 0, 15, S, 1, line);
  px(ctx, 7, 0, 1, 7, line);
  px(ctx, 15, 8, 1, 7, line);
}

// ---- recipes ---------------------------------------------------------------

function tallGrass(ctx) {
  px(ctx, 0, 0, S, S, P.GRASS_L);
  const tuft = (x, y) => {
    // chunky "W" of blades on a dark filled base — the Gold/Silver tall-grass look
    px(ctx, x, y, 1, 3, P.GRASS_D);
    px(ctx, x + 3, y - 1, 1, 4, P.GRASS_D);
    px(ctx, x + 6, y, 1, 3, P.GRASS_D);
    px(ctx, x + 1, y + 2, 2, 2, P.GRASS_D);
    px(ctx, x + 4, y + 2, 2, 2, P.GRASS_D);
    px(ctx, x, y + 3, 7, 2, P.GRASS_D);
    px(ctx, x, y + 5, 7, 1, P.TREE);
  };
  tuft(0, 1);
  tuft(8, 4);
  tuft(1, 9);
  px(ctx, 0, 15, S, 1, P.GRASS_D);
}

function flowers(ctx) {
  grass(ctx);
  const flower = (x, y, c) => {
    px(ctx, x, y, 2, 2, c);
    px(ctx, x + 1, y + 2, 1, 2, P.GRASS_D);
  };
  flower(3, 3, P.RED);
  flower(10, 6, P.RED);
  flower(5, 10, P.YELLOW);
}

function path(ctx) {
  px(ctx, 0, 0, S, S, P.PATH);
  px(ctx, 3, 5, 2, 1, P.PATH_D);
  px(ctx, 10, 11, 2, 1, P.PATH_D);
  px(ctx, 12, 2, 1, 1, P.PATH_D);
  px(ctx, 0, 0, 1, 1, P.PATH_D);
  px(ctx, 15, 8, 1, 1, P.PATH_D);
  px(ctx, 6, 15, 1, 1, P.PATH_D);
}

function sand(ctx) {
  px(ctx, 0, 0, S, S, P.SAND);
  px(ctx, 4, 4, 1, 1, P.PATH_D);
  px(ctx, 11, 10, 1, 1, P.PATH_D);
  px(ctx, 9, 3, 1, 1, P.WHITE);               // glints set sand apart from path
  px(ctx, 3, 12, 1, 1, P.WHITE);
}

function water(frame) {
  return ctx => {
    px(ctx, 0, 0, S, S, P.WATER);
    const wave = (x, y) => {
      px(ctx, x + 1, y, 3, 1, P.WATER_L);
      px(ctx, x, y + 1, 1, 1, P.WATER_L);
      px(ctx, x + 4, y + 1, 1, 1, P.WATER_L);
    };
    wave(2 + frame, 3);
    wave(9 - frame, 10);
  };
}

function tree(ctx) {
  grass(ctx);
  // canopy silhouette (14 wide, rows 0..12)
  spans(ctx, [
    [0, 5, 10], [1, 3, 12], [2, 2, 13], [3, 1, 14], [4, 1, 14], [5, 1, 14],
    [6, 1, 14], [7, 1, 14], [8, 1, 14], [9, 1, 14], [10, 2, 13], [11, 3, 12], [12, 5, 10],
  ], P.INK);
  const inner = [
    [1, 5, 10], [2, 3, 12], [3, 2, 13], [4, 2, 13], [5, 2, 13], [6, 2, 13],
    [7, 2, 13], [8, 2, 13], [9, 2, 13], [10, 3, 12], [11, 5, 10],
  ];
  spans(ctx, inner.filter(r => r[0] <= 6), P.TREE);
  spans(ctx, inner.filter(r => r[0] > 6), P.TREE_D);
  // leafy highlights and texture
  px(ctx, 5, 2, 3, 1, P.GRASS_D);
  px(ctx, 4, 3, 2, 1, P.GRASS_D);
  px(ctx, 10, 4, 2, 1, P.GRASS_D);
  px(ctx, 3, 6, 2, 1, P.TREE_D);
  px(ctx, 9, 6, 2, 1, P.TREE_D);
  px(ctx, 6, 9, 2, 1, P.TREE);
  // trunk
  px(ctx, 5, 12, 6, 4, P.INK);
  px(ctx, 6, 12, 4, 4, P.TRUNK);
  px(ctx, 6, 12, 4, 1, P.TREE_D);
}

function fence(ctx) {
  grass(ctx);
  const edge = mix(P.FENCE, P.INK, 0.45);
  for (const y of [4, 9]) {          // rails
    px(ctx, 0, y, S, 2, P.FENCE);
    px(ctx, 0, y + 2, S, 1, P.PATH_D);
  }
  for (const x of [1, 7, 13]) {      // posts
    px(ctx, x, 2, 2, 11, P.FENCE);
    px(ctx, x + 1, 3, 1, 10, P.PATH_D);
    px(ctx, x, 1, 2, 1, edge);
    px(ctx, x, 13, 2, 1, P.PATH_D);
  }
  px(ctx, 0, 14, S, 1, mix(P.GRASS_D, P.INK, 0.2));
}

function wall(ctx) {
  px(ctx, 0, 0, S, S, P.WALL);
  for (let band = 0; band < 4; band++) {
    const y = band * 4;
    px(ctx, 0, y + 3, S, 1, P.PATH_D);
    const off = band % 2 ? 4 : 0;
    for (let x = off; x < S; x += 8) px(ctx, x, y, 1, 3, P.PATH_D);
  }
}

function roof(color) {
  return ctx => {
    px(ctx, 0, 0, S, S, color);
    const line = mix(color, P.INK, 0.35);
    const hi = mix(color, P.WHITE, 0.25);
    for (let y = 3; y < 12; y += 4) {
      px(ctx, 0, y, S, 1, line);
      px(ctx, 0, y - 3, S, 1, hi);
      const off = (y >> 2) % 2 ? 4 : 0;
      for (let x = off; x < S; x += 8) px(ctx, x, y - 2, 1, 2, line);
    }
    px(ctx, 0, 12, S, 2, mix(color, P.INK, 0.2));
    px(ctx, 0, 14, S, 2, mix(color, P.INK, 0.6));
  };
}

function door(ctx) {
  px(ctx, 0, 0, S, S, P.WALL);
  px(ctx, 0, 3, S, 1, P.PATH_D);
  px(ctx, 2, 3, 12, 13, P.INK);
  px(ctx, 3, 4, 10, 12, P.DOOR);
  const panel = mix(P.DOOR, P.WHITE, 0.2);
  px(ctx, 4, 5, 3, 4, panel);
  px(ctx, 9, 5, 3, 4, panel);
  px(ctx, 7, 4, 2, 12, mix(P.DOOR, P.INK, 0.5));
  px(ctx, 10, 11, 1, 1, P.PAPER);
}

function sign(ctx) {
  grass(ctx);
  px(ctx, 7, 9, 2, 6, P.TRUNK);
  px(ctx, 7, 15, 2, 1, P.GRASS_D);
  px(ctx, 2, 2, 12, 8, P.INK);
  px(ctx, 3, 3, 10, 6, P.SIGN);
  px(ctx, 3, 3, 10, 1, mix(P.SIGN, P.WHITE, 0.3));
  px(ctx, 4, 5, 8, 1, P.TRUNK);
  px(ctx, 4, 7, 6, 1, P.TRUNK);
}

function gateBar(ctx, x) {
  px(ctx, x, 1, 2, 14, P.INK);
  px(ctx, x, 2, 1, 12, mix(P.GATE, P.WHITE, 0.35));
  px(ctx, x + 1, 2, 1, 12, P.GATE);
  px(ctx, x, 15, 2, 1, P.PATH_D);
}

function gateClosed(ctx) {
  px(ctx, 0, 0, S, S, P.PATH);
  px(ctx, 0, 1, S, 3, P.INK);
  for (let x = 1; x < S; x += 4) gateBar(ctx, x);
  px(ctx, 0, 2, S, 1, P.GATE);
}

function gateOpen(ctx) {
  px(ctx, 0, 0, S, S, P.PATH);
  gateBar(ctx, 0);
  gateBar(ctx, 14);
}

function mat(ctx) {
  floor(ctx);
  px(ctx, 1, 5, 14, 6, P.INK);
  px(ctx, 2, 6, 12, 4, P.ROOF_RIBS);
  px(ctx, 2, 7, 12, 1, P.YELLOW);
}

function counter(ctx) {
  px(ctx, 0, 0, S, S, P.COUNTER);
  px(ctx, 0, 0, S, 1, P.PAPER);
  px(ctx, 0, 1, S, 4, mix(P.COUNTER, P.PAPER, 0.35));
  px(ctx, 0, 5, S, 1, P.INK);
  const dark = mix(P.COUNTER, P.INK, 0.35);
  px(ctx, 7, 6, 1, 9, dark);
  px(ctx, 0, 10, S, 1, dark);
  px(ctx, 0, 15, S, 1, P.INK);
}

function fridge(ctx) {
  floor(ctx);
  const x0 = 2, y0 = 1, w = 12, h = 15;       // rounded body with ink outline
  px(ctx, x0 + 1, y0, w - 2, h, P.INK);
  px(ctx, x0, y0 + 1, w, h - 1, P.INK);
  px(ctx, x0 + 1, y0 + 1, w - 2, h - 2, P.FRIDGE);
  px(ctx, x0 + 1, y0 + 1, 1, h - 2, P.WHITE);
  px(ctx, x0 + 1, y0 + 5, w - 2, 1, P.INK);   // freezer split
  px(ctx, x0 + w - 3, y0 + 2, 1, 2, P.GATE);  // freezer handle
  px(ctx, x0 + w - 3, y0 + 7, 1, 4, P.GATE);  // main handle
  px(ctx, x0 + 1, y0 + h - 2, w - 2, 1, mix(P.FRIDGE, P.GATE, 0.5));
}

function shisha(ctx) {
  floor(ctx);
  px(ctx, 5, 0, 6, 3, P.INK);                 // bowl
  px(ctx, 6, 1, 4, 1, P.RED);
  px(ctx, 6, 3, 4, 6, P.INK);                 // neck
  px(ctx, 7, 3, 2, 6, P.GATE);
  spans(ctx, [[8, 5, 10], [9, 4, 11], [10, 3, 12], [11, 3, 12], [12, 3, 12], [13, 3, 12], [14, 4, 11], [15, 5, 10]], P.INK);
  spans(ctx, [[9, 5, 10], [10, 4, 11], [11, 4, 11], [12, 4, 11], [13, 4, 11], [14, 5, 10]], P.PURPLE);
  px(ctx, 5, 10, 1, 2, mix(P.PURPLE, P.WHITE, 0.45));
  const hose = mix(P.PATH_D, P.INK, 0.35);    // hose curling down to a mouthpiece
  px(ctx, 10, 5, 2, 1, hose);
  px(ctx, 12, 6, 1, 2, hose);
  px(ctx, 13, 8, 1, 3, hose);
  px(ctx, 14, 11, 1, 2, hose);
  px(ctx, 14, 13, 1, 2, P.GATE);
}

function rug(ctx) {
  px(ctx, 0, 0, S, S, P.FLOOR);
  px(ctx, 1, 1, 14, 14, P.YELLOW);
  px(ctx, 2, 2, 12, 12, P.ROOF_HAZE);
  spans(ctx, [[5, 7, 8], [6, 6, 9], [7, 5, 10], [8, 5, 10], [9, 6, 9], [10, 7, 8]], P.YELLOW);
  spans(ctx, [[7, 7, 8], [8, 7, 8]], P.RED);
}

function skateRack(ctx) {
  grass(ctx);
  // Boards seen side-on (kicktails + wheels) so they can't be mistaken for books;
  // each sits on a shelf arm of a wooden rack, staggered for a jaunty tilt.
  const wood = mix(P.TRUNK, P.INK, 0.3);
  px(ctx, 0, 0, 1, S, wood);                  // rack posts
  px(ctx, 15, 0, 1, S, wood);
  const board = (x, t, color) => {
    px(ctx, x, t, 1, 1, color);               // tail kick
    px(ctx, x + 11, t, 1, 1, color);          // nose kick
    px(ctx, x + 1, t + 1, 10, 1, color);      // deck
    px(ctx, x, t + 1, 1, 1, P.INK);
    px(ctx, x + 11, t + 1, 1, 1, P.INK);
    px(ctx, x + 1, t + 2, 10, 1, mix(color, P.INK, 0.55)); // underside
    px(ctx, x + 2, t + 3, 2, 1, P.BLACK);     // wheels
    px(ctx, x + 8, t + 3, 2, 1, P.BLACK);
    px(ctx, 0, t + 4, S, 1, P.TRUNK);         // shelf arm
  };
  board(2, 0, P.ROOF_RIBS);
  board(3, 5, P.ROOF_LAB);
  board(2, 10, P.YELLOW);
  px(ctx, 0, 15, S, 1, mix(P.GRASS_D, P.INK, 0.3)); // ground shadow
}

function pedestal(ctx) {
  floor(ctx);
  px(ctx, 3, 9, 10, 3, P.INK);                // pedestal: top plate + column
  px(ctx, 4, 10, 8, 1, mix(P.GATE, P.WHITE, 0.4));
  px(ctx, 5, 12, 6, 4, P.INK);
  px(ctx, 6, 12, 4, 4, P.GATE);
  px(ctx, 6, 12, 1, 4, mix(P.GATE, P.WHITE, 0.3));
  // 6px ball (8px with outline): red top, ink band, white bottom, centre button
  spans(ctx, [[1, 6, 9], [2, 5, 10], [3, 4, 11], [4, 4, 11], [5, 4, 11], [6, 4, 11], [7, 5, 10], [8, 6, 9]], P.INK);
  spans(ctx, [[2, 6, 9], [3, 5, 10], [4, 5, 10]], P.RED);
  spans(ctx, [[6, 5, 10], [7, 6, 9]], P.WHITE);
  px(ctx, 6, 3, 1, 1, mix(P.RED, P.WHITE, 0.6));
  px(ctx, 6, 4, 4, 3, P.INK);
  px(ctx, 7, 5, 2, 1, P.WHITE);
}

/** char → recipe, or an array of recipes for animation frames (one cell each). */
export const RECIPES = {
  '.': grass,
  ',': tallGrass,
  '*': flowers,
  '=': path,
  ':': sand,
  '~': [water(0), water(1)],
  'T': tree,
  '#': fence,
  'W': wall,
  'H': roof(P.ROOF_HAZE),
  'B': roof(P.ROOF_RIBS),
  'L': roof(P.ROOF_LAB),
  'P': roof(P.ROOF_BOOTH),
  'D': door,
  'S': sign,
  'G': gateClosed,
  'g': gateOpen,
  '_': floor,
  'M': mat,
  'C': counter,
  'F': fridge,
  'Q': shisha,
  'R': rug,
  'K': skateRack,
  'E': pedestal,
};

export function buildTileset(doc = document) {
  const chars = [...LEGEND];
  const cells = chars.reduce((n, c) => n + [].concat(RECIPES[c]).length, 0);
  const canvas = doc.createElement('canvas');
  canvas.width = COLS * S;
  canvas.height = Math.ceil(cells / COLS) * S;
  const ctx = canvas.getContext('2d');

  const index = {};
  let cell = 0;
  for (const c of chars) {
    const frames = [];
    for (const recipe of [].concat(RECIPES[c])) {
      const sx = (cell % COLS) * S, sy = Math.floor(cell / COLS) * S;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
      recipe(ctx);
      ctx.restore();
      frames.push({ sx, sy });
      cell++;
    }
    index[c] = { sx: frames[0].sx, sy: frames[0].sy, frames };
  }

  function draw(ctx, char, x, y, frame = 0) {
    const entry = index[char];
    if (!entry) return;
    const { sx, sy } = entry.frames[frame % entry.frames.length];
    ctx.drawImage(canvas, sx, sy, S, S, x, y, S, S);
  }

  return { canvas, index, draw };
}
