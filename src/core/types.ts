/** Shared type definitions for the GRAVEWRIGHT core simulation. */

export type Slot = 'weapon' | 'armor' | 'charm';

export type Affix =
  | 'atk'      // flat attack
  | 'def'      // flat defense
  | 'hpPct'    // +% max hp
  | 'crit'     // +% crit chance
  | 'goldPct'  // +% gold gain
  | 'soulPct'  // +% soul gain
  | 'regen'    // flat hp per turn
  | 'lifesteal'  // % of damage dealt healed
  | 'xpPct'    // +% experience
  | 'bonePct'  // +% bone gain
  | 'dodge';   // +% chance to avoid attacks

export type WeaponKind = 'blade' | 'heavy' | 'polearm' | 'bow' | 'focus';

export interface Item {
  slot: Slot;
  name: string;
  rarity: number; // 0 common … 4 mythic, 5 legendary, 6 vestige (set piece)
  depth: number;
  stats: Partial<Record<Affix, number>>;
  score: number;
  /** weapons only: archetype gating which classes may wield it */
  kind?: WeaponKind;
  /** vestiges only: which named set this piece belongs to */
  setId?: string;
  /** player-locked: auto-equip never replaces it, auto-scrap never eats it */
  locked?: boolean;
}

export type MonsterSpecial =
  | 'fast'      // acts twice per hero turn
  | 'slow'      // acts every other hero turn
  | 'poison'    // attacks apply poison dot
  | 'burn'      // attacks apply burn dot
  | 'vampiric'  // heals for 60% of damage dealt
  | 'ranged'    // attacks at distance <= 3 with line of sight
  | 'regen'     // regenerates 3% max hp per turn
  | 'summon'    // periodically raises lesser dead
  | 'thief'     // steals gold on hit
  | 'armored'   // bonus defense baked in at spawn
  | 'deadly';   // 20% crit chance

export interface Monster {
  id: number;
  key: string;
  name: string;
  glyph: string;
  color: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  specials: MonsterSpecial[];
  xp: number;
  tier: number;
  elite: boolean;
  boss: boolean;
  /** Vault Warden mini-boss. */
  mini: boolean;
  /** Champion enchantment ids (Diablo-style rares); empty for normal mobs. */
  enchants: string[];
  /** spawned by the Trial of the Sealed Hall */
  trial?: boolean;
  awake: boolean;
  /** turn-parity helpers */
  slowSkip: boolean;
  summonCd: number;
  stolenGold: number;
}

export type GroundKind = 'gold' | 'bones' | 'chest' | 'potion';

export interface GroundItem {
  x: number;
  y: number;
  kind: GroundKind;
  amount: number;
  /** vault hoard chests always hold an epic-or-better item */
  special?: boolean;
}

export interface Floor {
  depth: number;
  w: number;
  h: number;
  /** Tile enum values, row-major (y * w + x). */
  tiles: Uint8Array;
  seen: Uint8Array;
  visible: Uint8Array;
  monsters: Monster[];
  items: GroundItem[];
  entry: { x: number; y: number };
  stairs: { x: number; y: number };
  shrine: { x: number; y: number; used: boolean } | null;
  well: { x: number; y: number; used: boolean } | null;
  /** Sealed treasure room guarded by a Vault Warden (low chance per floor). */
  vault: { x: number; y: number; w: number; h: number } | null;
  /** Trial shrine of the Sealed Hall (boss-rush wager). */
  trial: { x: number; y: number; used: boolean } | null;
  /** transient: the offer modal was already shown this visit */
  trialOffered?: boolean;
  floorTileCount: number;
  isBossFloor: boolean;
}

export type StatusKind = 'poison' | 'burn';

export interface Status {
  kind: StatusKind;
  turns: number;
  power: number;
}

export interface Gear {
  weapon: Item | null;
  armor: Item | null;
  charm: Item | null;
}

export type Strategy = 'cautious' | 'balanced' | 'reckless';

export interface RunState {
  depth: number;
  heroName: string;
  klass: string;
  level: number;
  xp: number;
  hp: number;
  gear: Gear;
  statuses: Status[];
  kills: number;
  turn: number;
  floor: Floor;
  /** Shrine blessing: +25% damage while > 0 (counts down per hero turn). */
  blessTurns: number;
  /** Curses snapshotted at summon time; toggling mid-run has no effect. */
  curseIds: string[];
  /** Click-to-move override target. */
  manualTarget: { x: number; y: number } | null;
  /** Active boss-rush trial (wave counter); null outside trials. */
  trialActive: { wave: number; totalWaves: number } | null;
  /** Last Vigil 3-piece: the once-per-floor cheat of death was spent. */
  oathUsed: boolean;
  /** shrines used by THIS vessel (the ritual counts per life) */
  shrinesThisRun: number;
}

