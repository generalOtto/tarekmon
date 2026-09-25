import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OverworldScene } from '../../src/world/overworld.js';
import { loadMaps } from '../../src/world/map.js';
import { newGameState } from '../../src/engine/state.js';
import mapData from '../../data/map.json' with { type: 'json' };

/** Headless scene with stub input/textbox/save/tileset; `ctl.dir` drives the held direction. */
function headless(start = mapData.start) {
  const ctl = { dir: null, calls: [] };
  const state = newGameState('T', start);
  const scene = new OverworldScene({
    db: {}, maps: loadMaps(mapData), state, tileset: { draw() {} },
    input: { direction: () => ctl.dir, justPressed: () => false, isDown: () => false },
    textbox: { open: false, update() {}, draw() {} },
    save: { autosave: s => ctl.calls.push(structuredClone(s.pos)) },
  });
  scene.enter();
  return { scene, state, ctl };
}

test('walking onto the lab mat warps to town once, ignoring input during the fade', () => {
  const { scene, state, ctl } = headless();
  const lab = loadMaps(mapData).lab;
  const matY = mapData.start.y + 1;
  const warp = lab.warps.find(w => w.x === mapData.start.x && w.y === matY);
  assert.ok(warp, 'the mat is one tile south of start');

  ctl.dir = 'down';
  for (let i = 0; i < 120 && state.pos.y !== matY; i++) scene.update(1 / 60);
  assert.equal(state.pos.y, matY, 'reached the mat');
  assert.equal(scene.fader.active, true, 'arriving on the mat starts the fade');

  // Hold a direction that is walkable both on the lab mat row and beside the town door:
  // if input leaked through during the fade the player would start a step.
  for (let i = 0; i < 30; i++) {
    const fading = scene.fader.active;
    ctl.dir = fading ? 'right' : null;
    scene.update(1 / 60);
    if (fading) assert.equal(scene.player.moving, false, `tick ${i}: moved during the fade`);
  }
  assert.equal(scene.fader.active, false);
  assert.equal(state.pos.map, 'town');
  assert.deepEqual(state.pos, { map: warp.to, x: warp.tx, y: warp.ty, facing: warp.facing });
  assert.equal(ctl.calls.length, 1, 'autosaved exactly once');
  assert.deepEqual(ctl.calls[0], state.pos);
});
