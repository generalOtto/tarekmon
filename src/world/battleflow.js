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

    startWildBattle(species, level) {
      const { db, rng } = scene;
      this.startBattle({ kind: 'wild', foeParty: [makeMonster(db.speciesById[species], level, db.movesById, rng)] });
    },

    /** The one way into any battle: jingle + flash/wipe, then hand it to whoever owns the scene
     *  stack (main.js) via scene.onBattle. */
    startBattle({ kind, foeParty, trainer = null, jingle = 'encounter' }) {
      scene.audio?.playJingle(jingle);
      scene.player.moving = false;
      scene.transition.start(() => scene.onBattle?.({ kind, foeParty, trainer }));
    },

    /** Called by main.js's BattleScene onEnd once a battle is over: reset transient battle
     *  state, record a trainer win (before the autosave), autosave, then either black out (loss)
     *  or play the trainer's outro (post line, badge, champion). A lost trainer stays undefeated. */
    onBattleEnd(result, { kind, trainer } = {}) {
      for (const m of scene.state.party) resetBattleState(m);
      const outro = result === 'win' && kind === 'trainer' ? scene.trainerFlow.recordWin(trainer) : null;
      scene.save.autosave(scene.state);
      if (result === 'lose') scene.blackout?.();
      if (outro) scene.run(outro);
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
