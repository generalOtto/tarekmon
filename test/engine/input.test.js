import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ButtonState } from '../../src/engine/input.js';

test('justPressed fires once per press; isDown persists; endFrame clears edges', () => {
  const b = new ButtonState();
  b.set('a', true); assert.equal(b.justPressed('a'), true); assert.equal(b.isDown('a'), true);
  b.endFrame(); assert.equal(b.justPressed('a'), false); assert.equal(b.isDown('a'), true);
  b.set('a', false); b.endFrame(); assert.equal(b.isDown('a'), false);
});

test('direction returns the most recently pressed held direction', () => {
  const b = new ButtonState();
  b.set('left', true); b.set('up', true); assert.equal(b.direction(), 'up');
  b.set('up', false); assert.equal(b.direction(), 'left');
  b.set('left', false); assert.equal(b.direction(), null);
});

test('pressedDirection prefers the held direction, falling back to a tap released before this tick', () => {
  const b = new ButtonState();
  b.set('down', true);
  assert.equal(b.pressedDirection(), 'down', 'held direction wins');
  b.set('down', false); // released before the next tick reads input, but still justPressed this tick
  assert.equal(b.pressedDirection(), 'down', 'falls back to the justPressed edge');
  b.endFrame();
  assert.equal(b.pressedDirection(), null, 'nothing held, nothing just pressed');
});

test('repeated set(true) while already down does not re-fire justPressed after endFrame', () => {
  const b = new ButtonState();
  b.set('a', true);
  b.endFrame();
  b.set('a', true);
  b.endFrame();
  assert.equal(b.justPressed('a'), false);
  assert.equal(b.isDown('a'), true);
});
