import type { Affix, Item, Slot, WeaponKind } from '../types';
import { itemStatBudget, rarityWeights } from '../balance';
import { chance, pick, pickWeighted, rndf, rndInt, shuffle } from '../rng';

export const RARITY_NAMES = ['Common', 'Fine', 'Rare', 'Epic', 'Mythic', 'Legendary', 'Vestige'];
/** index 6 is a fallback — the UI renders Vestiges as animated rainbow text */
export const RARITY_COLORS = ['#c8c8c8', '#7fdd6a', '#5ab0ff', '#c47fff', '#ffb13d', '#ff5d3d', '#ff5d9d'];

/** Weapon archetypes: who may wield them, who wields them WELL (+20% weapon ATK). */
export interface WeaponKindDef {
  label: string;
  bases: string[];
  /** class ids allowed to equip; null = everyone */
  classes: string[] | null;
  /** class ids that gain the favored-weapon bonus */
  favored: string[];
}

export const WEAPON_KINDS: Record<WeaponKind, WeaponKindDef> = {
  blade: {
    label: 'Blade', bases: ['Knife', 'Sword', 'Cleaver', 'Blade', 'Falchion', 'Dirk'],
    classes: null, favored: ['footman', 'shadow'],
  },
  heavy: {
    label: 'Heavy', bases: ['Axe', 'Maul', 'Greathammer', 'Warpick'],
    classes: ['wretch', 'footman', 'berserker', 'cleric'], favored: ['berserker'],
  },
  polearm: {
    label: 'Polearm', bases: ['Spear', 'Scythe', 'Halberd', 'Glaive'],
    classes: ['wretch', 'footman', 'ranger', 'berserker'], favored: ['footman'],
  },
  bow: {
    label: 'Bow', bases: ['Shortbow', 'Longbow', 'Warbow', 'Recurve', 'Bonebow'],
    classes: ['ranger', 'shadow'], favored: ['ranger'],
  },
  focus: {
    label: 'Focus', bases: ['Wand', 'Bone Censer', 'Skull Focus', 'Grave Lantern'],
    classes: ['cleric', 'lich'], favored: ['cleric', 'lich'],
  },
};

export const FAVORED_WEAPON_MULT = 1.2;

/** Can this class hold this item at all? */
export function kindAllows(kind: WeaponKind, classId: string): boolean {
  const def = WEAPON_KINDS[kind];
  return def.classes === null || def.classes.includes(classId);
}

export function kindFavors(kind: WeaponKind, classId: string): boolean {
  return WEAPON_KINDS[kind].favored.includes(classId);
}

/** Human description of who can use a weapon kind, for tooltips. */
export function kindUsableBy(kind: WeaponKind): string {
  const def = WEAPON_KINDS[kind];
  if (def.classes === null) return 'all vessels';
  return def.classes.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ');
}

const ARMOR_BASES = [
  'Rags', 'Leathers', 'Hauberk', 'Plate', 'Shroud', 'Carapace', 'Vestments',
  'Bonemail', 'Palecloak', 'Grave-aegis',
];
const CHARM_BASES = [
  'Ring', 'Amulet', 'Idol', 'Fetish', 'Locket', 'Talisman', 'Eye',
  'Phylactery', 'Knucklebone', 'Memento',
];

const PREFIXES_BY_RARITY = [
  ['Rusty', 'Cracked', 'Worn', 'Plain', 'Dull'],
  ['Iron', 'Oiled', 'Keen', 'Sturdy', 'Bleak'],
  ['Graven', 'Runed', 'Sanguine', 'Mourning', 'Hexed'],
  ['Spectral', 'Vampiric', 'Dreadforged', 'Abyssal', 'Wailing'],
  ['Soulrent', 'Worldgrave', 'Deathless', 'Umbral', 'Pale King’s'],
  ['Apocryphal', 'First-Buried', 'Grave-Emperor’s', 'Worldrot', 'Unwritten'],
];

const SUFFIXES = [
  'of the Crypt', 'of Sorrow', 'of Hunger', 'of the Deep', 'of Embers',
  'of the Harvest', 'of Whispers', 'of the Last Vigil', 'of Marrow', 'of the Veil',
];

