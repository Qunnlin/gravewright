# GRAVEWRIGHT — project orientation

An incremental necromancy roguelike (browser, TypeScript + Vite). Core fantasy:
**your heroes ("vessels") die, and their deaths are the economy** — souls fund
permanent upgrades, prestige ("the Reaping") converts cycles into essence.
Built during genua's GeekWeek hackathon; contains deliberate genua easter eggs
(see *Lore & easter eggs* below — keep them subtle).

## Commands

```bash
npm run dev                                  # dev server, hot reload (:5173)
npm test                                     # vitest, ~70 tests, all headless
npm run build                                # tsc --noEmit && vite build → dist/
npm run preview                              # serve dist (:4173; tests use :4823)
npx vitest run test/balance-report.spec.ts   # pacing report: robot plays 3 prestige
                                             # cycles, prints metrics, asserts curve
node test/browser-smoke.mjs                  # real-Chromium boot/play/save test
                                             # (needs preview server on :4823 and
                                             #  npx playwright install chromium)
```

The browser smoke test can flake ONCE right after a rebuild (preview server
swaps dist assets mid-load). Re-run before investigating.

## Architecture

```
src/core/          pure simulation — NO DOM/canvas/audio; fully headless-testable
  types.ts           all shared types (GameState, RunState, Floor, Item, Derived…)
  balance.ts         EVERY tuning constant & curve formula lives here
  rng.ts             seeded mulberry32 (seedRng in tests → determinism)
  events.ts          bus: the ONLY channel from sim to UI (log/float/sound/dirty…)
  dungeon.ts         floor gen, FOV raycasting, BFS pathfinding, spawnMonster
  game.ts            the Game class: tick loop, hero AI, combat, shops, inventory,
                     prestige, trials, offline progress (~1700 lines, the heart)
  save.ts            localStorage + base64 export; mergeState() SANITIZES every
                     field of loaded saves — extend it whenever GameState grows
  data/              pure data tables: monsters, classes, items (+WEAPON_KINDS),
                     upgrades, relics, curses, achievements, enchants (champions),
                     sets.ts (Vestiges), names
src/ui/            render.ts (canvas), ui.ts (DOM panels/modals/toasts),
                   tooltip.ts (data-tip), tutorial.ts (contextual whispers),
                   sound.ts (zzfx presets)
src/main.ts        boot order matters: initRender/initUI BEFORE applyOffline
test/              vitest suites + browser-smoke.mjs + balance-report
```

## Key mechanics & invariants (violating these = bug)

- **Currencies**: gold is run-scoped (lost on death, minus Marrow Memory);
  bones/souls persist; essence survives reaping. All multipliers funnel through
  `recalc()` → the cached `Derived` object `game.d`.
- **Crypt Wrath** (`cryptWrath()`): hoarding souls past reap-readiness scales
  monster HP/ATK on NEW floors. The anti "never reap, get OP" mechanic.
- **Reaping**: needs souls ≥ `essenceGain ≥ 1` AND depth ≥ `reapDepthRequired
  (reaps)` = 10+2/reap (anti reap-spam). Resets everything except essence
  upgrades, feats, essence (+ Reliquary-Eternal relics).
- **Curses snapshot at summon** into `run.curseIds`; live toggles affect only
  the next vessel. Wrath & curses both enter `genMods()`.
- **Mid-run state is NEVER persisted** — saves null the run; equipped gear is
  carried via `keptGear`. Reload = fresh summon.
- **Item rarities**: 0–4 random, 5 Legendary (forced rolls only: Vault Wardens,
  deep bosses), 6 **Vestige** (set pieces ONLY via `rollSetPiece`; rainbow UI).
- **protectRarity sentinel is 7** for "protect nothing" (6 is Vestige!).
- **Trials**: opt-in 3-wave boss rush; death OR stair-flight = `failTrial` →
  40% soul forfeit + zero death payout. The genuGate set requires the Iron
  Crypt pact active at victory. Hidden ritual: 3 shrines in one life →
  `trialPending`.
- **Auto-equip** has 5% hysteresis and never breaks a fully-worn 3-piece set
  (`completesWornSet`).
- The hero AI fights any awake monster before exploring; trial waves spawn
  awake, so autopilot fights them naturally and won't wander off.

## Contribution rules (fixed — these are not suggestions)

- **Never commit directly to `main`.** Every change goes on a feature branch:
  `feat/<slug>`, `fix/<slug>`, `balance/<slug>`, `docs/<slug>`.
- Open a PR to `main` and **assign it to @Qunnlin** (for now):
  `gh pr create --assignee Qunnlin --title "…" --body "…"`. The PR body states
  what changed, why, and the test evidence.
- **Before any PR**: `npx tsc --noEmit && npx vitest run` green; run
  `node test/browser-smoke.mjs` for UI-touching changes and
  `npx vitest run test/balance-report.spec.ts` for economy/balance changes.
- **Authorship is honest**: when Claude writes the code, Claude makes the
  commit and ends the message with
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
  Human contributors author their own manual commits under their own name —
  no Claude trailer on human-written changes.
- Content additions (monsters, items, affixes, sets, relics, curses,
  achievements, classes) follow the step-by-step guide in `docs/EXTENDING.md`.
- **Versioning & changelog**: every merged PR adds its entry to
  `CHANGELOG.md` under *[Unreleased]*. Releases follow semver — **patch** =
  fixes & balance nudges, **minor** = features/content, **major** =
  save-breaking or pillar changes — and bump `src/core/version.ts` (the
  single source of truth, shown in Settings) + `package.json`, then date the
  Unreleased heading. `GameState.v` is the save schema version; never
  conflate the two.

## Conventions

- All balance/pacing knobs go in `balance.ts` with intent comments; data tables
  in `src/core/data/`. UI strings get `esc()` when dynamic; tooltip HTML lives
  in double-quoted `data-tip` attributes → `attrSafe()`.
- Tests use `seedRng(n)` + `bus.clear()`; the robot player (shop/play helpers
  in sim & balance-report specs) is the canonical "plays the actual game" test.
- After ANY change run: `npx tsc --noEmit && npx vitest run`. For features
  touching saves, extend `mergeState()` sanitization + `test/save.spec.ts`.
- Heavy reviews of new features have been done via multi-agent adversarial
  workflows; keep findings-driven fixes documented in commit messages.

## Lore & easter eggs (subtle, never in-your-face)

- genua (cybersecurity, firewalls): the **genuGate** Vestige set
  (genuScreen/genuWall/genuKey, AIRGAP bonus = packet filtering). Earned only
  with a hardened crypt (Iron pact). Hint line: "Only a hardened crypt yields
  the Gate."
- Planned (see TODO.md): server-room dungeon biome (genua cooler purple +
  digital blue), hidden "Admin" class, GeekWeek references.

## Where things stand

See `TODO.md` for the curated idea backlog (next session's work). README.md is
the player-facing doc. Design history & decisions: `~/.claude/.../memory/
gravewright-game.md` (auto-memory).
