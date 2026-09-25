import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, midiToHz, scheduleTrack } from '../../src/engine/audio.js';
import { SONGS } from '../../src/engine/jingles.js';

/** A recording AudioParam: value plus the automation calls made on it. */
class Param {
  constructor(v = 0) { this.value = v; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); }
  linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); }
}
class Node { connect(n) { this.out = n; return n; } }
class Source extends Node {
  start(t = 0) { this.startAt = t; }
  stop(t = 0) { this.stopAt = t; }
}
/** Fake AudioContext recording every node it creates; currentTime is settable. */
class FakeCtx {
  static instances = [];
  constructor() {
    Object.assign(this, { currentTime: 0, sampleRate: 8000, state: 'suspended', destination: new Node(),
      oscillators: [], gains: [], buffers: [], resumed: 0 });
    FakeCtx.instances.push(this);
  }
  resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() {
    const o = Object.assign(new Source(), { type: 'sine', frequency: new Param(440), setPeriodicWave(w) { this.wave = w; } });
    this.oscillators.push(o);
    return o;
  }
  createGain() { const g = Object.assign(new Node(), { gain: new Param(1) }); this.gains.push(g); return g; }
  createBiquadFilter() { return Object.assign(new Node(), { type: 'lowpass', frequency: new Param(350) }); }
  createBufferSource() { const s = new Source(); this.buffers.push(s); return s; }
  createBuffer(ch, len) { const data = new Float32Array(len); return { getChannelData: () => data }; }
  createPeriodicWave(real, imag) { return { real, imag }; }
}
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
};
function fakeTimers() {
  const t = {
    live: new Map(), next: 1,
    setInterval: (fn, ms) => { const id = t.next++; t.live.set(id, { fn, ms }); return id; },
    clearInterval: id => { t.live.delete(id); },
    fire() { for (const { fn } of [...t.live.values()]) fn(); },
  };
  return t;
}
function setup(storage = memStorage()) {
  FakeCtx.instances = [];
  const timers = fakeTimers();
  const audio = createAudio({ AudioContextCtor: FakeCtx, storage, timers });
  return { audio, timers, storage, ctx: () => FakeCtx.instances[0] };
}
const masterOf = ctx => ctx.gains.find(g => g.out === ctx.destination);

test('midiToHz: A4 is 440, an octave up doubles', () => {
  assert.equal(midiToHz(69), 440);
  assert.equal(midiToHz(81), 880);
  assert.ok(Math.abs(midiToHz(60) - 261.6256) < 1e-3);
});

test('scheduleTrack plays non-rest notes at beat-spaced times and returns the end time', () => {
  const played = [];
  const end = scheduleTrack((n, t, d) => played.push([n, t, d]), [[60, 1], [null, 1], [64, 0.5]], 120, 10);
  assert.deepEqual(played, [[60, 10, 0.5], [64, 11, 0.25]]);
  assert.equal(end, 11.25);
});

test('before unlock() every play call is a no-op: no context, no nodes', () => {
  const { audio, timers } = setup();
  audio.playJingle('heal'); audio.playSfx('select'); audio.startMusic('title'); audio.startLoopSfx('skate');
  assert.equal(FakeCtx.instances.length, 0);
  assert.equal(timers.live.size, 0);
});

test('unlock() creates the context once and resumes it when suspended', () => {
  const { audio, ctx } = setup();
  audio.unlock(); audio.unlock();
  assert.equal(FakeCtx.instances.length, 1);
  assert.equal(ctx().state, 'running');
  assert.equal(ctx().resumed, 1);
});

test('playJingle(heal) schedules five ascending oscillators spaced by 60/bpm × beats', () => {
  const { audio, ctx } = setup();
  audio.unlock();
  ctx().currentTime = 2;
  audio.playJingle('heal');
  const oscs = ctx().oscillators;
  assert.equal(oscs.length, 5);
  const f = oscs.map(o => o.frequency.value);
  for (let i = 1; i < 5; i++) assert.ok(f[i] > f[i - 1], `ascending ${f}`);
  const { bpm, tracks: { lead } } = SONGS.heal;
  let t = oscs[0].startAt;
  assert.ok(t >= 2 && t < 2.1);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(oscs[i].startAt - t) < 1e-9, `note ${i} at ${oscs[i].startAt}, want ${t}`);
    t += 60 / bpm * lead[i][1];
  }
});

