// OverworldScene: walks the player around a map, scrolls the camera, draws tiles + NPCs + sprite,
// and handles A-button interaction (NPCs, signs, fridge, rack, pedestals, gate). Battles (wild and
// trainer) go out through onBattle({ kind, foeParty, trainer }); main.js owns the scene stack.
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
import { YesNo } from '../ui/menu.js';
import { ShopScreen } from '../ui/shop.js';
import { FridgeScreen } from '../ui/fridge.js';
import { hazeEntrance } from './items.js';
import { attachBattleFlow } from './battleflow.js';
import { TrainerFlow, pickStarter, pedestalGone, drawStarterPreview } from './trainers.js';
import { FlashWipe } from '../battle/transition.js';

const S = TILE_SIZE;
const BUMP_TICKS = 20;

export class OverworldScene {
  constructor({ db, maps, state, tileset, input, textbox, save, audio, rng = defaultRng, onBattle = null, onChampion = null }) {
    Object.assign(this, { db, maps, state, tileset, input, textbox, save, audio, rng, onBattle, onChampion });
    this.transition = new FlashWipe(); // owned/drawn here: the flash + wipe into any battle
    this.ticks = 0;
    this.lastBumpTick = -Infinity; // walking into a wall thuds at most every BUMP_TICKS while held
    this.fader = new Fader();
    this.busy = false; // true for the whole of an interaction, incl. gaps between chained say()s
    this.overlay = null; // one full-input screen at a time (shop, fridge); drawn above the map, below the fade
    this.afterFade = null; // run once the current warp fade has finished (napkin/blackout arrival lines)
    this.prompt = new YesNo(textbox); // YES/NO questions (the starter pick)
    this.preview = null; // species whose sticker card is up while its pedestal is being read
    this.startMenu = new StartMenu({ state, save, textbox, audio, db, onNapkin: () => this.useNapkin() });
    this.flow = attachBattleFlow(this);
    this.trainerFlow = new TrainerFlow(this);
  }

  enter() {
    const { state } = this;
    this.map = this.maps[state.pos.map];
    this.player = this.makePlayer(state.pos.x, state.pos.y, state.pos.facing);
    this.trainerFlow.placeChampion();
    this.audio?.startMusic('overworld'); // interiors share the track at full volume, by design (no attenuation)
  }

  /** Build a Player wired for this scene: onArrive syncs state.pos, checks for a warp underfoot,
   *  and — only when there's no warp — rolls for a tall-grass encounter. */
  makePlayer(x, y, facing) {
    const player = new Player(x, y, facing);
    player.onArrive = (nx, ny) => {
      this.state.pos.x = nx; this.state.pos.y = ny;
      const w = resolveWarp(this.map, nx, ny);
      if (w && this.map.id === 'lab' && !this.state.flags.starterPicked) { this.blockDoor(nx, ny); return; }
      if (w) { this.beginWarp(w); return; }
      this.checkEncounter(nx, ny);
    };
    return player;
  }

  /** Fade out, swap map/player/state at full black, run `onDark` (blackout), autosave, then fade back in. */
  beginWarp(w, onDark) {
    this.fader.start(() => {
      this.map = this.maps[w.map];
      this.player = this.makePlayer(w.x, w.y, w.facing);
      this.state.pos = { map: w.map, x: w.x, y: w.y, facing: w.facing };
      this.trainerFlow.placeChampion();
      onDark?.();
      this.save.autosave(this.state);
    });
  }

  /** No starter yet: the lab mat doesn't warp; back up a tile and let Prof. Otto say why. */
  blockDoor(x, y) {
    this.player = this.makePlayer(x, y - 1, 'up');
    this.state.pos = { map: this.map.id, x, y: y - 1, facing: 'up' };
    this.run(() => this.say('otto-lab-block'));
  }

  // Encounter/battle plumbing lives in battleflow.js; these stay as the scene's public surface.
  checkEncounter(x, y) { this.flow.checkEncounter(x, y); }
  startWildBattle(species, level) { this.flow.startWildBattle(species, level); }
  onBattleEnd(result, ctx) { this.flow.onBattleEnd(result, ctx); }
  blackout() { this.flow.blackout(); }

