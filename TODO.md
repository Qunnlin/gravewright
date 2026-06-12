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

- [x] ~~THE v1.1 FEEL-PASS~~ — **verdict (2026-06-12): "feels great, the
  defense rework was amazing."** The Ward + eHP system and the lethality
  tuning are human-validated. Still open from the original list (folded
  into the items below): bone income at reaps 5+ (needs a deep save) and
  the deep-era field trip.
- [ ] **(P2, M, needs a deep save) Bone income at reaps 5+** — Grand
  Ossuary (×1.5^l, max 30) is unmeasurable by the 3-cycle robot; check
  minutes-to-next-level stays sane deep into prestige, trim to ×1.35 if
  bones firehose.
- [ ] **(P2, S, validation) Deep-era field trip** — nobody has organically
  visited the Drowned Archive (50+) or Ossuary City (100+); play a deep
  Deep-Memory save and check palettes/natives/loot feel + era thresholds.
- [ ] **(P2, M) More essence sinks** — e.g. *very slightly* increased trial
  and unique-drop chances, very expensive, carefully balanced. *New essence
  upgrades with tiny eff values; cap levels hard.*
- [x] ~~More gold sinks~~ — shipped as v1.4.0: the Peddler's mystery wares,
  shrine re-lighting (×3 per use), and shrine/reforge price bites.
- [x] ~~EQUIPMENT REEVALUATION (audit phase)~~ — done in PR #36: all 11
  affixes traced end-to-end and pinned with tests (one real bug: keyboard
  turns skipped regen — fixed); weapon kinds and rarity budgets audited
  (tables in test/equipment-audit.spec.ts). Remaining design findings live
  in the two items below.
- [x] ~~COOL NEW AFFIXES + VESTIGE REWORK~~ — shipped as v1.2.0 (PR #37):
  dot resist / thorns / cleave; depth-scaled % caps ("slower, with depth");
  five curated lines per Vestige piece (charms recovered 16%→~120% of
  legendary value, all pinned). Remaining affix ideas for a later batch:
  on-kill gold burst, shrine discount, +trial souls, minion lifesteal,
  status-duration reduction, soul-on-crit, echo strike. *scoreItem weight
  spread (atk 2.0 vs xpPct 0.36 per budget point) still unaddressed —
  revisit if auto-equip keeps dumping utility gear.*
- [x] ~~Loot goblin~~ — shipped as v1.4.0: the fleeing golden `¤` (first
  flee AI), 30-turn despawn, gold burst + pact-gated Vestige sack.
- [ ] **(P2, M) Procession rework** — make minions more interesting (positioning?
  abilities? minion gear?) so the Regalia set has a richer system to amplify;
  maybe a dedicated summoner class whose power IS the procession.
- [ ] **(P2, M) Player damage-over-time: burn/poison/bleed** — dot-inflicting
  weapon affixes. *Needs monster statuses (they currently have none): add
  `statuses: Status[]` to Monster, tick in monstersAct.*
- [ ] **(P3, M) Lower classes less obsolete late game** — gather ideas:
  class mastery bonuses for vessels summoned N times, per-class feats,
  class-specific set interactions.
- [ ] **(P3, L) Active skill system** — player-triggered abilities (and/or
  vessel-AI-used skills) with cooldowns: a big pillar feature; design first.

## UX & presentation

- [ ] **(P2, L) New icons for classes & monsters** — current single-glyph look
  is plain; consider a sprite/icon dependency (e.g. a CC0 roguelike tileset or
  game-icons.net SVG set) for classes, monsters, items. *Touches render.ts
  glyph pipeline + UI chips; pick a license-clean source.*

## Systems & meta

- [ ] **(P2, L) Leaderboard service** — separate small service; players upload
  saves, score computed SERVER-side from the save (never trust the client),
  version-pinned, plausibility checks (souls vs kills vs playtime). Light
  anti-cheat, not a fortress. *Bun/Node + SQLite; upload button in Settings.*
- [ ] **(P3, XL) Endgame activity that drives leaderboard scores** — when
  everything is maxed, something must keep players going (infinite scaling
  trial? weekly seeds? wrath-embracing challenge modes). Explicitly lowest
  priority; design after the leaderboard exists.

## genua / GeekWeek easter eggs (subtle, never in-your-face)