test('setMuted persists to storage and drives the master gain; a stored mute starts muted', () => {
  const { audio, ctx, storage } = setup();
  audio.unlock();
  assert.equal(masterOf(ctx()).gain.value, 0.15);
  audio.setMuted(true);
  assert.equal(audio.muted, true);
  assert.equal(storage.getItem('tarekmon.muted'), '1');
  assert.equal(masterOf(ctx()).gain.value, 0);
  audio.setMuted(false);
  assert.equal(storage.getItem('tarekmon.muted'), '0');
  assert.equal(masterOf(ctx()).gain.value, 0.15);

  const again = setup(memStorage({ 'tarekmon.muted': '1' }));
  assert.equal(again.audio.muted, true);
  again.audio.unlock();
  assert.equal(masterOf(again.ctx()).gain.value, 0);
});

test('startMusic loops with a 100 ms look-ahead interval; the same name twice is a no-op', () => {
  const { audio, ctx, timers } = setup();
  audio.unlock();
  audio.startMusic('title');
  assert.equal(timers.live.size, 1);
  assert.equal([...timers.live.values()][0].ms, 100);
  const n = ctx().oscillators.length;
  assert.ok(n > 0, 'first notes scheduled right away');
  assert.ok(ctx().oscillators.every(o => o.startAt < 0.4), 'only within the 0.3 s look-ahead');
  audio.startMusic('title');
  assert.equal(timers.live.size, 1);
  assert.equal(ctx().oscillators.length, n);
  // Time moves on: the interval keeps topping up, wrapping seamlessly past the loop end.
  const loopLen = 32 * 60 / SONGS.title.bpm;
  const t0 = ctx().oscillators[0].startAt;
  for (let t = 0; t < loopLen + 1; t += 0.1) { ctx().currentTime = t; timers.fire(); }
  const firstFreq = midiToHz(SONGS.title.tracks.lead[0][0]);
  const restarts = ctx().oscillators.filter(o => o.frequency.value === firstFreq && Math.abs(o.startAt - (t0 + loopLen)) < 1e-6);
  assert.equal(restarts.length, 1, 'the lead restarts exactly one loop length later');
});

test('stopMusic clears the interval, fades the music gain over 150 ms and stops scheduled nodes', () => {
  const { audio, ctx, timers } = setup();
  audio.unlock();
  audio.startMusic('battle');
  ctx().currentTime = 1;
  audio.stopMusic();
  assert.equal(timers.live.size, 0);
  const pending = ctx().oscillators;
  assert.ok(pending.length > 0);
  for (const o of pending) assert.ok(o.stopAt <= 1.15 + 1e-9, `stopped by the end of the fade (${o.stopAt})`);
  const faded = ctx().gains.find(g => g.gain.calls.some(([k, v, t]) => k === 'lin' && v === 0 && Math.abs(t - 1.15) < 1e-9));
  assert.ok(faded, 'a 150 ms fade to 0');
  audio.startMusic('battle'); // no longer current: starts again
  assert.equal(timers.live.size, 1);
});

test('startMusic before unlock is remembered and starts on unlock', () => {
  const { audio, timers } = setup();
  audio.startMusic('overworld');
  assert.equal(timers.live.size, 0);
  audio.unlock();
  assert.equal(timers.live.size, 1);
});

test('a jingle ducks the music to 0.4 and restores it at its end', () => {
  const { audio, ctx } = setup();
  audio.unlock();
  audio.startMusic('overworld');
  const before = [...ctx().gains];
  audio.playJingle('levelup');
  const duck = before.find(g => g.gain.calls.some(([k, v]) => k === 'set' && v === 0.4));
  assert.ok(duck, 'music gain dipped');
  assert.ok(duck.gain.calls.some(([k, v, t]) => k === 'set' && v === 1 && t > 0.5));
});

test('loop sfx: startLoopSfx runs its own interval, stopLoopSfx clears it; music is untouched', () => {
  const { audio, timers } = setup();
  audio.unlock();
  audio.startMusic('overworld');
  audio.startLoopSfx('skate');
  assert.equal(timers.live.size, 2);
  audio.stopLoopSfx();
  assert.equal(timers.live.size, 1);
});

test('drums play noise buffer sources', () => {
  const { audio, ctx } = setup();
  audio.unlock();
  audio.playSfx('bump');
  assert.ok(ctx().buffers.length > 0);
});

test('unknown names are ignored', () => {
  const { audio, ctx, timers } = setup();
  audio.unlock();
  audio.playJingle('nope'); audio.playSfx('nope'); audio.startMusic('nope');
  assert.equal(ctx().oscillators.length, 0);
  assert.equal(timers.live.size, 0);
});
