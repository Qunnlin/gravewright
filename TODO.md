# GRAVEWRIGHT — idea backlog

Curated from playtests (last update 2026-06-11). **Effort**: S (under half a
session) · M (a session) · L (multiple sessions) · XL (epic). **Priority**: P1
(next up) · P2 (soon) · P3 (someday). Within each group, sorted by priority,
then effort. Notes in *italics* are implementation thoughts for whoever (or
whichever Claude) picks the item up — see `docs/EXTENDING.md` for content
how-tos and `CLAUDE.md` for the contribution rules.

## ✅ Recently shipped

- [x] Stop/exit autopilot when the trial popup appears (commit `2acfda9`) —
  the world freezes turn-based until the wager is answered.
- [x] Buy-amount toggle (×1/×10/×max) in the Reaping tab (was already live in
  Crypt & Necromancy).

## Quick wins (S effort, mostly QoL)

- [ ] **(P1, S) Souls-on-death indicator** — show live what the current vessel
  would pay out if it died now. *HUD or Vessel tab: `soulsOnDeath(depth, kills)
  × d.soulMult × curseMult` — formula already exists in balance.ts.*
- [ ] **(P1, S) Don't start fresh sessions on autopilot** — a first-time
  player (incognito test) had the game playing itself in the background
  unnoticed. Unlock auto after the first death (or depth 10?) with a tutorial
  modal introducing it. *`state.auto=false` in defaultState; gate the AUTO
  button until `totalDeaths >= 1`; add a tutorial whisper + small modal.*
- [ ] **(P1, S) Visibly dim used shrines** — players try to reuse them.
  *render.ts: grey/no-glow glyph when `floor.shrine.used`.*
- [ ] **(P1, S) Lock equipped items** — per-slot lock so auto-equip can never
  replace them (completed-set protection already exists; this generalizes it).
  *Item or slot flag + padlock toggle in gearLine; check in acquireItem.*
- [ ] **(P1, S) Auto-mend procession toggle** — auto-spend bones to re-raise
  fallen minions mid-run. *Settings + satchel-bar-style toggle; hook in tick
  like the bone automaton.*
- [ ] **(P2, S) Protect-vestige-only option** — a protect tier between
  'legendary+' and 'nothing' that shields only set pieces. *PROTECT_MODES
  entry; mind the sentinel ordering (7 = nothing).*
- [ ] **(P2, S) Retroactive auto-scrap** — when the auto-scrap rule changes
  (or on pickup), items already in the satchel that fall under it get scrapped.
  *Apply filter on settings change + acquireItem; respect protect rule.*
- [ ] **(P2, S) Playtime stat & more statistics** — track active playtime
  (per cycle and lifetime), souls/min, deepest trial, etc. in Settings stats.
  *Accumulate in tick(); add to GameState + sanitize.*

## Gameplay & balance

