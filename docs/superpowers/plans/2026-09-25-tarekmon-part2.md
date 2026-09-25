# TarekMon Implementation Plan — Part 2 (Stages 3–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

This file continues `2026-09-25-tarekmon.md` (read its header, conventions and file structure first). Task numbering continues from Task 19.

---

# Stage 3 — Battle

### Task 20: Stats, XP curve, stat stages

**Files:**
- Create: `src/battle/stats.js`
- Test: `test/battle/stats.test.js`

- [ ] **Step 1: Failing test**

```js
// test/battle/stats.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, xpForLevel, levelForXp, xpGain, stageMult, accMult, MAX_LEVEL } from '../../src/battle/stats.js';

test('Gen 1 style stats without IVs/EVs', () => {
  const s = computeStats({ base: { hp: 45, atk: 49, def: 49, spd: 45 } }, 5);
  assert.deepEqual(s, { hp: 19, atk: 9, def: 9, spd: 9 }); // floor(90*5/100)+5+10=19 ; floor(98*5/100)+5=9
  assert.deepEqual(computeStats({ base: { hp: 100, atk: 100, def: 100, spd: 100 } }, 50), { hp: 160, atk: 105, def: 105, spd: 105 });
});
test('medium-fast curve: xp = level^3, levelForXp inverts and caps at 50', () => {
  assert.equal(xpForLevel(1), 1); assert.equal(xpForLevel(10), 1000);
  assert.equal(levelForXp(999), 9); assert.equal(levelForXp(1000), 10); assert.equal(levelForXp(1e9), MAX_LEVEL);
});
test('xp gain: yield*level/7, x1.5 for trainers, floored', () => {
  assert.equal(xpGain({ xpYield: 64 }, 7, false), 64); assert.equal(xpGain({ xpYield: 64 }, 7, true), 96);
  assert.equal(xpGain({ xpYield: 60 }, 3, false), 25);
});
test('stage multipliers', () => {
  assert.equal(stageMult(0), 1); assert.equal(stageMult(1), 1.5); assert.equal(stageMult(3), 2.5); assert.equal(stageMult(-1), 2 / 3); assert.equal(stageMult(-3), 0.4);
  assert.equal(accMult(0), 1); assert.equal(accMult(-1), 0.75); assert.equal(accMult(-3), 0.75 ** 3);
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**

```js
// src/battle/stats.js
export const MAX_LEVEL = 50;
export const clampStage = s => Math.max(-3, Math.min(3, s));
export function computeStats(species, level) {
  const b = species.base, st = k => Math.floor(b[k] * 2 * level / 100) + 5;
  return { hp: Math.floor(b.hp * 2 * level / 100) + level + 10, atk: st('atk'), def: st('def'), spd: st('spd') };
}
export const xpForLevel = level => level ** 3;
export function levelForXp(xp) { let l = 1; while (l < MAX_LEVEL && xpForLevel(l + 1) <= xp) l++; return l; }
export function xpGain(species, foeLevel, isTrainer) { const base = Math.floor(species.xpYield * foeLevel / 7); return isTrainer ? Math.floor(base * 1.5) : base; }
export function stageMult(stage) { stage = clampStage(stage); return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage); }
export function accMult(stage) { stage = clampStage(stage); return stage >= 0 ? 1 : 0.75 ** -stage; }
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `feat: stats, xp curve, stat stages`.

### Task 21: Monster instances

**Files:**
- Create: `src/battle/monster.js`
- Test: `test/battle/monster.test.js`

- [ ] **Step 1: Failing test**

```js
// test/battle/monster.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMonster, movesLearnedAt, resetBattleState, addXp } from '../../src/battle/monster.js';
import { mulberry32 } from '../../src/engine/rng.js';

const species = { id: 'dX', name: 'TESTY', type: 'Fried', base: { hp: 50, atk: 60, def: 50, spd: 60 }, xpYield: 60,
  moves: [{ level: 1, id: 'm1' }, { level: 1, id: 'm2' }, { level: 8, id: 'm3' }, { level: 15, id: 'm4' }] };
const moves = { m1: { id: 'm1', pp: 20 }, m2: { id: 'm2', pp: 30 }, m3: { id: 'm3', pp: 10 }, m4: { id: 'm4', pp: 15 } };

test('makeMonster at level 5 knows only level-1 moves, full hp, xp = 125', () => {
  const m = makeMonster(species, 5, moves, mulberry32(1));
  assert.deepEqual(m.moves.map(x => x.id), ['m1', 'm2']); assert.equal(m.moves[0].pp, 20); assert.equal(m.hp, m.maxHp); assert.equal(m.xp, 125);
  assert.equal(m.speciesId, 'dX'); assert.equal(m.nickname, 'TESTY'); assert.ok(typeof m.uid === 'string');
});
test('movesLearnedAt lists moves gained exactly at that level', () => { assert.deepEqual(movesLearnedAt(species, 8), ['m3']); assert.deepEqual(movesLearnedAt(species, 9), []); });
test('addXp levels up (possibly several times), recomputes stats keeping hp ratio, learns moves, returns events', () => {
  const m = makeMonster(species, 5, moves, mulberry32(1)); m.hp = Math.floor(m.maxHp / 2);
  const ev = addXp(m, species, moves, xpForLevelHelper(8) - m.xp);
  assert.equal(m.level, 8); assert.ok(ev.some(e => e.type === 'levelup' && e.level === 8)); assert.ok(ev.some(e => e.type === 'learn' && e.move === 'm3'));
  assert.equal(m.moves.length, 3); assert.ok(m.hp > 0 && m.hp <= m.maxHp);
});
test('learning a 5th move replaces the oldest', () => {
  const m = makeMonster(species, 14, moves, mulberry32(1)); m.moves.push({ id: 'm3', pp: 10, maxPp: 10 }); m.moves.push({ id: 'extra', pp: 5, maxPp: 5 });
  addXp(m, species, moves, xpForLevelHelper(15) - m.xp);
  assert.deepEqual(m.moves.map(x => x.id), ['m2', 'm3', 'extra', 'm4']);
});
test('resetBattleState clears stages and skip', () => { const m = makeMonster(species, 5, moves); m.stages.atk = 2; m.skipNext = true; resetBattleState(m); assert.deepEqual(m.stages, { atk: 0, def: 0, acc: 0 }); assert.equal(m.skipNext, false); });
function xpForLevelHelper(l) { return l ** 3; }
```

