// The single mutable GameState object and small helpers. Pure (no DOM).
const DEFAULT_START = { map: 'lab', x: 5, y: 7, facing: 'up' };

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
