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
 *  past LATE_RAMP_START without touching the well-paced early game. */
export const LATE_RAMP_START = 12;

function lateRamp(depth: number, rate: number): number {
  return Math.pow(rate, Math.max(0, depth - LATE_RAMP_START));
}

export function monsterHp(depth: number): number {
  return 9 * Math.pow(1.23, depth - 1) * lateRamp(depth, 1.08);
}

export function monsterAtk(depth: number): number {
  return 3.2 * Math.pow(1.19, depth - 1) * lateRamp(depth, 1.05);
}

export function monsterDef(depth: number): number {
  return Math.max(0, (depth - 1) * 0.9 * Math.pow(1.05, depth - 1));
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

/** HERO mitigation: the pivot scales with depth so defense is a treadmill,
 *  not a one-time 80% checkbox (the old fixed-35 pivot capped out by ~depth 8
 *  and made every further DEF purchase feel useless — playtest finding). */
export function heroMitigation(def: number, depth: number): number {
  return Math.min(0.8, def / (def + 25 + 6 * depth));
}

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
 * Monsters gain +25% HP & ATK per extra soul-threshold harvested this cycle.
 * ×1 until the first essence is earned, then climbs without bound — the
 * incentive to actually Reap instead of squatting on an over-leveled vessel.
 */
export function cryptWrath(soulsThisReap: number): number {
  return 1 + 0.25 * Math.max(0, soulsThisReap / REAP_SOUL_BASE - 1);
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

/** The Satchel: carried-item capacity. */
export const INVENTORY_CAP = 10;

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
