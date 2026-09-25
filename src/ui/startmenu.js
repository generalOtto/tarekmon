// The pause menu: opened with Start in the overworld. Save/load, sound toggle, and placeholders
// for the dex/party/bag screens that arrive in later tasks.
import { Menu } from './menu.js';
import { toSaveCode } from '../engine/save.js';

const X = 160 - 88;
const Y = 0;
const W = 88;

const BASE_ITEMS = ['DUMPLINGDEX', 'DUMPLINGS', 'BAG', 'SAVE'];

export class StartMenu {
  constructor({ state, save, textbox, audio }) {
    Object.assign(this, { state, save, textbox, audio });
    this.open = false;
    this.menu = null;
  }

  _items() {
    return [...BASE_ITEMS, this.state.flags.muted ? 'SOUND OFF' : 'SOUND ON', 'CLOSE'];
  }

  start() {
    this.open = true;
    this.menu = new Menu(this._items());
  }

  close() {
    this.open = false;
    this.menu = null;
  }

  update(input) {
    if (!this.open) return;
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (input.justPressed('start')) { this.close(); return; }
    this.menu.items = this._items(); // keep the SOUND label current after a toggle
    this.menu.handle(input, {
      onSelect: label => this._select(label),
      onCancel: () => this.close(),
    });
  }

  _select(label) {
    switch (label) {
      case 'SOUND ON':
      case 'SOUND OFF':
        this.state.flags.muted = !this.state.flags.muted;
        this.audio?.setMuted?.(this.state.flags.muted);
        break;
      case 'SAVE':
        this._doSave();
        break;
      case 'CLOSE':
        this.close();
        break;
      case 'DUMPLINGDEX':
      case 'DUMPLINGS':
      case 'BAG':
        this.textbox.say('NOT YET.');
        break;
    }
  }

  async _doSave() {
    this.save.save(this.state);
    await this.textbox.say(`${this.state.playerName} SAVED THE GAME.`);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(toSaveCode(this.state));
        await this.textbox.say('SAVE CODE COPIED\nTO CLIPBOARD.');
      }
    } catch {
      // Clipboard write failed or unavailable — the save itself already succeeded.
    }
  }

  // Always safe to call: draws the shared textbox whenever it's open (menu or plain overworld
  // dialogue alike), plus the menu box itself when the start menu is open and not covered by it.
  draw(ctx) {
    if (this.open && !this.textbox.open) this.menu.draw(ctx, X, Y, W);
    this.textbox.draw(ctx);
  }
}
