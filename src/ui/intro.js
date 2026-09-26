// The new-game intro: Prof. Otto's bust on paper, his welcome lines (intro-1..5), the name entry,
// then intro-6 (with the name) and intro-7 → onDone(name). Every page waits for A.
import { W, H } from '../engine/canvas.js';
import { PAPER, FLOOR } from '../world/palette.js';
import { drawOttoPortrait } from '../world/npc.js';
import { NameEntry } from './nameentry.js';

const PORTRAIT_Y = 20;

export class IntroScene {
  constructor({ db, textbox, input, audio = null, playerName = 'TAREK', onDone = null }) {
    Object.assign(this, { db, textbox, input, audio, playerName, onDone });
    this.nameEntry = null;
    this.started = false;
  }

  enter() {
    if (this.started) return;
    this.started = true;
    this.script().catch(e => console.error(e));
  }

  line(id, name) {
    const text = this.db.dialogue?.[id] ?? '...';
    return this.textbox.say(name === undefined ? text : text.replaceAll('{name}', name));
  }

  async script() {
    for (const id of ['intro-1', 'intro-2', 'intro-3', 'intro-4', 'intro-5']) await this.line(id);
    const name = await new Promise(resolve => {
      this.nameEntry = new NameEntry({ input: this.input, initial: this.playerName, max: 7, onDone: resolve });
    });
    this.nameEntry = null;
    await this.line('intro-6', name);
    await this.line('intro-7');
    this.onDone?.(name);
  }

  update() {
    if (this.nameEntry) this.nameEntry.update(this.input);
    else this.textbox.update(this.input);
  }

  draw(ctx) {
    if (this.nameEntry) { this.nameEntry.draw(ctx); return; }
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = FLOOR; ctx.fillRect((W - 48) / 2, PORTRAIT_Y + 30, 48, 4); // a bit of floor under him
    drawOttoPortrait(ctx, (W - 32) / 2, PORTRAIT_Y);
    this.textbox.draw(ctx);
  }
}