- [ ] **Step 2: Implement**

```js
// src/battle/monster.js
import { computeStats, xpForLevel, levelForXp } from './stats.js';
import { defaultRng } from '../engine/rng.js';

export function movesLearnedAt(species, level) { return species.moves.filter(m => m.level === level).map(m => m.id); }
export function resetBattleState(m) { m.stages = { atk: 0, def: 0, acc: 0 }; m.skipNext = false; }

export function makeMonster(species, level, movesDb, rng = defaultRng) {
  const stats = computeStats(species, level);
  const known = species.moves.filter(m => m.level <= level).slice(-4).map(m => ({ id: m.id, pp: movesDb[m.id].pp, maxPp: movesDb[m.id].pp }));
  const m = { uid: Math.floor(rng() * 1e9).toString(36) + Date.now().toString(36), speciesId: species.id, nickname: species.name, level,
    xp: xpForLevel(level), stats, maxHp: stats.hp, hp: stats.hp, moves: known };
  resetBattleState(m); return m;
}

/** Adds xp, applies level-ups and move learning. Returns events for the UI. */
export function addXp(m, species, movesDb, amount) {
  const events = []; m.xp += amount;
  const target = levelForXp(m.xp);
  while (m.level < target) {
    m.level++;
    const ratio = m.hp / m.maxHp, stats = computeStats(species, m.level);
    m.stats = stats; m.maxHp = stats.hp; m.hp = Math.max(1, Math.round(stats.hp * ratio));
    events.push({ type: 'levelup', level: m.level, stats });
    for (const id of movesLearnedAt(species, m.level)) {
      if (m.moves.some(x => x.id === id)) continue;
      const mv = { id, pp: movesDb[id].pp, maxPp: movesDb[id].pp };
      if (m.moves.length < 4) { m.moves.push(mv); events.push({ type: 'learn', move: id }); }
      else { const old = m.moves.shift(); m.moves.push(mv); events.push({ type: 'learn', move: id, forgot: old.id }); }
    }
  }
  return events;
}
```

- [ ] **Step 3: Run** → pass. **Step 4: Commit** `feat: monster instances, xp and move learning`.

### Task 22: Damage formula

**Files:**
- Create: `src/battle/damage.js`
- Test: `test/battle/damage.test.js`

- [ ] **Step 1: Failing test**

```js
// test/battle/damage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDamage, hitCheck } from '../../src/battle/damage.js';
import types from '../../data/types.json' with { type: 'json' };

const atkSp = { type: 'Fried' }, defSp = { type: 'Steamed' };
const atk = { level: 10, stats: { atk: 30, def: 20, spd: 20 }, stages: { atk: 0, def: 0, acc: 0 } };
const def = { level: 10, stats: { atk: 20, def: 20, spd: 20 }, stages: { atk: 0, def: 0, acc: 0 } };
const fixed = v => () => v; // rng returning a constant

test('base formula, no crit, max random roll, STAB and 2x type', () => {
  // L=10: floor(2*10/5+2)=6 ; 6*50*30/20=450 ; floor(450/50)+2=11 ; x1.5 STAB x2 type x(255/255) = 33
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) });
  assert.equal(r.damage, 33); assert.equal(r.crit, false); assert.equal(r.typeMult, 2);
});
test('min random roll is 217/255; damage floors to at least 1; status moves do 0', () => {
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: { type: 'Spicy' }, move: { type: null, power: 10 }, types, rng: fixed(0.0) });
  assert.ok(r.damage >= 1); assert.equal(r.typeMult, 1);
  assert.equal(calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: null, power: 0 }, types, rng: fixed(0.5) }).damage, 0);
});
test('crit doubles the level term; rng sequence [critRoll, randomRoll]', () => {
  let i = 0; const seq = [0.0, 0.999]; const rng = () => seq[i++];
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: defSp, move: { type: 'Fried', power: 50 }, types, rng });
  assert.equal(r.crit, true); assert.ok(r.damage > 33);
});
test('Imported defender halves everything', () => {
  const r = calcDamage({ attacker: atk, attackerSpecies: atkSp, defender: def, defenderSpecies: { type: 'Imported' }, move: { type: 'Fried', power: 50 }, types, rng: fixed(0.999) });
  assert.equal(r.typeMult, 0.5);
});
test('hitCheck: accuracy, foe accuracy stages, neverMiss', () => {
  assert.equal(hitCheck({ accuracy: 100, effect: { kind: 'none' } }, { stages: { acc: 0 } }, fixed(0.99)), true);
  assert.equal(hitCheck({ accuracy: 70, effect: { kind: 'none' } }, { stages: { acc: 0 } }, fixed(0.71)), false);
  assert.equal(hitCheck({ accuracy: 100, effect: { kind: 'none' } }, { stages: { acc: -2 } }, fixed(0.6)), false); // 0.5625
  assert.equal(hitCheck({ accuracy: 1, effect: { kind: 'neverMiss' } }, { stages: { acc: -3 } }, fixed(0.99)), true);
});
```

