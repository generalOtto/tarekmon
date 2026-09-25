import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../../src/battle/battle.js';
import { makeMonster } from '../../src/battle/monster.js';
import { newGameState } from '../../src/engine/state.js';
import types from '../../data/types.json' with { type: 'json' };
import items from '../../data/items.json' with { type: 'json' };

const movesById = {
  hit: { id: 'hit', name: 'HIT', type: 'Fried', power: 50, accuracy: 100, pp: 10, effect: { kind: 'none' }, text: '{user} hits.' },
  skip: { id: 'skip', name: 'SKIP', type: 'Imported', power: 0, accuracy: 100, pp: 5, effect: { kind: 'skip' }, text: '{foe} waits.' },
  exhale: { id: 'exhale', name: 'EXHALE', type: 'Fried', power: 120, accuracy: 100, pp: 5, effect: { kind: 'accDown', stages: 1 }, text: '{user} exhales.' },
  big: { id: 'big', name: 'BIG', type: 'Fried', power: 120, accuracy: 100, pp: 5, effect: { kind: 'none' }, text: '{user} bigs.' },
};
const speciesById = {
  pA: { id: 'pA', name: 'PLAYERMON', type: 'Fried', base: { hp: 60, atk: 70, def: 50, spd: 80 }, xpYield: 60, catchRate: 190, moves: [{ level: 1, id: 'hit' }, { level: 1, id: 'skip' }], who: 'tarek' },
  fW: { id: 'fW', name: 'WILDY', type: 'Steamed', base: { hp: 40, atk: 40, def: 40, spd: 30 }, xpYield: 60, catchRate: 190, moves: [{ level: 1, id: 'hit' }], who: 'otto' },
  fK: { id: 'fK', name: 'SKIPPER', type: 'Steamed', base: { hp: 60, atk: 40, def: 60, spd: 10 }, xpYield: 60, catchRate: 190, moves: [{ level: 1, id: 'skip' }], who: 'otto' },
  fS: { id: 'fS', name: 'SUHAIBRO', type: 'Imported', base: { hp: 60, atk: 60, def: 80, spd: 20 }, xpYield: 100, catchRate: 45, moves: [{ level: 1, id: 'hit' }], who: 'suhaib' },
};
const db = { types, movesById, speciesById, itemsById: Object.fromEntries(items.map(i => [i.id, i])) };

const mon = (sp, level) => makeMonster(speciesById[sp], level, movesById, () => 0.5);
// Constant rngs (per-draw bookkeeping is fragile, so tests assert outcomes):
//   0.9 → hits land, no crits, high damage roll, AI best move, Suhaib stays, run fails.
//   0.1 → hits land, no crits at these speeds, AI random pick, Suhaib flees.
//   0.0 → catches and runs succeed.
const high = () => 0.9, low = () => 0.1, zero = () => 0.0;

function setup({ party, foes, kind = 'wild', trainer, rng = high }) {
  const state = newGameState();
  state.party.push(...party);
  const b = new Battle({ db, state, rng, kind, foeParty: foes, trainer });
  return { b, state };
}
const texts = evs => evs.filter(e => e.type === 'text').map(e => e.text);
const kinds = evs => evs.map(e => e.type);

test('wild battle: a big hit KOs the foe, grants xp and ends in a win', () => {
  const p = mon('pA', 15); p.moves.push({ id: 'big', pp: 5, maxPp: 5 });
  const xp0 = p.xp;
  const { b, state } = setup({ party: [p], foes: [mon('fW', 3)] });
  assert.equal(b.phase, 'choose');
  assert.deepEqual(state.dex.seen, ['fW']);
  b.chooseMove(2); // player spd 29 > foe spd 6 → player first; draws: AI decision, hit check, crit, damage roll
  const ev = b.drain();
  const t = texts(ev);
  assert.equal(t[0], 'A WILD WILDY APPEARED!');
  assert.equal(t[1], 'GO! PLAYERMON!');
  assert.ok(t.includes('PLAYERMON USED BIG!'));
  assert.ok(t.includes('PLAYERMON BIGS.'));
  assert.ok(t.includes('WILD WILDY FAINTED!'));
  assert.ok(ev.some(e => e.type === 'hp' && e.side === 'foe' && e.to === 0));
  assert.ok(ev.some(e => e.type === 'faint' && e.side === 'foe'));
  const xpEv = ev.find(e => e.type === 'xp');
  assert.equal(xpEv.side, 'player');
  assert.equal(xpEv.amount, 25); // floor(60 * 3 / 7)
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'win' });
  assert.equal(p.xp, xp0 + 25);
  assert.equal(b.phase, 'over'); assert.equal(b.result, 'win');
  assert.equal(p.moves[2].pp, 4);
  assert.deepEqual(b.drain(), []);
});

