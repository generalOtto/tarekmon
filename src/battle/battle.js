import { calcDamage, hitCheck } from './damage.js';
import { throwBall } from './catching.js';
import { chooseFoeMove, STRUGGLE } from './ai.js';
import { clampStage, xpGain, xpForLevel, MAX_LEVEL } from './stats.js';
import { addXp, resetBattleState } from './monster.js';
import { markSeen, markCaught } from '../engine/state.js';
import { defaultRng } from '../engine/rng.js';

const STAT_NAMES = { atk: 'ATTACK', def: 'DEFENSE', acc: 'ACCURACY' };
const NO_RUN = "NO! THERE'S NO RUNNING FROM A TRAINER BATTLE!";

/**
 * Headless battle state machine (pure, no DOM).
 *
 * Phases: 'choose' (waiting for chooseMove/useItem/switchTo/run) → a turn resolves
 * synchronously → back to 'choose', or 'mustSwitch' (the active player monster
 * fainted; only switchTo is accepted), or 'over' (result set, `end` event pushed,
 * every method a no-op). Each action pushes events onto `this.events` in the order
 * the scene should render them; the scene pulls them with drain().
 *
 * rng draw order in a move turn: foe AI (chooseFoeMove), speed-tie roll (only on
 * equal spd), then per action hitCheck, crit, damage roll; finally the wild Suhaib
 * flee roll.
 *
 * Skip ("held at the border") costs the held side one turn of any kind: a move,
 * an item, a voluntary switch or a run attempt is replaced by the HELD text, and
 * the foe still gets its action.
 */
export class Battle {
  constructor({ db, state, rng = defaultRng, kind, foeParty, trainer = null }) {
    if (kind === 'wild' && foeParty.length !== 1) throw new Error('Battle: a wild battle needs exactly one foe');
    Object.assign(this, { db, state, rng, kind, foeParty, trainer });
    this.events = [];
    this.result = null;
    this.foesFainted = 0;
    this.playerIndex = state.party.findIndex(m => m.hp > 0);
    if (this.playerIndex < 0) throw new Error('Battle: no party member with hp > 0');
    this.foeIndex = 0;
    markSeen(state, this.foe.speciesId);
    for (const m of [...state.party, ...foeParty]) resetBattleState(m);
    if (kind === 'wild') this.text(`A WILD ${this.foe.nickname} APPEARED!`);
    else { this.text(`${trainer.name} WANTS TO BATTLE!`); this.text(`${trainer.name} SENT OUT ${this.foe.nickname}!`); }
    this.text(`GO! ${this.player.nickname}!`);
    this.phase = 'choose';
  }

  get player() { return this.state.party[this.playerIndex]; }
  get foe() { return this.foeParty[this.foeIndex]; }

  /** Returns and clears the pending events. */
  drain() { const out = this.events; this.events = []; return out; }

  /** i: index into player.moves, or 'struggle' (the scene passes it when every move has 0 PP). */
  chooseMove(i) {
    if (!this.ready()) return;
    if (i !== 'struggle' && !(this.player.moves[i]?.pp > 0)) return this.text('NO PP LEFT FOR THAT MOVE!');
    const foeMove = this.pickFoeMove();
    const pSpd = this.player.stats.spd, fSpd = this.foe.stats.spd;
    const playerFirst = pSpd !== fSpd ? pSpd > fSpd : this.rng() < 0.5;
    const order = playerFirst ? [['player', i], ['foe', foeMove]] : [['foe', foeMove], ['player', i]];
    for (const [side, move] of order) {
      this.act(side, move);
      if (this.afterFaints()) return;
    }
    this.endTurn();
  }