- [ ] **Step 2: Implement**

```js
// src/battle/damage.js
import { typeMultiplier } from './types.js';
import { stageMult, accMult } from './stats.js';
import { defaultRng } from '../engine/rng.js';

/** rng is consumed as: [critRoll] then [randomRoll] (only for power > 0). */
export function calcDamage({ attacker, attackerSpecies, defender, defenderSpecies, move, types, rng = defaultRng }) {
  if (!move.power) return { damage: 0, crit: false, typeMult: 1 };
  const crit = rng() < attacker.stats.spd / 512;
  const L = crit ? attacker.level * 2 : attacker.level;
  const A = attacker.stats.atk * stageMult(attacker.stages.atk);
  const D = Math.max(1, defender.stats.def * stageMult(defender.stages.def));
  const base = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * move.power * A / D) / 50) + 2;
  const stab = move.type && move.type === attackerSpecies.type ? 1.5 : 1;
  const typeMult = typeMultiplier(move.type, defenderSpecies.type, types);
  const rand = (217 + Math.floor(rng() * 39)) / 255;
  const damage = Math.max(1, Math.floor(base * stab * typeMult * rand));
  return { damage, crit, typeMult };
}

/** Attacker's accuracy stage is the one lowered by Exhale etc. — we store it on the *attacker* as stages.acc. */
export function hitCheck(move, attacker, rng = defaultRng) {
  if (move.effect?.kind === 'neverMiss') return true;
  return rng() < (move.accuracy / 100) * accMult(attacker.stages.acc);
}
```
Note the convention: `accDown` lowers the **target's** `stages.acc`, and `hitCheck` reads the **attacker's** own `stages.acc` when it attacks. (The test passes the affected monster as the second argument.)

- [ ] **Step 3: Run** → pass. **Step 4: Commit** `feat: Gen 1 damage formula and hit check`.

### Task 23: Catching

**Files:**
- Create: `src/battle/catching.js`
- Test: `test/battle/catching.test.js`

- [ ] **Step 1: Failing test**

```js
// test/battle/catching.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchChance, throwBall } from '../../src/battle/catching.js';

test('chance grows as hp drops, bounded [0.05, 1]', () => {
  const full = catchChance({ hp: 100, maxHp: 100 }, 190), low = catchChance({ hp: 1, maxHp: 100 }, 190);
  assert.ok(low > full); assert.ok(full >= 0.05 && low <= 1);
  assert.equal(catchChance({ hp: 100, maxHp: 100 }, 1), 0.05);
  assert.ok(Math.abs(catchChance({ hp: 100, maxHp: 100 }, 255) - 255 / 3 / 255) < 1e-9);
});
test('throwBall: success gives 3 wobbles; failure gives 0-2 wobbles scaled by chance', () => {
  assert.deepEqual(throwBall({ hp: 1, maxHp: 100 }, 255, () => 0.0), { success: true, wobbles: 3 });
  const f = throwBall({ hp: 100, maxHp: 100 }, 30, () => 0.99); assert.equal(f.success, false); assert.ok(f.wobbles >= 0 && f.wobbles <= 2);
});
```

- [ ] **Step 2: Implement**

```js
// src/battle/catching.js
import { defaultRng } from '../engine/rng.js';
export function catchChance(monster, catchRate) {
  const p = ((3 * monster.maxHp - 2 * monster.hp) * catchRate / (3 * monster.maxHp)) / 255;
  return Math.min(1, Math.max(0.05, p));
}
export function throwBall(monster, catchRate, rng = defaultRng) {
  const p = catchChance(monster, catchRate), success = rng() < p;
  return { success, wobbles: success ? 3 : Math.min(2, Math.floor(p * 4)) };
}
```