- [ ] **(P1, M) Sets balance pass** — Vestiges have predictable but few stat
  types and should be *clearly* stronger than Legendaries; right now a good
  Legendary can out-stat them. Either raise SET_BUDGET_MULT, give pieces more
  stat lines, or add enchant-like unique powers per piece (preferred: powers —
  predictable stats are the identity, raw numbers aren't).
- [ ] **(P1, M) Defense rework** — 80% mitigation cap is reached quickly,
  after which DEF spending feels useless. *Likely: scale the mitigation
  constant with depth (`def/(def + 25 + 6·depth)`) so DEF becomes a treadmill;
  re-run balance-report after.*
- [ ] **(P1, M) Trial overhaul: bigger, longer, way harder** — the Sealed Hall
  should be a special stage in the dungeon's theme: one huge room, survive a
  timed onslaught of many enemies (not 3 small waves). Rewards scale with the
  new difficulty. *Dedicated genFloor mode (one giant hall), wave-spawner on a
  turn timer, victory = survive N turns or clear all; keep the 40% forfeit.*
- [ ] **(P2, M) More essence sinks** — e.g. *very slightly* increased trial
  and unique-drop chances, very expensive, carefully balanced. *New essence
  upgrades with tiny eff values; cap levels hard.*
- [ ] **(P2, M) More gold sinks** — gold piles up mid-run with little to do.
  Candidates: in-run gambler/peddler, shrine re-rolls, and the item-raising
  service below.
- [ ] **(P2, M) Raise Vestiges to current depth strength (for gold)** — very
  expensive re-forging so an old set piece scales up. ⚠ possibly OP — gate
  behind playtesting. *rollSetPiece(setId, slot, newDepth) replace-in-place;
  cost exponential in depth delta.*
- [ ] **(P2, M) Loot goblin** — ultra-rare special spawn, distinct look, tries
  to FLEE (new AI: run away from hero), drops a Vestige (or big loot) when
  caught. *Flee AI = step uphill on the hero BFS field; despawn after N turns.*
- [ ] **(P2, M) Procession rework** — make minions more interesting (positioning?
  abilities? minion gear?) so the Regalia set has a richer system to amplify;
  maybe a dedicated summoner class whose power IS the procession.
- [ ] **(P2, M) Player damage-over-time: burn/poison/bleed** — dot-inflicting
  weapon affixes. *Needs monster statuses (they currently have none): add
  `statuses: Status[]` to Monster, tick in monstersAct.*
- [ ] **(P2, M) More item modifiers** — on-kill gold burst, shrine discount,
  +trial souls, minion lifesteal, thorns, status-duration reduction. *Each:
  AFFIX_DEFS entry + scoreItem weight + recalc/combat hook + tooltip label.*
- [ ] **(P2, M) One or two more Vestige sets** — e.g. Ranger/Shadow bow-and-
  knife set, a greed/gold set. *Pattern in data/sets.ts + recalc bonuses.*
- [ ] **(P2, M) Depth-skip when overpowered** — replaying trivial floors with
  millions of HP is dead time: per-floor skip chance decaying with depth, or a
  levelable skill. *Cleanest: "the crypt does not bother resisting" — when
  d.atk dwarfs monsterHp(depth), auto-collapse the floor instantly.*
- [ ] **(P3, M) Lower classes less obsolete late game** — gather ideas:
  class mastery bonuses for vessels summoned N times, per-class feats,
  class-specific set interactions.
- [ ] **(P3, L) Active skill system** — player-triggered abilities (and/or
  vessel-AI-used skills) with cooldowns: a big pillar feature; design first.

## UX & presentation

- [ ] **(P1, M) Hover enemies/tiles on the map for stats** — canvas hover
  tooltip with monster name/HP/ATK/specials/enchants, tile info. *mousemove on
  canvas → cell → reuse the data-tip tooltip div directly.*
- [ ] **(P1, M) Status indicators top-left of the map** — icons for
  bless/poison/burn/etc. with turn counters, blinking when about to expire;
  extensible for future buffs/potions. *Draw in render.ts or absolutely-
  positioned DOM over the canvas frame.*
- [ ] **(P2, M) Log rework** — prettier and more informative: grouping/
  collapsing repeats ("×12"), icons, filter toggles (combat/loot/system),
  timestamps or depth markers.
- [ ] **(P2, L) New icons for classes & monsters** — current single-glyph look
  is plain; consider a sprite/icon dependency (e.g. a CC0 roguelike tileset or
  game-icons.net SVG set) for classes, monsters, items. *Touches render.ts
  glyph pipeline + UI chips; pick a license-clean source.*
- [ ] **(P2, M) Scarier dungeon palettes with depth** — tone shifts as you
  descend (dry bones → wet rot → void). Includes the **genua server-room
  biome** easter egg: rare deep floor in genua cooler purple + digital blue
  (cable-tray corridors, humming rack-walls). *Per-depth palette table +
  biome flag on Floor.*
- [ ] **(P2, S) CRT / old-TV / arcade filter, toggleable in Settings** —
  scanlines exist; full filter adds phosphor glow, vignette, slight chromatic
  aberration. *CSS layers on #app; `settings.crtFilter` default off; respect
  prefers-reduced-motion.*

## Systems & meta

- [ ] **(P1, M) Admin/dev test room** — a gitignored dev page (or `?dev=1`
  mode) to spawn any item/set/monster/trial, grant currencies, jump depths —
  for testing everything quickly. *Gitignored `dev.html` + exposed window.GW
  helpers, or a dev-only panel module excluded from the build by env flag.*
- [ ] **(P2, L) Codex (in-game wiki)** — entries unlock as monsters are slain
  / items found: stats, specials, uniques, mechanics (wrath, trials, reaping
  math). *`GameState.codex` counts (sanitize!); render from data tables so it
  never drifts; silhouette → name → full stats tiers.*
- [ ] **(P2, L) Leaderboard service** — separate small service; players upload
  saves, score computed SERVER-side from the save (never trust the client),
  version-pinned, plausibility checks (souls vs kills vs playtime). Light
  anti-cheat, not a fortress. *Bun/Node + SQLite; upload button in Settings.*
- [ ] **(P3, XL) Endgame activity that drives leaderboard scores** — when
  everything is maxed, something must keep players going (infinite scaling
  trial? weekly seeds? wrath-embracing challenge modes). Explicitly lowest
  priority; design after the leaderboard exists.

## genua / GeekWeek easter eggs (subtle, never in-your-face)

- [ ] **(P2, M) Hidden class "The Admin"** — cryptic unlock (complete the
  genuGate? a riddle?). Perk ideas: sees the whole floor (monitoring), shrines
  free (root access), perimeter bonus.
- [ ] **(P2, S) genua-flavored relics** — "Air-Gapped Phylactery", "The Patch
  Notes (read at last)", "Cold Spare".
- [ ] **(P3, S) GeekWeek references** — rare log line, a feat, a once-in-a-
  blue-moon vessel name ("Intern of the GeekWeek").
