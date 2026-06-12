import type { MonsterSpecial } from '../types';
import type { BiomeId } from './biomes';

export interface MonsterDef {
  key: string;
  name: string;
  glyph: string;
  color: string;
  minDepth: number;
  /** depth window beyond minDepth in which this spawns (Infinity = forever) */
  window: number;
  hpMult: number;
  atkMult: number;
  defMult: number;
  tier: number;
  specials: MonsterSpecial[];
  /** natives of a biome only spawn there (and spawn often, weighted up) */
  biome?: BiomeId;
  flavor: string;
}

export const MONSTERS: MonsterDef[] = [
  { key: 'rat',      name: 'Crypt Rat',      glyph: 'r', color: '#b89878', minDepth: 1,  window: 5,  hpMult: 0.8,  atkMult: 0.9,  defMult: 0, tier: 0, specials: [],                    flavor: 'Fat on coffin-meat.' },
  { key: 'bat',      name: 'Tomb Bat',       glyph: 'b', color: '#9a86b8', minDepth: 1,  window: 5,  hpMult: 0.6,  atkMult: 0.8,  defMult: 0, tier: 0, specials: ['fast'],              flavor: 'It knows the dark better than you.' },
  { key: 'ooze',     name: 'Grave Ooze',     glyph: 'o', color: '#6cc26c', minDepth: 1,  window: 6,  hpMult: 1.5,  atkMult: 0.7,  defMult: 1, tier: 0, specials: ['slow', 'regen'],     flavor: 'What the worms refused.' },
  { key: 'goblin',   name: 'Barrow Goblin',  glyph: 'g', color: '#88aa55', minDepth: 2,  window: 6,  hpMult: 1.0,  atkMult: 1.0,  defMult: 0, tier: 0, specials: [],                    flavor: 'Steals grave-goods. Now it is one.' },
  { key: 'spider',   name: 'Bone Spider',    glyph: 's', color: '#d8d8c8', minDepth: 3,  window: 7,  hpMult: 0.9,  atkMult: 1.1,  defMult: 0, tier: 1, specials: ['poison'],            flavor: 'Webs of hair and sinew.' },
  { key: 'zombie',   name: 'Sodden Zombie',  glyph: 'z', color: '#7a9a6a', minDepth: 4,  window: 7,  hpMult: 1.8,  atkMult: 1.0,  defMult: 0, tier: 1, specials: ['slow'],              flavor: 'Still digging, wrong direction.' },
  { key: 'kobold',   name: 'Vault Kobold',   glyph: 'k', color: '#cc8844', minDepth: 5,  window: 7,  hpMult: 0.9,  atkMult: 1.0,  defMult: 1, tier: 1, specials: ['thief'],             flavor: 'Your gold sings to it.' },
  { key: 'cultist',  name: 'Pale Cultist',   glyph: 'c', color: '#bb77dd', minDepth: 5,  window: 8,  hpMult: 0.8,  atkMult: 1.1,  defMult: 0, tier: 1, specials: ['ranged'],            flavor: 'Prays to what you serve.' },
  { key: 'wolf',     name: 'Charnel Hound',  glyph: 'h', color: '#aaaaaa', minDepth: 6,  window: 8,  hpMult: 1.0,  atkMult: 1.2,  defMult: 0, tier: 1, specials: ['fast'],              flavor: 'Buried with its master. Hungry since.' },
  { key: 'wight',    name: 'Wight',          glyph: 'w', color: '#aaeeff', minDepth: 7,  window: 9,  hpMult: 1.2,  atkMult: 1.1,  defMult: 1, tier: 2, specials: ['vampiric'],          flavor: 'It remembers being you.' },
  { key: 'orc',      name: 'Deep Orc',       glyph: 'O', color: '#66aa55', minDepth: 8,  window: 9,  hpMult: 1.4,  atkMult: 1.25, defMult: 1, tier: 2, specials: [],                    flavor: 'Mines the dark for worse things.' },
  { key: 'serpent',  name: 'Marsh Serpent',  glyph: 'S', color: '#44cc88', minDepth: 9,  window: 9,  hpMult: 1.1,  atkMult: 1.2,  defMult: 0, tier: 2, specials: ['poison', 'fast'],    flavor: 'The water here drowned a kingdom.' },
  { key: 'brigand',  name: 'Crypt Brigand',  glyph: 'B', color: '#cc7777', minDepth: 10, window: 9,  hpMult: 1.1,  atkMult: 1.3,  defMult: 1, tier: 2, specials: ['thief', 'deadly'],   flavor: 'Robbing graves was step one.' },
  { key: 'mummy',    name: 'Bound Mummy',    glyph: 'M', color: '#ddcc99', minDepth: 11, window: 10, hpMult: 1.7,  atkMult: 1.1,  defMult: 2, tier: 2, specials: ['slow', 'armored'],   flavor: 'The bandages hold something in.' },
  { key: 'caller',   name: 'Gravecaller',    glyph: 'C', color: '#9966ff', minDepth: 12, window: 10, hpMult: 1.0,  atkMult: 1.1,  defMult: 0, tier: 3, specials: ['summon', 'ranged'],  flavor: 'A colleague, technically.' },
  { key: 'ogre',     name: 'Tomb Ogre',      glyph: 'T', color: '#cc9966', minDepth: 13, window: 10, hpMult: 2.2,  atkMult: 1.7,  defMult: 1, tier: 3, specials: ['slow'],              flavor: 'Uses sarcophagi as lunchboxes.' },
  { key: 'hellhound',name: 'Cinder Hound',   glyph: 'd', color: '#ff6644', minDepth: 14, window: 10, hpMult: 1.0,  atkMult: 1.3,  defMult: 0, tier: 3, specials: ['fast', 'burn'],      flavor: 'Smells of pyres.' },
  { key: 'troll',    name: 'Ossuary Troll',  glyph: 'R', color: '#55aa55', minDepth: 15, window: 11, hpMult: 2.6,  atkMult: 1.4,  defMult: 1, tier: 3, specials: ['regen'],             flavor: 'Knits itself back with stolen bones.' },
  { key: 'revenant', name: 'Revenant',       glyph: 'V', color: '#aaddff', minDepth: 16, window: 11, hpMult: 1.5,  atkMult: 1.5,  defMult: 2, tier: 3, specials: ['vampiric','deadly'], flavor: 'Came back wrong. Came back angry.' },
  { key: 'drake',    name: 'Crypt Drake',    glyph: 'D', color: '#ff8800', minDepth: 18, window: 12, hpMult: 1.8,  atkMult: 1.5,  defMult: 2, tier: 4, specials: ['burn', 'armored'],   flavor: 'Hoards teeth instead of gold.' },
  { key: 'witch',    name: 'Hex Witch',      glyph: 'W', color: '#dd66ff', minDepth: 19, window: 12, hpMult: 1.1,  atkMult: 1.5,  defMult: 0, tier: 4, specials: ['ranged', 'poison'],  flavor: 'Sells curses. Buys souls. Bad rates.' },
  { key: 'golem',    name: 'Sepulcher Golem',glyph: 'G', color: '#8899aa', minDepth: 20, window: 13, hpMult: 3.0,  atkMult: 1.4,  defMult: 4, tier: 4, specials: ['armored', 'slow'],   flavor: 'Carved to keep things *in*.' },
  { key: 'lich',     name: 'Lesser Lich',    glyph: 'L', color: '#99ffff', minDepth: 22, window: 14, hpMult: 1.6,  atkMult: 1.6,  defMult: 2, tier: 4, specials: ['summon', 'ranged'],  flavor: 'Skipped the apprenticeship.' },
  { key: 'demon',    name: 'Pit Demon',      glyph: 'X', color: '#ff4444', minDepth: 24, window: 16, hpMult: 2.0,  atkMult: 1.9,  defMult: 2, tier: 5, specials: ['deadly', 'burn'],    flavor: 'Subletting from something deeper.' },
  { key: 'abomination', name: 'Abomination', glyph: 'A', color: '#ffaaaa', minDepth: 26, window: 18, hpMult: 3.5,  atkMult: 1.6,  defMult: 1, tier: 5, specials: ['regen'],             flavor: 'Many donors. No consent.' },
  { key: 'dknight',  name: 'Death Knight',   glyph: 'K', color: '#ccccff', minDepth: 28, window: Infinity, hpMult: 2.2, atkMult: 1.9, defMult: 5, tier: 5, specials: ['armored','deadly','vampiric'], flavor: 'Oathbound to the floor below.' },
  { key: 'voidspawn',name: 'Void Spawn',     glyph: 'v', color: '#aa44ff', minDepth: 30, window: Infinity, hpMult: 1.6, atkMult: 2.1, defMult: 2, tier: 6, specials: ['fast', 'deadly'], flavor: 'A hole shaped like an animal.' },
  { key: 'horror',   name: 'Elder Horror',   glyph: 'U', color: '#ff66aa', minDepth: 34, window: Infinity, hpMult: 3.0, atkMult: 2.0, defMult: 3, tier: 6, specials: ['regen','vampiric','deadly'], flavor: 'Older than the rock it sleeps in.' },
];