test('wild Suhaib flees after the exchange when the roll is under 0.5', () => {
  // Player L10, not L5: at L5 the L20 foe KOs the player in one hit, so the flee check never runs.
  const { b } = setup({ party: [mon('pA', 10)], foes: [mon('fS', 20)], rng: low });
  b.chooseMove(0);
  const ev = b.drain();
  assert.ok(b.foe.hp > 0 && b.player.hp > 0);
  assert.ok(texts(ev).includes('...SUHAIB LEFT.\nHE HAS A LONG DRIVE HOME.'));
  assert.deepEqual(kinds(ev).slice(-2), ['flee', 'end']);
  assert.equal(ev.at(-1).result, 'fled');
  assert.equal(b.result, 'fled');
});

test('catching: success joins the party, full party goes to the fridge, trainers block', () => {
  let { b, state } = setup({ party: [mon('pA', 5)], foes: [mon('fW', 3)], rng: zero });
  b.drain();
  b.useItem('dumpling-ball');
  let ev = b.drain();
  assert.deepEqual(ev.find(e => e.type === 'ball'), { type: 'ball', wobbles: 3, success: true });
  assert.ok(texts(ev).includes('TAREK THREW A DUMPLINGBALL!'));
  assert.ok(texts(ev).includes('GOTCHA! WILDY WAS CAUGHT!'));
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'caught' });
  assert.equal(state.party.length, 2);
  assert.ok(state.dex.caught.includes('fW'));
  assert.equal(state.bag['dumpling-ball'], 4);

  const six = [1, 2, 3, 4, 5, 6].map(() => mon('pA', 5));
  ({ b, state } = setup({ party: six, foes: [mon('fW', 3)], rng: zero }));
  b.useItem('dumpling-ball');
  ev = b.drain();
  assert.equal(state.party.length, 6);
  assert.equal(state.fridge.length, 1);
  assert.ok(texts(ev).includes('WILDY WAS SENT TO THE FRIDGE.'));

  ({ b, state } = setup({ party: [mon('pA', 5)], foes: [mon('fW', 3)], kind: 'trainer', trainer: { id: 't', name: 'T' }, rng: zero }));
  b.drain();
  b.useItem('dumpling-ball');
  ev = b.drain();
  assert.deepEqual(texts(ev), ["THE TRAINER BLOCKED THE BALL!\nDON'T BE WEIRD."]);
  assert.equal(state.bag['dumpling-ball'], 5);
  assert.equal(b.phase, 'choose');
});

test('run: impossible against trainers, succeeds in the wild on a low roll', () => {
  let { b } = setup({ party: [mon('pA', 5)], foes: [mon('fW', 3)], kind: 'trainer', trainer: { id: 't', name: 'T' } });
  b.drain();
  b.run();
  let ev = b.drain();
  assert.deepEqual(texts(ev), ["NO! THERE'S NO RUNNING FROM A TRAINER BATTLE!"]);
  assert.ok(!ev.some(e => e.type === 'end'));
  assert.equal(b.phase, 'choose');

  ({ b } = setup({ party: [mon('pA', 5)], foes: [mon('fW', 3)], rng: zero }));
  b.drain();
  b.run();
  ev = b.drain();
  assert.deepEqual(texts(ev), ['GOT AWAY SAFELY!']);
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'ran' });
});

