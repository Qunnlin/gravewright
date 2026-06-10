# ☠ GRAVEWRIGHT

*an incremental necromancy roguelike — your heroes die; that's the point.*

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
