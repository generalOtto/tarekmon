// Trainer battles on the overworld: line-of-sight spotting (a ! bubble, then the trainer walks up),
// talk-to-fight, the Haze Lounge gym (the shisha guy is healer + leader), the badge, and Suhaib's
// walk-in at the border strip. The scene owns one TrainerFlow and calls update/talk/recordWin.
import { npcAt, isWalkable, step } from './map.js';
import { inLineOfSight, faceToward } from './npc.js';
import { TILE_SIZE } from './tiles.js';
import { PAPER, INK } from './palette.js';
import { healParty } from '../engine/state.js';
import { makeMonster } from '../battle/monster.js';

const S = TILE_SIZE;
const ALERT_TICKS = 30, STEP_TICKS = 8;
const STRIP = { minY: 1, maxY: 3 }; // town rows north of the gate: the border strip
const DELTA = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export class TrainerFlow {
  constructor(scene) {
    this.scene = scene;
    this.seq = null; // { npc, phase: 'alert'|'walk', t, stopY? } while a spotted trainer approaches
    // Placed trainers carry only id/x/y/facing/sight; their sprite comes from trainers.json.
    for (const m of Object.values(scene.maps)) for (const t of m.trainers) t.sprite ??= this.data(t.id)?.sprite;
  }

  data(id) { return this.scene.db.trainersById?.[id]; }
  beaten(id) { return this.scene.state.defeatedTrainers.includes(id); }

  /** Idle-tick hook. Returns true while a trainer's bubble/walk-up owns the tick (input locked). */
  update() {
    const { player, state } = this.scene;
    if (this.seq) { this.advance(); return true; }
    if (player.moving || !state.party.some(m => m.hp > 0)) return false;
    const t = this.findLosTrainer();
    if (t) { this.seq = { npc: t, phase: 'alert', t: 0 }; return true; }
    if (this.championDue()) { this.seq = { npc: this.spawnSuhaib(0), phase: 'walk', t: 0, stopY: this.scene.map.champion.y }; return true; }
    return false;
  }

  /** First undefeated sighted trainer on this map that can see the player down a clear lane. */
  findLosTrainer() {
    const { map, player } = this.scene;
    return map.trainers.find(t => t.sight > 0 && !this.beaten(t.id) && inLineOfSight(t, player.x, player.y) && this.laneClear(t, player)) ?? null;
  }

  laneClear(t, p) {
    const { map } = this.scene;
    for (let [x, y] = step(t.x, t.y, t.facing); x !== p.x || y !== p.y; [x, y] = step(x, y, t.facing)) {
      if (!isWalkable(map, x, y) || npcAt(map, x, y)) return false;
    }
    return true;
  }

  advance() {
    const q = this.seq, { npc } = q;
    if (q.phase === 'alert') { if (++q.t >= ALERT_TICKS) Object.assign(q, { phase: 'walk', t: 0 }); return; }
    if (q.t === 0 && this.arrived(q)) { this.seq = null; this.scene.run(() => this.challenge(npc)); return; }
    if (++q.t >= STEP_TICKS) { [npc.x, npc.y] = step(npc.x, npc.y, npc.facing); q.t = 0; }
  }

  /** Stop beside the player, at stopY (Suhaib), or at anything in the way. */
  arrived({ npc, stopY }) {
    const { map, player } = this.scene;
    const [nx, ny] = step(npc.x, npc.y, npc.facing);
    if (nx === player.x && ny === player.y) return true;
    if (stopY !== undefined && npc.y >= stopY) return true;
    return !isWalkable(map, nx, ny) || !!npcAt(map, nx, ny);
  }

  /** Face each other, say the trainer's pre line, then start the battle. */
  async challenge(npc, id = npc.trainer ?? npc.id) {
    const { player, state } = this.scene, tr = this.data(id);
    npc.facing = faceToward(npc, player.x, player.y);
    player.facing = state.pos.facing = faceToward(player, npc.x, npc.y);
    await this.scene.say(tr.pre);
    this.beginBattle(tr);
  }

  beginBattle(tr) {
    const s = this.scene, { db, rng } = s;
    const foeParty = tr.team.map(m => makeMonster(db.speciesById[m.species], m.level, db.movesById, rng));
    const trainer = { id: tr.id, name: tr.name, payout: tr.payout, isChampion: tr.kind === 'champion' || undefined,
      speechAfterFaints: tr.speechAfterFaints, speech: tr.speech && db.dialogue?.[tr.speech] };
    for (const k of Object.keys(trainer)) if (trainer[k] === undefined) delete trainer[k];
    s.player.moving = false;
    s.transition.start(() => s.onBattle?.({ kind: 'trainer', foeParty, trainer }));
  }

  /** A pressed on an npc/trainer. Returns a promise if this flow handles it, else null (plain npc). */
  talk(npc) {
    const { map, state } = this.scene;
    const id = npc.trainer ?? (map.trainers.includes(npc) ? npc.id : null);
    const tr = id && this.data(id);
    if (!tr) return null;
    if (tr.kind === 'leader') return this.leaderTalk(npc);
    if (!this.beaten(id)) return this.challenge(npc, id);
    if (tr.kind === 'champion') return this.scene.say(npc.dialogue).then(() => this.beginBattle(tr)); // rematch
    return this.scene.say(tr.post);
  }

  /** The shisha guy: heals with the badge (null → the plain healer path); fights once the four
   *  regulars are down; otherwise tells you to wait for a table — and heals you anyway. */
  leaderTalk(npc) {
    const s = this.scene;
    if (s.state.badges.includes('haze')) return null;
    const regulars = Object.values(s.db.trainersById).filter(t => t.kind === 'regular');
    if (regulars.every(t => this.beaten(t.id))) return this.challenge(npc);
    return (async () => { await s.say('haze-leader-wait'); healParty(s.state); await s.say('haze-heal-2'); })();
  }

  /** Battle won: record it now (before the autosave) and return the outro to run. */
  recordWin({ id }) {
    const s = this.scene, { state, audio } = s, tr = this.data(id);
    if (!tr) return null;
    const lines = [], name = state.playerName;
    if (!this.beaten(id)) state.defeatedTrainers.push(id);
    if (tr.kind === 'leader' && !state.badges.includes('haze')) {
      state.badges.push('haze');
      lines.push(() => { audio?.playJingle('badge'); return s.textbox.say(`${name} RECEIVED THE\nHAZE BADGE!`); });
    }
    if (tr.kind === 'champion' && !state.flags.champion) {
      state.flags.champion = true;
      lines.push(async () => { audio?.playJingle('victory'); await s.textbox.say(`${name} IS THE\nDUMPLING CHAMPION!`); s.onChampion?.(); });
    }
    return async () => { await s.say(tr.post); for (const line of lines) await line(); };
  }

  // ── Suhaib ────────────────────────────────────────────────────────────────────
  championDue() {
    const { map, state, player } = this.scene;
    return !!map.champion && state.badges.includes('haze') && !state.flags.champion
      && player.y >= STRIP.minY && player.y <= STRIP.maxY && !map.npcs.some(n => n.id === 'suhaib');
  }

  spawnSuhaib(y) {
    const c = this.scene.map.champion;
    const npc = { id: 'suhaib', x: c.x, y, facing: y === c.y ? c.facing : 'down', sprite: 'npc-suhaib', dialogue: 'suhaib-rematch', trainer: 'suhaib' };
    this.scene.map.npcs.push(npc);
    return npc;
  }

  /** On entering a map: once champion, Suhaib just stands at his tile (e.g. after a reload). */
  placeChampion() {
    const { map, state } = this.scene;
    if (map.champion && state.flags.champion && !map.npcs.some(n => n.id === 'suhaib')) this.spawnSuhaib(map.champion.y);
  }

  // ── drawing ───────────────────────────────────────────────────────────────────
  /** Pixel offset for an npc mid-step in the walk-up (so it glides instead of hopping). */
  offset(npc) {
    const q = this.seq;
    if (!q || q.npc !== npc || q.phase !== 'walk') return [0, 0];
    const [dx, dy] = DELTA[npc.facing], f = (q.t / STEP_TICKS) * S;
    return [dx * f, dy * f];
  }

  /** The ! bubble above a spotted trainer: a small paper box with an ink border. */
  drawBubble(ctx, ox, oy) {
    const q = this.seq;
    if (!q || q.phase !== 'alert') return;
    const x = q.npc.x * S - ox + 4, y = q.npc.y * S - oy - 12;
    ctx.fillStyle = INK; ctx.fillRect(x, y, 8, 11);
    ctx.fillStyle = PAPER; ctx.fillRect(x + 1, y + 1, 6, 9);
    ctx.fillStyle = INK; ctx.fillRect(x + 3, y + 2, 2, 4); ctx.fillRect(x + 3, y + 7, 2, 2);
  }
}
