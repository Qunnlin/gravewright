export interface ClassDef {
  id: string;
  name: string;
  title: string;
  glyphColor: string;
  cost: number;            // souls; -1 = unlocked elsewhere (essence)
  essenceUnlock?: string;  // essence upgrade id that unlocks it
  hpMult: number;
  atkMult: number;
  perk: string;            // human description
  /** mechanical hooks read by the sim */
  blockPct?: number;       // flat % damage reduction
  ranged?: boolean;        // attacks at range 3
  healOnKill?: number;     // % max hp per kill
  regen?: number;          // % max hp per turn
  berserk?: boolean;       // up to +150% dmg scaling with missing hp
  dodge?: number;          // %
  crit?: number;           // bonus crit %
  soulMult?: number;
  minionMult?: number;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'wretch', name: 'Wretch', title: 'a nameless husk',
    glyphColor: '#e8e8e8', cost: 0, hpMult: 1, atkMult: 1,
    perk: 'No perks. No memories. No complaints.',
  },
  {
    id: 'footman', name: 'Footman', title: 'shield-bearer of a fallen house',
    glyphColor: '#88aaff', cost: 40, hpMult: 1.5, atkMult: 1.0,
    perk: 'Blocks 12% of all damage. +50% max HP.',
    blockPct: 12,
  },
  {
    id: 'ranger', name: 'Ranger', title: 'warden of the dead woods',
    glyphColor: '#88dd66', cost: 280, hpMult: 1.0, atkMult: 1.15,
    perk: 'Strikes from 3 tiles away. +15% damage.',
    ranged: true,
  },
  {
    id: 'cleric', name: 'Cleric', title: 'heretic of the hollow choir',
    glyphColor: '#ffdd88', cost: 1400, hpMult: 1.25, atkMult: 1.0,
    perk: 'Heals 8% max HP on kill, regenerates 1% per turn.',
    healOnKill: 8, regen: 1,
  },
  {
    id: 'berserker', name: 'Berserker', title: 'rage given a corpse',
    glyphColor: '#ff7755', cost: 7000, hpMult: 1.3, atkMult: 1.1,
    perk: 'Deals up to +150% damage as HP falls.',
    berserk: true,
  },
  {
    id: 'shadow', name: 'Shadow', title: 'what is left when light gives up',
    glyphColor: '#bb99ff', cost: 38000, hpMult: 0.9, atkMult: 1.2,
    perk: '28% dodge. +18% crit chance.',
    dodge: 28, crit: 18,
  },
  {
    id: 'lich', name: 'Lich Vessel', title: 'a shard of your own dark heart',
    glyphColor: '#66ffee', cost: -1, essenceUnlock: 'lichdom',
    hpMult: 0.85, atkMult: 1.25,
    perk: '+100% souls. Minions deal double damage.',
    soulMult: 2, minionMult: 2,
  },
];

export function classById(id: string): ClassDef {
  return CLASSES.find((c) => c.id === id) ?? CLASSES[0];
}
