// OverworldScene: walks the player around a map, scrolls the camera, draws tiles + NPCs + sprite,
// and handles A-button interaction (NPCs, signs, fridge, rack, pedestals, gate).
import { Player, drawPlayer } from './player.js';
import { cameraFor } from './camera.js';
import { tileAt, npcAt, signAt, step } from './map.js';
import { drawNpc, faceToward, dialogueFor } from './npc.js';
import { resolveWarp, Fader, drawFade } from './doors.js';
import { TILE_SIZE } from './tiles.js';
import { W, H } from '../engine/canvas.js';
import { INK } from './palette.js';
import { healParty } from '../engine/state.js';
import { rollWeather, defaultRng } from '../engine/rng.js';
import { StartMenu } from '../ui/startmenu.js';
import { attachBattleFlow } from './battleflow.js';
import { FlashWipe } from '../battle/transition.js';

const S = TILE_SIZE;

export class OverworldScene {
  constructor({ db, maps, state, tileset, input, textbox, save, audio, rng = defaultRng, onEncounter = null }) {
    Object.assign(this, { db, maps, state, tileset, input, textbox, save, audio, rng, onEncounter });
    this.transition = new FlashWipe(); // owned/drawn here: the wild-encounter flash + wipe
    this.ticks = 0;
    this.fader = new Fader();
    this.busy = false; // true for the whole of an interaction, incl. gaps between chained say()s
    this.startMenu = new StartMenu({ state, save, textbox, audio });
    this.flow = attachBattleFlow(this);
  }

  enter() {
    const { state } = this;
    this.map = this.maps[state.pos.map];
    this.player = this.makePlayer(state.pos.x, state.pos.y, state.pos.facing);
  }

  /** Build a Player wired for this scene: onArrive syncs state.pos, checks for a warp underfoot,
   *  and — only when there's no warp — rolls for a tall-grass encounter. */
  makePlayer(x, y, facing) {
    const player = new Player(x, y, facing);
    player.onArrive = (nx, ny) => {
      this.state.pos.x = nx; this.state.pos.y = ny;
      const w = resolveWarp(this.map, nx, ny);
      if (w) { this.beginWarp(w); return; }
      this.checkEncounter(nx, ny);
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

  // Encounter/battle plumbing lives in battleflow.js; these stay as the scene's public surface.
  checkEncounter(x, y) { this.flow.checkEncounter(x, y); }
  startWildBattle(species, level) { this.flow.startWildBattle(species, level); }
  onBattleEnd(result, ctx) { this.flow.onBattleEnd(result, ctx); }
  blackout() { this.flow.blackout(); }

  update(dt) {
    const { input, textbox, player, state, fader, startMenu } = this;
    if (fader.active) { fader.update(); return; } // no input while warping
    if (this.transition?.active) { this.transition.update(); return; }
    if (startMenu.open) { startMenu.update(input); return; }
    if (textbox.open) { textbox.update(input); return; }
    if (this.busy) return; // between two lines of a multi-say interaction
    if (!player.moving && input.justPressed('start')) { startMenu.start(); return; }
    if (!player.moving && input.justPressed('a') && this.interact()) return;
    if (!player.moving) {
      const d = input.pressedDirection();
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

  /** A pressed while standing: act on the faced tile (or an NPC across a counter). Returns true if something happened. */
  interact() {
    const { map, player, state } = this;
    const [fx, fy] = step(player.x, player.y, player.facing);
    let npc = npcAt(map, fx, fy);
    if (!npc && tileAt(map, fx, fy) === 'C') npc = npcAt(map, ...step(fx, fy, player.facing)); // talk over the counter
    if (npc) return this.run(() => this.talkTo(npc));
    const sign = signAt(map, fx, fy);
    if (sign) return this.run(() => this.say(sign.dialogue));
    switch (tileAt(map, fx, fy)) {
      case 'F': return this.run(() => this.say('fridge-open')); // Fridge screen: Task 31
      case 'K': return this.run(() => this.say(rollWeather() ? 'rack-nice' : 'rack-bad'));
      case 'E': return this.run(() => this.say('pedestal'));
      case 'G': return !state.badges.includes('haze') && this.run(() => this.say('gate-closed'));
    }
    return false;
  }

  /** Run an async interaction with input locked until it settles. */
  run(fn) {
    this.busy = true;
    fn().catch(e => console.error(e)).finally(() => { this.busy = false; });
    return true;
  }

  say(id) { return this.textbox.say(this.db.dialogue?.[id] ?? '...'); }

  async talkTo(npc) {
    const { player, state } = this;
    npc.facing = faceToward(npc, player.x, player.y);
    if (npc.kind === 'weather') state.flags.weatherNice = rollWeather();
    await this.textbox.say(dialogueFor(npc, state, this.db.dialogue ?? {}));
    if (npc.kind === 'healer') { healParty(state); await this.say('haze-heal-2'); }
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
    for (const n of [...map.npcs, ...map.trainers]) drawNpc(ctx, n, n.x * S - ox, n.y * S - oy, this.ticks);
    drawPlayer(ctx, Math.round(px) - ox, Math.round(py) - oy, player.facing, player.frame, player.skating);
    this.startMenu.draw(ctx); // draws the shared textbox too, whether from the menu or a plain interaction
    drawFade(ctx, fader.alpha);
    this.transition?.draw(ctx);
  }
}
