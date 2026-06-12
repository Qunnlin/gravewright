/**
 * All progression curves and economy formulas in one place.
 *
 * Design intent:
 *  - Monsters scale exponentially with depth; the player's *permanent* upgrades
 *    are multiplicative-per-level so walls are pushed, not hit.
 *  - A fresh game reaches depth 2–4 on the first vessel (~90s), depth 10 and the
 *    first Reaping in ~15–25 minutes, then essence compresses everything.
 */

/** ---- monster curves ---- */

/** Past the midgame the crypt compounds harder. Measured fix for "the game
 *  gets very easy": optimally-shopped income out-grows the base curves, so
 *  the frontier (depth ~16+) was one-shot territory with harmless monsters
 *  (probes: heroTTK 1, monTTK 30–100). The ramp bends both curves upward
 *  past LATE_RAMP_START without touching the well-paced early game.
 *  Steepened 2026-06-12 (playtest: "monsters scale way slower than the
 *  player, late game") — HP 1.08→1.10, ATK 1.05→1.065 per depth. */
export const LATE_RAMP_START = 12;

function lateRamp(depth: number, rate: number): number {
  return Math.pow(rate, Math.max(0, depth - LATE_RAMP_START));
}

/** Bases raised 2026-06-12 (playtest: "I don't even die in the early game…
 *  they also die super fast") — HP 9→10.5, ATK 3.2→3.6 lift the whole curve
 *  ~15% so the first floors draw blood again without touching the exponents. */
export function monsterHp(depth: number): number {
  return 10.5 * Math.pow(1.23, depth - 1) * lateRamp(depth, 1.10);
}

export function monsterAtk(depth: number): number {
  return 3.6 * Math.pow(1.19, depth - 1) * lateRamp(depth, 1.065);
}

/** Steepened with the 2026-06-12 defense pass (playtest: "mob defense seems
 *  super low/not scaling"): deep monsters now shrug off real fractions of a
 *  hit via mitigation(), instead of def being a rounding error. */
export function monsterDef(depth: number): number {
  return Math.max(0, (depth - 1) * 1.0 * Math.pow(1.07, depth - 1));
}

export function monsterXp(depth: number, tier: number): number {
  return Math.ceil((4 + depth * 2) * (1 + tier * 0.35));
}

export const ELITE_HP_MULT = 3.2;
export const ELITE_ATK_MULT = 1.5;
export const BOSS_HP_MULT = 9;
export const BOSS_ATK_MULT = 1.9;

/** Champions: rare enchanted monsters (Diablo-style). */
export function championChance(depth: number): number {
  return Math.min(0.10, 0.05 + depth * 0.002);
}
export const CHAMPION_HP_MULT = 1.9;
export const CHAMPION_ATK_MULT = 1.15;

/** Vault Wardens: mini-bosses guarding sealed treasure rooms. */
export const VAULT_CHANCE = 0.10;
export const MINIBOSS_HP_MULT = 5.5;
export const MINIBOSS_ATK_MULT = 1.6;

/** ---- hero curves ---- */

export const HERO_BASE_HP = 32;
export const HERO_BASE_ATK = 5;
export const HERO_BASE_DEF = 0;
export const HERO_BASE_CRIT = 4;       // %
export const HERO_BASE_CRITDMG = 2.0;  // multiplier
export const HERO_BASE_VISION = 7;
export const HERO_BASE_TICKRATE = 3.2; // actions per second

export function xpForLevel(level: number): number {
  return Math.ceil(22 * Math.pow(1.42, level - 1));
}

/** Per-run level bonus: compounding on atk & hp. */
export const LEVEL_STAT_MULT = 1.09;

/** Damage mitigation from defense: smooth, capped at 80%.
 *  Used for MONSTER defense (their def values already scale with depth). */
export function mitigation(def: number): number {
  return Math.min(0.8, def / (def + 35));
}

/** HERO defense — the eHP system (designed by the owner, 2026-06-12).
 *  One stat, one ratio:
 *
 *    reduction = def / (def + K),  K = DEF_K_BASE · monsterAtk(depth)
 *    damage    = max(raw · (1 − reduction), raw · DEF_MIN_DMG_FRAC)
 *
 *  K scales with local enemy POWER (not depth linearly), so the system is
 *  scale-invariant: 100× defense vs 100× enemy damage = the same reduction
 *  at depth 1 and depth 10,000 — a defensive build never silently decays.
 *  The damage floor means no amount of armor is true immortality (every
 *  hit lands ≥1%), so investing never stops mattering and there is no
 *  invincible-then-one-shot cliff. The UI never shows % reduction — it
 *  shows EFFECTIVE HP, which is linear and unbounded in defense, so every
 *  purchased point visibly raises a number forever.
 *
 *  DEF_K_BASE = 1.5 derived from the tuning checklist: a fresh vessel's
 *  first armor purchase (Ossified Hide 1 ≈ 2.2 DEF) vs depth-1 enemies
 *  (monsterAtk(1) = 3.2, K = 4.8) sits at 2.2/7.0 ≈ 31% — inside the
 *  prescribed 20–40% fresh-run band. (2.0 pushed the fresh post-reap
 *  wall expedition down to depth 14, under the report's ≥15 gate.) */
