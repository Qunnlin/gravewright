/** Relics: rare boss drops. Persist through deaths; lost on Reaping
 *  (unless Reliquary Eternal). Each is unique — one copy ever held. */

export interface RelicDef {
  id: string;
  name: string;
  desc: string;
  /** hooks read by recalc() */
  soulMult?: number;
  boneMult?: number;
  goldMult?: number;
  atkMult?: number;
  hpMult?: number;
  xpMult?: number;
  minionMult?: number;
  crit?: number;
  vision?: number;
  tickBonus?: number;
  keepGear?: number;
  shrinesFree?: boolean;
}

export const RELICS: RelicDef[] = [
  { id: 'femur',    name: 'Femur of the First King',  desc: '+30% bones. He stood for something, once.', boneMult: 1.3 },
  { id: 'lantern',  name: 'Lantern of Drowned Light', desc: '+1 vision. The flame burns downward.', vision: 1 },
  { id: 'chalice',  name: 'Chalice of Hollow Thirst', desc: '+25% souls. It is never full.', soulMult: 1.25 },
  { id: 'crown',    name: 'Crown of the Pale King',   desc: '+20% attack. Heavy is one word for it.', atkMult: 1.2 },
  { id: 'heart',    name: 'Clockwork Heart',          desc: '+1 action per second. It keeps the wrong time, faster.', tickBonus: 1 },
  { id: 'coinpurse',name: 'Bottomless Coinpurse',     desc: '+40% gold. Something inside makes change.', goldMult: 1.4 },
  { id: 'mask',     name: 'Mask of the Stitched Choir', desc: '+25% max HP. It sings when you bleed.', hpMult: 1.25 },
  { id: 'fang',     name: 'Fang of the Gravetide',    desc: '+6% crit chance. Still wet.', crit: 6 },
  { id: 'hourglass',name: 'Hourglass of Marrow',      desc: '+30% XP. Time passes through bone slower.', xpMult: 1.3 },
  { id: 'leash',    name: 'Leash of the Mawmother',   desc: '+35% minion power. They heel. Mostly.', minionMult: 1.35 },
  { id: 'shroud',   name: 'Shroud of Quiet Hands',    desc: '+20% chance to keep gear on death.', keepGear: 20 },
  { id: 'donation', name: 'Cardinal’s Ledger',        desc: 'Shrines are free. The Church owes you.', shrinesFree: true },
  { id: 'airgap',   name: 'Air-Gapped Phylactery',    desc: '+25% souls. Nothing gets in. Nothing gets out. The souls keep.', soulMult: 1.25 },
  { id: 'patchnotes', name: 'The Patch Notes, Read at Last', desc: '+35% XP. Everything you were doing wrong, enumerated.', xpMult: 1.35 },
  { id: 'coldspare', name: 'Cold Spare',              desc: '+20% chance to keep gear on death. There is always another in the rack.', keepGear: 20 },
];

export function relicById(id: string): RelicDef | undefined {
  return RELICS.find((r) => r.id === id);
}
