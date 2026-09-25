// Tiny drawing helpers shared by the overlay screens (bag, party, shop).
import { PAPER, INK } from './textbox.js';
import { drawText, measure } from '../engine/font.js';

/** A paper rectangle with a 2px ink border. */
export function paperBox(ctx, x, y, w, h) {
  ctx.fillStyle = PAPER; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w - 2, y, 2, h);
}

/** Draws `text` so that it ends at x `right`. */
export function drawRight(ctx, text, right, y, color = INK) {
  drawText(ctx, text, right - measure(text), y, color);
}

/** First visible row for a cursor list of `n` items showing `rows` at once (keeps the cursor mid-window, like Menu.draw). */
export function scrollFor(index, n, rows) {
  if (n <= rows) return 0;
  return Math.min(n - rows, Math.max(0, index - Math.floor(rows / 2)));
}

/** Left-pads/right-aligns a count/price into a fixed-width label: `NAME      x3`. */
export function padRow(left, right, cols) {
  return String(left).padEnd(Math.max(0, cols - String(right).length)) + right;
}
