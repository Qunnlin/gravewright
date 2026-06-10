# ☠ GRAVEWRIGHT

*an incremental necromancy roguelike — your heroes die; that's the point.*

> ⚠️ **This is a vibe-coded project.** It was built during (and after hours of)
> genua's **GeekWeek** hackathon as an experiment in what Claude Code can do —
> and to have some fun. Read [About this project](#about-this-project) before
> judging the code too kindly or too harshly.

You are the **Gravewright**, chained beneath an endless crypt. You summon cheap,
hopeful heroes ("vessels") and send them down. They auto-explore procedurally
generated floors, fight, loot — and die. Every death is harvested as **souls**;
every kill leaves **bones**. Spend both to make the next vessel crueler, raise an
undead procession to march beside them, unlock darker vessel classes, and—once you
reach depth 10—**Reap**: collapse the whole crypt into permanent **essence**.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

or build a static bundle:

```bash
npm run build      # type-checks + bundles into dist/
npm run preview    # serves dist/
```

## Play it

- The vessel plays itself (autopilot). Watch, shop, optimize.
- **WASD / arrows** seize manual control (classic turn-based roguelike rules:
  nothing moves until you do). **P** resumes autopilot, **Space** descends on `▼`,
  **click** the map to send the vessel somewhere.
- **Vessel** — stats, gear, doctrine (Cautious / Balanced / Reckless), minions.
- **Necromancy** (souls) — speed, siphons, vision, minions, classes.
- **Crypt** (bones) — the meat itself: HP, attack, crit, fortune, gear retention.
- **Reaping** (essence) — prestige multipliers, deeper starts, curse pacts, Lichdom.
- Shrines `☩` heal for gold. Soul wells `◉` pay souls. Bosses every 5th depth
  guard the stairs and drop relics. Vessels too stubborn to die can be Reclaimed
  for 60% of the souls.
- **Champions** — rare blue-glowing monsters carrying Diablo-style enchantments
  (*Gilded*, *Soulbranded*, *Volatile*, *Phasing*, …). Name tags over special
  monsters tell you what you're charging into; their corpses pay accordingly.
- **The Satchel** — a 10-slot inventory with manual equip/unequip/salvage and an
  auto-equip toggle. Weapons have archetypes (Blade/Heavy/Polearm/Bow/Focus)
  gated by class: Rangers shoot bows, Liches channel foci, nobody hands the
  Lich an axe. Favored archetypes strike 20% harder.
- **The procession marches** — your raised minions are visible on the map,
  trailing the vessel through the dark.
- **The Trial of the Sealed Hall** — a rainbow shrine `◈` appears deep in the
  crypt (and there are quieter ways to summon one…). Swear the wager: three
  waves of keepers for a **Vestige** — rainbow set items with fixed, named
  pieces that scale to the depth they were won at, and full-set bonuses.
  Lose or flee, and the Hall keeps two-fifths of your souls. Rumor says one
  set only reveals itself to a *hardened* crypt.
- **Vaults** — ~10% of floors hide a violet-tiled treasure room. Its Warden `Ω`
  is brutally strong but always drops a **Legendary** item and a hoard.
- Hover anything for a tooltip; the crypt itself whispers a short tutorial as
  each mechanic first becomes relevant.
- Saves automatically (localStorage), exports/imports as a string, and pays
  offline progress (50% rate, 12 h cap).

## Stack

TypeScript + Vite. Canvas 2D renderer, DOM panels, [ZzFX](https://github.com/KilledByAPixel/ZzFX)
synth sound, bundled Cinzel + JetBrains Mono. The core simulation
(`src/core/`) is DOM-free and fully testable headless.

## Tests

```bash
npm test                      # vitest: dungeon gen, balance, saves, inventory,
                              # and a robot player that plays to depth 10 and
                              # through full prestige cycles
npx vitest run test/balance-report.spec.ts
                              # prints a pacing report: 3 prestige cycles of
                              # optimal play, with curve assertions
node test/browser-smoke.mjs   # headless-Chromium boot/play/save/reload test
                              # (needs `npx playwright install chromium`, and the
                              #  preview server: npm run build && npm run preview)
```

## Architecture

```
src/core/        pure simulation — no DOM, no canvas, no audio
  balance.ts       every progression curve and economy formula in one file
  dungeon.ts       floor generation, FOV raycasting, BFS pathfinding
  game.ts          the Game class: tick loop, hero AI, combat, shops, prestige
  data/            monsters, classes, items, upgrades, relics, curses, feats
src/ui/          canvas renderer, DOM panels, sound — all driven by the event bus
test/            vitest suites + a real-browser smoke test
```

## About this project

This game was built during genua's **GeekWeek** hackathon, after hours, as a
vibe-coding experiment — to explore what Claude (via Claude Code) is capable
of, and to have some fun along the way.

Full transparency: **I have not written most of the productive code in this
repository.** My contribution is prompts, playtesting, direction and taste;
the code itself was written by Claude Code, session by session. That's the
experiment.

And that's exactly why this matters to me: **game developers — and software
developers in general — are awesome.** AI tools, Claude Code very much
included, are amazing, but they are *tools*. They should support and amplify
human creativity, never replace it. If anything, watching an AI assemble a
small game in a few evenings deepens the respect for the people who design,
build, balance and polish real games over years. This project has nothing on
real game development — and it isn't trying to.

## Contributing

This repo is meant to be shared with the team — humans and their Claude Codes
alike. PRs welcome.

**Humans:**

```bash
git clone git@github.com:Qunnlin/gravewright.git && cd gravewright
npm install
npm run dev        # play at :5173
```

1. Pick something from [`TODO.md`](TODO.md) (or bring your own idea).
2. Branch from `main`: `feat/<slug>`, `fix/<slug>`, `balance/<slug>` or
   `docs/<slug>`. **Never commit to `main` directly.**
3. `npx tsc --noEmit && npx vitest run` must be green; run
   `node test/browser-smoke.mjs` for UI changes and the balance report
   (`npx vitest run test/balance-report.spec.ts`) for economy changes.
4. Open a PR and assign it to **@Qunnlin** (for now).
5. Author your own commits under your own name.

**Claude Codes:** clone the repo and just start a session — Claude reads
[`CLAUDE.md`](CLAUDE.md) (architecture, invariants, contribution rules) on its
own. A good first prompt is "pick a P1 item from TODO.md and implement it".
Content additions (monsters, items, sets, relics, achievements…) have a
step-by-step guide in [`docs/EXTENDING.md`](docs/EXTENDING.md). Commits made
by a Claude are committed by that Claude and carry a
`Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer — keep the
honesty of who wrote what.
