# Playtest round 1 — phone viewport (375×812)

Date: 2026-09-26 · branch `dev` · browser pane, mobile preset, keyboard + synthetic key taps.

**Method note.** The opening (items 1–7) was played as a normal game from a cleared save. For speed,
items 8–10 used a *temporary* edit of the `?start=` dev path in `src/main.js` (a `&boost=N` party of
Chillbao/Suhaibro/Dumplord at level N, `&badge=1`, 9 wet wipes, 2 napkins) plus a temporary
`window.__g` debug handle for reading position/state. Both were reverted before any commit
(`git checkout -- src/main.js`); none of it is in the history.

## Checklist

| # | Result | Note |
|---|---|---|
| 1 | ✅ | Title → NEW GAME → 7 intro pages → name entry (TAREK prefilled; A adds a letter, B deletes it; Start accepts) → lab. Mat blocks with NOT WITHOUT A DUMPLING. Pedestal: preview card, TAKE IT? YES → received. The other two pedestals draw empty and say EMPTY. SOMEONE WAS FASTER. Lab exit → town. |
| 2 | ✅ | Route 1 encounter (Lampface L3). FIGHT → Exhale, HP bars tween, battle texts auto-advance (~0.75 s hold). BAG → WET WIPE → party picker → healed 11→23. DUMPLINGBALL caught it first throw. RUN from a second encounter. No console errors (sound itself is not audible in the pane). |
| 3 | ✅ | Stepped into Napkin Nic's lane at (13,24): he walked up, pre line, battle won, post line NOT BAD. NOT GOOD EITHER.; talking again repeats the post line. |
| 4 | ✅ | Ribs shop: BUY → DUMPLINGBALL ×3 → $600 → $300, HERE YOU GO. / DON'T EAT THE BALLS. LEAVE line closes the shop. |
| 5 | ✅ | Before the regulars HAZE GUY says the wait line, then heals (heal-2, three pages) with the jingle. After the badge: WELCOME TO HAZE LOUNGE… + heal. Fridge: deposit OK, depositing the last dumpling refused (YOU CAN'T LEAVE WITHOUT A DUMPLING), withdraw OK. The "party full" withdraw refusal needs 6 in the party — not reachable in this run, covered by `test/ui/fridge.test.js`. Regulars: all four beaten (boosted run); a normal L5 party loses to Regular Al (used for item 7). |
| 6 | ✅ | DUMPLINGDEX list (SEEN 5 / CAUGHT 2), entry page, Start toggles NUMBER/NAME sort. DUMPLINGS summary + SWITCH swaps order (and back). Field BAG: WET WIPE on a full-HP party → IT WON'T HAVE ANY EFFECT. SAVE → TAREK SAVED THE GAME. → SAVE CODE COPIED TO CLIPBOARD. (only with a real key press; synthetic key events get no clipboard permission, and that failure is silent by design). SOUND OFF persists across reload (`tarekmon.muted`), in the menu and on the speaker button. |
| 7 | ✅ | Lost to Regular Al at L5 (and again at L8 via `?start`): TAREK BLACKED OUT! → fade → Haze mat → heal lines → TAREK DROPPED $389 ON THE WAY. Money halved ($300→$150; $777→$388). |
| 8 | ✅ | `?date=2026-01-02`: rack → THE BOARD FEELS RIGHT TODAY., sprite on the board, ~2× speed (held Up ≈ 7 tiles/s). Haze door parks it (`boardParked`); walking out → THE BOARD IS BACK. WHIRR. and riding again. `?date=2026-01-01` → IT DOESN'T FEEL RIGHT TODAY. The halved encounter rate is code + test verified (`battleflow.js` ×0.5, `encounters.test.js`), not measured. |
| 9 | ✅ | (Boosted L20 party — see method note.) 4 regulars + HAZE GUY beaten; TAREK GOT THE HAZE BADGE!; the officer flips from NO BADGE, NO CROSSING. to BADGE CHECKS OUT…, then gives 3 Extra Sauce once; the gate opens (walked through (25,4)). Before the badge the gate says it's locked with a badge-shaped hole. |
| 10 | ✅ | Step into the strip → Suhaib walks in → pre (4 pages) → battle; speech THREE HOURS. EACH WAY. EVERY WEEK. after his 3rd faint → win → post → TAREK IS THE DUMPLING CHAMPION! → credits: sunset, sticker parade, scrolling lines, nightfall, typed birthday card with a blinking ♥ → A → title with CONTINUE highlighted → CONTINUE → back at (25,3) with Suhaib at (25,2). Talk → REMATCH? I ALREADY BOOKED THE RETURN TRIP. → rematch won → post line only, no credits. |
| 11 | ✅ | Napkin from the field BAG → fade → TAREK WIPED HIS WAY BACK TO HAZE LOUNGE. on the Haze mat. LOAD CODE with the clipboard denied → paste prompt (cancelled) → THAT'S NOT A SAVE CODE. |
| 12 | ✅ | Desktop preset (pane 472×620), reload: title cursor driven by the keyboard, Game Boy frame centered. |
| 13 | ✅ | `grep -rni "pokemon\|pokémon\|nintendo" src data index.html` → nothing. |
| 14 | ✅ | `read_console_messages` onlyErrors after route 1, shop/Haze, skate, gym/border and title → no errors. |

## Bugs and rough edges

| id | where | what | severity | status |
|---|---|---|---|---|
| P1 | Skate rack corner, town (5,33) | Driver Dee (sight 3, facing down from (5,31)) spots a player coming up from the rack at (5,34), walks to (5,33) and stays there after the battle. That is the only walkable gap north of the rack row (rack, sign and weather guy fill the rest), so the south entrance of the skate route stays plugged. Not a softlock: the route is also reachable from town at (8,18). | low | OPEN — acceptable as-is; to keep the south entrance open, drop Driver Dee's sight to 2 (he'd spot the player at (5,33) and stop at (5,32), leaving (4,33)/(6,33) free). Guard test added: no trainer walk-up may cut off reachable tiles (`test/world/map.test.js`). |
| P2 | Every YES/NO question (lab TAKE IT?, title LOAD THIS SAVE? / NEW GAME over a save) | The ▶ "more text" arrow stayed frozen on the question's last page under the YES/NO menu, inviting an A press the menu then took as YES. | low | FIXED — `TextBox.question` hides the arrow on the question's last page; regression test in `test/ui/textbox.test.js`. |
| P3 | Start menu | DUMPLINGDEX ended 1 px from the box border. | cosmetic | FIXED — menu 88 → 96 px wide. |
| P4 | Balance, gym → border | A normal party reaches the gate well under L18 (see below). | medium | OPEN — proposal below. |
| P5 | Title → LOAD CODE | Cancelling the paste prompt says THAT'S NOT A SAVE CODE. (same as pasting garbage). | cosmetic | OPEN — current tests (`title.test.js`) treat null as a bad code on purpose; a softer "NO CODE." line needs a decision. |
| P6 | Overworld input | Direction taps landing while a step is in progress are dropped (no buffering), so rapid tapping moves fewer tiles than taps. Holding works as expected. | cosmetic | Not a bug (GB-like); noted only. |

