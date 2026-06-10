# GRAVEWRIGHT — idea backlog

Compiled from playtests (2026-06-10). Roughly ordered by my guess at
impact/effort; reorder freely. Notes in *italics* are implementation thoughts
for whoever picks the item up.

## Gameplay & balance

- [ ] **Defense rework** — you hit the 80% mitigation cap super quickly, after
  which spending on defense feels useless. Decide: is that wanted?
  *Likely fix: the `mitigation = def/(def+35)` constant should scale with depth
  (e.g. `def/(def + 25 + 6·depth)`) so DEF is a treadmill like ATK/HP instead
  of a one-time checkbox. Alternatively let overcap DEF convert into something
  (regen? block?). Touches `balance.ts:mitigation` + Ossified Hide / Winding
  Sheet pricing; re-run the balance report after.*

- [ ] **Skip early depths once strong** — replaying trivial floors with
  millions of HP is dead time. Ideas: per-floor skip chance that decays with
  depth, or a levelable skill.
  *Cleanest fit: an essence upgrade or soul skill "Ravenous Descent" — when a
  floor is ≥N× overpowered (compare `game.d.atk` vs `monsterHp(depth)`), the
  vessel auto-descends instantly / the floor collapses ("the crypt does not
  bother resisting"). Deep Memory (start depth) already exists — this should
  feel different: dynamic, power-based, not a flat start bonus.*

- [ ] **Burn/Poison/Bleed damage for the player** — monsters have dots; the
  vessel doesn't. Add dot-inflicting weapon affixes/enchant-style mods.
  *Needs a monster status system (currently only hero has statuses) — Monster
  gets `statuses: Status[]`, ticked in monstersAct. Then affixes `ignite`,
  `envenom`, `laceration` (bleed = phys dot, stacks?). Mind perf: ≤30 monsters.*

- [ ] **One or two more Vestige sets** — e.g. a Ranger/Shadow-flavored set
  (bow/knife theme) and a gold/greed set. Keep `data/sets.ts` pattern: fixed
  names, share-based budgets, 2pc/3pc bonuses wired in `recalc()`.

- [ ] **More item modifiers** — current 11 affixes. Candidates: on-kill gold
  burst, shrine discount, +trial souls, minion lifesteal, thorns,
  status-duration reduction. *Each needs: AFFIX_DEFS entry, scoreItem weight,
  recalc/combat hook, tooltip label.*

## Presentation

- [ ] **Scarier dungeon palettes with depth** — color/tone shifts as you
  descend (drier bones → wet rot → void). Include the **genua server-room
  biome** easter egg: a rare deep floor styled in genua cooler purple +
  digital blue (cable-tray corridors, humming "racks" as walls?).
  *Render-side: per-depth palette table in render.ts; biome flag on Floor.*

- [ ] **Old TV / arcade CRT filter, toggleable in settings** — scanlines exist
  (subtle); the full filter adds barrel distortion vibe, vignette, phosphor
  glow, slight chromatic aberration.
  *CSS-only on #app (filter + overlay layers) or a canvas post-pass. Settings
  toggle `settings.crtFilter`, default off; respect prefers-reduced-motion.*

## genua / GeekWeek easter eggs (subtle!)

- [ ] **Hidden class "The Admin"** — unlocked by something cryptic (complete
  the genuGate? a riddle?). Perk ideas: sees the whole floor (monitoring),
  shrines free (root access), starts with the firewall's perimeter bonus.
- [ ] **genua-flavored relics** — e.g. "Air-Gapped Phylactery", "The Patch
  Notes (read at last)", "Cold Spare". Drop conditions can be mundane.
- [ ] **GeekWeek reference** — the game was built at genua's GeekWeek
  hackathon. Ideas: a once-per-game log line, a "geek week" 7-day-streak feat,
  a vessel name that very rarely rolls ("Intern of the GeekWeek").
  *Keep all of these discoverable, never in the player's face.*

## Systems

- [ ] **Leaderboard service** — separate small service; players upload saves,
  it computes a score. Must pin the game version; "not too easy to manipulate"
  but doesn't need to be bulletproof.
  *Sketch: score = f(lifetimeSouls, bestDepth, reaps, trialsWon) recomputed
  server-side from the uploaded save (never trust a client score). Sanity-check
  the save with the same mergeState rules + plausibility bounds (souls vs
  kills vs playtime rates). Sign uploads with a per-install id. Tech: tiny
  Bun/Node service + SQLite; client gets an "Upload to leaderboard" button in
  Settings with the version baked in.*

- [ ] **Codex (in-game wiki)** — entries unlock as monsters are slain / items
  are found: monster stats & specials, item types, uniques, mechanics
  (wrath, trials, reaping math).
  *New tab; `GameState.codex: Record<string, number>` (kill/find counts —
  sanitize in mergeState!). Entry tiers: silhouette → name → full stats at N
  kills. Mechanics pages are static text; monster data renders from
  data/monsters.ts so it never drifts. Tutorial whispers could link here.*