- [ ] **Step 3: Run** → pass. **Step 4: Commit** `feat: catch roll with wobbles`.

### Task 24: Foe AI

**Files:**
- Create: `src/battle/ai.js`
- Test: `test/battle/ai.test.js`

- [ ] **Step 1: Failing test** — with `rng` fixed at 0.9 (no random pick), the AI picks the move with the highest `power × typeMult × accuracy` that has PP; a status move is chosen only when it is the only one with PP; with all PP gone it returns `'struggle'`; with rng 0.1 it picks uniformly at random among moves with PP.
- [ ] **Step 2: Implement** `chooseFoeMove(foe, foeSpecies, playerSpecies, movesDb, types, rng)` → move index or `'struggle'`. Score = `power * typeMultiplier(type, playerSpecies.type) * accuracy/100`, status moves score 5. 25 % of the time (rng() < 0.25) pick uniformly among usable moves.
- [ ] **Step 3: Run, commit** `feat: foe move selection`.

### Task 25: Items data

**Files:**
- Create: `data/items.json`
- Test: `test/data/items.test.js` (ids and prices exactly as the spec)

```json
[
  { "id": "dumpling-ball", "name": "DUMPLINGBALL", "price": 100, "battle": "catch", "field": null, "text": "A ball for catching wild dumplings. Do not eat." },
  { "id": "wet-wipe", "name": "WET WIPE", "price": 150, "battle": "heal", "field": "heal", "heal": 30, "text": "Restores 30 HP. Smells like lemon." },
  { "id": "extra-sauce", "name": "EXTRA SAUCE", "price": 300, "battle": "atkUp", "field": null, "text": "Raises Attack in battle. Regret later." },
  { "id": "napkin", "name": "NAPKIN", "price": 250, "battle": "escape", "field": "escape", "text": "Escape any wild battle, or wipe your way back to Haze Lounge." }
]
```

- [ ] Commit `content: items`.

### Task 26: The headless Battle state machine

**Files:**
- Create: `src/battle/battle.js`
- Test: `test/battle/battle.test.js`

API:
```js
const b = new Battle({ db, state, rng, kind: 'wild'|'trainer', foeParty: [monster,...], foeSpeciesById, trainer?: {id, name, payout, isChampion} });
b.phase            // 'choose' | 'mustSwitch' | 'over'
b.result           // null | 'win' | 'lose' | 'caught' | 'ran' | 'fled'
b.player, b.foe    // active monsters
b.events           // queue of {type,...} the scene drains; each action pushes events then resolves the turn
b.chooseMove(i); b.useItem(itemId, partyIndex?); b.switchTo(partyIndex); b.run();
b.drain()          // returns and clears events
```
Turn: player action + foe action (foe uses `chooseFoeMove`), ordered by `stats.spd` (tie → rng). Items and switches always go first. Running from a wild battle: success if `rng() < 0.5 + 0.5 * (player.spd / foe.spd)` clamped; from a trainer battle → event `text "NO! THERE'S NO RUNNING FROM A TRAINER BATTLE!"`. `skipNext` consumed at the start of that monster's action ("X IS HELD AT THE BORDER!"). After both actions, if `kind === 'wild'` and the foe species `who === 'suhaib'` and the foe is alive and `rng() < 0.5` → events `text "...SUHAIB LEFT. HE HAS A LONG DRIVE HOME."`, `flee`, `end fled`. Faints: foe → xp to the player's active monster via `addXp` (events pass through), then next foe monster (trainer) or `end win` (+money `20 × max foe level` for trainers, pushed as `money` event); player → `mustSwitch` if any alive else `end lose`. Catching (wild only): `throwBall` → events `ball {wobbles, success}`; success → `markCaught`, add to party or fridge (`text "SENT TO THE FRIDGE"`), `end caught`. `markSeen` for every foe that appears. Effects: `accDown` → target `stages.acc -= n`; `atkUp/defUp` → user stages; `heal` → user; `skip` → target `skipNext = true`. Each use costs 1 PP; with 0 PP on all moves the monster uses Struggle (typeless power 20, hurts user by ¼ of damage dealt).

- [ ] **Step 1: Failing tests** (build a tiny fixture db with 2 species, 4 moves, real `types.json`):
  1. a wild battle where the player one-shots the foe ends with `win`, xp event present, player gains xp;
  2. a Suhaib wild foe with `rng` sequence forcing the flee branch ends with `fled` and the flee text;
  3. `useItem('dumpling-ball')` with rng forcing success ends `caught`, party grows by one, dex.caught updated; with a full party (6) it goes to the fridge;
  4. `run()` in a trainer battle yields the "no running" text and the turn still resolves (foe attacks);
  5. player faint with another alive monster → `mustSwitch`; `switchTo` continues; with none alive → `lose`;
  6. trainer with 2 monsters: after the first faints, the second appears (`switch` event with side `foe`), win pays `20 × max level` money;
  7. `skip` effect makes the target lose its next action (only one `text` "…HELD AT THE BORDER" and no damage event from it that turn).