test('player faint: forced switch when someone is left, otherwise a loss', () => {
  const lead = mon('pA', 5); lead.hp = 1;
  const { b } = setup({ party: [lead, mon('pA', 5)], foes: [mon('fW', 20)] });
  b.chooseMove(0); // player faster; the L20 foe survives and hits back for more than 1
  let ev = b.drain();
  assert.ok(texts(ev).includes('PLAYERMON FAINTED!'));
  assert.ok(ev.some(e => e.type === 'faint' && e.side === 'player'));
  assert.equal(b.phase, 'mustSwitch');
  b.chooseMove(0);
  assert.deepEqual(texts(b.drain()), ['CHOOSE A DUMPLING!']);
  b.switchTo(1);
  ev = b.drain();
  assert.deepEqual(texts(ev), ['GO! PLAYERMON!']); // no COME BACK for a fainted lead
  assert.deepEqual(ev.find(e => e.type === 'switch'), { type: 'switch', side: 'player', index: 1 });
  assert.ok(!ev.some(e => e.type === 'hp')); // forced switch: the foe does not act
  assert.equal(b.phase, 'choose');
  assert.equal(b.playerIndex, 1);

  const solo = mon('pA', 5); solo.hp = 1;
  const dead = mon('pA', 5); dead.hp = 0;
  const r = setup({ party: [solo, dead], foes: [mon('fW', 20)] });
  r.b.chooseMove(0);
  ev = r.b.drain();
  assert.ok(texts(ev).includes('TAREK IS OUT OF USABLE DUMPLINGS!'));
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'lose' });
});

test('trainer with two monsters: sends out the next, then pays out on the win', () => {
  const p = mon('pA', 15); p.moves.push({ id: 'big', pp: 5, maxPp: 5 });
  const { b, state } = setup({ party: [p], foes: [mon('fW', 3), mon('fW', 4)], kind: 'trainer', trainer: { id: 't', name: 'T' } });
  let ev = b.drain();
  assert.deepEqual(texts(ev), ['T WANTS TO BATTLE!', 'T SENT OUT WILDY!', 'GO! PLAYERMON!']);
  b.chooseMove(2);
  ev = b.drain();
  assert.ok(texts(ev).includes('WILDY FAINTED!')); // no WILD prefix in trainer battles
  assert.ok(texts(ev).includes('T SENT OUT WILDY!'));
  assert.deepEqual(ev.find(e => e.type === 'switch'), { type: 'switch', side: 'foe', index: 1 });
  assert.equal(ev.find(e => e.type === 'xp').amount, 37); // floor(floor(60*3/7) * 1.5)
  assert.equal(b.phase, 'choose');
  b.chooseMove(2);
  ev = b.drain();
  assert.deepEqual(ev.find(e => e.type === 'money'), { type: 'money', amount: 80, total: 580 });
  assert.equal(state.money, 580);
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'win' });
});

test('skip effect: the target loses its next action', () => {
  const { b } = setup({ party: [mon('pA', 10)], foes: [mon('fW', 20)] });
  b.drain();
  b.chooseMove(1); // player (spd 21) before foe (spd 17): the skip lands before the foe acts this very turn
  let ev = b.drain();
  const t = texts(ev);
  assert.ok(t.includes('PLAYERMON USED SKIP!'));
  assert.ok(t.includes('WILD WILDY WAITS.'));
  assert.ok(t.includes('WILD WILDY IS STUCK IN LINE!'));
  assert.equal(t.at(-1), 'WILD WILDY IS HELD AT THE BORDER!');
  assert.ok(!ev.some(e => e.type === 'hp'));
  assert.equal(b.foe.skipNext, false);
  b.chooseMove(0); // the turn after, the foe (46 hp, survives the hit) acts normally again
  ev = b.drain();
  assert.ok(ev.some(e => e.type === 'hp' && e.side === 'player'));
});

