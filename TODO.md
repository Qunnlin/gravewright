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
- [x] Souls-on-death indicator — live `✦ N on death` in the HUD + Vessel stats
  (PR #2).
- [x] Manual-first onboarding — fresh games start without autopilot; the first
  death (or depth 10) awakens it, with a tutorial whisper (PR #2).
- [x] Visibly dim used shrines & wells (PR #2).
- [x] Lock equipped items — 🔒 per slot; locked items survive every automatic
  decision (PR #2).
- [x] Auto-mend procession toggle (PR #2).
- [x] QoL-as-essence-unlocks (PR #2): auto-mend, item locks and auto-scrap
  cost 1 ❖ each (Sexton / Quartermaster's Seal / Scrap-Tithe). ⚠ **Playtest
  experiment** — if gating comfort behind the first reap feels bad, revert by
  removing the `qolUnlocked` gates in game.ts/ui.ts (note also sits in
  upgrades.ts above the three entries).
- [x] Souls-on-death indicator moved onto the souls plaque as a small `+N`
  (PR #2).
- [x] Pending reap gain shown as a small `+N` on the essence plaque (PR #2).
- [x] Protect-vestiges setting (PR #5): set pieces exempt from every automatic
  scrap, toggleable once the Scrap-Tithe is owned; default ON.

- [x] Defense rework (PR #4): hero mitigation pivot now scales with depth
  (`def÷(def+25+6·depth)`) — DEF is a treadmill, not a one-time 80% checkbox.
- [x] Depth-skip (PR #4): **Ravenous Descent** essence upgrade — floors you
  overwhelm 2.5× collapse unentered (vaults included), tributing scraps;
  bosses and Sealed Halls always hold.
- [x] The Smith (PR #7): reforge Vestiges to current-depth strength for gold
  (⚒ buttons on gear & satchel; ~40 gold-piles per reforge; locks survive).
- [x] Two new Vestige sets (PR #7): **The Longwatch** (Ranger/Shadow — Deadeye,
  Fleetfoot, Quarry; full-set: ×2.4 crits + full-health damage) and **The
  Tithe-Gilded** (earned under the Pact of Famine — Tollkeeper, Midas Scrap,
  Usury; full-set: Golden Tide).
- [x] genua easter eggs (PR #7): hidden class **The Admin** (root in a dead
  domain — unlocked by wearing the full genuGate, survives reaps, sees every
  floor plan, free shrines, theft-proof), three genua relics (Air-Gapped
  Phylactery, The Patch Notes, Cold Spare), a GeekWeek vessel epithet and a
  once-in-a-blue-moon murmur.
- [x] Trial overhaul + sets balance pass (PR #7): the Sealed Hall is now a
  real arena — 60-turn survival onslaught (~40+ enemies) ending in the Avatar,
  no stairs, doubled rewards. Vestiges: budget 5× base (above the mean
  Legendary primary) and every piece carries a named unique power.
- [x] Big-rebalance part 1 (PR #4): late-depth ramp (HP ×1.08^(d−12),
  ATK ×1.05^(d−12)) + difficulty probes & wall-expedition instrumentation in
  the balance report. Measured: cycle-1 deaths 2→6, frontier monster threat
  100→≈25 hits, no-shop survival 20→10 min, post-reap wall at ~depth 20.
- [x] Canvas hover tooltips: hover any seen cell for monster stats/specials/
  enchants/flavor, vessel info, loot amounts and landmark details
  (src/ui/maptip.ts; rides the shared tooltip via a programmatic API).
- [x] Status indicators top-left of the map: bless/poison/burn chips with turn
  counters, blinking when about to expire; extensible via STATUS_META in ui.ts.
- [x] Scarier dungeon palettes with depth: four distinct eras (bone dust →
  wet rot → drowned cold → void, stops at depth 1/12/24/36) that hold flat and
  snap across the boundary, each crossing marked by an omen line + flash.
- [x] The **genua server-room biome**: starts rarely at depth 13+, runs for
  3 floors; cooler purple racks, blinking LEDs, native monsters (Daemon
  Process, Firewall Sentinel, Coolant Wraith — eligible for elite/champion
  rolls), 1.5× gold piles and data-cache chests (epic+); entry/exit murmurs;
  `?dev=1` has a force button.
- [x] CRT filter in Settings (default off): scanlines, phosphor grille,
  vignette, retrace band, chromatic fringing; respects prefers-reduced-motion.
- [x] Log rework (PR #9): consecutive repeats collapse into ×N pills,
  combat/loot/system filter chips (persisted), descend lines as depth
  dividers, big moments restyled as headlines (display font + glow).
- [x] Defense rework part 2 (PR #10): hero mitigation is now an asymptote
  toward 85% (no more hard cap pegging the panel at −80% for invested
  players); monster DEF steepened (coeff 0.9→1.0, growth 1.05→1.07).
- [x] Late-game scaling (PR #10, playtest feedback): late ramp HP 1.08→1.10,
  ATK 1.05→1.065 per depth past 12; Crypt Wrath slope 0.25→0.40. Measured:
  frontier monTTK 1000+→59–100, wall expedition d20→d18, cycle-1 pacing
  unchanged. Needs human feel-validation.
- [x] Deep Memory uncorked (PR #10): max 10→50 (start depth up to 101),
  cost growth 2.5→1.9 — the endgame frontier should live in the hundreds.
- [x] Autopilot speed slider (PR #10): Settings range 25–100% of the
  unlocked action rate; persisted, applies to autopilot and click-to-move.

## Quick wins (S effort, mostly QoL)

- [ ] **(P2, S) Retroactive auto-scrap** — when the auto-scrap rule changes
  (or on pickup), items already in the satchel that fall under it get scrapped.
  *Apply filter on settings change + acquireItem; respect protect rule.*
- [ ] **(P2, S) Playtime stat & more statistics** — track active playtime
  (per cycle and lifetime), souls/min, deepest trial, etc. in Settings stats.
  *Accumulate in tick(); add to GameState + sanitize.*

## Gameplay & balance

- [ ] **(P1, L) THE BIG REBALANCE — part 2 (part 1 shipped in PR #4).**
  Remaining: validate against real human playtests; the asymptotic race
  (optimal income growth vs monster curves) still allows one-shot bands
  mid-cycle — intended power fantasy now that Ravenous swallows them, but
  re-measure after play feedback.
  Optimally-shopped vessels out-scale the monster curves and late-game
  difficulty collapses (the balance report already shows near-immortal
  frontier vessels). Some of this may resolve via other items — faster depth
  traversal/skip removes the "easy floors are boring" half, the defense
  rework removes the mitigation checkbox, Crypt Wrath bites hoarders — but a
  dedicated pass is needed on top. *Approach: extend balance-report with
  difficulty metrics (vessel TTK vs monster TTK by depth, deaths per hour at
  optimal play, income-vs-monster-curve exponent comparison), then tune
  monster curves / income growth / wrath slope / item budgets until the
  frontier stays lethal at every stage. Tie in the trial overhaul as the
  intended hard content.*
- [ ] **(P2, M) More essence sinks** — e.g. *very slightly* increased trial
  and unique-drop chances, very expensive, carefully balanced. *New essence
  upgrades with tiny eff values; cap levels hard.*
- [ ] **(P2, M) More gold sinks** — gold piles up mid-run with little to do.
  Candidates: in-run gambler/peddler, shrine re-rolls, and the item-raising
  service below.
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
- [ ] **(P3, M) Lower classes less obsolete late game** — gather ideas:
  class mastery bonuses for vessels summoned N times, per-class feats,
  class-specific set interactions.
- [ ] **(P3, L) Active skill system** — player-triggered abilities (and/or
  vessel-AI-used skills) with cooldowns: a big pillar feature; design first.

## UX & presentation

- [ ] **(P2, M) Log rework** — prettier and more informative: grouping/
  collapsing repeats ("×12"), icons, filter toggles (combat/loot/system),
  timestamps or depth markers.
- [ ] **(P2, L) New icons for classes & monsters** — current single-glyph look
  is plain; consider a sprite/icon dependency (e.g. a CC0 roguelike tileset or
  game-icons.net SVG set) for classes, monsters, items. *Touches render.ts
  glyph pipeline + UI chips; pick a license-clean source.*

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

