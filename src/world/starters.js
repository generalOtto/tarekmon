// The lab's starter pedestals: A on a pedestal previews the sticker and offers it (pickStarter),
// the render swap that empties the other two once one is taken (pedestalGone), and the preview card
// drawn while the line and TAKE IT? are up (drawStarterPreview). No state of its own: it all lives in state.flags.
import { objectAt } from './map.js';
import { PAPER, INK } from './palette.js';
import { markCaught } from '../engine/state.js';
import { drawText, measure } from '../engine/font.js';
import { paperBox } from '../ui/box.js';
import { drawThumb } from '../ui/party.js';
import { makeMonster } from '../battle/monster.js';

/** A on a lab pedestal: before a pick, preview the sticker, say its line, ask; YES gives the L5
 *  starter (dex, flags, jingle, autosave). After, the others are empty and the picked one is just a stand. */
export async function pickStarter(scene, x, y) {
  const { state, db } = scene, obj = objectAt(scene.map, x, y);
  const species = obj?.kind === 'pedestal' && db.speciesById?.[obj.species];
  if (!species) return scene.say('pedestal');
  if (state.flags.starterPicked) return scene.say(obj.species === state.flags.starterId ? 'pedestal' : 'starter-gone');
  scene.preview = species;
  try {
    await scene.say(`starter-${species.id}`);
    if (!(await scene.prompt.ask(db.dialogue?.['starter-confirm'] ?? 'TAKE IT?'))) return;
    const m = makeMonster(species, 5, db.movesById, scene.rng);
    state.party.push(m);
    markCaught(state, species.id);
    state.flags.starterPicked = true;
    state.flags.starterId = species.id;
    scene.save.autosave(state);
    scene.audio?.playJingle('caught');
    await scene.textbox.say(`${state.playerName} RECEIVED\n${m.nickname.toUpperCase()}!`);
  } finally {
    scene.preview = null;
  }
}

/** Render swap: once a starter is picked, the other two pedestals draw as bare floor. */
export function pedestalGone(map, state, x, y) {
  if (!state.flags.starterPicked) return false;
  const o = objectAt(map, x, y);
  return o?.kind === 'pedestal' && o.species !== state.flags.starterId;
}

/** Draw-only: the big sticker card shown while a pedestal's line and TAKE IT? are up. */
export function drawStarterPreview(ctx, db, species) {
  const x = 12, y = 2, w = 88; // left of centre: the YES/NO box sits at the right edge
  paperBox(ctx, x, y, w, 92);
  drawThumb(ctx, db.images?.[species.id], x + 12, y + 6, 64);
  const name = species.name.toUpperCase();
  drawText(ctx, name, x + Math.round((w - measure(name)) / 2), y + 73, INK);
  const type = species.type.toUpperCase(), tw = measure(type) + 5;
  const tx = x + Math.round((w - tw) / 2);
  ctx.fillStyle = db.types?.colors?.[species.type] ?? PAPER; ctx.fillRect(tx, y + 82, tw, 9);
  drawText(ctx, type, tx + 3, y + 83, INK);
}
