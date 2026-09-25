import { computeStats, xpForLevel, levelForXp, MAX_LEVEL } from './stats.js';
import { defaultRng } from '../engine/rng.js';

/** Lists the ids of moves a species learns at exactly this level. */
export function movesLearnedAt(species, level) { return species.moves.filter(m => m.level === level).map(m => m.id); }

/** Clears per-battle transient state (stat stages, skip-next-turn flag) on a monster. */
export function resetBattleState(m) { m.stages = { atk: 0, def: 0, acc: 0 }; m.skipNext = false; }

/** Creates a monster instance (party member / wild foe) at a level. movesDb is db.movesById. */
export function makeMonster(species, level, movesDb, rng = defaultRng) {
  const stats = computeStats(species, level);
  const known = species.moves.filter(m => m.level <= level).slice(-4).map(m => ({ id: m.id, pp: movesDb[m.id].pp, maxPp: movesDb[m.id].pp }));
  const m = {
    uid: Math.floor(rng() * 2 ** 31).toString(36) + Math.floor(rng() * 2 ** 31).toString(36),
    speciesId: species.id, nickname: species.name, level,
    xp: xpForLevel(level), stats, maxHp: stats.hp, hp: stats.hp, moves: known,
  };
  resetBattleState(m);
  return m;
}

/** Adds xp to a monster, applying level-ups and move learning. Returns a list of events for the UI. */
export function addXp(m, species, movesDb, amount) {
  const events = [];
  m.xp = Math.min(m.xp + amount, xpForLevel(MAX_LEVEL));
  const target = levelForXp(m.xp);
  while (m.level < target) {
    m.level++;
    const ratio = m.hp / m.maxHp, stats = computeStats(species, m.level);
    m.stats = stats; m.maxHp = stats.hp; m.hp = Math.max(1, Math.round(stats.hp * ratio));
    events.push({ type: 'levelup', level: m.level, stats });
    for (const id of movesLearnedAt(species, m.level)) {
      if (m.moves.some(x => x.id === id)) continue;
      const mv = { id, pp: movesDb[id].pp, maxPp: movesDb[id].pp };
      if (m.moves.length < 4) {
        m.moves.push(mv);
        events.push({ type: 'learn', move: id });
      } else {
        const old = m.moves.shift();
        m.moves.push(mv);
        events.push({ type: 'learn', move: id, forgot: old.id });
      }
    }
  }
  return events;
}