/** Biome natives — each stalks only its own biome (matched by `biome`). */
export const BIOME_MONSTERS: MonsterDef[] = [
  // the server room (depth 13+)
  { key: 'daemon',   name: 'Daemon Process',    glyph: 'p', color: '#38c8f0', minDepth: 13, window: Infinity, hpMult: 0.9, atkMult: 1.25, defMult: 0, tier: 3, specials: ['fast'],              biome: 'server', flavor: 'It was never meant to stop running.' },
  { key: 'sentinel', name: 'Firewall Sentinel', glyph: 'F', color: '#ff9e3d', minDepth: 13, window: Infinity, hpMult: 2.0, atkMult: 1.1,  defMult: 3, tier: 3, specials: ['armored', 'ranged'], biome: 'server', flavor: 'Default policy: deny.' },
  { key: 'coolant',  name: 'Coolant Wraith',    glyph: '≈', color: '#7fd4ff', minDepth: 13, window: Infinity, hpMult: 1.3, atkMult: 1.2,  defMult: 1, tier: 4, specials: ['slow', 'vampiric'],  biome: 'server', flavor: 'The cold keeps something fresh in there.' },
  // the Drowned Archive (depth 50+)
  { key: 'archivist', name: 'Drowned Archivist', glyph: 'q', color: '#3fbcb0', minDepth: 50, window: Infinity, hpMult: 1.2, atkMult: 1.4, defMult: 1, tier: 5, specials: ['ranged', 'summon'],          biome: 'archive', flavor: 'It files you under PENDING.' },
  { key: 'siltchoir', name: 'Silt Choir',        glyph: '≋', color: '#4a8aa8', minDepth: 50, window: Infinity, hpMult: 2.4, atkMult: 1.3, defMult: 3, tier: 5, specials: ['slow', 'vampiric', 'armored'], biome: 'archive', flavor: 'A hymn with too many mouths.' },
  // the Ossuary City (depth 100+)
  { key: 'sexton',  name: 'Ossuary Sexton', glyph: '†', color: '#d8d0b8', minDepth: 100, window: Infinity, hpMult: 2.0, atkMult: 1.6, defMult: 4, tier: 6, specials: ['summon', 'armored'], biome: 'city', flavor: 'Still burying. Always room for one more.' },
  { key: 'marrowtyrant', name: 'Marrow Tyrant', glyph: 'Ψ', color: '#ffb44e', minDepth: 100, window: Infinity, hpMult: 2.8, atkMult: 1.9, defMult: 3, tier: 6, specials: ['deadly', 'regen'],   biome: 'city', flavor: 'It taxes the dead. The rates are criminal.' },
];

