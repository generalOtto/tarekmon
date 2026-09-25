// Tile legend for map strings — pure data, no DOM (imported by the map module).
//   .  grass          ,  tall grass (encounters)   *  flowers     =  path
//   :  sand           ~  water                     T  tree        #  fence
//   W  wall           H B L P  roofs (haze/ribs/lab/booth)        D  door
//   S  sign           G  gate (closed)             g  gate (open) _  floor
//   M  mat            C  counter                   F  fridge      Q  shisha
//   R  rug            K  skateboard rack           E  pedestal (starter ball)
export const TILE_SIZE = 16;

export const LEGEND = new Set([
  '.', ',', '*', '=', ':', '~', 'T', '#', 'W',
  'H', 'B', 'L', 'P', 'D', 'S', 'G', 'g',
  '_', 'M', 'C', 'F', 'Q', 'R', 'K', 'E',
]);

export const WALKABLE = new Set(['.', ',', '*', '=', ':', 'D', 'g', '_', 'M', 'R']);
export const ENCOUNTER = new Set([',']);
export const INTERACT = new Set(['S', 'F', 'K', 'G', 'E']);
