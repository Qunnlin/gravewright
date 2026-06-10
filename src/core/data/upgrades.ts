/**
 * The three shops:
 *  - Crypt (bones): the vessel's body — stats, fortune, gear retention.
 *  - Necromancy (souls): your power — speed, siphons, automation, vision.
 *  - Reaping (essence): permanent post-prestige multipliers and unlocks.
 *
 * `eff(lvl)` returns the *current* aggregate effect for that level,
 * interpreted per-id inside recalc(). Effects compound per level so the
 * player can keep pace with exponential monster curves.
 */

export type Pool = 'bones' | 'souls' | 'essence';

export interface UpgradeDef {
  id: string;
  pool: Pool;
  name: string;
  desc: string;
  base: number;
  growth: number;
  max: number; // Infinity = uncapped
  eff: (lvl: number) => number;
  effDesc: (lvl: number) => string;
  /** minimum reaps before this shows up (essence shop gating) */
  minReaps?: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const BONE_UPGRADES: UpgradeDef[] = [
  {
    id: 'vigor', pool: 'bones', name: 'Marrow Vigor',
    desc: 'Pack the vessel’s bones with stolen marrow. +14% max HP per level (compounding).',
    base: 12, growth: 1.17, max: Infinity,
    eff: (l) => Math.pow(1.14, l),
    effDesc: (l) => `HP ×${Math.pow(1.14, l).toFixed(2)}`,
  },
  {
    id: 'ferocity', pool: 'bones', name: 'Grafted Sinew',
    desc: 'Sinew from things that died furious. +13% attack per level (compounding).',
    base: 12, growth: 1.17, max: Infinity,
    eff: (l) => Math.pow(1.13, l),
    effDesc: (l) => `ATK ×${Math.pow(1.13, l).toFixed(2)}`,
  },
  {
    id: 'bulwark', pool: 'bones', name: 'Ossified Hide',
    desc: 'Layered bone plating. +2 defense per level (compounding +10%).',
    base: 16, growth: 1.21, max: Infinity,
    eff: (l) => (l === 0 ? 0 : 2 * l * Math.pow(1.1, l)),
    effDesc: (l) => `DEF +${Math.round(l === 0 ? 0 : 2 * l * Math.pow(1.1, l))}`,
  },
  {
    id: 'fortune', pool: 'bones', name: 'Tomb Fortune',
    desc: 'The dead tithe to you. +15% gold per level (compounding).',
    base: 18, growth: 1.24, max: Infinity,
    eff: (l) => Math.pow(1.15, l),
    effDesc: (l) => `Gold ×${Math.pow(1.15, l).toFixed(2)}`,
  },
  {
    id: 'sharpbone', pool: 'bones', name: 'Splintered Edge',
    desc: 'Jagged bone shards along every striking surface. +1% crit chance per level.',
    base: 25, growth: 1.38, max: 20,
    eff: (l) => l,
    effDesc: (l) => `Crit +${l}%`,
  },
  {
    id: 'marrow', pool: 'bones', name: 'Marrow Memory',
    desc: 'On death, the crypt digests the vessel’s purse: 8% of carried gold becomes bones, per level.',
    base: 30, growth: 1.6, max: 10,
    eff: (l) => l * 0.08,
    effDesc: (l) => `${pct(l * 0.08)} gold → bones on death`,
  },
  {
    id: 'reliquary', pool: 'bones', name: 'Reliquary',
    desc: 'Each equipped item has +11% chance per level to survive the vessel’s death.',
    base: 45, growth: 1.85, max: 8,
    eff: (l) => Math.min(88, l * 11),
    effDesc: (l) => `${Math.min(88, l * 11)}% keep gear`,
  },
];

export const SOUL_UPGRADES: UpgradeDef[] = [
  {
    id: 'haste', pool: 'souls', name: 'Dark Haste',
    desc: 'Lash the vessel’s soul to a faster drumbeat. +1 action per second, per level.',
    base: 15, growth: 1.72, max: 14,
    eff: (l) => l,
    effDesc: (l) => `+${l} actions/s`,
  },
  {
    id: 'siphon', pool: 'souls', name: 'Soul Siphon',
    desc: 'Wider funnels for the dying light. +15% souls per level (compounding).',
    base: 25, growth: 1.8, max: 50,
    eff: (l) => Math.pow(1.15, l),
    effDesc: (l) => `Souls ×${Math.pow(1.15, l).toFixed(2)}`,
  },
  {
    id: 'circle', pool: 'souls', name: 'Summoning Circle',
    desc: 'A better-drawn circle. Reduces resummon delay: 12s → 8s → 5s → 3s → 2s → 1s → instant.',
    base: 20, growth: 2.1, max: 6,
    eff: (l) => [12000, 8000, 5000, 3000, 2000, 1000, 0][Math.min(l, 6)],
    effDesc: (l) => {
      const ms = [12000, 8000, 5000, 3000, 2000, 1000, 0][Math.min(l, 6)];
      return ms === 0 ? 'instant resummon' : `${ms / 1000}s resummon`;
    },
  },
  {
    id: 'hunger', pool: 'souls', name: 'Grave Hunger',
    desc: 'The vessel feeds as you do. Heal 2% max HP on kill, per level.',
    base: 60, growth: 1.95, max: 10,
    eff: (l) => l * 2,
    effDesc: (l) => `Heal ${l * 2}% on kill`,
  },
  {
    id: 'insight', pool: 'souls', name: 'Death’s Insight',
    desc: 'Borrowed eyes that have already seen everything. +1 vision radius per level.',
    base: 40, growth: 2.4, max: 5,
    eff: (l) => l,
    effDesc: (l) => `Vision +${l}`,
  },
  {
    id: 'soularmor', pool: 'souls', name: 'Winding Sheet',
    desc: 'Wrap the vessel in grave-cloth that remembers being armor. +10% defense per level (compounding).',
    base: 50, growth: 1.85, max: 40,
    eff: (l) => Math.pow(1.1, l),
    effDesc: (l) => `DEF ×${Math.pow(1.1, l).toFixed(2)}`,
  },
  {
    id: 'greed', pool: 'souls', name: 'Spectral Greed',
    desc: 'Teach the dead to covet. +12% gold per level (compounding).',
    base: 30, growth: 1.7, max: 40,
    eff: (l) => Math.pow(1.12, l),
    effDesc: (l) => `Gold ×${Math.pow(1.12, l).toFixed(2)}`,
  },
];

export const ESSENCE_UPGRADES: UpgradeDef[] = [
  {
    id: 'eternal', pool: 'essence', name: 'Eternal Power',
    desc: 'Your hunger outlives every collapse. ×1.8 attack and HP per level.',
    base: 1, growth: 2.0, max: 50,
    eff: (l) => Math.pow(1.8, l),
    effDesc: (l) => `ATK & HP ×${Math.pow(1.8, l) < 100 ? Math.pow(1.8, l).toFixed(2) : Math.pow(1.8, l).toExponential(1)}`,
  },
  {
    id: 'conduit', pool: 'essence', name: 'Soul Conduit',
    desc: 'A channel worn smooth by a million deaths. ×1.5 souls per level.',
    base: 2, growth: 2.2, max: 30,
    eff: (l) => Math.pow(1.5, l),
    effDesc: (l) => `Souls ×${Math.pow(1.5, l).toFixed(2)}`,
  },
  {
    id: 'ossuary', pool: 'essence', name: 'Grand Ossuary',
    desc: 'Architecture of femurs. ×1.5 bones per level.',
    base: 2, growth: 2.2, max: 30,
    eff: (l) => Math.pow(1.5, l),
    effDesc: (l) => `Bones ×${Math.pow(1.5, l).toFixed(2)}`,
  },
  {
    id: 'memory', pool: 'essence', name: 'Deep Memory',
    desc: 'The crypt remembers your descent. Vessels begin 2 depths lower per level.',
    base: 3, growth: 2.5, max: 10,
    eff: (l) => l * 2,
    effDesc: (l) => `Start at depth ${1 + l * 2}`,
  },
  {
    id: 'quickening', pool: 'essence', name: 'The Quickening',
    desc: 'Time argues; you win. +1 base action/s and +3 to the Dark Haste cap, per level.',
    base: 4, growth: 3.0, max: 6,
    eff: (l) => l,
    effDesc: (l) => `+${l} base speed, haste cap +${l * 3}`,
  },
  {
    id: 'rites', pool: 'essence', name: 'Forbidden Rites',
    desc: 'Unlocks Curses: optional pacts that harden the crypt but fatten the harvest.',
    base: 3, growth: 1, max: 1,
    eff: (l) => l,
    effDesc: (l) => (l > 0 ? 'Curses unlocked' : 'Locked'),
  },
  {
    id: 'lichdom', pool: 'essence', name: 'Lichdom',
    desc: 'Pour a shard of yourself into a vessel. Unlocks the Lich Vessel class.',
    base: 8, growth: 1, max: 1, minReaps: 2,
    eff: (l) => l,
    effDesc: (l) => (l > 0 ? 'Lich Vessel unlocked' : 'Locked'),
  },
  {
    id: 'everrelic', pool: 'essence', name: 'Reliquary Eternal',
    desc: 'One relic per level survives the Reaping.',
    base: 5, growth: 3.0, max: 3,
    eff: (l) => l,
    effDesc: (l) => `${l} relic${l === 1 ? '' : 's'} kept on reap`,
  },
  {
    id: 'automaton', pool: 'essence', name: 'Bone Automaton',
    desc: 'A servitor of knuckles and patience. Automatically buys the cheapest Crypt upgrade.',
    base: 6, growth: 1, max: 1, minReaps: 1,
    eff: (l) => l,
    effDesc: (l) => (l > 0 ? 'Auto-buy active (toggle in Settings)' : 'Locked'),
  },
];

export const ALL_UPGRADES: UpgradeDef[] = [
  ...BONE_UPGRADES,
  ...SOUL_UPGRADES,
  ...ESSENCE_UPGRADES,
];

export function upgradeById(id: string): UpgradeDef | undefined {
  return ALL_UPGRADES.find((u) => u.id === id);
}

/** ---- minions (soul shop, but separate mechanics) ---- */

export interface MinionDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  unlockCost: number;       // souls
  levelBase: number;        // souls for level 2+
  levelGrowth: number;
  desc: string;
  /** fraction of hero ATK contributed per hero attack */
  atkFrac: number;
  /** fraction of hero max HP */
  hpFrac: number;
  /** chance to intercept a hit aimed at the hero (%) */
  intercept: number;
  /** special tags */
  tags: ('piercing' | 'scavenger')[];
}