  useItem(itemId, partyIndex) {
    if (!this.ready()) return;
    const item = this.db.itemsById[itemId];
    if (!item || !(this.state.bag[itemId] > 0)) return this.text("YOU DON'T HAVE THAT.");
    if (!['catch', 'heal', 'atkUp', 'escape'].includes(item.battle)) return this.text("THAT CAN'T BE USED HERE.");
    const wild = this.kind === 'wild';
    if (item.battle === 'catch' && !wild) return this.text("THE TRAINER BLOCKED THE BALL!\nDON'T BE WEIRD.");
    if (item.battle === 'escape' && !wild) return this.text(NO_RUN);
    const target = this.state.party[partyIndex ?? this.playerIndex];
    if (item.battle === 'heal' && (!target || target.hp <= 0 || target.hp >= target.maxHp)) return this.text("IT WON'T HAVE ANY EFFECT.");
    if (this.heldTurn()) return; // guards above cost nothing; being held costs the turn (item kept)
    this.state.bag[itemId]--;

    if (item.battle === 'catch') {
      const foe = this.foe, { success, wobbles } = throwBall(foe, this.species(foe).catchRate, this.rng);
      this.text(`${this.state.playerName} THREW A DUMPLINGBALL!`);
      this.push({ type: 'ball', wobbles, success });
      if (!success) { this.text('OH NO! IT BROKE FREE!'); return this.foeTurn(); }
      this.text(`GOTCHA! ${foe.nickname} WAS CAUGHT!`);
      markCaught(this.state, foe.speciesId);
      resetBattleState(foe);
      if (this.state.party.length < 6) this.state.party.push(foe);
      else { this.state.fridge.push(foe); this.text(`${foe.nickname} WAS SENT TO THE FRIDGE.`); }
      return this.endBattle('caught');
    }
    if (item.battle === 'escape') { this.text('YOU WIPED YOUR HANDS\nAND LEFT.'); return this.endBattle('ran'); }
    if (item.battle === 'heal') {
      const from = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + item.heal);
      if (target === this.player) this.push({ type: 'hp', side: 'player', from, to: target.hp, max: target.maxHp });
      this.text(`${target.nickname} RECOVERED ${target.hp - from} HP!`);
    } else if (item.battle === 'atkUp') {
      this.raise('player', 'atk', 1);
    }
    this.foeTurn();
  }

  switchTo(partyIndex) {
    if (this.phase === 'over') return;
    const next = this.state.party[partyIndex];
    if (!next) return this.text('CHOOSE A DUMPLING!');
    if (partyIndex === this.playerIndex) return this.text(`${next.nickname} IS ALREADY OUT!`);
    if (next.hp <= 0) return this.text(`${next.nickname} HAS NO ENERGY LEFT!`);
    const voluntary = this.phase === 'choose';
    if (voluntary && this.heldTurn()) return;
    if (this.player.hp > 0) this.text(`${this.player.nickname}, COME BACK!`);
    this.playerIndex = partyIndex;
    this.text(`GO! ${next.nickname}!`);
    resetBattleState(next);
    this.push({ type: 'switch', side: 'player', index: partyIndex });
    this.phase = 'choose';
    if (voluntary) this.foeTurn();
  }

  run() {
    if (!this.ready()) return;
    if (this.kind !== 'wild') return this.text(NO_RUN);
    if (this.heldTurn()) return;
    const chance = Math.min(1, Math.max(0, 0.5 + 0.5 * this.player.stats.spd / this.foe.stats.spd));
    if (this.rng() < chance) { this.text('GOT AWAY SAFELY!'); return this.endBattle('ran'); }
    this.text("CAN'T ESCAPE!");
    this.foeTurn();
  }

  /** The foe's lone action after a non-move player turn (item, switch, failed run). */
  foeTurn() {
    this.act('foe', this.pickFoeMove());
    if (!this.afterFaints()) this.endTurn();
  }

  /** End-of-turn checks once both sides are standing: a wild Suhaib may leave. */
  endTurn() {
    const sp = this.species(this.foe);
    if (this.kind === 'wild' && sp.who === 'suhaib' && this.rng() < 0.5) {
      this.text('...SUHAIB LEFT.\nHE HAS A LONG DRIVE HOME.');
      this.push({ type: 'flee' });
      this.endBattle('fled');
    }
  }

  /** One side uses a move (index into its moves, or 'struggle') on the other. */
  act(side, moveRef) {
    const user = this.mon(side), tSide = other(side), target = this.mon(tSide);
    const u = this.name(side), t = this.name(tSide);
    if (user.skipNext) { user.skipNext = false; return this.text(`${u} IS HELD AT THE BORDER!`); }
    let move = STRUGGLE;
    if (moveRef !== 'struggle') { const slot = user.moves[moveRef]; slot.pp--; move = this.db.movesById[slot.id]; }
    this.text(`${u} USED ${move.name.toUpperCase()}!`);
    if (!hitCheck(move, user, this.rng)) return this.text(`${u}'S ATTACK MISSED!`);
    if (move.text) this.text(move.text.replaceAll('{user}', u).replaceAll('{foe}', t).toUpperCase());
    if (move.power > 0) {
      const { damage, crit, typeMult } = calcDamage({
        attacker: user, attackerSpecies: this.species(user), defender: target, defenderSpecies: this.species(target),
        move, types: this.db.types, rng: this.rng,
      });
      const dealt = this.setHp(tSide, target.hp - damage);
      if (crit) this.text('A CRITICAL HIT!');
      if (typeMult > 1) this.text("IT'S SUPER EFFECTIVE!");
      if (typeMult < 1) this.text("IT'S NOT VERY EFFECTIVE...");
      if (move === STRUGGLE && dealt > 0) {
        this.setHp(side, user.hp - Math.ceil(dealt / 4));
        this.text(`${u} IS HURT BY THE FLAILING!`);
      }
    }
    this.applyEffect(side, move.effect ?? { kind: 'none' });
  }

  applyEffect(side, effect) {
    const user = this.mon(side), tSide = other(side), target = this.mon(tSide);
    if (target.hp <= 0 && (effect.kind === 'accDown' || effect.kind === 'skip')) return; // no effects on the fallen
    switch (effect.kind) {
      case 'accDown':
        target.stages.acc = clampStage(target.stages.acc - effect.stages);
        this.text(`${this.name(tSide)}'S ACCURACY FELL!`);
        this.push({ type: 'stat', side: tSide, stat: 'acc', stages: target.stages.acc });
        break;
      case 'atkUp': return this.raise(side, 'atk', effect.stages);
      case 'defUp': return this.raise(side, 'def', effect.stages);
      case 'heal':
        if (this.setHp(side, user.hp + Math.floor(user.maxHp * effect.fraction)) === 0) this.text("IT WON'T HAVE ANY EFFECT.");
        else this.text(`${this.name(side)} FEELS FRESH!`);
        break;
      case 'skip':
        target.skipNext = true;
        this.text(`${this.name(tSide)} IS STUCK IN LINE!`);
        break;
      default: break; // 'none', 'neverMiss'
    }
  }

  /**
   * Resolves any faints after an action. Returns true when the turn must stop
   * (someone fainted — the remaining actor does not act).
   */
  afterFaints() {
    const foeDown = this.foe.hp <= 0, playerDown = this.player.hp <= 0;
    if (!foeDown && !playerDown) return false;
    if (foeDown) {
      this.text(`${this.name('foe')} FAINTED!`);
      this.push({ type: 'faint', side: 'foe' });
      this.foesFainted++;
      if (!playerDown) this.gainXp(this.foe);
    }
    if (playerDown) {
      this.text(`${this.player.nickname} FAINTED!`);
      this.push({ type: 'faint', side: 'player' });
    }
    const playerOut = playerDown && !this.state.party.some(m => m.hp > 0);
    if (foeDown) {
      const tr = this.trainer, next = this.foeParty.findIndex(m => m.hp > 0);
      if (next < 0) { this.payout(); this.endBattle('win'); return true; } // a mutual KO on the last foe is a win
      if (!playerOut) {
        // Only reachable while the trainer has a monster left, so speechAfterFaints must be < team size.
        if (tr.speech && tr.speechAfterFaints === this.foesFainted) this.push({ type: 'speech', text: tr.speech });
        this.foeIndex = next;
        this.text(`${tr.name} SENT OUT ${this.foe.nickname}!`);
        this.push({ type: 'switch', side: 'foe', index: next });
        markSeen(this.state, this.foe.speciesId);
      }
    }
    if (playerOut) { this.text(`${this.state.playerName} IS OUT OF USABLE DUMPLINGS!`); this.endBattle('lose'); }
    else if (playerDown) this.phase = 'mustSwitch';
    return true;
  }

  gainXp(foe) {
    const p = this.player, amount = xpGain(this.species(foe), foe.level, this.kind === 'trainer');
    const hpBefore = p.hp, maxBefore = p.maxHp;
    const later = addXp(p, this.species(p), this.db.movesById, amount);
    const xpForNext = xpForLevel(Math.min(p.level + 1, MAX_LEVEL));
    this.push({ type: 'xp', side: 'player', amount, xp: p.xp, level: p.level, xpForLevel: xpForLevel(p.level), xpForNext });
    for (const e of later) this.push({ ...e, side: 'player' });
    if (p.hp !== hpBefore || p.maxHp !== maxBefore) this.push({ type: 'hp', side: 'player', from: hpBefore, to: p.hp, max: p.maxHp });
  }

  payout() {
    if (this.kind !== 'trainer') return;
    const amount = this.trainer.payout ?? 20 * Math.max(...this.foeParty.map(m => m.level));
    this.state.money += amount;
    this.push({ type: 'money', amount, total: this.state.money });
  }

  endBattle(result) {
    this.result = result;
    this.phase = 'over';
    this.push({ type: 'end', result });
  }

  /** Guards the 'choose'-only actions: no-op once over, nag while a switch is owed. */
  ready() {
    if (this.phase === 'over') return false;
    if (this.phase === 'mustSwitch') { this.text('CHOOSE A DUMPLING!'); return false; }
    return true;
  }

  /** If the player is held (skipNext), the chosen action is lost: HELD text, then the foe acts. */
  heldTurn() {
    if (!this.player.skipNext) return false;
    this.player.skipNext = false;
    this.text(`${this.player.nickname} IS HELD AT THE BORDER!`);
    this.foeTurn();
    return true;
  }

  pickFoeMove() {
    return chooseFoeMove(this.foe, this.species(this.foe), this.species(this.player), this.db.movesById, this.db.types, this.rng);
  }

  raise(side, stat, n) {
    const m = this.mon(side);
    m.stages[stat] = clampStage(m.stages[stat] + n);
    this.text(`${this.name(side)}'S ${STAT_NAMES[stat]} ROSE!`);
    this.push({ type: 'stat', side, stat, stages: m.stages[stat] });
  }

  /** Sets a side's hp (clamped to [0, maxHp]); pushes an hp event if it changed. Returns hp lost (negative = gained). */
  setHp(side, hp) {
    const m = this.mon(side), from = m.hp;
    m.hp = Math.max(0, Math.min(m.maxHp, hp));
    if (m.hp !== from) this.push({ type: 'hp', side, from, to: m.hp, max: m.maxHp });
    return from - m.hp;
  }

  mon(side) { return side === 'player' ? this.player : this.foe; }
  species(m) { return this.db.speciesById[m.speciesId]; }
  /** Display name in battle text: the foe is "WILD <NICK>" in wild battles. */
  name(side) { return side === 'foe' && this.kind === 'wild' ? `WILD ${this.foe.nickname}` : this.mon(side).nickname; }
  text(s) { this.push({ type: 'text', text: s }); }
  push(e) { this.events.push(e); }
}

const other = side => (side === 'player' ? 'foe' : 'player');