  update(dt) {
    const { input, textbox, player, state, fader, startMenu } = this;
    if (fader.active) { // no input while warping
      fader.update();
      if (!fader.active && this.afterFade) { const f = this.afterFade; this.afterFade = null; this.run(f); }
      return;
    }
    if (this.transition?.active) { this.transition.update(); return; }
    if (this.overlay) { this.overlay.update(input); return; }
    if (this.prompt.active) { this.prompt.update(input); return; }
    if (startMenu.open) { startMenu.update(input); return; }
    if (textbox.open) { textbox.update(input); return; }
    if (this.busy) return; // between two lines of a multi-say interaction
    if (this.trainerFlow.update()) return; // a trainer spotted us (or Suhaib is walking in)
    if (!player.moving && input.justPressed('start')) { startMenu.start(); return; }
    if (!player.moving && input.justPressed('a') && this.interact()) return;
    if (!player.moving) {
      const d = input.pressedDirection();
      if (d) {
        const moved = player.tryMove(d, this.map, {
          blocked: (x, y) => !!npcAt(this.map, x, y),
          allow: (x, y) => tileAt(this.map, x, y) === 'G' && state.badges.includes('haze'),
        });
        state.pos.facing = player.facing;
        if (!moved && this.ticks - this.lastBumpTick >= BUMP_TICKS) { this.audio?.playSfx('bump'); this.lastBumpTick = this.ticks; }
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
      case 'F': return this.openOverlay(FridgeScreen, () => this.save.autosave(state)); // says fridge-open itself
      case 'K': return this.run(() => this.say(rollWeather() ? 'rack-nice' : 'rack-bad'));
      case 'E': return this.run(() => pickStarter(this, fx, fy));
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
    const fight = this.trainerFlow.talk(npc);
    if (fight) return fight;
    if (npc.kind === 'shop') return this.openOverlay(ShopScreen);
    if (npc.kind === 'weather') state.flags.weatherNice = rollWeather();
    await this.textbox.say(dialogueFor(npc, state, this.db.dialogue ?? {}));
    if (npc.kind === 'healer') { healParty(state); this.audio?.playJingle('heal'); await this.say('haze-heal-2'); }
    await this.trainerFlow.officerGift(npc);
  }

  /** Puts a full-input screen (shop, fridge) in the overlay slot; `after` runs once it closes. */
  openOverlay(Screen, after) {
    const s = new Screen({ state: this.state, db: this.db, textbox: this.textbox,
      onClose: () => { if (this.overlay === s) this.overlay = null; after?.(); } });
    this.overlay = s;
    return true;
  }

  /** A napkin from the BAG: fade to the Haze Lounge entrance mat (autosaves), then say so. */
  useNapkin() {
    const w = hazeEntrance(this.maps);
    if (!w) return;
    this.afterFade = () => this.textbox.say(`${this.state.playerName} WIPED HIS WAY\nBACK TO HAZE LOUNGE.`);
    this.beginWarp(w);
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
        else if (t === 'E' && pedestalGone(map, state, x, y)) t = '_';
        tileset.draw(ctx, t, x * S - ox, y * S - oy, frame);
      }
    }
    for (const n of [...map.npcs, ...map.trainers]) {
      const [dx, dy] = this.trainerFlow.offset(n);
      drawNpc(ctx, n, n.x * S - ox + dx, n.y * S - oy + dy, this.ticks);
    }
    this.trainerFlow.drawBubble(ctx, ox, oy);
    drawPlayer(ctx, Math.round(px) - ox, Math.round(py) - oy, player.facing, player.frame, player.skating);
    this.overlay?.draw(ctx);
    if (this.preview) drawStarterPreview(ctx, this.db, this.preview);
    this.startMenu.draw(ctx); // draws the shared textbox too, whether from the menu or a plain interaction
    this.prompt.draw(ctx);
    drawFade(ctx, fader.alpha);
    this.transition?.draw(ctx);
  }
}
