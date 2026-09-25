// Battle flow for the overworld: tall-grass encounter rolls, the jingle + flash/wipe into a
// battle, the post-battle cleanup, and the (stub) blackout. attachBattleFlow(scene) returns
// methods closed over the scene; OverworldScene keeps thin methods that delegate here.
import { isEncounterTile, zoneAt } from './map.js';
import { healParty } from '../engine/state.js';
import { rollEncounter } from './encounters.js';
import { makeMonster, resetBattleState } from '../battle/monster.js';

export function attachBattleFlow(scene) {
  return {
    /** Rolls for a wild encounter on the tile just arrived at, if it's grass with a zone and the
     *  party has a fighting-fit member (an empty/wiped party never triggers one). */
    checkEncounter(x, y) {
      const { map, state, player, rng } = scene;
      if (!isEncounterTile(map, x, y)) return;
      const zone = zoneAt(map, x, y);
      if (!zone) return;
      if (!state.party.some(m => m.hp > 0)) return;
      const hit = rollEncounter(zone, rng, player.skating ? 0.5 : 1);
      if (hit) scene.startWildBattle(hit.species, hit.level);
    },

    /** Jingle + flash/wipe, then hand the foe to whoever owns the scene stack (main.js). */
    startWildBattle(species, level) {
      const { db, rng, audio } = scene;
      const foeMonster = makeMonster(db.speciesById[species], level, db.movesById, rng);
      audio?.playJingle('encounter');
      scene.player.moving = false;
      scene.transition.start(() => scene.onEncounter?.(foeMonster));
    },

    /** Called by main.js's BattleScene onEnd once a battle is over: reset transient battle
     *  state, autosave, and — on a loss — get the player back into play. */
    onBattleEnd(result) {
      for (const m of scene.state.party) resetBattleState(m);
      scene.save.autosave(scene.state);
      if (result === 'lose') scene.blackout?.();
    },

    // TODO Task 32: replace this stub with the real blackout sequence (fade/text/carry to the
    // last healer). For now it just heals up and sends the player back to the game's start so a
    // loss doesn't strand them.
    blackout() {
      healParty(scene.state);
      scene.beginWarp(scene.db.mapData.start);
    },
  };
}
