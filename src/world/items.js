// Field (overworld) item effects — pure: mutate the GameState, return what to show.
export const NO_EFFECT = "IT WON'T HAVE ANY EFFECT.";

/**
 * Uses `itemId` outside battle. `heal` targets state.party[partyIndex] (alive, below max);
 * `escape` (napkin) asks the overworld to warp to Haze Lounge. The bag is only decremented on success.
 * @returns {{ok: boolean, text?: string, warp?: boolean}}
 */
export function applyFieldItem(state, itemId, partyIndex, { db }) {
  const item = db.itemsById[itemId];
  if (!item || !(state.bag[itemId] > 0)) return { ok: false, text: "YOU DON'T HAVE THAT." };
  if (item.field === 'heal') {
    const m = state.party[partyIndex];
    if (!m || m.hp <= 0 || m.hp >= m.maxHp) return { ok: false, text: NO_EFFECT };
    const n = Math.min(item.heal, m.maxHp - m.hp);
    m.hp += n;
    state.bag[itemId]--;
    return { ok: true, text: `${m.nickname} RECOVERED ${n} HP!` };
  }
  if (item.field === 'escape') {
    state.bag[itemId]--;
    return { ok: true, warp: true };
  }
  return { ok: false, text: "THAT CAN'T BE USED HERE." };
}

/** Where a napkin (or a blackout) lands: the Haze Lounge side of the town→haze door (its tx/ty), facing up. */
export function hazeEntrance(maps) {
  for (const m of Object.values(maps)) {
    if (m.id === 'haze') continue;
    const w = (m.warps ?? []).find(w => w.to === 'haze');
    if (w) return { map: 'haze', x: w.tx, y: w.ty, facing: 'up' };
  }
  return null;
}