- [ ] **Step 2: Implement `battle.js`** to make them pass. Keep it under ~250 lines; helpers: `act(side, action)`, `applyMove(user, target, move)`, `checkFaints()`, `endTurn()`.
- [ ] **Step 3: Run all tests** `node --test` → green. **Step 4: Commit** `feat: headless battle state machine`.

### Task 27: Battle scene (rendering + pacing)

**Files:**
- Create: `src/battle/battlescene.js`, `src/ui/hpbar.js`
- Modify: `src/main.js` (a debug key `1` on desktop starts a test wild battle until Task 28 wires encounters)

- [ ] **Step 1: Layout** on the 160×144 screen: foe sticker drawn 56×56 at (96, 8) with its name/level/HP bar box at (8, 8, 80×24); player sticker 56×56 at (8, 56) with its box at (88, 60, 64×32) showing name, level, HP bar and `HP 23/40`; the bottom 48 px is the textbox / action menu. Stickers are `<img>` elements loaded once at boot (`db.images[speciesId]`) and drawn with `drawImage` (crisp, not pixelated — set `ctx.imageSmoothingEnabled = true` just for these draws, then back to false). Player's sticker is mirrored (`scale(-1,1)`) so both face each other.
- [ ] **Step 2: Action menu** 2×2: FIGHT / BAG / DUMPLINGS / RUN. FIGHT opens the 2×2 move menu with the move names and `PP 12/20` + type for the highlighted move. BAG opens the bag (Task 30) filtered to battle-usable items. DUMPLINGS opens the party screen (Task 30) for switching. B cancels back.
- [ ] **Step 3: Event playback**: the scene drains `battle.events` into a queue and plays one at a time with timing: `text` → textbox page (A to continue, or auto-advance after 1.2 s for battle text); `hp` → animate the bar from → to over 400 ms with a tick sound; `faint` → the sticker slides down and off (300 ms); `ball` → a 12 px ball sprite arcs to the foe, the sticker shrinks into it, then `wobbles` rocks (each 500 ms, sound) and either a click (success, sticker stays inside) or a pop (fail, sticker reappears); `switch` → slide out/in; `levelup` → fanfare + text; `learn` → text; `money` → text; `flee` → the foe sticker slides right off the screen fast; `end` → after the last text, `exit` the scene (pop) and hand the result to the overworld (`onEnd(result)`).
- [ ] **Step 4: Encounter transition** (used by Task 28): `flashWipe(ctx, t)` — 3 white flashes (80 ms each) then a diagonal wipe to black over 400 ms; the BattleScene is pushed when the wipe completes and the foe sticker slides in from the right while the player's slides in from the left.
- [ ] **Step 5: Play** a debug battle end-to-end: attack, get hit, use a Wet Wipe, throw a ball, run. Phone viewport check. **Step 6: Commit** `feat: battle scene with animated events`.

### Task 28: Wild encounters from tall grass

**Files:**
- Create: `src/world/encounters.js`
- Modify: `src/world/overworld.js`
- Test: `test/world/encounters.test.js`

- [ ] **Step 1: Failing test**

```js
// test/world/encounters.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollEncounter } from '../../src/world/encounters.js';
const zone = { id: 'z', rate: 0.5, table: [{ species: 'a', min: 2, max: 4, weight: 9 }, { species: 'b', min: 10, max: 10, weight: 1 }] };
test('returns null when the rate roll fails; otherwise a weighted species at a level in range', () => {
  assert.equal(rollEncounter(zone, () => 0.9), null);
  let i = 0; const seq = [0.1, 0.05, 0.5]; const r = rollEncounter(zone, () => seq[i++]);
  assert.equal(r.species, 'a'); assert.ok(r.level >= 2 && r.level <= 4);
});
```

- [ ] **Step 2: Implement** `rollEncounter(zone, rng)` (rate roll, `pickWeighted`, `randInt`). In the overworld, on `player.onArrive(x, y)`: if `isEncounterTile` and `zoneAt` → `rollEncounter`; on a hit, stop the player, play the encounter jingle, run `flashWipe`, `makeMonster(species, level)`, push `BattleScene` with `kind: 'wild'`. On `onEnd`: `resetBattleState` for the party, `save.autosave(state)`; if result is `lose` → blackout (Task 32).
- [ ] **Step 3: Play** — walk in Route 1 grass, get encounters at a sane rate (~1 per 8 steps at rate 0.12). **Step 4: Run tests, commit** `feat: wild encounters in tall grass`.

### Task 29: Trainers, the gym, the badge and the Border gate

**Files:**
- Create: `data/trainers.json`
- Modify: `data/map.json` (trainers, gate object), `data/dialogue.json`, `src/world/overworld.js`, `src/world/npc.js`
- Test: `test/data/trainers.test.js`

