# Changelog

All notable changes to GRAVEWRIGHT are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), versions follow
[semver](https://semver.org/): **patch** = fixes & balance nudges, **minor** =
features & content, **major** = save-breaking or pillar-level changes.
Every merged PR adds its entry under *Unreleased*; a release dates the heading
and bumps `src/core/version.ts` + `package.json`.

## [Unreleased]

### Added

- Equipment audit instrumentation: `test/equipment-audit.spec.ts` prints
  rarity-throughput, weapon-kind and Vestige-vs-legendary tables and pins
  the invariants (slot legality, caps, monotonic rarity power, the Vestige
  weapon/armor primary promise); `test/affixes.spec.ts` pins every affix's
  exact wiring. (#36)

### Fixed

- Regeneration (gear, class, Unbroken) now applies on keyboard turns —
  `manualMove` ticked DoTs and monsters but silently skipped regen. (#36)
- The item-comparison tooltip's "overall better/worse" verdict now uses the
  favored-weapon-aware scorer (same as auto-equip), so it can no longer
  contradict the autopilot. (#36)
- Salvage tooltips quote the actual payout — including Midas Scrap ×3 and
  the Famine pact's ×0 — via a single `salvageValue()` source of truth. (#36)

### Added

- Automatic tags & releases on both remotes: every version bump that lands
  on `main` is tagged `vX.Y.Z` by CI; minor and major versions also get a
  GitHub Release with their changelog section as notes. The GitLab mirror
  (`.gitlab-ci.yml`) creates a Release per version (its job token can only
  tag through the Releases API). (#32)

## [1.1.1] — 2026-06-12

### Fixed

- **Tab bar, solved properly.** Six full-size labels need ~620px — more than
  the side rail's 560px maximum — so one row always bled ("Necromancy"
  overflowing into "Crypt"). The bar now responds to the rail's *real* width
  via a container query: below 620px it becomes a deliberate two-shelf
  register (3×3, full-size labels, no icons, no crushed type); a single row
  appears only in the stacked layout where the bar is genuinely wide.
  Verified overflow-free at 17 viewport widths from 420 to 1700px. The
  icon-only mode from v1.1.0 is gone. (#31)

## [1.1.0] — 2026-06-12 · The Crypt Grows Stranger

Everything since the GeekWeek release, delivered across PRs #1–#29.

### Added

- **The Codex** — an in-game wiki that unlocks as you play: mechanics pages
  computed from live balance constants, a bestiary with kill-count tiers
  (silhouette → name → full nature), champions, Vestige sets, relics, pacts
  and districts. Knowledge survives Reapings. Feats live inside it. (#26, #28)
- **Map hover inspector** — hover any seen cell for live monster stats,
  specials in plain language, vessel info, loot amounts and landmark detail;
  re-resolves every frame, yields to modals. (#8)
- **Status chips** over the map for bless/poison/burn with turn counters,
  blinking near expiry; click-through. (#8)
- **Depth atmosphere** — four palette eras (bone dust → wet rot → drowned
  cold → void) that hold flat and snap at boundaries, each crossing marked by
  an omen and a flash. (#8, #10)
- **Biome eras** — rare multi-floor districts with natives, loot hooks,
  palettes and omens: the genua **server room** (depth 13+), the **Drowned
  Archive** (50+), the **Ossuary City** (100+); 3-floor streaks spaced by a
  40-floor cooldown. (#8, #15)
- **The Ward** — defense rendered honestly: a luminous sheen glazing the
  health bar whose brightness *is* the reduction ratio, shards of light that
  crack off per absorbed hit, qualitative thinning omens on descent. DoTs
  visibly bypass it. (#20, #22, #23)
- **Log rework** — collapsed ×N repeats, persisted combat/loot/system filter
  chips, depth-divider lines, headline styling for deaths, bosses, reapings
  and feats. (#11)
- **CRT filter** (scanlines, phosphor grille, vignette, retrace band,
  chromatic fringing) — on by default; respects reduced motion. (#8, #17)
- **Autopilot speed slider** in the topbar (25–100% of the unlocked rate),
  visible while AUTO drives. (#10, #13, #16)
- **The Sealed Hall trial overhaul** — a true 60-turn arena onslaught ending
  in the Avatar; Vestige set pieces with named unique powers; the Smith
  (gold reforging); the Longwatch and Tithe-Gilded sets; the hidden Admin
  class and genua relics. (#3, #7)
- **Quality-of-life arc** — satchel inventory controls, item locks,
  auto-mend, auto-scrap with protect tiers, protect-vestiges, buy ×1/×10/×max,
  manual-first onboarding, dev room (`?dev=1`), distinct-relics stat,
  full-health shrine use on deliberate steps, hidden easter-egg feats. (#2,
  #5, #13, #17, #19, #27)

### Balance

- **Defense, rebuilt from zero** (owner design): `reduction = def/(def+K)`
  with `K = 1.5 × monsterAtk(depth)` — scale-invariant at any depth — plus a
  1% per-hit damage floor (no immortality) and a `defense = base × mult ×
  prestige` triad completed by the Grave Aegis essence upgrade. (#14 → #16)
- **Late-game pressure** — late ramp HP ×1.10 / ATK ×1.065 per depth past 12,
  Crypt Wrath +40% per hoarded threshold, monster DEF steepened. (#10)
- **Early-game lethality** — monster bases HP 10.5 / ATK 3.6, Ossified Hide
  halved. (#20)
- **Bone-scaling review** (measured, one knob per commit) — ferocity cost
  growth 1.17 → 1.28, LEVEL_STAT_MULT 1.09 → 1.085; the balance report now
  prints power audits and hero-vs-crypt race exponents, and asserts the wall
  is never one-shot territory. (#24)
- **Deep Memory** uncapped to 50 levels (start depth up to 101); longer
  buffs/debuffs (bless 40 / poison 7 / burn 5 turns). (#10, #17)
- Crypt Wrath, depth-scaled reap demands, and the death-economy curves from
  the first balance arc. (#4)

### Fixed

- Boss aeons read "Reborn V", not "IIIII"; the relics statistic no longer
  reads 90/15; the speed slider stopped fighting the panel re-render; stacked
  tab overflow on small screens (glyph mode in the squeeze band); trial-
  interrupted biome streaks no longer double-count or re-announce. (#13, #26,
  #28, #29)

## [1.0.0] — 2026-06-10 · The GeekWeek Release

The original 48-hour build: vessels delve, die, and fund the necromancy
economy (souls → upgrades → the Reaping → essence); seeded dungeon generation
with FOV and autopilot AI; bones/souls/essence shops; minion procession;
classes; curses; relics; champions; Vault Wardens; achievements; the
illuminated-grimoire interface; ZzFX sound; offline progress; robot-player
test suite.