export const DEF_K_BASE = 1.5;
export const DEF_MIN_DMG_FRAC = 0.01;

/** The defense pivot against the local population's power. */
export function defenseK(depth: number): number {
  return DEF_K_BASE * monsterAtk(depth);
}

/** Damage that gets through the hero's armor. */
export function heroDamageAfterDef(raw: number, def: number, depth: number): number {
  const k = defenseK(depth);
  return Math.max(raw * (k / (def + k)), raw * DEF_MIN_DMG_FRAC);
}

/** Effective HP vs the local depth: maxHp stretched by armor. Linear and
 *  unbounded in defense (the headline number the player sees), bounded
 *  only by the damage floor. */
export function heroEffectiveHp(maxHp: number, def: number, depth: number): number {
  const k = defenseK(depth);
  return maxHp * Math.min((def + k) / k, 1 / DEF_MIN_DMG_FRAC);
}

/** ---- statuses (previously hardcoded in game.ts; playtest 2026-06-12:
 *  "buffs/debuffs should last longer" — durations raised so the new status
 *  chips have time to matter) ---- */

/** Shrine blessing: +25% damage for this many hero turns (was 25). */
export const BLESS_TURNS = 40;
/** Poison: hero-turns of dot (was 4) and power as a share of the raw hit. */
export const POISON_TURNS = 7;
export const POISON_POWER = 0.25;
/** Burn: shorter but hotter (was 3). */
export const BURN_TURNS = 5;
export const BURN_POWER = 0.35;

/** Ravenous Descent: floors collapse when the vessel out-damages their
 *  monsters' (wrath-scaled) health by this factor. Tuned so the fall ends
 *  roughly where fights stop being one-shots (~2.5× raw ≈ TTK 2 after
 *  monster mitigation). */
export const RAVENOUS_OVERKILL = 2.5;

/** Damage variance band: rolls multiply attack by [1-V, 1+V]. */
export const DMG_VARIANCE = 0.15;

/** ---- economy ---- */

export function goldPile(depth: number): number {
  return Math.ceil(6 * Math.pow(1.16, depth - 1));
}

export function bonePile(depth: number): number {
  return Math.ceil(2 * Math.pow(1.10, depth - 1));
}

export function boneDrop(depth: number, tier: number): number {
  return 1 + tier + depth * 0.25;
}

export function monsterGold(depth: number): number {
  return Math.ceil(2 * Math.pow(1.14, depth - 1));
}

export function shrineCost(depth: number): number {
  return Math.ceil(20 * Math.pow(1.15, depth - 1));
}

/** Souls paid out when a vessel dies (before multipliers).
 *  Death is the HEADLINE income — kill/well payouts stay clearly below it. */
export function soulsOnDeath(depth: number, kills: number): number {
  return Math.pow(depth, 1.62) * 3.5 + kills * 0.5;
}

/** Souls from killing an elite (before multipliers). */
export function eliteSouls(depth: number): number {
  return 1 + depth;
}

/** Souls from killing a boss (before multipliers). */
export function bossSouls(depth: number): number {
  return 12 + depth * 6;
}

/** Souls from killing a champion (before multipliers and enchant bonuses). */
export function championSouls(depth: number): number {
  return 1 + depth * 0.9;
}

/** Souls from killing a Vault Warden (before multipliers). */
export function minibossSouls(depth: number): number {
  return 6 + depth * 3;
}

/** Soul well bonus (before multipliers). */
export function wellSouls(depth: number): number {
  return 6 + depth * 2.5;
}

/** ---- upgrade pricing ---- */

export function upgradeCost(base: number, growth: number, level: number): number {
  return Math.ceil(base * Math.pow(growth, level));
}

/** ---- prestige ---- */

export const REAP_MIN_DEPTH = 10;

/** Each Reaping raises the depth the crypt demands for the next one —
 *  otherwise spamming shallow 1-essence reaps is strictly optimal. */
