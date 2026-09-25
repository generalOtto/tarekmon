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

test('repeated set(true) while already down does not re-fire justPressed after endFrame', () => {
  const b = new ButtonState();
  b.set('a', true);
  b.endFrame();
  b.set('a', true);
  b.endFrame();
  assert.equal(b.justPressed('a'), false);
  assert.equal(b.isDown('a'), true);
});
