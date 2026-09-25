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
import { Battle } from './battle/battle.js';
import { BattleScene } from './battle/battlescene.js';
import { FlashWipe } from './battle/transition.js';
import { makeMonster } from './battle/monster.js';
import { healParty } from './engine/state.js';

const db = await loadDb();

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();
const input = new ButtonState();
attachInput(document.body, input);
const save = createSave(localStorage);
const textbox = new TextBox();

// TEMP: straight into a fresh game until the title/intro scenes exist.
const state = newGameState('TAREK', debugStart() ?? db.mapData.start);

/** Dev aid, kept on purpose: `?start=map,x,y,facing` (e.g. `?start=haze,6,8,up`) drops a fresh game
 *  at that tile for play-testing. Absent or malformed → null (normal start). `?date=` will follow suit. */
function debugStart() {
  const raw = new URLSearchParams(location.search).get('start');
  if (!raw) return null;
  const [map, x, y, facing = 'down'] = raw.split(',');
  const start = { map, x: Number(x), y: Number(y), facing };
  const ok = db.mapData.maps[map] && Number.isInteger(start.x) && Number.isInteger(start.y) && ['up', 'down', 'left', 'right'].includes(facing);
  if (!ok) { console.warn(`ignoring bad ?start=${raw}`); return null; }
  return start;
}
const overworld = new OverworldScene({ db, maps: loadMaps(db.mapData), state, tileset: buildTileset(), input, textbox, save, onDebug1: debugBattle });
scenes.push(overworld);

/** TEMP (remove in Task 28): key 1 in the overworld starts a test wild battle. */
function debugBattle() {
  const mk = (id, lv) => makeMonster(db.speciesById[id], lv, db.movesById);
  if (!state.party.length) state.party.push(mk('d061', 8), mk('d013', 6));
  if (!state.party.some(m => m.hp > 0)) healParty(state);
  state.bag['dumpling-ball'] = Math.max(5, state.bag['dumpling-ball'] ?? 0);
  const battle = new Battle({ db, state, kind: 'wild', foeParty: [mk('d002', 4)] });
  overworld.transition = new FlashWipe();
  overworld.transition.start(() => scenes.push(new BattleScene({
    db, state, battle, input, textbox, images: db.images, onEnd: () => { scenes.pop(); },
  })));
}

startLoop({
  tick: dt => { scenes.update(dt); input.endFrame(); },
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
