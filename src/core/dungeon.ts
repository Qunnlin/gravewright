import { TILE, type Floor, type Monster } from './types';
import { biomeById, type BiomeId } from './data/biomes';
import {
  BOSS_ATK_MULT, BOSS_HP_MULT, CHAMPION_ATK_MULT, CHAMPION_HP_MULT,
  ELITE_ATK_MULT, ELITE_HP_MULT, MINIBOSS_ATK_MULT, MINIBOSS_HP_MULT,
  VAULT_CHANCE, bonePile, championChance, elitesOnFloor, goldPile,
  monsterAtk, monsterCount, monsterDef, monsterHp, monsterXp,
} from './balance';
import { bossName, eligibleMonsters } from './data/monsters';
import { ENCHANTS, WARDEN_NAMES } from './data/enchants';
import { chance, pick, pickWeighted, rndInt, rndf, shuffle } from './rng';

export const FLOOR_W = 48;
export const FLOOR_H = 27;

export interface GenMods {
  monsterHpMult: number;
  monsterAtkMult: number;
  monsterCountMult: number;
}

export const DEFAULT_MODS: GenMods = {
  monsterHpMult: 1,
  monsterAtkMult: 1,
  monsterCountMult: 1,
};

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

let monsterIdCounter = 1;

const idx = (x: number, y: number) => y * FLOOR_W + x;

function roomsOverlap(a: Room, b: Room): boolean {
  return (
    a.x - 1 < b.x + b.w + 1 && a.x + a.w + 1 > b.x - 1 &&
    a.y - 1 < b.y + b.h + 1 && a.y + a.h + 1 > b.y - 1
  );
}

function carveRoom(tiles: Uint8Array, r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[idx(x, y)] = TILE.FLOOR;
    }
  }
}

function carveCorridor(tiles: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  // L-shaped corridor; orientation randomized by caller via argument order.
  let x = x0;
  let y = y0;
  while (x !== x1) {
    tiles[idx(x, y)] = TILE.FLOOR;
    x += Math.sign(x1 - x);
  }
  while (y !== y1) {
    tiles[idx(x, y)] = TILE.FLOOR;
    y += Math.sign(y1 - y);
  }
  tiles[idx(x, y)] = TILE.FLOOR;
}

function center(r: Room): { x: number; y: number } {
  return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
}

/** Random floor tile not occupied by anything important. */
function freeTile(
  floor: Floor,
  taken: Set<number>,
  nearRoom?: Room,
): { x: number; y: number } {
  for (let attempts = 0; attempts < 500; attempts++) {
    let x: number, y: number;
    if (nearRoom) {
      x = rndInt(nearRoom.x, nearRoom.x + nearRoom.w - 1);
      y = rndInt(nearRoom.y, nearRoom.y + nearRoom.h - 1);
    } else {
      x = rndInt(1, FLOOR_W - 2);
      y = rndInt(1, FLOOR_H - 2);
    }
    const i = idx(x, y);
    const t = floor.tiles[i];
    if ((t === TILE.FLOOR || t === TILE.VAULT) && !taken.has(i)) {
      taken.add(i);
      return { x, y };
    }
  }
  // Fallback: linear scan.
  for (let i = 0; i < floor.tiles.length; i++) {
    const t = floor.tiles[i];
    if ((t === TILE.FLOOR || t === TILE.VAULT) && !taken.has(i)) {
      taken.add(i);
      return { x: i % FLOOR_W, y: Math.floor(i / FLOOR_W) };
    }
  }
  return { x: 1, y: 1 };
}

