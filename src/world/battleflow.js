// Battle flow for the overworld: tall-grass encounter rolls, the jingle + flash/wipe into a
// battle, the post-battle cleanup, and the blackout. attachBattleFlow(scene) returns
// methods closed over the scene; OverworldScene keeps thin methods that delegate here.
import { isEncounterTile, zoneAt } from './map.js';
import { healParty } from '../engine/state.js';
import { rollEncounter } from './encounters.js';
import { makeMonster, resetBattleState } from '../battle/monster.js';
import { hazeEntrance } from './items.js';
import { onWarpSkate } from './skate.js';

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
      scene.audio?.stopMusic();
      scene.audio?.stopLoopSfx?.(); // the skate loop shouldn't play over battle music
      scene.audio?.playJingle(jingle);
      scene.player.moving = false;
      scene.transition.start(() => scene.onBattle?.({ kind, foeParty, trainer }));
    },

    /** Called by main.js's BattleScene onEnd once a battle is over: reset transient battle
     *  state, record a trainer win (before the autosave), autosave, then either black out (loss)
     *  or play the trainer's outro (post line, badge, champion). A lost trainer stays undefeated. */
    onBattleEnd(result, { kind, trainer } = {}) {
      for (const m of scene.state.party) resetBattleState(m);
      scene.audio?.startMusic('overworld');
      if (scene.player.skating) scene.audio?.startLoopSfx?.('skate'); // resume the board's loop if still on it
      const outro = result === 'win' && kind === 'trainer' ? scene.trainerFlow.recordWin(trainer) : null;
      scene.save.autosave(scene.state);
      if (result === 'lose') scene.blackout?.();
      if (outro) scene.run(outro);
    },

    /** A lost battle: "<NAME> BLACKED OUT!" on the spot, fade out; at full dark halve the money,
     *  heal, land on the Haze Lounge mat (autosaved); fade in to the shisha guy's heal-2 line and,
     *  if anything was dropped, how much. */
    blackout() {
      const { state, textbox, map: fromMap } = scene;
      scene.run(async () => {
        await textbox.say((scene.db.dialogue?.blackout ?? '{name} BLACKED OUT!').replaceAll('{name}', state.playerName));
        let lost = 0;
        scene.afterFade = async () => {
          await scene.say('haze-heal-2');
          if (lost > 0) await textbox.say(`${state.playerName} DROPPED $${lost}\nON THE WAY.`);
        };
        const w = hazeEntrance(scene.maps);
        onWarpSkate(state, fromMap, scene.maps[w.map]); // Haze Lounge is indoors: parks the board if it was out
        if (scene.player.skating) scene.audio?.stopLoopSfx?.(); // the old player is about to be replaced (defaults to skating=false)
        scene.beginWarp(w, () => {
          lost = state.money - Math.floor(state.money / 2);
          state.money -= lost;
          healParty(state);
        });
      });
    },
  };
}
