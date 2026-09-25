import { loadDb } from './data/load.js';
import { createScreen } from './engine/canvas.js';
import { SceneStack, startLoop } from './engine/loop.js';
import { ButtonState, attachInput } from './engine/input.js';
import { createSave } from './engine/save.js';
import { TextBox } from './ui/textbox.js';
import { buildTileset } from './world/tileset.js';
import { LEGEND } from './world/tiles.js';

const db = await loadDb();

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();
const input = new ButtonState();
attachInput(document.body, input);
const save = createSave(localStorage);
const tileset = buildTileset();
const TILE_CHARS = [...LEGEND];

// Placeholder scene — replaced by TitleScene/OverworldScene in later tasks
const placeholderScene = {
  x: 76,
  y: 68,
  flash: false,
  ticks: 0,
  textbox: new TextBox(),
  update() {
    this.ticks++;
    if (input.justPressed('start') && !this.textbox.open) {
      this.textbox.say("WELCOME TO THE WORLD OF TAREKMON!\fMY NAME IS OTTO. PEOPLE CALL ME THE DUMPLING PROFESSOR.");
    }
    this.textbox.update(input);

    if (!this.textbox.open) {
      const dir = input.direction();
      if (dir === 'up') this.y -= 1;
      else if (dir === 'down') this.y += 1;
      else if (dir === 'left') this.x -= 1;
      else if (dir === 'right') this.x += 1;
    }
    // OR-accumulate rather than assign: the loop can run several ticks per
    // rendered frame (catch-up after a slow frame), so a plain assignment
    // here could be overwritten back to false by a later tick in the same
    // frame before draw() ever sees the true from an earlier one. draw()
    // resets this after drawing, once the frame has actually used it.
    this.flash ||= input.justPressed('a');
  },
  draw(ctx) {
    // TEMP: tileset preview grid — removed when OverworldScene renders the real map (Task 14)
    // Tileset preview: every legend tile in a 10-column grid; water flips every 32 ticks
    const frame = (this.ticks >> 5) & 1;
    TILE_CHARS.forEach((ch, i) => tileset.draw(ctx, ch, (i % 10) * 16, Math.floor(i / 10) * 16, frame));
    ctx.fillStyle = this.flash ? '#ffffff' : '#1f1a33';
    ctx.fillRect(this.x, this.y, 8, 8);
    this.flash = false;
    this.textbox.draw(ctx);
  },
};
scenes.push(placeholderScene);

startLoop({
  tick: dt => { scenes.update(dt); input.endFrame(); },
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