export function spawnMonster(
  depth: number,
  x: number,
  y: number,
  mods: GenMods,
  opts: { elite?: boolean; boss?: boolean; mini?: boolean; plain?: boolean; biome?: BiomeId } = {},
): Monster {
  const defs = eligibleMonsters(depth, opts.biome);
  // biome natives crowd out the common rabble (×3 weight)
  const def = pickWeighted(defs, defs.map((d) => (10 / (1 + d.tier * 0.5)) * (d.biome ? 3 : 1)));
  const elite = opts.elite ?? false;
  const boss = opts.boss ?? false;
  const mini = opts.mini ?? false;

  let hp = monsterHp(depth) * def.hpMult * mods.monsterHpMult;
  let atk = monsterAtk(depth) * def.atkMult * mods.monsterAtkMult;
  let def_ = monsterDef(depth) + def.defMult * Math.max(1, depth * 0.4);
  if (def.specials.includes('armored')) def_ *= 2.2;
  if (elite) {
    hp *= ELITE_HP_MULT;
    atk *= ELITE_ATK_MULT;
  }
  if (boss) {
    hp *= BOSS_HP_MULT;
    atk *= BOSS_ATK_MULT;
    def_ *= 1.5;
  }
  if (mini) {
    hp *= MINIBOSS_HP_MULT;
    atk *= MINIBOSS_ATK_MULT;
    def_ *= 1.3;
  }

  const specials = [...def.specials];
  let name = boss ? bossName(depth) : mini ? pick(WARDEN_NAMES) : elite ? `Dread ${def.name}` : def.name;
  let color = boss ? '#ff3366' : mini ? '#ffb44e' : elite ? '#ffd700' : def.color;
  let xpMult = elite ? 3 : boss ? 8 : mini ? 5 : 1;

  // champion roll — Diablo-style enchanted rares
  const enchants: string[] = [];
  if (!elite && !boss && !mini && !opts.plain && chance(championChance(depth))) {
    let n = 1;
    if (depth >= 8 && chance(0.5)) n++;
    if (depth >= 16 && chance(0.35)) n++;
    for (const e of shuffle([...ENCHANTS]).slice(0, n)) {
      enchants.push(e.id);
      hp *= e.hpMult ?? 1;
      atk *= e.atkMult ?? 1;
      def_ *= e.defMult ?? 1;
      for (const sp of e.specials ?? []) {
        if (!specials.includes(sp)) specials.push(sp);
      }
      name = `${e.prefix} ${name}`;
    }
    hp *= CHAMPION_HP_MULT;
    atk *= CHAMPION_ATK_MULT;
    color = '#7fc7ff';
    xpMult = 2.5;
  }

  return {
    id: monsterIdCounter++,
    key: def.key,
    name,
    glyph: boss ? '☠' : mini ? 'Ω' : def.glyph,
    color,
    x, y,
    hp: Math.ceil(hp),
    maxHp: Math.ceil(hp),
    atk,
    def: def_,
    specials,
    xp: monsterXp(depth, def.tier) * xpMult,
    tier: def.tier,
    elite,
    boss,
    mini,
    enchants,
    awake: false,
    slowSkip: false,
    summonCd: enchants.includes('phasing') ? 5 : 0,
    stolenGold: 0,
  };
}

/** A weak add summoned mid-fight by 'summon' monsters. */
export function spawnLesser(depth: number, x: number, y: number, mods: GenMods): Monster {
  const m = spawnMonster(Math.max(1, depth - 3), x, y, mods, { plain: true });
  m.name = `Risen ${m.name}`;
  m.hp = Math.ceil(m.hp * 0.5);
  m.maxHp = m.hp;
  m.xp = Math.ceil(m.xp * 0.3);
  m.awake = true;
  return m;
}