/** Plain-language notes for monster specials (hover tips + the codex). */
export const SPECIAL_NOTES: Record<MonsterSpecial, string> = {
  fast: 'Fast — acts twice per hero turn',
  slow: 'Slow — acts every other turn',
  poison: 'Poisonous — its hits afflict a poison dot',
  burn: 'Burning — its hits afflict a burn dot',
  vampiric: 'Vampiric — heals for 60% of damage dealt',
  ranged: 'Ranged — strikes from up to 3 tiles with line of sight',
  regen: 'Regenerating — recovers 3% max HP per turn',
  summon: 'Summoner — raises lesser dead mid-fight',
  thief: 'Thief — steals gold on hit',
  armored: 'Armored — bonus defense baked in',
  deadly: 'Deadly — 20% chance to crit',
};

/** Specials that spawn by their own rules, not the depth tables. */
export const SPECIAL_MONSTERS: MonsterDef[] = [
  { key: 'lootgoblin', name: 'Loot Goblin', glyph: '¤', color: '#ffd700', minDepth: 3, window: Infinity, hpMult: 2.2, atkMult: 0, defMult: 0, tier: 2, specials: ['fast'], flavor: 'It has your gold. It is very sorry. It is leaving.' },
];

/** Def lookup across every spawn table (UI flavor, the codex). */
export function monsterDefByKey(key: string): MonsterDef | undefined {
  return MONSTERS.find((m) => m.key === key)
    ?? BIOME_MONSTERS.find((m) => m.key === key)
    ?? SPECIAL_MONSTERS.find((m) => m.key === key);
}

export const BOSS_NAMES = [
  'Bonelord Karguth',
  'The Pale Shepherd',
  'Ossuary Queen Velka',
  'Hollow King Dreth',
  'Mawmother Sezzik',
  'The Drowned Cardinal',
  'Gravetide Emperor Ahl',
  'The Stitched Choir',
  'Tyrant of the Ninth Vault',
  'The Nameless Below',
];

/** Proper roman numerals — "Reborn V", not "Reborn IIIII". */
function roman(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, sym] of table) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out;
}

/** Bosses past the named list get numbered epithets. */
export function bossName(depth: number): string {
  const idx = Math.floor(depth / 5) - 1;
  if (idx < BOSS_NAMES.length) return BOSS_NAMES[idx];
  const cycle = BOSS_NAMES[idx % BOSS_NAMES.length];
  const aeon = Math.floor(idx / BOSS_NAMES.length) + 1;
  return `${cycle}, Reborn ${roman(aeon)}`;
}

export function eligibleMonsters(depth: number, biome?: BiomeId): MonsterDef[] {
  const list = MONSTERS.filter(
    (m) => depth >= m.minDepth && depth <= m.minDepth + m.window,
  );
  // Safety: never return empty (very deep floors fall back to open-window mobs).
  const base = list.length === 0 ? MONSTERS.filter((m) => m.window === Infinity) : list;
  if (biome) {
    return [...base, ...BIOME_MONSTERS.filter((m) => m.biome === biome && depth >= m.minDepth)];
  }
  return base;
}
