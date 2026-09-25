// OverworldScene: walks the player around a map, scrolls the camera, draws tiles + sprite.
import { Player, drawPlayer } from './player.js';
import { cameraFor } from './camera.js';
import { tileAt, npcAt } from './map.js';
import { TILE_SIZE } from './tiles.js';
import { W, H } from '../engine/canvas.js';
import { INK } from './palette.js';

const S = TILE_SIZE;
const DIRS = ['up', 'down', 'left', 'right'];

export class OverworldScene {
  constructor({ db, maps, state, tileset, input, textbox, save }) {
    Object.assign(this, { db, maps, state, tileset, input, textbox, save });
    this.ticks = 0;
  }

  enter() {
    const { state } = this;
    this.map = this.maps[state.pos.map];
    this.player = new Player(state.pos.x, state.pos.y, state.pos.facing);
    this.player.onArrive = (x, y) => { state.pos.x = x; state.pos.y = y; };
  }

  update(dt) {
    const { input, textbox, player, state } = this;
    if (textbox.open) { textbox.update(input); return; }
    if (!player.moving) {
      // Held direction first; justPressed catches a tap released before this tick ran.
      const d = input.direction() ?? DIRS.find(b => input.justPressed(b));
      if (d) {
        player.tryMove(d, this.map, { blocked: (x, y) => !!npcAt(this.map, x, y) });
        state.pos.facing = player.facing;
      }
    }
    player.update(dt);
    this.ticks++;
  }

  draw(ctx) {
    const { map, player, tileset, state } = this;
    const { px, py } = player.pixelPos();
    const { ox, oy } = cameraFor({ px, py }, map);
    ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); // letterbox for interiors smaller than the screen
    const frame = (this.ticks >> 5) & 1;
    const gateOpen = state.badges.includes('haze');
    const x0 = Math.floor(ox / S) - 1, y0 = Math.floor(oy / S) - 1;
    for (let y = Math.max(0, y0); y <= Math.min(map.height - 1, y0 + 10); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(map.width - 1, x0 + 11); x++) {
        let t = tileAt(map, x, y);
        if (t === 'G' && gateOpen) t = 'g';
        tileset.draw(ctx, t, x * S - ox, y * S - oy, frame);
      }
    }
    drawPlayer(ctx, Math.round(px) - ox, Math.round(py) - oy, player.facing, player.frame, player.skating);
    this.textbox.draw(ctx);
  }
}