export interface MinionState {
  level: number; // 0 = not unlocked
  alive: boolean;
  hp: number;
}

export interface Settings {
  sound: boolean;
  autoBuyBones: boolean;
  particles: boolean;
  /** equip looted items automatically when they score better */
  autoEquip: boolean;
  /** instantly scrap unequipped loot below this rarity (0 = never) */
  autoSalvageBelow: number;
  /** items at or above this rarity are never auto-scrapped (3 epic / 4 mythic / 5 legendary / 7 nothing) */
  protectRarity: number;
  /** shop purchase batch: 1, 10, or 0 = max affordable */
  buyAmount: number;
  /** automatically re-raise fallen minions with bones */
  autoMend: boolean;
  /** Vestiges (set pieces) are exempt from every automatic scrap */
  protectVestiges: boolean;
}

export interface GameState {
  v: number;
  /** currencies */
  gold: number;
  bones: number;
  souls: number;
  essence: number;
  /** lifetime / per-reap accounting */
  lifetimeSouls: number;
  soulsThisReap: number;
  totalKills: number;
  totalDeaths: number;
  reaps: number;
  bestDepth: number;
  bestDepthThisReap: number;
  bossesSlain: number;
  shrinesUsed: number;
  goldLifetime: number;
  relicsFound: number;
  minionsRaised: number;
  championsSlain: number;
  wardensSlain: number;
  legendariesFound: number;
  trialsSeen: number;
  trialsWon: number;
  trialsFailed: number;
  /** the shrine ritual was completed; the next floor bears a Sealed Hall */
  trialPending: boolean;
  /** progression */
  upgrades: Record<string, number>;
  minions: Record<string, MinionState>;
  achievements: Record<string, boolean>;
  classesUnlocked: string[];
  curClass: string;
  strategy: Strategy;
  curses: Record<string, boolean>;
  relics: string[];
  /** gear waiting for the next vessel (survivors of keep-gear rolls) */
  keptGear: Gear;
  /** the Satchel: carried items awaiting manual decisions; survives death, not reaping */
  inventory: Item[];
  /** live run; null while between vessels */
  run: RunState | null;
  /** ms remaining until the next vessel can be summoned */
  summonCd: number;
  auto: boolean;
  /** Contextual tutorial steps already shown. */
  tutorial: Record<string, boolean>;
  /** EMA earn rates, per minute (for offline progress) */
  rates: { souls: number; bones: number };
  lastSeen: number;
  settings: Settings;
}

/** Stats derived from upgrades/class/gear/essence/relics — recomputed on change. */
export interface Derived {
  maxHp: number;
  atk: number;
  def: number;
  crit: number;       // %
  critDmg: number;    // multiplier
  vision: number;
  tickRate: number;   // hero actions per second
  goldMult: number;
  soulMult: number;
  boneMult: number;
  xpMult: number;
  lifesteal: number;  // %
  regen: number;      // flat hp per turn
  healOnKill: number; // % max hp
  keepGearChance: number; // %
  marrowPct: number;  // % of gold converted to bones on death
  dodge: number;      // %
  blockPct: number;   // % damage reduction after mitigation
  startDepth: number;
  summonCdMax: number; // ms
  minionAtkMult: number;
  minionHpMult: number;
  shrinesFree: boolean;
  rangedAttack: boolean;
  berserk: boolean;   // damage scales with missing hp
  /** set bonuses */
  negateChance: number;  // % chance a hit is discarded entirely (genuGate AIRGAP)
  dotImmune: boolean;    // poison/burn cannot land (genuGate AIRGAP)
  lowHpAtk: number;      // bonus damage fraction below half HP (Last Vigil)
  oathstone: boolean;    // survive one killing blow per floor (Last Vigil)
}

export const TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS: 2,
  SHRINE: 3,
  WELL: 4,
  VAULT: 5,
  TRIAL: 6,
} as const;

export type TileVal = (typeof TILE)[keyof typeof TILE];
