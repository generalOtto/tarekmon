// OverworldScene: walks the player around a map, scrolls the camera, draws tiles + sprite.
import { Player, drawPlayer } from './player.js';
import { cameraFor } from './camera.js';
import { tileAt, npcAt } from './map.js';
import { resolveWarp, Fader, drawFade } from './doors.js';
import { TILE_SIZE } from './tiles.js';
import { W, H } from '../engine/canvas.js';
import { INK } from './palette.js';

const S = TILE_SIZE;
const DIRS = ['up', 'down', 'left', 'right'];

export class OverworldScene {
  constructor({ db, maps, state, tileset, input, textbox, save }) {
    Object.assign(this, { db, maps, state, tileset, input, textbox, save });
    this.ticks = 0;
    this.fader = new Fader();
  }

  enter() {
    const { state } = this;
    this.map = this.maps[state.pos.map];
    this.player = this.makePlayer(state.pos.x, state.pos.y, state.pos.facing);
  }

  /** Build a Player wired for this scene: onArrive syncs state.pos and checks for a warp underfoot. */
  makePlayer(x, y, facing) {
    const player = new Player(x, y, facing);
    player.onArrive = (nx, ny) => {
      this.state.pos.x = nx; this.state.pos.y = ny;
      const w = resolveWarp(this.map, nx, ny);
      if (w) this.beginWarp(w);
    };
    return player;
  }

  /** Fade out, swap map/player/state at full black, autosave, then fade back in. */
  beginWarp(w) {
    this.fader.start(() => {
      this.map = this.maps[w.map];
      this.player = this.makePlayer(w.x, w.y, w.facing);
      this.state.pos = { map: w.map, x: w.x, y: w.y, facing: w.facing };
      this.save.autosave(this.state);
    });
  }

  update(dt) {
    const { input, textbox, player, state, fader } = this;
    if (fader.active) { fader.update(); return; } // no input while warping
    if (textbox.open) { textbox.update(input); return; }
    if (!player.moving) {
      // Held direction first; justPressed catches a tap released before this tick ran.
      const d = input.direction() ?? DIRS.find(b => input.justPressed(b));
      if (d) {
        player.tryMove(d, this.map, {
          blocked: (x, y) => !!npcAt(this.map, x, y),
          allow: (x, y) => tileAt(this.map, x, y) === 'G' && state.badges.includes('haze'),
        });
        state.pos.facing = player.facing;
      }
    }
    player.update(dt);
    this.ticks++;
  }

  draw(ctx) {
    const { map, player, tileset, state, fader } = this;
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
    drawFade(ctx, fader.alpha);
  }
}