export const MINIONS: MinionDef[] = [
  {
    id: 'skeleton', name: 'Skeleton Warrior', glyph: 'Ƨ', color: '#e8e0c8',
    unlockCost: 35, levelBase: 50, levelGrowth: 1.55,
    desc: 'A loyal stack of bones. Adds 40% of vessel ATK to every strike.',
    atkFrac: 0.4, hpFrac: 0.5, intercept: 10, tags: [],
  },
  {
    id: 'ghoul', name: 'Hulking Ghoul', glyph: 'Ǥ', color: '#9ab87a',
    unlockCost: 160, levelBase: 200, levelGrowth: 1.55,
    desc: 'Meat with a job. Intercepts 35% of blows aimed at the vessel.',
    atkFrac: 0.15, hpFrac: 1.4, intercept: 35, tags: [],
  },
  {
    id: 'wraith', name: 'Keening Wraith', glyph: 'Ψ', color: '#9be8ff',
    unlockCost: 650, levelBase: 800, levelGrowth: 1.55,
    desc: 'Grief with edges. Adds 30% of vessel ATK, ignoring enemy defense.',
    atkFrac: 0.3, hpFrac: 0.4, intercept: 5, tags: ['piercing'],
  },
  {
    id: 'hound', name: 'Bone Hound', glyph: 'Ћ', color: '#d8b894',
    unlockCost: 2600, levelBase: 3000, levelGrowth: 1.55,
    desc: 'It buries nothing. +25% gold & bones, adds 20% of vessel ATK.',
    atkFrac: 0.2, hpFrac: 0.6, intercept: 10, tags: ['scavenger'],
  },
];

export const MINION_LEVEL_STAT_MULT = 1.25;

export function minionById(id: string): MinionDef | undefined {
  return MINIONS.find((m) => m.id === id);
}

export function minionLevelCost(def: MinionDef, level: number): number {
  // level 0 -> unlockCost; further levels follow the growth curve
  if (level <= 0) return def.unlockCost;
  return Math.ceil(def.levelBase * Math.pow(def.levelGrowth, level - 1));
}

/** Bones to re-raise a fallen minion mid-run. */
export function mendCost(depth: number): number {
  return Math.ceil(10 * Math.pow(1.12, depth - 1));
}
