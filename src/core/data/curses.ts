/** Curses: opt-in pacts (unlocked via Forbidden Rites) that make runs harder
 *  but multiply the soul harvest. Applied at summon time; freely toggled
 *  between vessels. Multipliers stack multiplicatively. */

export interface CurseDef {
  id: string;
  name: string;
  desc: string;
  soulMult: number;
  monsterHpMult?: number;
  monsterAtkMult?: number;
  monsterCountMult?: number;
  goldMult?: number;
  heroHpMult?: number;
}

export const CURSES: CurseDef[] = [
  {
    id: 'iron', name: 'Pact of the Iron Crypt',
    desc: 'Monsters have double HP. Souls ×1.8.',
    soulMult: 1.8, monsterHpMult: 2,
  },
  {
    id: 'famine', name: 'Pact of Famine',
    desc: 'No gold drops anywhere. Souls ×1.5.',
    soulMult: 1.5, goldMult: 0,
  },
  {
    id: 'horde', name: 'Pact of the Horde',
    desc: 'Twice as many monsters per floor. Souls ×2.',
    soulMult: 2, monsterCountMult: 2,
  },
  {
    id: 'blood', name: 'Blood Pact',
    desc: 'Vessels have half HP. Souls ×1.6.',
    soulMult: 1.6, heroHpMult: 0.5,
  },
  {
    id: 'wrath', name: 'Pact of Wrath',
    desc: 'Monsters hit 50% harder. Souls ×1.7.',
    soulMult: 1.7, monsterAtkMult: 1.5,
  },
];

export function curseById(id: string): CurseDef | undefined {
  return CURSES.find((c) => c.id === id);
}
