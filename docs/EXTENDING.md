# Extending GRAVEWRIGHT — content guide

Almost all content lives as plain data tables in `src/core/data/`. Most
additions are "add an entry, wire one hook, add a test". This guide goes
type by type; the [universal checklist](#universal-checklist) at the bottom
applies to everything.

## Monsters

`src/core/data/monsters.ts` → `MONSTERS: MonsterDef[]`.

```ts
{ key: 'ghast', name: 'Pallid Ghast', glyph: 'q', color: '#9fb',
  minDepth: 9, window: 8,         // spawns at depths [minDepth, minDepth+window]
  hpMult: 1.2, atkMult: 1.1, defMult: 1, tier: 2,
  specials: ['vampiric'], flavor: 'It misses being hungry.' }
```

- Stats are multipliers on the depth curves in `balance.ts` (`monsterHp`,
  `monsterAtk`, `monsterDef`). `tier` scales XP and lowers spawn weight.
- `specials` come from the fixed `MonsterSpecial` union in `types.ts`
  (`fast`, `slow`, `poison`, `burn`, `vampiric`, `ranged`, `regen`, `summon`,
  `thief`, `armored`, `deadly`). A *new* special needs combat/AI code in
  `game.ts` (`monsterAct` / `monsterAttack`) — grep an existing one.
- Make sure every depth keeps a non-empty pool: `eligibleMonsters` has a test
  in `test/dungeon.spec.ts` ("never empty, to depth 500").
- Boss names: `BOSS_NAMES` (same file). Vault Warden names: `WARDEN_NAMES` in
  `data/enchants.ts`.

## Champion enchantments

`src/core/data/enchants.ts` → `ENCHANTS: EnchantDef[]`. Stat mults, added
specials, and loot bonuses (`goldDrop`, `boneDrop`, `soulMult`) work purely
from data. Behavior flags like `volatile`/`phasing` have bespoke hooks in
`game.ts` (`killMonster`, `monsterAct`) — a new behavior flag needs code.
The enchant `prefix` becomes part of the monster's name ("Gilded Venomous…"),
so keep it one strong word.

## Classes

`src/core/data/classes.ts` → `CLASSES`. `cost` is souls (`-1` + an
`essenceUnlock` id for essence-gated classes). Mechanical perks are the
optional fields (`blockPct`, `ranged`, `healOnKill`, `regen`, `berserk`,
`dodge`, `crit`, `soulMult`, `minionMult`) — all read in `recalc()`/combat;
a new perk type needs a `Derived` field + hook. Don't forget **weapon
proficiency**: add the class id to the `classes`/`favored` arrays of the
relevant `WEAPON_KINDS` in `data/items.ts`, and to `trialSetFor` in
`data/sets.ts` if it should earn a specific set.

## Weapon kinds & bases

`src/core/data/items.ts` → `WEAPON_KINDS`. Adding *bases* (names) to an
existing kind is free. Adding a new *kind* means: extend the `WeaponKind`
union in `types.ts`, set `classes` (null = everyone) and `favored`, and check
`fixWeaponKind` in `save.ts` (unknown kinds fall back to `'blade'`).

## Item affixes

Three places, all mandatory:

1. `types.ts`: extend the `Affix` union.
2. `data/items.ts`: `AFFIX_DEFS` entry — `slots` it may roll on, `perBudget`,
   and for percent affixes the depth-scaled cap (`capBase + capPerDepth·depth`,
   hard-ceilinged by `cap`)
   (value per point of depth-scaled budget), `cap` (0 = uncapped), `label`.
   Plus a weight in `scoreItem` so auto-equip values it.
3. The effect itself: simple stat reads happen via `gearStat('<affix>')` in
   `recalc()` (`game.ts`); combat-time effects (like `lifesteal`) hook into
   `heroAttack`/`monsterAttack`.

Test pattern: `test/inventory.spec.ts` → "new affixes feed derived stats".

## Vestige sets

`src/core/data/sets.ts` → `SETS`. Pieces have **fixed names and fixed affix
shares** (of `itemStatBudget(depth) × SET_BUDGET_MULT`) — only magnitudes
scale with the depth the trial was won at. To add a set:

1. Add the `SetDef` (3 pieces: weapon/armor/charm; weapon needs a `kind`).
2. Wire the 2pc/3pc bonuses in `recalc()` (`game.ts`, the `setCount` block).
   New bonus *mechanics* need `Derived` fields + combat hooks (see
   `negateChance`/`oathstone` for the pattern).
3. Route it: `trialSetFor()` decides which classes earn it (or gate it behind
   a condition like the genuGate's iron-pact rule in `trialVictory`).
4. Tests live in `test/trial.spec.ts` ("every set defines all three slots"
   will catch malformed sets automatically).

Rarity 6 renders as rainbow automatically (`rCls`/`rStyle` in `ui.ts`).

## Relics

`src/core/data/relics.ts` → `RELICS`. Existing hook fields (`soulMult`,
`boneMult`, `goldMult`, `atkMult`, `hpMult`, `xpMult`, `minionMult`, `crit`,
`vision`, `tickBonus`, `keepGear`, `shrinesFree`) are all read in `recalc()`
— data-only additions just work. New hook types need recalc wiring. Relics
are unique (one copy ever); drop chances live in `killMonster`.

## Curses

`src/core/data/curses.ts` → `CURSES`. `soulMult` is required (the reward);
`monsterHpMult`/`monsterAtkMult`/`monsterCountMult` apply at floor
generation, `heroHpMult` in recalc, `goldMult` at award time. Curses snapshot
into the run at summon — never read live state mid-run.

## Achievements (feats)

`src/core/data/achievements.ts` → `ACHIEVEMENTS`. Just `{ id, name, desc,
check(GameState) }` — each unlocked feat grants +2% souls automatically.
If your check needs a new counter, add it to `GameState` (`types.ts`),
`defaultState()` (`game.ts`), the `NUM_FIELDS` sanitization list (`save.ts`),
and increment it where it happens.

## Upgrades (the three shops)

`src/core/data/upgrades.ts` → `BONE_UPGRADES` / `SOUL_UPGRADES` /
`ESSENCE_UPGRADES`. Pricing is `base × growth^level` up to `max`
(`Infinity` = uncapped). `eff(level)` returns the aggregate effect — but the
*interpretation* of that number is wired by id inside `recalc()` (or
elsewhere: see `circle` for cooldowns, `automaton` for a behavior unlock).
A new upgrade id always needs one read-site. Compounding per-level effects
(`1.14^level`) are the house style — they must keep pace with exponential
monster curves.

Minions are in the same file (`MINIONS`): `atkFrac`/`hpFrac` scale off the
hero, `intercept` is the bodyguard chance, `tags` are bespoke (`piercing`,
`scavenger`).

## Flavor

Vessel names & epithets, death lines: `src/core/data/names.ts`. Mystic log
lines and tutorial whispers: `src/ui/tutorial.ts` and the `log(…, 'mystic')`
call sites. Keep genua easter eggs subtle (see CLAUDE.md → Lore).

## Balance constants

Every curve and tuning knob is in `src/core/balance.ts` with intent comments.
After touching economy numbers, run the pacing report and read it:

```bash
npx vitest run test/balance-report.spec.ts
```

## Universal checklist

1. `npx tsc --noEmit && npx vitest run` — green before any PR.
2. **GameState grew?** → `defaultState()` + `mergeState()` sanitization in
   `save.ts` + a case in `test/save.spec.ts` (corrupted saves must never
   produce NaN or unknown ids).
3. **UI shows your strings?** → `esc()` anything dynamic; tooltip HTML goes
   through `attrSafe()`.
4. Add or extend a test — the robot-player specs are the gold standard.
5. Economy touched? → balance report. UI touched? → browser smoke test.
6. Follow the contribution rules in `CLAUDE.md` (feature branch, PR assigned
   to @Qunnlin, honest authorship).
