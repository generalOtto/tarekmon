/**
 * @typedef {Object} MoveSlot
 * @property {string} id      Move id (key into db.moves).
 * @property {number} pp      Current power points.
 * @property {number} maxPp   Maximum power points.
 */
/**
 * @typedef {Object} MonsterInstance
 * @property {string} uid        Unique per-instance id.
 * @property {string} speciesId  Key into db.species.
 * @property {string|null} nickname
 * @property {number} level
 * @property {number} xp
 * @property {{hp:number, atk:number, def:number, spd:number}} stats  Computed stats at this level.
 * @property {number} maxHp
 * @property {number} hp
 * @property {MoveSlot[]} moves  Up to 4.
 */
/**
 * @typedef {Object} GameState
 * @property {string} playerName
 * @property {number} money
 * @property {{map:string, x:number, y:number, facing:'up'|'down'|'left'|'right'}} pos  Current map id + tile position.
 * @property {MonsterInstance[]} party   Up to 6, lead first.
 * @property {MonsterInstance[]} fridge  Box storage (the lab fridge).
 * @property {Object<string, number>} bag  itemId -> count.
 * @property {string[]} badges           Badge ids earned (e.g. 'haze').
 * @property {Object<string, *>} flags   Story/event flags.
 * @property {{seen:string[], caught:string[]}} dex  Species ids.
 * @property {string[]} defeatedTrainers Trainer ids already beaten.
 * @property {number} playSeconds
 */

// The single mutable GameState object and small helpers. Pure (no DOM).
const DEFAULT_START = { map: 'lab', x: 5, y: 7, facing: 'up' };

/** @returns {GameState} */
export function newGameState(playerName = 'TAREK', start = DEFAULT_START) {
  return {
    playerName,
    money: 500,
    pos: { ...start },
    party: [],
    fridge: [],
    bag: { 'dumpling-ball': 5, 'wet-wipe': 2, 'extra-sauce': 0, 'napkin': 0 },
    badges: [],
    flags: {},
    dex: { seen: [], caught: [] },
    defeatedTrainers: [],
    playSeconds: 0,
  };
}

export function healParty(state) {
  for (const m of state.party) {
    m.hp = m.maxHp;
    for (const mv of m.moves) mv.pp = mv.maxPp;
  }
}

export function markSeen(state, id) {
  if (!state.dex.seen.includes(id)) state.dex.seen.push(id);
}

export function markCaught(state, id) {
  markSeen(state, id);
  if (!state.dex.caught.includes(id)) state.dex.caught.push(id);
}