interface AffixDef {
  affix: Affix;
  slots: Slot[];
  /** value per point of stat budget */
  perBudget: number;
  /** hard ceiling for percentage-type affixes (0 = uncapped) */
  cap: number;
  /** depth-scaled cap: min(cap, capBase + capPerDepth·depth). Percent
   *  affixes used to slam their flat caps by ~depth 13–19 (equipment
   *  audit) — "+60% HP at depth 20" — so percents now grow with depth
   *  and reach their ceilings only deep. 0/0 = flat cap only. */
  capBase: number;
  capPerDepth: number;
  label: (v: number) => string;
}

export const AFFIX_DEFS: AffixDef[] = [
  { affix: 'atk',       slots: ['weapon', 'charm'],          perBudget: 1.0,  cap: 0,   capBase: 0,  capPerDepth: 0,    label: (v) => `+${v} ATK` },
  { affix: 'def',       slots: ['armor', 'charm'],           perBudget: 0.8,  cap: 0,   capBase: 0,  capPerDepth: 0,    label: (v) => `+${v} DEF` },
  { affix: 'hpPct',     slots: ['armor', 'charm'],           perBudget: 0.9,  cap: 60,  capBase: 8,  capPerDepth: 2,    label: (v) => `+${v}% HP` },
  { affix: 'crit',      slots: ['weapon', 'charm'],          perBudget: 0.4,  cap: 35,  capBase: 6,  capPerDepth: 1,    label: (v) => `+${v}% crit` },
  { affix: 'goldPct',   slots: ['charm', 'weapon'],          perBudget: 1.5,  cap: 150, capBase: 20, capPerDepth: 4,    label: (v) => `+${v}% gold` },
  { affix: 'soulPct',   slots: ['charm', 'armor'],           perBudget: 0.8,  cap: 80,  capBase: 10, capPerDepth: 2,    label: (v) => `+${v}% souls` },
  { affix: 'regen',     slots: ['armor', 'charm'],           perBudget: 0.35, cap: 0,   capBase: 0,  capPerDepth: 0,    label: (v) => `+${v} HP/turn` },
  { affix: 'lifesteal', slots: ['weapon'],                   perBudget: 0.3,  cap: 30,  capBase: 4,  capPerDepth: 0.7,  label: (v) => `+${v}% lifesteal` },
  { affix: 'xpPct',     slots: ['charm', 'armor'],           perBudget: 0.9,  cap: 100, capBase: 12, capPerDepth: 2.5,  label: (v) => `+${v}% XP` },
  { affix: 'bonePct',   slots: ['charm', 'weapon'],          perBudget: 0.8,  cap: 80,  capBase: 10, capPerDepth: 2.5,  label: (v) => `+${v}% bones` },
  { affix: 'dodge',     slots: ['armor', 'charm'],           perBudget: 0.2,  cap: 12,  capBase: 2,  capPerDepth: 0.35, label: (v) => `+${v}% dodge` },
  { affix: 'dotResist', slots: ['armor', 'charm'],           perBudget: 0.5,  cap: 70,  capBase: 8,  capPerDepth: 1.6,  label: (v) => `+${v}% dot resist` },
  { affix: 'thorns',    slots: ['armor'],                    perBudget: 0.6,  cap: 0,   capBase: 0,  capPerDepth: 0,    label: (v) => `${v} thorns` },
  { affix: 'cleave',    slots: ['weapon'],                   perBudget: 0.35, cap: 50,  capBase: 6,  capPerDepth: 1.2,  label: (v) => `+${v}% cleave` },
];

/** The effective cap for an affix on an item of the given depth. */
export function affixCap(def: { cap: number; capBase: number; capPerDepth: number }, depth: number): number {
  if (def.cap <= 0) return Infinity;
  if (def.capPerDepth <= 0) return def.cap;
  return Math.min(def.cap, Math.round(def.capBase + def.capPerDepth * depth));
}