## Balance (design target: ~L20 before Suhaib)

Observed on the normal run: after Napkin Nic and one catch the starter was still **L5** (188/216 XP),
and a two-dumpling L5/L3 party was swept by Regular Al (L12/L13). The normal run was not carried to
the gate; the gate figure is computed from the data with the game's own `xpGain`/`levelForXp`
(trainer ×1.5), assuming **every** trainer XP point goes to one dumpling and no wild battles:

`napkin-nic L5 · wet-will L6 · coal-kid L8 · lounge-liz L9 · skater-dan L11 · driver-dee L12 · regular-1 L13 · regular-2 L14 · regular-3 L15 · regular-4 L15 · haze-guy L17`

So even a single carry sits at **L15 going into HAZE GUY (L16–18 ×5)** and **L17 at the gate**; a party
that shares XP lands around L13–15 each. Wild XP is small (route 1 ≈ 30, route 2 ≈ 60, skate ≈ 170 per
win): L17 → L20 needs ~2,800 XP ≈ 17 skate wins. The boosted run backs this up: three **L20**
dumplings only just beat HAZE GUY (one fainted, one left on 1 HP).

**OPEN — proposal (not applied):** double the trainer XP bonus for `regular`/`leader` kinds (×3 instead
of ×1.5), which puts a single carry at ~L20 at the gate (two dumplings sharing: ~L16 each); or add a
one-time level-up item to the booth officer's Extra Sauce gift. Lowering HAZE GUY to L14–16 would
fix the gym spike but not the gate level.

Applied: trainer XP ×3 (controller decision 2026-09-26); re-check levels at the gate in round 2.

## Commits

- `8ab11a3` fix: hide the textbox's more-text arrow under a YES/NO menu
- `cfa7b5e` fix: widen the Start menu so DUMPLINGDEX clears the border
- `30a46bc` test: guard against trainers parking on a map bottleneck after a walk-up

Tests: 326 pass (was 324).
