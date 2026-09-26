import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, dateSeed, todayString, rollWeather, randInt, chance, pickWeighted } from '../../src/engine/rng.js';

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const xs = Array.from({ length: 5 }, () => a());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b()));
  for (const x of xs) assert.ok(x >= 0 && x < 1);
});
test('dateSeed is stable per calendar day', () => {
  assert.equal(dateSeed('2026-09-25'), dateSeed('2026-09-25'));
  assert.notEqual(dateSeed('2026-09-25'), dateSeed('2026-09-26'));
});
test('todayString formats a Date as YYYY-MM-DD', () => {
  assert.equal(todayString(new Date(2026, 8, 5)), '2026-09-05');
});
test('rollWeather is nice about 60% of days', () => {
  let nice = 0; for (let d = 1; d <= 300; d++) if (rollWeather(`2026-${String(1 + d % 12).padStart(2, '0')}-${String(1 + d % 28).padStart(2, '0')}-${d}`)) nice++;
  assert.ok(nice > 150 && nice < 210, `nice=${nice}`);
});
test('randInt inclusive bounds; pickWeighted respects weights', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) { const v = randInt(rng, 2, 5); assert.ok(v >= 2 && v <= 5); }
  const picks = { a: 0, b: 0 };
  for (let i = 0; i < 1000; i++) picks[pickWeighted(rng, [{ v: 'a', weight: 9 }, { v: 'b', weight: 1 }]).v]++;
  assert.ok(picks.a > 800 && picks.b > 40);
});
test('chance uses rng draw against probability threshold', () => {
  const rng = () => 0.3;
  assert.equal(chance(rng, 0.5), true);
  assert.equal(chance(rng, 0.2), false);
});
test('todayString honors a ?date=YYYY-MM-DD override, and ignores malformed values', () => {
  const had = 'location' in globalThis, restore = globalThis.location;
  try {
    globalThis.location = { search: '?date=2026-01-05' };
    assert.equal(todayString(), '2026-01-05');
    assert.equal(todayString(new Date(2026, 8, 5)), '2026-01-05', 'the override wins over an explicit date too');
    globalThis.location = { search: '?date=not-a-date' };
    assert.equal(todayString(new Date(2026, 8, 5)), '2026-09-05', 'malformed value ignored, falls back to the given date');
    globalThis.location = { search: '' };
    assert.equal(todayString(new Date(2026, 8, 5)), '2026-09-05', 'no date param at all');
  } finally {
    if (had) globalThis.location = restore; else delete globalThis.location;
  }
});
