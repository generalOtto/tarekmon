import { loadDb } from './data/load.js';
import { createScreen } from './engine/canvas.js';
import { SceneStack, startLoop } from './engine/loop.js';
import { ButtonState, attachInput } from './engine/input.js';
import { createSave } from './engine/save.js';
import { newGameState } from './engine/state.js';
import { TextBox } from './ui/textbox.js';
import { buildTileset } from './world/tileset.js';
import { loadMaps } from './world/map.js';
import { OverworldScene } from './world/overworld.js';

const db = await loadDb();

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();
const input = new ButtonState();
attachInput(document.body, input);
const save = createSave(localStorage);
const textbox = new TextBox();

// TEMP: straight into a fresh game until the title/intro scenes exist.
const state = newGameState('TAREK', db.mapData.start);
scenes.push(new OverworldScene({ db, maps: loadMaps(db.mapData), state, tileset: buildTileset(), input, textbox, save }));

startLoop({
  tick: dt => { scenes.update(dt); input.endFrame(); },
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
