import type { MonsterSpecial } from '../types';

/**
 * Champion enchantments — Diablo-style affixes that a small fraction of
 * monsters spawn with. Champions glow blue, carry their enchant names as
 * prefixes ("Gilded Venomous Tomb Bat"), hit harder, and drop better.
 */
export interface EnchantDef {
  id: string;
  prefix: string;
  desc: string;
  hpMult?: number;
  atkMult?: number;
  defMult?: number;
  specials?: MonsterSpecial[];
  /** loot bonuses paid on kill */
  goldDrop?: number;  // × monsterGold(depth)
  boneDrop?: number;  // × boneDrop(depth, tier)
  soulMult?: number;  // × champion soul payout
  /** detonates on death, damaging an adjacent vessel */
  volatile?: boolean;
  /** teleports beside the vessel when kept at range */
  phasing?: boolean;
}

export const ENCHANTS: EnchantDef[] = [
  { id: 'juggernaut',  prefix: 'Juggernaut',  desc: 'Swollen with stolen vigor.',          hpMult: 2.2 },
  { id: 'frenzied',    prefix: 'Frenzied',    desc: 'Moves like a panic.',                 specials: ['fast'] },
  { id: 'venomous',    prefix: 'Venomous',    desc: 'Its blood argues with yours.',        specials: ['poison'] },
  { id: 'hellforged',  prefix: 'Hellforged',  desc: 'Quenched somewhere worse.',           specials: ['burn'], atkMult: 1.2 },
  { id: 'leeching',    prefix: 'Leeching',    desc: 'Your wounds feed it.',                specials: ['vampiric'] },
  { id: 'stonehide',   prefix: 'Stonehide',   desc: 'Mourning made mineral.',              specials: ['armored'], defMult: 2 },
  { id: 'executioner', prefix: 'Executioner', desc: 'It has done this before.',            specials: ['deadly'], atkMult: 1.35 },
  { id: 'undying',     prefix: 'Undying',     desc: 'Death keeps returning it, annoyed.',  specials: ['regen'] },
  { id: 'gilded',      prefix: 'Gilded',      desc: 'Drops a fortune in grave-gold.',      goldDrop: 6 },
  { id: 'soulbranded', prefix: 'Soulbranded', desc: 'Its soul is worth three of yours.',   soulMult: 3 },
  { id: 'ossified',    prefix: 'Ossified',    desc: 'A walking ossuary. Rich pickings.',   boneDrop: 5 },
  { id: 'volatile',    prefix: 'Volatile',    desc: 'Detonates on death. Stand back.',     volatile: true },
  { id: 'phasing',     prefix: 'Phasing',     desc: 'Distance is a suggestion.',           phasing: true },
];

export function enchantById(id: string): EnchantDef | undefined {
  return ENCHANTS.find((e) => e.id === id);
}

/** Vault Warden name pool — mini-bosses guarding sealed treasure rooms. */
export const WARDEN_NAMES = [
  'Hesk, Keeper of the Ninth Seal',
  'Morvane the Interred',
  'Saint Ossia, Defiled',
  'The Vault’s Tongue',
  'Cantor Veyl of the Last Hymn',
  'The Gilded Stillborn',
  'Provost Mhul, Unpaid',
  'Echo of the First Burial',
  'Widow Crask, Still Counting',
  'The Debt Collector',
];
