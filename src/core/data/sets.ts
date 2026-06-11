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
  /** the piece's unique power (wired by id in game.ts) */
  powerId: string;
  powerName: string;
  powerDesc: string;
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
        powerId: 'inspection', powerName: 'Deep Inspection',
        powerDesc: 'First contact is fully inspected: +50% damage against unhurt enemies.',
      },
      {
        slot: 'armor', name: 'genuWall, the Stateful Aegis',
        affixes: { def: 1.0, regen: 0.45, hpPct: 0.35, dodge: 0.1 },
        powerId: 'stateful', powerName: 'Stateful',
        powerDesc: 'After 5 turns without taking a hit, the next hit is dropped outright.',
      },
      {
        slot: 'charm', name: 'genuKey, the Trusted Token',
        affixes: { regen: 0.55, goldPct: 0.5, soulPct: 0.3 },
        powerId: 'leastpriv', powerName: 'Least Privilege',
        powerDesc: 'Thieves cannot steal from you, and shrines charge half.',
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
        powerId: 'conduction', powerName: 'Conduction',
        powerDesc: 'Minions echo every strike a second time at half power.',
      },
      {
        slot: 'armor', name: 'Shroud of the Hollow Choir',
        affixes: { def: 0.8, regen: 0.5, hpPct: 0.35 },
        powerId: 'choir', powerName: 'The Choir Endures',
        powerDesc: 'Minions take half damage when shielding the vessel.',
      },
      {
        slot: 'charm', name: 'Phylactery of True Names',
        affixes: { soulPct: 0.45, xpPct: 0.4, regen: 0.35 },
        powerId: 'truenames', powerName: 'True Names',
        powerDesc: 'Every kill surrenders its name: bonus souls per kill, scaling with depth.',
      },
    ],
    bonus2: 'The choir stirs: minions +35% power.',
    bonus3: 'THE CHOIR RISES: minions +100% power, souls +40%.',
  },
  {
    id: 'vigil',
    name: 'The Last Vigil',
    flavor: 'Worn by the nine who held the door. The door held.',
    forClasses: ['wretch', 'footman', 'berserker'],
    pieces: [
      {
        slot: 'weapon', name: 'Vigilkeeper’s Edge', kind: 'blade',
        affixes: { atk: 1.0, lifesteal: 0.3 },
        powerId: 'holdline', powerName: 'Hold the Line',
        powerDesc: '+40% damage against elites, champions, wardens and bosses.',
      },
      {
        slot: 'armor', name: 'Bastion of the Ninth Vault',
        affixes: { def: 1.1, regen: 0.4, hpPct: 0.35 },
        powerId: 'unbroken', powerName: 'Unbroken',
        powerDesc: 'Regenerates 1.5% max HP per turn while below half health.',
      },
      {
        slot: 'charm', name: 'The Oath-Knot',
        affixes: { atk: 0.45, crit: 0.3, hpPct: 0.3 },
        powerId: 'laststand', powerName: 'Last Stand',
        powerDesc: 'When the Oath refuses a killing blow, rise at 30% health, blessed.',
      },
    ],
    bonus2: 'Shieldwall: +10% block.',
    bonus3: 'DEAD MAN’S OATH: +60% damage below half health, and once per floor a killing blow is survived at 1 HP.',
  },
  {
    id: 'longwatch',
    name: 'The Longwatch',
    flavor: 'They watched the dark so long the dark blinked first.',
    forClasses: ['ranger', 'shadow'],
    pieces: [
      {
        slot: 'weapon', name: 'Watchman’s Recurve', kind: 'bow',
        affixes: { atk: 0.9, crit: 0.3 },
        powerId: 'deadeye', powerName: 'Deadeye',
        powerDesc: '+20% critical chance. The dark has nowhere to hide.',
      },
      {
        slot: 'armor', name: 'Stalker’s Shroud',
        affixes: { def: 0.8, regen: 0.45, dodge: 0.1 },
        powerId: 'fleetfoot', powerName: 'Fleetfoot',
        powerDesc: '+1 action per second. The watch never lingers.',
      },
      {
        slot: 'charm', name: 'The Marked Coin',
        affixes: { goldPct: 0.45, bonePct: 0.4, regen: 0.3 },
        powerId: 'quarry', powerName: 'Quarry',
        powerDesc: 'Elites and champions pay double gold and bones when felled.',
      },
    ],
    bonus2: 'Keen eyes: critical hits deal ×2.4 damage (up from ×2).',
    bonus3: 'THE LONG WATCH: +20% dodge, and +60% damage while at full health.',
  },
  {
    id: 'tithegilded',
    name: 'The Tithe-Gilded',
    flavor: 'Starved into wealth. The famine taught them what gold is for.',
    forClasses: null, // the Pact of Famine yields the golden set
    pieces: [
      {
        slot: 'weapon', name: 'Coinblade, Paid in Full', kind: 'blade',
        affixes: { atk: 0.85, goldPct: 0.5 },
        powerId: 'tollkeeper', powerName: 'Tollkeeper',
        powerDesc: 'Every kill pays its toll in gold.',
      },
      {
        slot: 'armor', name: 'Gildedmail of the Hollow Purse',
        affixes: { def: 0.9, regen: 0.4, goldPct: 0.3 },
        powerId: 'midas', powerName: 'Midas Scrap',
        powerDesc: 'Salvage pays triple.',
      },
      {
        slot: 'charm', name: 'The Ledgerstone',
        affixes: { goldPct: 0.55, bonePct: 0.45 },
        powerId: 'usury', powerName: 'Usury',
        powerDesc: 'Every shrine payment returns 150% of its cost — in bones.',
      },
    ],
    bonus2: 'Gilded: +50% gold.',
    bonus3: 'GOLDEN TIDE: gold gain ×2.2 instead, and Marrow Memory converts twice as much on death.',
  },
];

export function setById(id: string): SetDef | undefined {
  return SETS.find((s) => s.id === id);
}

/** The Vestige stat budget runs hot — these are trophies, not drops, and a
 *  piece's headline stat must outclass a Legendary's (whose primary lands at
 *  ~4.4x base budget). Their real identity is the unique powers. */
const SET_BUDGET_MULT = 5.0;

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

/** Which set the Sealed Hall awards. The pacts speak first: a hardened
 *  crypt yields the Gate, famine yields the golden set; otherwise the
 *  vessel's calling decides. */
export function trialSetFor(classId: string, curseIds: string[]): string {
  if (curseIds.includes('iron')) return 'genugate';
  if (curseIds.includes('famine')) return 'tithegilded';
  const named = SETS.find((s) => s.forClasses?.includes(classId));
  return named?.id ?? 'vigil';
}
