import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weatherToday, onRackInteract, shouldAutoSkateOnEnter, onWarpSkate } from '../../src/world/skate.js';
import { rollWeather } from '../../src/engine/rng.js';

const NICE = '2026-01-02', BAD = '2026-01-01'; // fixed dates, checked against rollWeather itself below
const outdoor = { outdoor: true }, indoor = { outdoor: false };
const newState = (flags = {}) => ({ flags });

test('sanity: the fixed dates really are one nice, one bad day', () => {
  assert.equal(rollWeather(NICE), true);
  assert.equal(rollWeather(BAD), false);
});

test('weatherToday wraps rollWeather for a given date', () => {
  assert.equal(weatherToday(NICE), rollWeather(NICE));
  assert.equal(weatherToday(BAD), rollWeather(BAD));
});

test('onRackInteract: not skating + nice weather picks the board up', () => {
  const state = newState();
  const r = onRackInteract(state, false, NICE);
  assert.deepEqual(r, { skating: true, say: 'rack-nice' });
  assert.equal(state.flags.boardOut, true);
});

test('onRackInteract: not skating + bad weather just says so, nothing changes', () => {
  const state = newState();
  const r = onRackInteract(state, false, BAD);
  assert.deepEqual(r, { skating: false, say: 'rack-bad' });
  assert.equal(state.flags.boardOut, undefined);
});

test('onRackInteract: already skating racks it, regardless of weather', () => {
  for (const date of [NICE, BAD]) {
    const state = newState({ boardOut: true });
    const r = onRackInteract(state, true, date);
    assert.deepEqual(r, { skating: false, say: 'rack-park' });
    assert.equal(state.flags.boardOut, false);
  }
});

test('shouldAutoSkateOnEnter: no board out never auto-skates', () => {
  assert.equal(shouldAutoSkateOnEnter(newState(), outdoor), false);
  assert.equal(shouldAutoSkateOnEnter(newState(), indoor), false);
});

test('shouldAutoSkateOnEnter: board out + outdoor map rides again and clears boardParked', () => {
  const state = newState({ boardOut: true, boardParked: true });
  assert.equal(shouldAutoSkateOnEnter(state, outdoor), true);
  assert.equal(state.flags.boardParked, false);
});

test('shouldAutoSkateOnEnter: board out + indoor map stays parked', () => {
  const state = newState({ boardOut: true });
  assert.equal(shouldAutoSkateOnEnter(state, indoor), false);
  assert.equal(state.flags.boardParked, true);
});

test('onWarpSkate: outdoor -> indoor while skating parks the board', () => {
  const state = newState({ boardOut: true });
  const r = onWarpSkate(state, outdoor, indoor);
  assert.deepEqual(r, { skating: false });
  assert.equal(state.flags.boardParked, true);
});

test('onWarpSkate: outdoor -> indoor with no board out is a no-op', () => {
  const state = newState();
  const r = onWarpSkate(state, outdoor, indoor);
  assert.deepEqual(r, { skating: false });
  assert.equal(state.flags.boardParked, undefined);
});

test('onWarpSkate: indoor -> outdoor with the board parked restores it and says rack-back', () => {
  const state = newState({ boardOut: true, boardParked: true });
  const r = onWarpSkate(state, indoor, outdoor);
  assert.deepEqual(r, { skating: true, say: 'rack-back' });
  assert.equal(state.flags.boardParked, false);
});

test('onWarpSkate: indoor -> outdoor with nothing parked stays boardless', () => {
  const state = newState();
  const r = onWarpSkate(state, indoor, outdoor);
  assert.deepEqual(r, { skating: false });
});

test('onWarpSkate: indoor -> indoor stays parked, never skates', () => {
  const state = newState({ boardOut: true, boardParked: true });
  const r = onWarpSkate(state, indoor, indoor);
  assert.deepEqual(r, { skating: false });
  assert.equal(state.flags.boardParked, true, 'still parked, untouched');
});

test('onWarpSkate: outdoor -> outdoor keeps skating going', () => {
  const state = newState({ boardOut: true });
  const r = onWarpSkate(state, outdoor, outdoor);
  assert.deepEqual(r, { skating: true });
});

test('onWarpSkate: outdoor -> outdoor with no board stays boardless', () => {
  const state = newState();
  const r = onWarpSkate(state, outdoor, outdoor);
  assert.deepEqual(r, { skating: false });
});
