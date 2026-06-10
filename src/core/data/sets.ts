/**
 * Vestiges — named set items won from the Trial of the Sealed Hall.
 * Unlike random loot their stat TYPES are fixed by design; only the
 * magnitudes scale with the depth the trial was conquered at. Rendered
 * rainbow in the UI; a rarity beyond Legendary (rarity 6).
 */
import type { Affix, Item, Slot, WeaponKind } from '../types';
import { itemStatBudget } from '../balance';
import { AFFIX_DEFS, scoreItem } from './items';

export interface SetPieceDef {
  slot: Slot;
  name: string;
  kind?: WeaponKind;
  /** affix -> share of the piece's stat budget */
  affixes: Partial<Record<Affix, number>>;
}

export interface SetDef {
  id: string;
  name: string;
  flavor: string;
  /** which classes the trial awards this set to (null = the hidden set) */
  forClasses: string[] | null;
  pieces: SetPieceDef[];
  bonus2: string;
  bonus3: string;
}

export const SETS: SetDef[] = [
  {
    id: 'genugate',
    name: 'The genuGate',
    flavor: 'Built by careful hands, hardened beyond reproach. Nothing passes unseen.',
    forClasses: null, // only a hardened crypt yields the Gate
    pieces: [
      {
        slot: 'weapon', name: 'genuScreen, the Packet Cleaver', kind: 'blade',
        affixes: { atk: 0.9, crit: 0.4 },
      },
      {
        slot: 'armor', name: 'genuWall, the Stateful Aegis',
        affixes: { def: 0.8, hpPct: 0.5, dodge: 0.3 },
      },
      {
        slot: 'charm', name: 'genuKey, the Trusted Token',
        affixes: { soulPct: 0.5, goldPct: 0.55, regen: 0.35 },
      },
    ],
    bonus2: 'Perimeter: +15% dodge — most threats never reach the host.',
    bonus3: 'AIRGAP: 25% of all hits are silently dropped, and poison or burn payloads cannot pass.',
  },
  {
    id: 'regalia',
    name: 'The Gravewright’s Regalia',
    flavor: 'What you wore before the chains. The choir remembers.',
    forClasses: ['cleric', 'lich'],
    pieces: [
      {
        slot: 'weapon', name: 'Sceptre of the First Grave', kind: 'focus',
        affixes: { atk: 0.8, soulPct: 0.4 },
      },
      {
        slot: 'armor', name: 'Shroud of the Hollow Choir',
        affixes: { def: 0.5, hpPct: 0.6, regen: 0.4 },
      },
      {
        slot: 'charm', name: 'Phylactery of True Names',
        affixes: { soulPct: 0.6, xpPct: 0.5 },
      },
    ],
    bonus2: 'The choir stirs: minions +35% power.',
    bonus3: 'THE CHOIR RISES: minions +100% power, souls +40%.',
  },
  {
    id: 'vigil',
    name: 'The Last Vigil',
    flavor: 'Worn by the nine who held the door. The door held.',
    forClasses: ['wretch', 'footman', 'ranger', 'berserker', 'shadow'],
    pieces: [
      {
        slot: 'weapon', name: 'Vigilkeeper’s Edge', kind: 'blade',
        affixes: { atk: 1.0, lifesteal: 0.3 },
      },
      {
        slot: 'armor', name: 'Bastion of the Ninth Vault',
        affixes: { def: 0.9, hpPct: 0.5 },
      },
      {
        slot: 'charm', name: 'The Oath-Knot',
        affixes: { crit: 0.5, hpPct: 0.3 },
      },
    ],
    bonus2: 'Shieldwall: +10% block.',
    bonus3: 'DEAD MAN’S OATH: +60% damage below half health, and once per floor a killing blow is survived at 1 HP.',
  },
];

export function setById(id: string): SetDef | undefined {
  return SETS.find((s) => s.id === id);
}

/** The Vestige stat budget runs hot — these are trophies, not drops. */
const SET_BUDGET_MULT = 1.9;

/** Deterministic stat types; magnitudes scale with conquest depth. */
export function rollSetPiece(setId: string, slot: Slot, depth: number): Item | null {
  const set = setById(setId);
  const piece = set?.pieces.find((p) => p.slot === slot);
  if (!set || !piece) return null;
  const budget = itemStatBudget(depth) * SET_BUDGET_MULT;
  const stats: Item['stats'] = {};
  for (const [affix, share] of Object.entries(piece.affixes) as [Affix, number][]) {
    const def = AFFIX_DEFS.find((d) => d.affix === affix)!;
    let v = Math.max(1, Math.round(budget * share * def.perBudget));
    if (def.cap > 0) v = Math.min(def.cap, v);
    stats[affix] = v;
  }
  const item: Item = {
    slot, name: piece.name, rarity: 6, depth, stats, score: 0,
    kind: piece.kind, setId,
  };
  item.score = scoreItem(item);
  return item;
}

/** Which set the Sealed Hall awards: the hardened crypt yields the Gate. */
export function trialSetFor(classId: string, ironPactActive: boolean): string {
  if (ironPactActive) return 'genugate';
  const named = SETS.find((s) => s.forClasses?.includes(classId));
  return named?.id ?? 'vigil';
}