export function genFloor(
  depth: number,
  mods: GenMods = DEFAULT_MODS,
  withTrial = false,
  biome?: BiomeId,
): Floor {
  const tiles = new Uint8Array(FLOOR_W * FLOOR_H); // all WALL
  const isBossFloor = depth % 5 === 0;

  // --- rooms ---
  const rooms: Room[] = [];
  const target = rndInt(9, 13);
  for (let attempts = 0; attempts < 250 && rooms.length < target; attempts++) {
    const w = rndInt(4, 9);
    const h = rndInt(3, 6);
    const r: Room = {
      x: rndInt(1, FLOOR_W - w - 2),
      y: rndInt(1, FLOOR_H - h - 2),
      w, h,
    };
    if (!rooms.some((o) => roomsOverlap(r, o))) rooms.push(r);
  }
  for (const r of rooms) carveRoom(tiles, r);

  // --- corridors: chain + a few loops ---
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]);
    const b = center(rooms[i]);
    if (chance(0.5)) carveCorridor(tiles, a.x, a.y, b.x, b.y);
    else carveCorridor(tiles, b.x, b.y, a.x, a.y);
  }
  for (let i = 0; i < 2 && rooms.length > 3; i++) {
    const a = center(pick(rooms));
    const b = center(pick(rooms));
    carveCorridor(tiles, a.x, a.y, b.x, b.y);
  }

  // --- entry & stairs: farthest-apart room pair ---
  const entryRoom = rooms[0];
  let stairsRoom = rooms[rooms.length - 1];
  let bestDist = -1;
  const ec = center(entryRoom);
  for (const r of rooms.slice(1)) {
    const c = center(r);
    const d = Math.abs(c.x - ec.x) + Math.abs(c.y - ec.y);
    if (d > bestDist) {
      bestDist = d;
      stairsRoom = r;
    }
  }

  const floor: Floor = {
    depth,
    w: FLOOR_W,
    h: FLOOR_H,
    tiles,
    seen: new Uint8Array(FLOOR_W * FLOOR_H),
    visible: new Uint8Array(FLOOR_W * FLOOR_H),
    monsters: [],
    items: [],
    entry: { x: 0, y: 0 },
    stairs: { x: 0, y: 0 },
    shrine: null,
    well: null,
    vault: null,
    trial: null,
    floorTileCount: 0,
    isBossFloor,
    biome,
  };

  const taken = new Set<number>();
  floor.entry = freeTile(floor, taken, entryRoom);
  floor.stairs = freeTile(floor, taken, stairsRoom);
  tiles[idx(floor.stairs.x, floor.stairs.y)] = TILE.STAIRS;

  // --- the Sealed Hall: a trial shrine in the grandest room ---
  if (withTrial) {
    const halls = rooms
      .filter((r) => r !== entryRoom && r.w * r.h >= 12)
      .sort((a, b) => b.w * b.h - a.w * a.h);
    const hall = halls[0] ?? stairsRoom;
    const spot = freeTile(floor, taken, hall);
    floor.trial = { ...spot, used: false };
    tiles[idx(spot.x, spot.y)] = TILE.TRIAL;
  }

  // --- vault: rare sealed treasure room with a Warden mini-boss ---
  if (!isBossFloor && !withTrial && chance(VAULT_CHANCE)) {
    const candidates = rooms.filter(
      (r) => r !== entryRoom && r !== stairsRoom && r.w >= 4 && r.h >= 3);
    if (candidates.length > 0) {
      const room = pick(candidates);
      floor.vault = { x: room.x, y: room.y, w: room.w, h: room.h };
      for (let y = room.y; y < room.y + room.h; y++) {
        for (let x = room.x; x < room.x + room.w; x++) {
          if (tiles[idx(x, y)] === TILE.FLOOR) tiles[idx(x, y)] = TILE.VAULT;
        }
      }
      const wardenSpot = freeTile(floor, taken, room);
      floor.monsters.push(spawnMonster(depth, wardenSpot.x, wardenSpot.y, mods, { mini: true }));
      // the hoard
      for (let i = 0; i < 2; i++) {
        const spot = freeTile(floor, taken, room);
        floor.items.push({ ...spot, kind: 'gold', amount: Math.ceil(goldPile(depth) * 3 * rndf(0.8, 1.3)) });
      }
      const boneSpot = freeTile(floor, taken, room);
      floor.items.push({ ...boneSpot, kind: 'bones', amount: Math.ceil(bonePile(depth) * 3 * rndf(0.8, 1.3)) });
      const chestSpot = freeTile(floor, taken, room);
      floor.items.push({ ...chestSpot, kind: 'chest', amount: 0, special: true });
    }
  }

  // --- shrine ---
  if (chance(0.75)) {
    const spot = freeTile(floor, taken);
    floor.shrine = { ...spot, used: false };
    tiles[idx(spot.x, spot.y)] = TILE.SHRINE;
  }

  // --- soul well on boss floors ---
  if (isBossFloor) {
    const spot = freeTile(floor, taken, stairsRoom);
    floor.well = { ...spot, used: false };
    tiles[idx(spot.x, spot.y)] = TILE.WELL;
  }

  // --- monsters ---
  const count = Math.round(monsterCount(depth) * mods.monsterCountMult);
  const entryIdx = idx(floor.entry.x, floor.entry.y);
  for (let i = 0; i < count; i++) {
    const spot = freeTile(floor, taken);
    // keep spawns off the entrance doorstep
    if (Math.abs(spot.x - floor.entry.x) + Math.abs(spot.y - floor.entry.y) < 4) continue;
    floor.monsters.push(spawnMonster(depth, spot.x, spot.y, mods, { biome }));
  }
  let elites = elitesOnFloor(depth);
  for (const m of shuffle([...floor.monsters])) {
    if (elites <= 0) break;
    if (!m.elite && !m.boss && !m.mini && m.enchants.length === 0) {
      const e = spawnMonster(depth, m.x, m.y, mods, { elite: true, biome });
      Object.assign(m, { ...e, id: m.id, x: m.x, y: m.y });
      elites--;
    }
  }
  if (isBossFloor) {
    // boss guards the stairs
    const spot = freeTile(floor, taken, stairsRoom);
    floor.monsters.push(spawnMonster(depth, spot.x, spot.y, mods, { boss: true }));
  }
  void entryIdx;

  // --- loot ---
  // biome loot hooks: pile multipliers and special (epic+) chests come from
  // the biome's def — see data/biomes.ts
  const bdef = biome ? biomeById(biome) : undefined;
  const goldPiles = rndInt(4, 7);
  for (let i = 0; i < goldPiles; i++) {
    const spot = freeTile(floor, taken);
    floor.items.push({ ...spot, kind: 'gold', amount: Math.ceil(goldPile(depth) * rndf(0.7, 1.4) * (bdef?.goldMult ?? 1)) });
  }
  const bonePiles = rndInt(2, 4);
  for (let i = 0; i < bonePiles; i++) {
    const spot = freeTile(floor, taken);
    floor.items.push({ ...spot, kind: 'bones', amount: Math.ceil(bonePile(depth) * rndf(0.7, 1.4) * (bdef?.boneMult ?? 1)) });
  }
  const chests = rndInt(1, 3);
  for (let i = 0; i < chests; i++) {
    const spot = freeTile(floor, taken);
    floor.items.push({ ...spot, kind: 'chest', amount: 0, special: bdef?.chestsSpecial || undefined });
  }
  if (chance(0.4)) {
    const spot = freeTile(floor, taken);
    floor.items.push({ ...spot, kind: 'potion', amount: 0 });
  }

  // --- bookkeeping ---
  let fc = 0;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== TILE.WALL) fc++;
  floor.floorTileCount = fc;

  return floor;
}

