import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../../src/engine/jingles.js';

const JINGLES = ['encounter', 'battle', 'victory', 'heal', 'levelup', 'badge', 'caught', 'title', 'overworld', 'credits'];
const SFX = ['select', 'bump', 'textTick', 'hpTick', 'ballThrow', 'wobble', 'click', 'pop', 'flee', 'skate', 'sauce'];
const TRACKS = ['lead', 'harmony', 'bass', 'drums'];
const VOICES = ['square', 'pulse25', 'triangle', 'noise'];
const beats = track => track.reduce((sum, [, b]) => sum + b, 0);

test('the named set contains every jingle and sfx id', () => {
  for (const id of [...JINGLES, ...SFX]) assert.ok(SONGS[id], `missing ${id}`);
});

test('every song has a valid shape', () => {
  for (const [id, song] of Object.entries(SONGS)) {
    assert.ok(song.bpm > 0, `${id} bpm`);
    assert.equal(typeof song.loop, 'boolean', `${id} loop`);
    assert.ok(Array.isArray(song.tracks.lead) && song.tracks.lead.length, `${id} needs a lead`);
    for (const [name, track] of Object.entries(song.tracks)) {
      assert.ok(TRACKS.includes(name), `${id}: unknown track ${name}`);
      assert.ok(Array.isArray(track) && track.length > 0, `${id}.${name} empty`);
      for (const note of track) {
        assert.ok(Array.isArray(note) && note.length === 2, `${id}.${name}: bad note ${JSON.stringify(note)}`);
        const [n, b] = note;
        assert.ok(b > 0, `${id}.${name}: beats must be > 0`);
        if (name === 'drums') assert.ok(n === null || ['k', 's', 'h'].includes(n), `${id} drum ${n}`);
        else assert.ok(n === null || (Number.isInteger(n) && n >= 24 && n <= 108), `${id}.${name} midi ${n}`);
      }
    }
    for (const v of Object.values(song.voices ?? {})) assert.ok(VOICES.includes(v), `${id} voice ${v}`);
  }
});

test('loops have equal total beats in every track', () => {
  for (const [id, song] of Object.entries(SONGS)) {
    if (!song.loop) continue;
    const totals = Object.values(song.tracks).map(beats);
    for (const t of totals) assert.ok(Math.abs(t - totals[0]) < 1e-9, `${id}: ${totals}`);
  }
});

test('lengths match the brief', () => {
  const secs = id => Math.max(...Object.values(SONGS[id].tracks).map(beats)) * 60 / SONGS[id].bpm;
  for (const id of ['encounter', 'victory', 'heal', 'levelup', 'badge', 'caught']) assert.ok(secs(id) <= 3, `${id} ${secs(id)}s`);
  assert.ok(Math.abs(secs('heal') - 1) < 0.05);
  assert.ok(Math.abs(secs('levelup') - 0.8) < 0.05);
  assert.deepEqual([SONGS.battle.bpm, beats(SONGS.battle.tracks.lead)], [150, 32]);
  assert.deepEqual([SONGS.title.bpm, beats(SONGS.title.tracks.lead)], [120, 32]);
  assert.deepEqual([SONGS.overworld.bpm, beats(SONGS.overworld.tracks.lead)], [128, 64]);
  assert.deepEqual([SONGS.credits.bpm, beats(SONGS.credits.tracks.lead)], [80, 32]);
  for (const id of ['battle', 'title', 'overworld', 'credits', 'skate']) assert.equal(SONGS[id].loop, true, id);
});

test('heal is the five-note C E G C E arpeggio', () => {
  assert.deepEqual(SONGS.heal.tracks.lead.map(([n]) => n % 12), [0, 4, 7, 0, 4]);
  assert.deepEqual(Object.keys(SONGS.heal.tracks), ['lead']);
});
