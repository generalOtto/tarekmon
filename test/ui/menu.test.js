import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Menu } from '../../src/ui/menu.js';

const DIRS = ['up', 'down', 'left', 'right'];
/** Minimal stand-in for engine/input.js's ButtonState, scoped to one call. */
function inputWith({ justPressed, direction }) {
  return { justPressed, direction, pressedDirection() { return this.direction() ?? DIRS.find(b => this.justPressed(b)); } };
}

test('cursor moves, wraps, selects, cancels', () => {
  const m = new Menu(['A', 'B', 'C']);
  assert.equal(m.index, 0); m.move('down'); assert.equal(m.index, 1); m.move('down'); m.move('down'); assert.equal(m.index, 0, 'wraps');
  m.move('up'); assert.equal(m.index, 2, 'wraps up'); assert.equal(m.selected(), 'C');
  const seen = [];
  m.handle(inputWith({ justPressed: b => b === 'a', direction: () => null }), { onSelect: i => seen.push(['sel', i]), onCancel: () => seen.push(['cancel']) });
  m.handle(inputWith({ justPressed: b => b === 'b', direction: () => null }), { onSelect: i => seen.push(['sel', i]), onCancel: () => seen.push(['cancel']) });
  assert.deepEqual(seen, [['sel', 'C'], ['cancel']]);
});
test('handle moves once per press with a repeat delay while held', () => {
  const m = new Menu(['A', 'B', 'C', 'D']); const held = inputWith({ justPressed: b => b === 'down', direction: () => 'down' });
  m.handle(held, {}); assert.equal(m.index, 1);
  const stillHeld = inputWith({ justPressed: () => false, direction: () => 'down' });
  for (let i = 0; i < 11; i++) m.handle(stillHeld, {}); assert.equal(m.index, 1, 'no repeat within the first 12 ticks');
  m.handle(stillHeld, {}); assert.equal(m.index, 2, 'repeats after the delay'); for (let i = 0; i < 5; i++) m.handle(stillHeld, {}); assert.equal(m.index, 3, 'then every 6 ticks');
});
test('items can be updated in place (labels re-rendered)', () => { const m = new Menu(['SOUND ON']); m.items[0] = 'SOUND OFF'; assert.equal(m.selected(), 'SOUND OFF'); });
