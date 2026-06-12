/**
 * Biome eras — rare multi-floor detours from honest crypt stone. A new
 * theme unlocks roughly every 50–100 depths (playtest request), and visits
 * are spaced by a cooldown so each one stays an event, not wallpaper.
 * Natives live in data/monsters.ts (BIOME_MONSTERS, matched by `biome`);
 * palettes in render.ts BIOME_PALETTES; global knobs in balance.ts
 * (BIOME_CHANCE / BIOME_FLOORS / BIOME_COOLDOWN).
 */

export type BiomeId = 'server' | 'archive' | 'city';

export interface BiomeDef {
  id: BiomeId;
  name: string;
  /** floors this deep may roll the biome */
  minDepth: number;
  /** loot hooks: pile multipliers + whether chests become special (epic+) */
  goldMult: number;
  boneMult: number;
  chestsSpecial: boolean;
  /** the special chest's identity (maptip + render tint) */
  cacheName: string;
  cacheDesc: string;
  cacheColor: string;
  enterOmen: string;
  exitOmen: string;
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'server',
    name: 'the server room',
    minDepth: 13,
    goldMult: 1.5,
    boneMult: 1,
    chestsSpecial: true,
    cacheName: '▣ Data cache',
    cacheDesc: 'salvaged hardware — an epic, or better, still spinning inside',
    cacheColor: '#38c8f0',
    enterOmen: '∿ The walls here are too regular. Black racks hum in ordered rows, and something keeps the air cold on purpose.',
    exitOmen: '∿ The hum fades behind you. Honest stone again.',
  },
  {
    id: 'archive',
    name: 'the Drowned Archive',
    minDepth: 50,
    goldMult: 1,
    boneMult: 1.75,
    chestsSpecial: false,
    cacheName: '▣ A swollen chest',
    cacheDesc: 'waterlogged; something shifts inside',
    cacheColor: '#3fbcb0',
    enterOmen: '≋ Shelves rise out of black water. The books breathe. Every title is a name you almost remember.',
    exitOmen: '≋ The water releases you. The Archive keeps reading.',
  },
  {
    id: 'city',
    name: 'the Ossuary City',
    minDepth: 100,
    goldMult: 1.4,
    boneMult: 1.4,
    chestsSpecial: true,
    cacheName: '▣ Reliquary urn',
    cacheDesc: 'a saint’s ransom — an epic, or better, sealed in bone',
    cacheColor: '#ffb44e',
    enterOmen: '† Streets of femur, plazas of skull. A whole civilization decided dying was a zoning issue.',
    exitOmen: '† The city gates of bone close politely behind you.',
  },
];

export function biomeById(id: string): BiomeDef | undefined {
  return BIOMES.find((b) => b.id === id);
}