/** The Sealed Hall: one huge pillared arena. No stairs, no loot, no mercy.
 *  The onslaught itself is spawned by the Game (wrath/curse-scaled packs). */
export function genTrialHall(depth: number, mods: GenMods = DEFAULT_MODS): Floor {
  void mods; // the hall is bare; its monsters arrive later, already scaled
  const tiles = new Uint8Array(FLOOR_W * FLOOR_H); // all WALL
  for (let y = 2; y < FLOOR_H - 2; y++) {
    for (let x = 2; x < FLOOR_W - 2; x++) {
      tiles[idx(x, y)] = TILE.FLOOR;
    }
  }
  // scattered pillars for cover and line-of-sight play; the center stays open
  const cx = Math.floor(FLOOR_W / 2);
  const cy = Math.floor(FLOOR_H / 2);
  for (let i = 0; i < 18; i++) {
    const px = rndInt(5, FLOOR_W - 6);
    const py = rndInt(4, FLOOR_H - 5);
    if (Math.abs(px - cx) + Math.abs(py - cy) < 5) continue;
    tiles[idx(px, py)] = TILE.WALL;
    if (chance(0.5)) tiles[idx(px + 1, py)] = TILE.WALL;
  }
  // the spent altar at the heart of the hall (inert; flavor only)
  tiles[idx(cx, cy)] = TILE.TRIAL;

  const floor: Floor = {
    depth,
    w: FLOOR_W,
    h: FLOOR_H,
    tiles,
    seen: new Uint8Array(FLOOR_W * FLOOR_H),
    visible: new Uint8Array(FLOOR_W * FLOOR_H),
    monsters: [],
    items: [],
    entry: { x: cx, y: cy },
    // there are no stairs in the Sealed Hall — only victory or the wager
    stairs: { x: -1, y: -1 },
    shrine: null,
    well: null,
    vault: null,
    trial: { x: cx, y: cy, used: true },
    floorTileCount: 0,
    isBossFloor: false,
  };
  let fc = 0;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== TILE.WALL) fc++;
  floor.floorTileCount = fc;
  return floor;
}

