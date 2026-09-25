// src/data/species-tables.js — shared by tools/gen-species.mjs and the species tests.

// Base-stat templates by type (each sums to ~240–255 before the rarity bonus).
export const TEMPLATE = {
  Steamed: { hp: 70, atk: 50, def: 70, spd: 55 }, Fried: { hp: 55, atk: 75, def: 50, spd: 65 },
  Spicy: { hp: 60, atk: 80, def: 45, spd: 60 }, Soggy: { hp: 80, atk: 55, def: 65, spd: 40 },
  Frozen: { hp: 60, atk: 60, def: 60, spd: 70 }, Imported: { hp: 75, atk: 70, def: 80, spd: 30 },
};

// The rarity bonus is added to ALL FOUR stats, so base-stat totals run from ~230 (common)
// to ~390 (legend) once the per-stat nudge of -7..+7 is applied.
export const RARITY = {
  common: { catchRate: 190, xpYield: 60, bonus: 0 }, uncommon: { catchRate: 120, xpYield: 90, bonus: 10 },
  rare: { catchRate: 60, xpYield: 140, bonus: 20 }, starter: { catchRate: 45, xpYield: 100, bonus: 15 },
  legend: { catchRate: 30, xpYield: 200, bonus: 30 },
};

// Levels at which the four moves are learned; the last lines up with the Champion fight (L20–24).
export const LEVELS = [1, 1, 10, 20];