export function reapDepthRequired(reaps: number): number {
  return REAP_MIN_DEPTH + reaps * 2;
}

/** Souls required for the first point of essence. */
export const REAP_SOUL_BASE = 6000;

/**
 * Crypt Wrath: hoarding souls past reap-readiness angers the crypt.
 * Monsters gain +40% HP & ATK per extra soul-threshold harvested this cycle
 * (0.25 → 0.40, 2026-06-12 — playtest: "wrath helps but is not enough").
 * ×1 until the first essence is earned, then climbs without bound — the
 * incentive to actually Reap instead of squatting on an over-leveled vessel.
 */
export function cryptWrath(soulsThisReap: number): number {
  return 1 + 0.4 * Math.max(0, soulsThisReap / REAP_SOUL_BASE - 1);
}

export function essenceGain(soulsThisReap: number): number {
  if (soulsThisReap < REAP_SOUL_BASE) return 0;
  return Math.floor(Math.pow(soulsThisReap / REAP_SOUL_BASE, 0.62));
}

/** Souls needed to reach a given essence amount (for UI "next at" hint). */
export function soulsForEssence(e: number): number {
  return Math.ceil(REAP_SOUL_BASE * Math.pow(e, 1 / 0.62));
}

/** ---- items ---- */

export function itemStatBudget(depth: number): number {
  return 3 * Math.pow(1.17, depth - 1);
}

/** rarity weights by depth: mythics only realistically appear deep.
 *  Legendaries (index 5) never drop naturally — Vault Wardens and deep
 *  bosses force them via rollItem's minimum-rarity floor. */
export function rarityWeights(depth: number): number[] {
  return [
    100,
    35 + depth * 2,
    8 + depth * 1.2,
    1 + depth * 0.45,
    0.05 + depth * 0.12,
    0,
  ];
}

export const SALVAGE_GOLD_BY_RARITY = [4, 10, 30, 90, 300, 1200, 5000];

/** ---- the Trial of the Sealed Hall ---- */

/** Floors this deep may bear a Sealed Hall... */
export const TRIAL_MIN_DEPTH = 12;
/** ...with this chance per floor, */
export const TRIAL_CHANCE = 0.04;
/** and the first one is guaranteed at this depth (never on boss floors). */
export const TRIAL_GUARANTEE_DEPTH = 14;
/** Losing (or fleeing) the trial forfeits this share of held souls. */
export const TRIAL_FORFEIT = 0.4;
/** The Sealed Hall onslaught: survive this many hero turns... */
export const TRIAL_TURNS = 60;
/** ...with a spawn pack arriving every N turns, */
export const TRIAL_SPAWN_EVERY = 4;
/** capped at this many living trial monsters. */
export const TRIAL_MAX_ALIVE = 35;

/** The Satchel: carried-item capacity. */
export const INVENTORY_CAP = 10;

/** Reforging a Vestige to the current depth costs roughly several floors'
 *  worth of gold income — the late-game gold sink. */
export function reforgeCost(toDepth: number): number {
  return Math.ceil(40 * goldPile(toDepth));
}

/** ---- atmosphere & biomes ---- */

/** Depths at which the crypt's atmosphere turns: bone dust → wet rot →
 *  drowned cold → void. Bands hold flat, then snap over the last few depths
 *  before the next stop — the change should land like a door closing, not a
 *  slow dimmer. Render palettes and the crossing murmur both key off this. */
export const ATMOSPHERE_BANDS = [1, 12, 24, 36];

/** Biomes (defs + per-biome numbers in data/biomes.ts): a streak may begin
 *  with this chance per eligible floor (never on boss or trial floors)... */
export const BIOME_CHANCE = 0.05;
/** ...runs for this many floors once entered... */
export const BIOME_FLOORS = 3;
/** ...and then the crypt stays honest stone for at least this many floors —
 *  biomes are events, not wallpaper (playtest: "higher gaps"). Expected
 *  spacing ≈ COOLDOWN + 1/CHANCE ≈ 60 floors between visits. */
export const BIOME_COOLDOWN = 40;

/** ---- dungeon population ---- */

export function monsterCount(depth: number): number {
  return Math.min(22, 8 + Math.floor(depth * 0.6));
}

export function elitesOnFloor(depth: number): number {
  if (depth < 3) return 0;
  return Math.min(4, 1 + Math.floor(depth / 7));
}

/** ---- offline ---- */

export const OFFLINE_CAP_MS = 12 * 3600 * 1000;
export const OFFLINE_EFFICIENCY = 0.5;