/** Pick a weapon kind, biased toward what the given class can actually wield. */
function rollWeaponKind(classId?: string): WeaponKind {
  const all = Object.keys(WEAPON_KINDS) as WeaponKind[];
  if (classId && chance(0.75)) {
    const usable = all.filter((k) => kindAllows(k, classId));
    if (usable.length > 0) return pick(usable);
  }
  return pick(all);
}

/** Primary stat every item has; extra affixes come with rarity. */
function primaryAffix(slot: Slot): Affix {
  if (slot === 'weapon') return 'atk';
  if (slot === 'armor') return 'def';
  return pick(['crit', 'goldPct', 'soulPct'] as Affix[]);
}

export function rollItem(depth: number, forcedMinRarity = 0, classId?: string): Item {
  const slot = pick(['weapon', 'armor', 'charm'] as Slot[]);
  const weights = rarityWeights(depth);
  for (let r = 0; r < forcedMinRarity; r++) weights[r] = 0;
  // a forced floor at a zero-weight tier (legendaries) must still land there
  if (weights.every((w) => w <= 0)) weights[forcedMinRarity] = 1;
  const rarity = pickWeighted([0, 1, 2, 3, 4, 5], weights);

  const kind = slot === 'weapon' ? rollWeaponKind(classId) : undefined;

  const budget = itemStatBudget(depth) * (1 + rarity * 0.45) *
    (rarity === 5 ? 1.35 : 1) * rndf(0.85, 1.15);
  const stats: Partial<Record<Affix, number>> = {};

  const apply = (affix: Affix, budgetShare: number) => {
    const def = AFFIX_DEFS.find((d) => d.affix === affix)!;
    const v = Math.max(1, Math.min(affixCap(def, depth), Math.round(budgetShare * def.perBudget)));
    stats[affix] = (stats[affix] ?? 0) + v;
  };

  apply(primaryAffix(slot), budget);

  const extraAffixes = rarity; // fine=1 ... mythic=4
  const candidates = shuffle(
    AFFIX_DEFS.filter((d) => d.slots.includes(slot) && stats[d.affix] === undefined).map((d) => d.affix),
  );
  for (let i = 0; i < extraAffixes && i < candidates.length; i++) {
    apply(candidates[i], budget * rndf(0.3, 0.55));
  }

  const base = slot === 'weapon'
    ? pick(WEAPON_KINDS[kind!].bases)
    : slot === 'armor' ? pick(ARMOR_BASES) : pick(CHARM_BASES);
  const prefix = pick(PREFIXES_BY_RARITY[rarity]);
  let name = `${prefix} ${base}`;
  if (rarity >= 5 || (rarity >= 2 && chance(0.6))) name += ` ${pick(SUFFIXES)}`;

  const item: Item = { slot, name, rarity, depth, stats, score: 0, kind };
  item.score = scoreItem(item);
  return item;
}

/** Single comparable number so auto-equip can decide. */
export function scoreItem(item: Item): number {
  const s = item.stats;
  return (
    (s.atk ?? 0) * 2 +
    (s.def ?? 0) * 2 +
    (s.hpPct ?? 0) * 0.8 +
    (s.crit ?? 0) * 1.2 +
    (s.goldPct ?? 0) * 0.25 +
    (s.soulPct ?? 0) * 0.9 +
    (s.regen ?? 0) * 3 +
    (s.lifesteal ?? 0) * 1.5 +
    (s.xpPct ?? 0) * 0.3 +
    (s.bonePct ?? 0) * 0.5 +
    (s.dodge ?? 0) * 2 +
    (s.dotResist ?? 0) * 0.8 +
    (s.thorns ?? 0) * 0.7 +
    (s.cleave ?? 0) * 1.2
  );
}

export function describeItem(item: Item): string[] {
  const lines: string[] = [];
  for (const def of AFFIX_DEFS) {
    const v = item.stats[def.affix];
    if (v !== undefined) lines.push(def.label(Math.round(v)));
  }
  return lines;
}

export function chestRoll(depth: number): { kind: 'item' | 'gold' | 'potion'; } {
  const r = rndInt(1, 100);
  if (r <= 55) return { kind: 'item' };
  if (r <= 85) return { kind: 'gold' };
  return { kind: 'potion' };
}
