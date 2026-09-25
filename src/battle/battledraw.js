// Battle rendering: drawBattle(ctx, scene) reads the BattleScene (its `view`, mode, menu, textbox)
// and never mutates it. All battle layout constants live here.
import { drawHpBar } from '../ui/hpbar.js';
import { drawText, measure } from '../engine/font.js';
import { W, H } from '../engine/canvas.js';
import { drawFade } from '../world/doors.js';
import { PAPER, INK, GRASS_L, RED, WHITE, YELLOW, XP_BLUE, PLACEHOLDER } from '../world/palette.js';

const STICKER = 56;
const FOE_POS = { x: 96, y: 8 }, PLAYER_POS = { x: 8, y: 56 };
const FOE_INFO = { x: 8, y: 8 }, PLAYER_INFO = { x: 88, y: 60 };
const BOX_Y = 96, BOX_H = 48;
const PANEL_X = 100; // FIGHT menu: TYPE/PP panel
/** Ball path (used by the scene's ball timeline): thrown from the player side, rests on the foe's platform. */
export const BALL_FROM = { x: 40, y: 80 }, BALL_TO = { x: 124, y: 50 };

const clamp01 = v => Math.max(0, Math.min(1, v));

export function drawBattle(ctx, scene) {
  const v = scene.view;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = GRASS_L;
  ellipse(ctx, FOE_POS.x + STICKER / 2, FOE_POS.y + STICKER - 6, 30, 6);
  ellipse(ctx, PLAYER_POS.x + STICKER / 2, 92, 34, 7);

  drawSticker(ctx, scene.images?.[v.foe.mon.speciesId], v.foe, FOE_POS, false);
  drawSticker(ctx, scene.images?.[v.player.mon.speciesId], v.player, PLAYER_POS, true);
  if (scene.sparkle > 0) {
    const cx = PLAYER_POS.x + STICKER / 2, cy = PLAYER_POS.y + 20, r = 26 + (scene.sparkle % 4);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 2 * Math.PI + scene.sparkle * 0.1;
      drawStar(ctx, Math.round(cx + r * Math.cos(a)) - 2, Math.round(cy + r * Math.sin(a)) - 2, YELLOW);
    }
  }

  drawFoeInfo(ctx, v.foe);
  drawPlayerInfo(ctx, v.player);
  if (v.ball.visible) drawBall(ctx, v.ball.x, v.ball.y);
  if (v.ball.star) drawStar(ctx, v.ball.x + 4, v.ball.y - 14, YELLOW);
  drawBottom(ctx, scene);
  drawFade(ctx, scene.fadeAlpha);
}

function drawSticker(ctx, img, side, pos, mirror) {
  if (side.hidden || side.scale <= 0) return;
  // scale < 1 only happens to the foe during a ball throw: shrink into the ball's resting spot
  const size = Math.round(STICKER * side.scale);
  const x = Math.round(BALL_TO.x + (pos.x - BALL_TO.x) * side.scale) + side.dx;
  const y = Math.round(BALL_TO.y + (pos.y - BALL_TO.y) * side.scale) + side.dy;
  ctx.save();
  ctx.globalAlpha = side.alpha;
  if (img && img.complete !== false && (img.naturalWidth ?? 1) > 0) {
    ctx.imageSmoothingEnabled = true; // stickers are photos: smooth scaling; restore() puts pixel art back
    if (mirror) { ctx.translate(x + size, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, size, size); }
    else ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = PLACEHOLDER;
    ctx.fillRect(x, y, size, size);
    if (size >= 12) drawText(ctx, '?', x + (size >> 1) - 2, y + (size >> 1) - 3, INK);
  }
  ctx.restore();
}

function drawFoeInfo(ctx, s) {
  const { x, y } = FOE_INFO; // 80×26: name / level / HP bar
  drawText(ctx, s.mon.nickname.slice(0, 10), x + 2, y + 1, INK);
  const lv = `L${s.level}`;
  drawText(ctx, lv, x + 80 - measure(lv), y + 10, INK);
  drawHpBar(ctx, x + 14, y + 19, 64, 4, s.hp / s.max);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y + 1, 1, 24); ctx.fillRect(x, y + 25, 80, 1); // Gen-1 corner bracket
}