/** ---- visibility ---- */

export function isPassable(floor: Floor, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return false;
  return floor.tiles[y * floor.w + x] !== TILE.WALL;
}

/** Bresenham line; returns true if no wall strictly between the endpoints. */
export function losClear(floor: Floor, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    if (!isPassable(floor, x, y)) return false;
  }
  return true;
}

export function computeFov(floor: Floor, cx: number, cy: number, radius: number): void {
  floor.visible.fill(0);
  const r2 = radius * radius;
  for (let y = Math.max(0, cy - radius); y <= Math.min(floor.h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(floor.w - 1, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (losClear(floor, cx, cy, x, y) || losClearToWall(floor, cx, cy, x, y)) {
        const i = y * floor.w + x;
        floor.visible[i] = 1;
        floor.seen[i] = 1;
      }
    }
  }
}

/** Walls are visible if the line reaches them without passing another wall. */
function losClearToWall(floor: Floor, x0: number, y0: number, x1: number, y1: number): boolean {
  if (isPassable(floor, x1, y1)) return false;
  // check LOS to a passable neighbor of the wall adjacent toward viewer
  const dx = Math.sign(x0 - x1);
  const dy = Math.sign(y0 - y1);
  const nx = x1 + dx;
  const ny = y1 + dy;
  if (isPassable(floor, nx, ny) && losClear(floor, x0, y0, nx, ny)) return true;
  if (isPassable(floor, x1 + dx, y1) && losClear(floor, x0, y0, x1 + dx, y1)) return true;
  if (isPassable(floor, x1, y1 + dy) && losClear(floor, x0, y0, x1, y1 + dy)) return true;
  return false;
}

/** ---- pathfinding ---- */

const DIRS4 = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
] as const;

/**
 * BFS distance field from (sx, sy) over passable tiles.
 * -1 = unreachable/wall. Monsters are NOT obstacles (paths bump through them).
 */
export function bfsMap(floor: Floor, sx: number, sy: number): Int16Array {
  const dist = new Int16Array(floor.w * floor.h).fill(-1);
  const qx = new Int16Array(floor.w * floor.h);
  const qy = new Int16Array(floor.w * floor.h);
  let head = 0;
  let tail = 0;
  dist[sy * floor.w + sx] = 0;
  qx[tail] = sx;
  qy[tail] = sy;
  tail++;
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    const d = dist[y * floor.w + x];
    for (const [ox, oy] of DIRS4) {
      const nx = x + ox;
      const ny = y + oy;
      if (!isPassable(floor, nx, ny)) continue;
      const ni = ny * floor.w + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = d + 1;
      qx[tail] = nx;
      qy[tail] = ny;
      tail++;
    }
  }
  return dist;
}

/** Step from (x,y) downhill on a BFS field (toward its source). */
export function stepToward(
  floor: Floor,
  x: number,
  y: number,
  dist: Int16Array,
): { x: number; y: number } | null {
  const cur = dist[y * floor.w + x];
  if (cur <= 0) return null;
  let best: { x: number; y: number } | null = null;
  let bestD = cur;
  for (const [ox, oy] of shuffleDirs()) {
    const nx = x + ox;
    const ny = y + oy;
    if (!isPassable(floor, nx, ny)) continue;
    const d = dist[ny * floor.w + nx];
    if (d !== -1 && d < bestD) {
      bestD = d;
      best = { x: nx, y: ny };
    }
  }
  return best;
}

function shuffleDirs(): number[][] {
  const dirs = DIRS4.map((d) => [...d]);
  return shuffle(dirs);
}

/** Nearest tile matching a predicate, by BFS distance from a field. */
export function nearestWhere(
  floor: Floor,
  dist: Int16Array,
  match: (x: number, y: number, i: number) => boolean,
): { x: number; y: number; d: number } | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y < floor.h; y++) {
    for (let x = 0; x < floor.w; x++) {
      const i = y * floor.w + x;
      const d = dist[i];
      if (d === -1) continue;
      if (!match(x, y, i)) continue;
      if (best === null || d < best.d) best = { x, y, d };
    }
  }
  return best;
}

/** Reset the monster id counter (used by tests for determinism). */
export function resetMonsterIds(): void {
  monsterIdCounter = 1;
}