`trainers.json` entries: `{ id, name, sprite, kind: 'route'|'regular'|'leader'|'champion', team: [{ species, level }], pre, post, speechAfterFaints?: 3 }`. Content: 6 route trainers (levels 4–12, 1–3 dumplings, lines like "I'VE BEEN STANDING HERE SINCE 2019." / "NOT BAD. NOT GOOD EITHER."), 4 Haze regulars ("I'M NOT LEAVING. THE COALS ARE FRESH." levels 12–15, 2 dumplings each), the leader **HAZE GUY** (5 dumplings, L16–18, mixed Steamed/Fried, pre: "YOU WANT THE BADGE? FIRST YOU WAIT FOR A TABLE.", post: "TAKE THE BADGE. AND A COAL. NO, NOT THAT ONE."), Champion **SUHAIB** (6 Imported, L20–24; `pre: suhaib-pre`, `speechAfterFaints: 3 → suhaib-mid`, `post: suhaib-lost`).

- [ ] **Step 1: Failing test** — all trainer species/dialogue ids exist; every trainer placed in `map.json` exists in `trainers.json`; Champion team is all Imported; exactly one leader and one champion.
- [ ] **Step 2: Implement** in the overworld: each frame, for each undefeated trainer on the current map, `inLineOfSight(trainer, player)` → `!` bubble for 500 ms, trainer walks to the tile adjacent to the player, `pre` dialogue, push `BattleScene({kind:'trainer'})`. Talking to a trainer directly also starts it. On win: `post` dialogue, `state.defeatedTrainers.push(id)`; leader → `state.badges.push('haze')`, textbox "TAREK RECEIVED THE HAZE BADGE!" and jingle; the town's `G` gate tile becomes `g` when `state.badges.includes('haze')` (rendered and walkable), the booth officer switches to `booth-officer-open`. Defeated trainers stay as NPCs with their `post` line. Champion trigger: when the badge is held and the player steps north of the gate, Suhaib walks in from the top edge (suitcase sprite), `suhaib-pre`, battle; the `speechAfterFaints` hook makes the BattleScene show `suhaib-mid` after his third dumpling faints.
- [ ] **Step 3: Play** — fight a route trainer via LOS, beat the gym, watch the gate open. **Step 4: Run tests, commit** `feat: trainers, gym, badge, border gate, champion trigger`.

### Task 30: Bag, party and shop screens

**Files:**
- Create: `src/ui/bag.js`, `src/ui/party.js`, `src/ui/shop.js`
- Modify: `src/ui/startmenu.js`, `src/battle/battlescene.js`, `src/world/overworld.js`

- [ ] **Step 1: Bag** — list `state.bag` entries with counts; A → context menu USE / CANCEL; in battle only `battle`-usable items, out of battle only `field`-usable (`wet-wipe` → pick a party member; `napkin` → warp to the Haze Lounge door with a fade, text "TAREK WIPED HIS WAY BACK TO HAZE LOUNGE."). Uses call `battle.useItem` or mutate state directly.
- [ ] **Step 2: Party** — six slots with sticker thumbnails (24×24), name, level, HP bar; A → SUMMARY (sticker large, type, stats, moves with PP) / SWITCH (reorder; in battle → `battle.switchTo`) / CANCEL.
- [ ] **Step 3: Shop** — talking to the Ribs shopkeeper: `ribs-shop` text, then BUY / LEAVE; BUY lists the 4 items with prices, left/right adjusts quantity 1–9, A confirms if `money >= total`, else "YOU CAN'T AFFORD THE RIBS. OR ANYTHING." Money shown top-right as `$1234`.
- [ ] **Step 4: Play** all three. **Step 5: Commit** `feat: bag, party and shop screens`.

### Task 31: The Fridge

**Files:**
- Create: `src/ui/fridge.js`
- Modify: `src/world/overworld.js` (interact with the `F` tile in Haze Lounge)