test('no PP: refuses the move without a turn, Struggle hits and recoils', () => {
  const p = mon('pA', 10); p.moves.forEach(m => { m.pp = 0; });
  const { b } = setup({ party: [p], foes: [mon('fW', 10)] });
  b.drain();
  b.chooseMove(0);
  assert.deepEqual(b.drain(), [{ type: 'text', text: 'NO PP LEFT FOR THAT MOVE!' }]);
  assert.equal(b.phase, 'choose');
  const foeHp = b.foe.hp;
  b.chooseMove('struggle');
  const ev = b.drain();
  assert.ok(texts(ev).includes('PLAYERMON USED STRUGGLE!'));
  assert.ok(b.foe.hp < foeHp);
  assert.ok(texts(ev).includes('PLAYERMON IS HURT BY THE FLAILING!'));
  const dealt = foeHp - b.foe.hp;
  const recoil = ev.find(e => e.type === 'hp' && e.side === 'player');
  assert.equal(recoil.from - recoil.to, Math.ceil(dealt / 4));
});

test('champion speech plays after the configured number of faints, before the next switch-in', () => {
  const p = mon('pA', 15); p.moves.push({ id: 'big', pp: 5, maxPp: 5 });
  const trainer = { id: 'suhaib', name: 'SUHAIB', isChampion: true, speechAfterFaints: 1, speech: 'THREE HOURS. EACH WAY.' };
  const { b } = setup({ party: [p], foes: [mon('fW', 3), mon('fW', 3)], kind: 'trainer', trainer });
  b.drain();
  b.chooseMove(2);
  const ev = b.drain();
  const si = ev.findIndex(e => e.type === 'speech'), wi = ev.findIndex(e => e.type === 'switch');
  assert.deepEqual(ev[si], { type: 'speech', text: 'THREE HOURS. EACH WAY.' });
  assert.ok(si >= 0 && si < wi);
});

test('every method is a no-op once the battle is over', () => {
  const { b } = setup({ party: [mon('pA', 5)], foes: [mon('fW', 3)], rng: zero });
  b.run();
  b.drain();
  assert.equal(b.phase, 'over');
  b.chooseMove(0); b.useItem('wet-wipe'); b.switchTo(0); b.run();
  assert.deepEqual(b.drain(), []);
});

test('mutual KO on Struggle recoil against the last foe is a win with no xp', () => {
  const p = mon('pA', 10); p.hp = 1; p.moves.forEach(m => { m.pp = 0; });
  const f = mon('fW', 10); f.hp = 1;
  const { b } = setup({ party: [p], foes: [f] });
  b.drain();
  b.chooseMove('struggle'); // player faster: deals 1, recoil ceil(1/4) = 1 → both at 0
  const ev = b.drain();
  assert.equal(p.hp, 0); assert.equal(f.hp, 0);
  assert.ok(!ev.some(e => e.type === 'xp'));
  assert.deepEqual(ev.at(-1), { type: 'end', result: 'win' });
  assert.equal(b.result, 'win');
});

test('voluntary switch: COME BACK, switch event, then the foe acts', () => {
  const { b } = setup({ party: [mon('pA', 5), mon('pA', 5)], foes: [mon('fW', 3)] });
  b.drain();
  b.switchTo(1);
  const ev = b.drain();
  const t = texts(ev);
  assert.deepEqual(t.slice(0, 2), ['PLAYERMON, COME BACK!', 'GO! PLAYERMON!']);
  assert.ok(t.includes('WILD WILDY USED HIT!'));
  assert.deepEqual(ev.find(e => e.type === 'switch'), { type: 'switch', side: 'player', index: 1 });
  const sw = ev.findIndex(e => e.type === 'switch');
  assert.ok(ev.slice(sw).some(e => e.type === 'hp' && e.side === 'player'));
  assert.equal(b.player, b.state.party[1]);
});

