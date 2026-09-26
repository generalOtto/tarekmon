import { loadDb } from './data/load.js';
import { createScreen } from './engine/canvas.js';
import { SceneStack, startLoop } from './engine/loop.js';
import { ButtonState, attachInput } from './engine/input.js';
import { createSave } from './engine/save.js';
import { createAudio } from './engine/audio.js';
import { newGameState, markCaught } from './engine/state.js';
import { TextBox } from './ui/textbox.js';
import { Menu } from './ui/menu.js';
import { TitleScene } from './ui/title.js';
import { IntroScene } from './ui/intro.js';
import { buildTileset } from './world/tileset.js';
import { loadMaps } from './world/map.js';
import { OverworldScene } from './world/overworld.js';
import { Battle } from './battle/battle.js';
import { BattleScene } from './battle/battlescene.js';
import { makeMonster } from './battle/monster.js';

const db = await loadDb();

const screen = createScreen(document.getElementById('screen'));
const scenes = new SceneStack();
const input = new ButtonState();
const audio = createAudio({ onMuteChange: () => showMute() });
// Browsers only let audio start inside a user activation (keydown, mouse down, or a touch's pointerup),
// so the first input unlocks it, and later activating events retry until the context really runs.
const unlockAudio = () => { if (navigator.userActivation?.isActive !== false) audio.unlock(); };
attachInput(document.body, input, { onAnyPress: unlockAudio });
for (const type of ['keydown', 'pointerup', 'touchend']) window.addEventListener(type, unlockAudio, { capture: true });
Menu.audio = audio; // every menu blips on cursor moves and A
const muteBtn = document.getElementById('mute');
function showMute() { if (muteBtn) muteBtn.textContent = audio.muted ? '🔇' : '🔊'; }
muteBtn?.addEventListener('click', () => audio.setMuted(!audio.muted)); // same toggle as the Start menu's SOUND
showMute();
const save = createSave(localStorage);
const textbox = new TextBox({ audio });

// The live game: `state` and `overworld` are replaced when a game starts (new, continue, load
// code); startBattle and the overworld's callbacks always read the current ones.
let state = null;
let overworld = null;

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
/** Build a Battle and push its scene; on end, pop back to the overworld with the battle's context. */
function startBattle({ kind, foeParty, trainer = null }) {
  scenes.push(new BattleScene({
    db, state, battle: new Battle({ db, state, kind, foeParty, trainer }), input, textbox, images: db.images, audio,
    onEnd: result => { scenes.pop(); overworld.onBattleEnd(result, { kind, trainer }); },
  }));
}
/** Make `s` the live game and show it in the overworld (replacing the title/intro, if any). */
function startOverworld(s) {
  state = s;
  overworld = new OverworldScene({
    db, maps: loadMaps(structuredClone(db.mapData)), state, tileset: buildTileset(), input, textbox, save, audio,
    onBattle: startBattle,
    onChampion: () => {}, // TODO Task 37: roll the credits
  });
  if (scenes.top) scenes.replace(overworld); else scenes.push(overworld);
}

const devStart = debugStart();
if (devStart) {
  // DEV: ?start= skips title/intro — a fresh game at that tile with Tarek's starter at L8.
  const s = newGameState('TAREK', devStart);
  s.party.push(makeMonster(db.speciesById['d061'], 8, db.movesById));
  markCaught(s, 'd061');
  Object.assign(s.flags, { starterPicked: true, starterId: 'd061' });
  startOverworld(s);
} else {
  scenes.push(new TitleScene({
    db, save, textbox, input, audio,
    onNewGame: () => {
      const s = newGameState('TAREK', db.mapData.start);
      scenes.replace(new IntroScene({
        db, textbox, input, audio, playerName: s.playerName,
        onDone: name => { s.playerName = name; save.save(s); startOverworld(s); },
      }));
    },
    onContinue: saved => startOverworld(saved),
    onLoadCode: saved => startOverworld(saved),
  }));
}

startLoop({
  tick: dt => { scenes.update(dt); input.endFrame(); },
  render: () => { screen.clear('#9bbc0f'); scenes.draw(screen.ctx); },
});
