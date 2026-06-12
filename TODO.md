# GRAVEWRIGHT — idea backlog

Curated from playtests (last update 2026-06-12, evening). **Effort**: S (under half a
session) · M (a session) · L (multiple sessions) · XL (epic). **Priority**: P1
(next up) · P2 (soon) · P3 (someday). Within each group, sorted by priority,
then effort. Notes in *italics* are implementation thoughts for whoever (or
whichever Claude) picks the item up — see `docs/EXTENDING.md` for content
how-tos and `CLAUDE.md` for the contribution rules.

## ✅ Recently shipped

Delivered work now lives in `CHANGELOG.md` (semver since v1.1.0) — this
section only tracks items shipped after the latest release, then they move
into the next version's notes.

## Quick wins (S effort, mostly QoL)

- [ ] **(P2, S) Per-hit ward float (optional)** — if the numberless ward
  leaves players wanting a figure, the honest one is a pale "ward ate N"
  float per landed hit (real damage prevented). *One emit already exists
  (`wardhit`); add a float in ui.ts behind settings.particles.*

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
- [ ] **(P1, M, needs human late-save) Bone income late-game check** — the
  bone-scaling pass fixed the eff/cost legs; the income leg (Grand Ossuary
  ×1.5^l max 30, bonePile/boneDrop) is unmeasurable by the 3-cycle robot.
  Verify minutes-to-next-level stays sane at reaps 5+ on a real save; trim
  Ossuary (×1.35 or lower max) if bones still firehose.
- [ ] **(P2, S, validation) Deep-era field trip** — nobody has organically
  visited the Drowned Archive (50+) or Ossuary City (100+); play a deep
  Deep-Memory save and check palettes/natives/loot feel + era thresholds.
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