- [ ] **Step 1:** Two-column screen: PARTY (left) / FRIDGE (right, scrollable, `state.fridge`). A on a party member → DEPOSIT (refused if it's the last healthy member: "YOU CAN'T LEAVE WITHOUT A DUMPLING. HOUSE RULES."), A on a fridge member → WITHDRAW (refused if the party is full). Opening text: "THE FRIDGE HUMS. IT'S FULL OF FACES."
- [ ] **Step 2: Play, commit** `feat: the Fridge`.

### Task 32: Blackout

**Files:**
- Modify: `src/world/overworld.js`

- [ ] **Step 1:** On battle result `lose`: fade to black, textbox "TAREK BLACKED OUT!", `state.money = Math.floor(state.money / 2)`, `healParty`, set `pos` to the Haze Lounge interior entrance mat facing up, fade in, shisha guy's `haze-heal-2` line, `autosave`.
- [ ] **Step 2: Test by losing on purpose, commit** `feat: blackout to Haze Lounge`.

---

# Stage 4 — Polish + ship

### Task 33: Chiptune audio

**Files:**
- Create: `src/engine/audio.js`, `src/engine/jingles.js`
- Modify: `src/main.js` (unlock on first input), `src/ui/startmenu.js` (SOUND toggle), scenes (calls)

- [ ] **Step 1: Synth** — `createAudio()` returns `{ unlock(), playJingle(name), playSfx(name), startMusic(name), stopMusic(), setMuted(bool), muted }`. Voices: `square` (lead), `pulse25` (harmony, via a PeriodicWave or two detuned squares), `triangle` (bass), `noise` (drums via a buffer of random samples). A note is `[midiNote|null, beats]`; a jingle is `{ bpm, tracks: { lead: [...], bass: [...] } }`; `startMusic` loops. Schedule with `AudioContext.currentTime` look-ahead (Web Audio timing, not `setTimeout`). Volume 0.15 master.
- [ ] **Step 2: Jingles** (all original; write short catchy phrases): `encounter` (fast descending stabs, 1.5 s), `battle` (loop, 8 bars, driving bass), `victory` (rising fanfare, 2 s), `heal` (5-note ascending arpeggio, 1 s), `levelup` (3-note fanfare), `badge`, `caught` (two-note click then fanfare), `title` (loop, 8 bars, bright), `overworld` (loop, 16 bars, cheerful), `credits` (loop, slow, warm). SFX: `select` (blip), `bump` (low thud), `textTick`, `hpTick`, `ballThrow`, `wobble`, `click`, `pop`, `skate` (a looping low-pitch whirr with vibrato while skating), `flee` (quick descending slide).
- [ ] **Step 3: Wire** — overworld music per map (interiors use `overworld` at lower volume), battle music on push, victory on win, heal at the Lounge, skate whirr toggled with `player.skating`, text ticks in the textbox, blips on menu moves. Mute state persisted in `localStorage` under `tarekmon.muted`.
- [ ] **Step 4: Verify on the phone viewport** that nothing plays before the first tap and that the mute toggle silences everything. **Step 5: Commit** `feat: chiptune synth, music and sfx`.

### Task 34: Title, intro, name entry, starter pick

**Files:**
- Create: `src/ui/title.js`, `src/ui/intro.js`
- Modify: `src/main.js` (boot into TitleScene)

- [ ] **Step 1: Title** — dark background, the word TAREKMON in 3× pixel font with a 1 px drop shadow in Frozen blue and a bouncing dumpling (a random species sticker, 48 px, sine float); menu NEW GAME / CONTINUE (CONTINUE only if `save.load()` returns a state); `title` music. NEW GAME with an existing save asks "OVERWRITE THE OLD GAME? Y/N".
- [ ] **Step 2: Intro** — Prof. Otto sprite large (procedural 32×32 portrait: lab coat, moustache), lines: "WELCOME TO THE WORLD OF TAREKMON!\fMY NAME IS OTTO. PEOPLE CALL ME THE DUMPLING PROFESSOR.\fTHIS WORLD IS INHABITED BY CREATURES WITH VERY SQUISHED FACES.\fSOME PEOPLE KEEP THEM AS PETS. I STUDY THEM. IT'S A LIVING.\fFIRST, WHAT'S YOUR NAME?" → name entry: an A–Z grid plus `DEL` and `END`, 7 chars max, pre-filled `TAREK`; then "RIGHT. TAREK. OBVIOUSLY.\fYOUR VERY OWN DUMPLING LEGEND IS ABOUT TO UNFOLD!" → fade into the lab at `map.start`.
- [ ] **Step 3: Starter pick** in the lab: three `K`-like pedestal tiles each holding a ball; interacting shows the starter's sticker + "SO! YOU WANT THE (STEAMED) ONE? IT'S OTTO. THAT'S A LOT OF OTTO." / "...TAREK? PICKING YOURSELF. BOLD." / "THAT ONE'S IMPORTED. IT TAKES 3 HOURS TO GET HERE." → Y/N → `makeMonster(starter, 5)`, party push, `markCaught`, the other two pedestals empty, flag `starterPicked`, Prof. Otto's lab line changes to "GO ON. THE GRASS ISN'T GOING TO SQUISH ITSELF." Leaving the lab without a starter is blocked by Otto stepping in front of the door: "NOT WITHOUT A DUMPLING. THAT GRASS IS FULL OF FACES."
- [ ] **Step 4: Play the whole opening, commit** `feat: title, intro, name entry, starters`.

### Task 35: Dumplingdex

**Files:**
- Create: `src/ui/dex.js`
- Modify: `src/ui/startmenu.js`

- [ ] **Step 1:** List: `#001 GRINLORD` for seen/caught (a ball icon marks caught), `#002 -----` for unseen; header `SEEN 12  CAUGHT 5`. A on a seen entry → page: sticker 64×64 (animated ones animate — draw from the `<img>`), name, type badge, `HT 0'8"  WT 3 LBS` (fixed gag values by type), the Dex entry paginated, and for caught ones the base stats as bars. B back. Sort options: NUMBER / NAME (Start toggles).
- [ ] **Step 2: Play, commit** `feat: Dumplingdex`.

### Task 36: Skateboard and the weather gag

**Files:**
- Modify: `src/world/overworld.js`, `src/world/player.js`, `data/map.json` (rack `K` at the Skate Route entrance), `data/dialogue.json`

- [ ] **Step 1:** Interacting with the rack: if `rollWeather()` → "THE BOARD FEELS RIGHT TODAY." → `player.skating = true`, skate whirr starts, walk speed doubles, the player sprite shows the board. If not: "IT DOESN'T FEEL RIGHT TODAY." (no board). Skating stops on entering any door (board "waits outside" — flag `boardParked`, so leaving the building re-enables it without re-checking the weather that day). Tall grass encounters still happen while skating (rate ×0.5 because you're fast — a nice touch, one multiplier).
- [ ] **Step 2: Test both weather branches** by temporarily faking the date via a `?date=YYYY-MM-DD` query parameter honored by `todayString()` when present (keep this — it's a harmless debug aid). **Step 3: Commit** `feat: electric skateboard when the weather is nice`.

### Task 37: Champion ending and credits

**Files:**
- Create: `src/ui/credits.js`
- Modify: `src/world/overworld.js`, `src/battle/battlescene.js` (speechAfterFaints hook)

- [ ] **Step 1:** After beating Suhaib: `suhaib-lost` dialogue, then "TAREK IS THE DUMPLING CHAMPION!" with the `victory` jingle, `state.flags.champion = true`, autosave, then push `CreditsScene`.
- [ ] **Step 2: CreditsScene** — a procedural sunset gradient over the Skate Route (water reflecting orange, silhouetted trees), the caught dumplings (from `state.dex.caught`, 32 px stickers) walking left-to-right in a line with a bob, while credit lines scroll up: `TAREKMON`, `A GAME FOR TAREK`, `BY OTTO`, `STARRING: TAREK, OTTO, SUHAIB (IMPORTED)`, `DUMPLINGS CAUGHT: N / 74`, `HAZE LOUNGE — FOR THE COALS`, `THAT RIBS PLACE — SORRY ABOUT THE NAME`, `THE WEATHER — FOR THE GOOD DAYS`, then the sky fades to night and the final card shows, centered and letter-by-letter with the heal jingle, **exactly**:

```
HAPPY BIRT-D'AY PINE-APPLE,
LOOKING WERRY GOOR
WERRY NAAAICE!
```
(The source string in `dialogue.json` under `birthday` is the exact text from the spec: `Happy Birt-d'ay Pine-Apple, Looking Werry Goor Werry Naaaice!` — the font upper-cases it; the spelling must not be corrected.) A afterwards returns to the title with CONTINUE enabled; the world stays playable, Suhaib remains at the Border with "REMATCH? I ALREADY BOOKED THE RETURN TRIP." (rematch allowed).
- [ ] **Step 3: Play the ending, commit** `feat: champion ending and credits with the birthday message`.

### Task 38: Full playthrough on a phone viewport + fixes

- [ ] **Step 1:** In the browser pane at 375×812: new game → starter → Route 1 grinding → shop → Haze heal → gym → Skate Route (both weather branches via `?date=`) → Border → Suhaib → credits → CONTINUE. Log every bug and rough edge to `docs/playtest-notes.md`.
- [ ] **Step 2:** Fix everything logged; keep tests green; re-run the playthrough. Check `grep -ri "pokemon\|pokémon\|nintendo" src data index.html` returns nothing.
- [ ] **Step 3:** Desktop sanity pass with the keyboard. **Step 4: Commit** `fix: playtest round 1`.

### Task 39: Dockerfile and Coolify deployment (STAGE GATE at the end)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `nginx.conf`

- [ ] **Step 1:**
```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css /usr/share/nginx/html/
COPY src /usr/share/nginx/html/src
COPY data /usr/share/nginx/html/data
COPY assets /usr/share/nginx/html/assets
```
`nginx.conf`: `listen 80; root /usr/share/nginx/html; location / { try_files $uri $uri/ =404; } ; types { image/webp webp; } include /etc/nginx/mime.types;` with `add_header Cache-Control "public, max-age=3600"` for `/assets/` and `no-cache` for `index.html`. `.dockerignore`: `test docs tools node_modules .git`.
- [ ] **Step 2: Build and run locally** — `docker build -t tarekmon . && docker run --rm -p 8080:80 tarekmon`, open `http://localhost:8080`, confirm the game loads and `.webp` files serve with `content-type: image/webp` (`curl -I`). Commit `chore: nginx Dockerfile for Coolify`.
- [ ] **Step 3: Deploy on Coolify.** Read `claude-brain/knowledge/coolify-vps.md` and `claude-brain/infrastructure/coolify-vps/coolify-lessons-learned.md` first (API quirks, domain PATCH). Create an application in the `_personal` project from the private GitHub repo `generalOtto/tarekmon` (Coolify's GitHub App source if one is configured on the VPS; otherwise add a deploy key source per the brain's `github-repo-scoped-keys` note), build pack **Dockerfile**, domain `https://tarekmon.othman.ca`, port 80. Add the DNS record for `tarekmon.othman.ca` → the VPS IP per `infrastructure/coolify-vps/` (Otto's domains note says where DNS lives). Deploy; confirm HTTPS works and the game plays from a phone.
- [ ] **Step 4: STOP and hand over:** tell Otto the URL, that the save is per-browser, and that Suhaib gets the same link. Update the brain project note (Current Focus → shipped; version v1.0.0) via the write protocol, and the journal.