test('heal item: hp event for the active monster, text only for a benched one', () => {
  const a = mon('pA', 10), c = mon('pA', 10); a.hp = 5; c.hp = 5;
  const { b, state } = setup({ party: [a, c], foes: [mon('fW', 3)] });
  b.drain();
  b.useItem('wet-wipe');
  let ev = b.drain();
  assert.deepEqual(ev[0], { type: 'hp', side: 'player', from: 5, to: 32, max: 32 });
  assert.equal(texts(ev)[0], 'PLAYERMON RECOVERED 27 HP!');
  assert.equal(state.bag['wet-wipe'], 1);
  b.useItem('wet-wipe', 1);
  ev = b.drain();
  const r = ev.findIndex(e => e.type === 'text' && e.text === 'PLAYERMON RECOVERED 27 HP!');
  assert.ok(r >= 0);
  assert.ok(!ev.slice(0, r + 1).some(e => e.type === 'hp'));
  assert.equal(c.hp, 32);
  assert.equal(state.bag['wet-wipe'], 0);
});

test('atkUp item: stat event, then the foe acts', () => {
  const { b, state } = setup({ party: [mon('pA', 10)], foes: [mon('fW', 3)] });
  state.bag['extra-sauce'] = 1;
  b.drain();
  b.useItem('extra-sauce');
  const ev = b.drain();
  assert.equal(texts(ev)[0], "PLAYERMON'S ATTACK ROSE!");
  assert.deepEqual(ev.find(e => e.type === 'stat'), { type: 'stat', side: 'player', stat: 'atk', stages: 1 });
  assert.ok(texts(ev).includes('WILD WILDY USED HIT!'));
  assert.equal(state.bag['extra-sauce'], 0);
});

test('a KO with an accDown move skips the accuracy drop', () => {
  const p = mon('pA', 15); p.moves.push({ id: 'exhale', pp: 5, maxPp: 5 });
  const { b } = setup({ party: [p], foes: [mon('fW', 3)] });
  b.drain();
  b.chooseMove(2);
  const ev = b.drain();
  assert.ok(texts(ev).includes('WILD WILDY FAINTED!'));
  assert.ok(!texts(ev).some(x => x.includes('ACCURACY FELL')));
  assert.ok(!ev.some(e => e.type === 'stat'));
});

test('level-up: xp event reports the new level, then levelup, then the hp bar update', () => {
  const p = mon('pA', 5); p.moves.push({ id: 'big', pp: 5, maxPp: 5 });
  p.xp = 215; // one short of L6 (6^3 = 216); the L3 WILDY gives 25
  const { b } = setup({ party: [p], foes: [mon('fW', 3)] });
  b.drain();
  b.chooseMove(2);
  const ev = b.drain();
  const xi = ev.findIndex(e => e.type === 'xp'), x = ev[xi];
  assert.equal(x.level, 6); assert.equal(p.level, 6);
  assert.equal(x.xp, 240);
  assert.ok(x.xp <= x.xpForNext && x.xp >= x.xpForLevel);
  assert.deepEqual([x.xpForLevel, x.xpForNext], [216, 343]);
  assert.equal(ev[xi + 1].type, 'levelup'); assert.equal(ev[xi + 1].side, 'player');
  assert.deepEqual(ev[xi + 2], { type: 'hp', side: 'player', from: 21, to: p.hp, max: p.maxHp });
  assert.equal(p.maxHp, 23);
});

test('a held player loses an item turn too: HELD once, item kept, foe still acts', () => {
  const p = mon('pA', 10); p.hp = 10;
  const { b, state } = setup({ party: [p], foes: [mon('fK', 10)] });
  b.drain();
  b.chooseMove(0); // player first (spd 21 > 7); the slower SKIPPER then holds the player for next turn
  b.drain();
  assert.equal(p.skipNext, true);
  b.useItem('wet-wipe');
  const ev = b.drain();
  const t = texts(ev);
  assert.equal(t.filter(x => x === 'PLAYERMON IS HELD AT THE BORDER!').length, 1);
  assert.equal(t[0], 'PLAYERMON IS HELD AT THE BORDER!');
  assert.ok(t.includes('WILD SKIPPER USED SKIP!'));
  assert.ok(!t.some(x => x.includes('RECOVERED')));
  assert.equal(state.bag['wet-wipe'], 2);
});

test('a wild battle must have exactly one foe', () => {
  assert.throws(() => setup({ party: [mon('pA', 5)], foes: [mon('fW', 3), mon('fW', 3)] }), /exactly one foe/);
});
