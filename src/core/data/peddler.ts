/**
 * The Peddler's wares (v1.5.0) — things no chest ever drops. Each stall
 * offers three distinct wares; prices are in goldPiles and double with
 * every purchase at the same stall. Effects are RUN-scoped (they die with
 * the vessel and are never persisted — run is nulled on save).
 * Pricing intent (v1.5.1, playtest: "a bit cheap for being that
 * powerful"): run-long curios cost several floors of gold income; the
 * Musk must exceed the goblin's own 12-pile burst or it's free money.
 */

export interface WareDef {
  id: string;
  name: string;
  desc: string;
  /** price in goldPile(depth)s, before the per-stall doubling */
  pricePiles: number;
}

export const WARES: WareDef[] = [
  {
    id: 'mystery', name: 'A Wrapped Parcel',
    desc: 'Something epic or better, wrapped in grave-cloth. No refunds, no peeking.',
    pricePiles: 18,
  },
  {
    id: 'compass', name: 'The Grave Compass',
    desc: 'Its needle points down and to the left. This vessel always knows where the stairs are.',
    pricePiles: 45,
  },
  {
    id: 'oil', name: 'Lantern Oil',
    desc: 'Pressed from things that feared the light. +2 vision for this vessel.',
    pricePiles: 32,
  },
  {
    id: 'musk', name: 'Goblin Musk',
    desc: 'Smells like unattended wealth. The next floor WILL hold a Loot Goblin.',
    pricePiles: 55,
  },
  {
    id: 'draught', name: 'Sealed Draught',
    desc: 'Drinks itself in an emergency: the first time a hit leaves this vessel below a quarter health, it restores 40%.',
    pricePiles: 25,
  },
];

export function wareById(id: string): WareDef | undefined {
  return WARES.find((w) => w.id === id);
}