function drawPlayerInfo(ctx, s) {
  const { x, y } = PLAYER_INFO; // 68×36: name / level / HP bar / HP text / XP bar
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, 68, 36); // sits over the foe's platform
  drawText(ctx, s.mon.nickname.slice(0, 10), x + 3, y + 1, INK);
  const lv = `L${s.level}`;
  drawText(ctx, lv, x + 67 - measure(lv), y + 9, INK);
  drawHpBar(ctx, x + 18, y + 18, 48, 4, s.hp / s.max);
  drawText(ctx, `HP ${s.hpText}/${s.max}`, x + 3, y + 24, INK);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 18, y + 32, 48, 2);
  ctx.fillStyle = XP_BLUE;
  ctx.fillRect(x + 18, y + 32, Math.round(48 * clamp01(s.xpRatio)), 2);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 67, y, 1, 36); ctx.fillRect(x, y + 35, 68, 1); // Gen-1 corner bracket
}

function drawBottom(ctx, scene) {
  const { mode, menu } = scene;
  if (mode === 'events') {
    if (scene.textbox.open) scene.textbox.draw(ctx);
    else paperBox(ctx, 0, BOX_Y, W, BOX_H);
  } else if (mode === 'action') {
    paperBox(ctx, 0, BOX_Y, W, BOX_H);
    menu.items.forEach((item, i) => {
      const cx = 16 + (i % 2) * 80, cy = BOX_Y + 12 + Math.floor(i / 2) * 16;
      if (i === menu.index) drawText(ctx, '▶', cx - 10, cy, INK);
      drawText(ctx, item, cx, cy, INK);
    });
  } else if (mode === 'fight') {
    // 4 rows of 10 px: move names can be 10 chars, so a 2×2 grid would collide with the PP panel.
    paperBox(ctx, 0, BOX_Y, W, BOX_H);
    for (let i = 0; i < 4; i++) {
      const cy = BOX_Y + 5 + i * 10, item = menu.items[i];
      if (i === menu.index && item) drawText(ctx, '▶', 6, cy, INK);
      drawText(ctx, item ?? '-', 16, cy, INK);
    }
    ctx.fillStyle = INK; ctx.fillRect(PANEL_X - 4, BOX_Y + 4, 1, BOX_H - 8);
    const slot = menu.struggle ? null : scene.battle.player.moves[menu.index];
    const move = slot && scene.db.movesById[slot.id];
    drawText(ctx, 'TYPE/', PANEL_X, BOX_Y + 8, INK);
    drawText(ctx, move?.type ? move.type : '-', PANEL_X, BOX_Y + 18, INK);
    drawText(ctx, slot ? `PP ${slot.pp}/${slot.maxPp}` : 'PP -', PANEL_X, BOX_Y + 32, slot?.pp === 0 ? RED : INK);
  } else {
    // bag / party: a list that grows upward from the bottom edge
    const rows = Math.min(menu.items.length, 6);
    menu.draw(ctx, 0, H - (16 + rows * 16), W, { rows });
  }
}

function paperBox(ctx, x, y, w, h) {
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
}

/** A flat pixel ellipse (horizontal scanlines), no anti-aliasing. */
function ellipse(ctx, cx, cy, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / ry) ** 2));
    ctx.fillRect(cx - half, cy + dy, half * 2, 1);
  }
}

/** 10 px dumpling ball: red top, white bottom, ink outline + center line, centered on (x, y). */
function drawBall(ctx, x, y) {
  const R = [3, 4, 5, 5, 5, 5, 5, 5, 4, 3]; // half-widths per row
  for (let r = 0; r < 10; r++) {
    const half = R[r], yy = y - 5 + r;
    ctx.fillStyle = INK; ctx.fillRect(x - half, yy, half * 2, 1);
    if (r === 0 || r === 9) continue;
    ctx.fillStyle = r < 5 ? RED : WHITE;
    ctx.fillRect(x - half + 1, yy, half * 2 - 2, 1);
  }
  ctx.fillStyle = INK; ctx.fillRect(x - 5, y, 10, 1);
  ctx.fillStyle = WHITE; ctx.fillRect(x - 1, y - 1, 2, 2);
}

/** 5×5 pixel star with an ink halo (reads over the photo stickers better than the font's ★). */
function drawStar(ctx, x, y, color) {
  const rows = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
  ctx.fillStyle = INK;
  rows.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') ctx.fillRect(x + c - 1, y + r - 1, 3, 3); });
  ctx.fillStyle = color;
  rows.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '#') ctx.fillRect(x + c, y + r, 1, 1); });
}
