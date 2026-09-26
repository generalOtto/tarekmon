// The pause menu: opened with Start in the overworld. Save, sound toggle, and the DUMPLINGDEX,
// DUMPLINGS (party) and BAG overlay screens. While a screen is open the menu hides
// its own box and forwards update/draw to it; closing the screen returns here.
import { Menu } from './menu.js';
import { toSaveCode } from '../engine/save.js';
import { PartyScreen } from './party.js';
import { BagScreen } from './bag.js';
import { DexScreen } from './dex.js';
import { applyFieldItem } from '../world/items.js';

// 96 wide: DUMPLINGDEX (11 chars after the 20px cursor gutter) ends 85px in; at 88 it sat 1px off the border.
const W = 96;
const X = 160 - W;
const Y = 0;

const BASE_ITEMS = ['DUMPLINGDEX', 'DUMPLINGS', 'BAG', 'SAVE'];

export class StartMenu {
  /** onNapkin(): the overworld's warp back to Haze Lounge, run after a napkin is used from the BAG. */
  constructor({ state, save, textbox, audio, db = {}, onNapkin = null }) {
    Object.assign(this, { state, save, textbox, audio, db, onNapkin });
    this.screen = null; // the open DexScreen / PartyScreen / BagScreen, if any
    this.open = false;
    this.menu = null;
    this.busy = false; // true for the whole SAVE flow, incl. the gap between say() calls, so Start can't race it
  }

  _items() {
    return [...BASE_ITEMS, this.audio?.muted ? 'SOUND OFF' : 'SOUND ON', 'CLOSE'];
  }

  start() {
    this.open = true;
    this.menu = new Menu(this._items());
  }

  close() {
    this.open = false;
    this.menu = null;
    this.screen = null;
  }

  update(input) {
    if (!this.open) return;
    if (this.screen) { this.screen.update(input); return; }
    if (this.textbox.open) { this.textbox.update(input); return; }
    if (this.busy) return; // mid-SAVE, between say() calls: ignore Start/B/menu input until it settles
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
        this.audio?.setMuted(!this.audio.muted); // persisted by the audio module
        break;
      case 'SAVE':
        this._doSave();
        break;
      case 'CLOSE':
        this.close();
        break;
      case 'DUMPLINGS':
        this._show(new PartyScreen({ ...this._screenOpts(), mode: 'manage' }));
        break;
      case 'BAG':
        this._show(new BagScreen({ ...this._screenOpts(), context: 'field', onUse: (id, i) => this._useItem(id, i) }));
        break;
      case 'DUMPLINGDEX':
        this._show(new DexScreen(this._screenOpts()));
        break;
    }
  }

  _screenOpts() { return { state: this.state, db: this.db, textbox: this.textbox }; }

  /** Opens an overlay screen; its onClose drops it (only if it is still the current one). */
  _show(screen) {
    screen.onClose = () => { if (this.screen === screen) this.screen = null; };
    if (screen.open) this.screen = screen;
  }

  /** BAG → USE in the field: heal a picked member, or napkin out (closes everything, then warps). */
  _useItem(id, partyIndex) {
    const r = applyFieldItem(this.state, id, partyIndex, { db: this.db });
    if (r.warp) { this.close(); this.onNapkin?.(); return; }
    this.textbox.say(r.text);
  }

  async _doSave() {
    this.busy = true;
    try {
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
    } finally {
      this.busy = false;
    }
  }

  // Always safe to call: draws the shared textbox whenever it's open (menu or plain overworld
  // dialogue alike), on top of the open screen, or the menu box when it is not covered.
  draw(ctx) {
    if (this.screen) this.screen.draw(ctx);
    else if (this.open && !this.textbox.open) this.menu.draw(ctx, X, Y, W);
    this.textbox.draw(ctx);
  }
}
