export function isValidType(t, types) { return types.types.includes(t); }

/** attackType may be null (typeless). Returns 2, 1 or 0.5. */
export function typeMultiplier(attackType, defenderType, types) {
  if (defenderType === types.resistsAll) return types.resistsAllMultiplier;
  if (!attackType) return 1;
  if (types.beats[attackType] === defenderType) return 2;
  if (types.beats[defenderType] === attackType) return 0.5;
  return 1;
}
