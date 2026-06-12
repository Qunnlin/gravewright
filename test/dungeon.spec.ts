import { describe, expect, it } from 'vitest';
import { seedRng } from '../src/core/rng';
import { genFloor, bfsMap, DEFAULT_MODS, FLOOR_W, FLOOR_H } from '../src/core/dungeon';
import { TILE } from '../src/core/types';
import { eligibleMonsters, bossName } from '../src/core/data/monsters';
import { BIOMES } from '../src/core/data/biomes';
import { Game } from '../src/core/game';
import * as B from '../src/core/balance';

describe('dungeon generation', () => {
  it('generates connected floors at every depth (entry → stairs reachable)', () => {
    seedRng(1234);
    for (let depth = 1; depth <= 60; depth++) {
      const floor = genFloor(depth);
      const dist = bfsMap(floor, floor.entry.x, floor.entry.y);
      const stairsIdx = floor.stairs.y * FLOOR_W + floor.stairs.x;
      expect(dist[stairsIdx], `depth ${depth}: stairs unreachable`).toBeGreaterThan(0);
    }
  });

  it('places all monsters and items on passable, in-bounds tiles', () => {
    seedRng(777);
    for (let depth = 1; depth <= 40; depth += 3) {
      const floor = genFloor(depth);
      for (const m of floor.monsters) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThan(FLOOR_W);
        expect(m.y).toBeGreaterThanOrEqual(0);
        expect(m.y).toBeLessThan(FLOOR_H);
        expect(floor.tiles[m.y * FLOOR_W + m.x]).not.toBe(TILE.WALL);
        expect(m.hp).toBeGreaterThan(0);
        expect(m.atk).toBeGreaterThan(0);
      }
      for (const it of floor.items) {
        expect(floor.tiles[it.y * FLOOR_W + it.x]).not.toBe(TILE.WALL);
      }
    }
  });

  it('boss floors have exactly one boss and a soul well', () => {
    seedRng(99);
    for (const depth of [5, 10, 15, 20, 25, 50]) {
      const floor = genFloor(depth);
      expect(floor.isBossFloor).toBe(true);
      expect(floor.monsters.filter((m) => m.boss)).toHaveLength(1);
      expect(floor.well).not.toBeNull();
    }
    const normal = genFloor(7);
    expect(normal.isBossFloor).toBe(false);
    expect(normal.monsters.some((m) => m.boss)).toBe(false);
  });

  it('monster eligibility is never empty, to depth 500', () => {
    for (let depth = 1; depth <= 500; depth++) {
      expect(eligibleMonsters(depth).length, `depth ${depth}`).toBeGreaterThan(0);
    }
  });

  it('boss names exist arbitrarily deep, with proper roman aeons', () => {
    expect(bossName(5)).toBe('Bonelord Karguth');
    expect(bossName(55)).toBe('Bonelord Karguth, Reborn II');
    expect(bossName(255)).toMatch(/, Reborn VI$/); // not IIIIII
    expect(bossName(505)).toMatch(/, Reborn XI$/);
    expect(bossName(2505)).toMatch(/, Reborn LI$/);
  });

  it('champions spawn rarely with enchants, stat boosts and prefixed names', () => {
    seedRng(31415);
    let champions = 0;
    let normals = 0;
    for (let i = 0; i < 300; i++) {
      const floor = genFloor(12);
      for (const m of floor.monsters) {
        if (m.enchants.length > 0) {
          champions++;
          expect(m.enchants.length).toBeGreaterThanOrEqual(1);
          expect(m.enchants.length).toBeLessThanOrEqual(3);
          expect(m.color).toBe('#7fc7ff');
          expect(m.elite).toBe(false);
          expect(m.boss).toBe(false);
          expect(m.mini).toBe(false);
          // name carries the enchant prefixes
          expect(m.name.split(' ').length).toBeGreaterThanOrEqual(2);
        } else if (!m.elite && !m.boss && !m.mini) {
          normals++;
        }
      }
    }
    expect(champions).toBeGreaterThan(50);
    // champions stay rare relative to the rabble
    expect(champions).toBeLessThan(normals * 0.25);
  });

  it('vaults appear on ~10% of floors with a Warden and a hoard inside', () => {
    seedRng(2718);
    let vaults = 0;
    for (let i = 0; i < 400; i++) {
      const floor = genFloor(8);
      if (!floor.vault) continue;
      vaults++;
      const v = floor.vault;
      const wardens = floor.monsters.filter((m) => m.mini);
      expect(wardens).toHaveLength(1);
      const w = wardens[0];
      expect(w.x).toBeGreaterThanOrEqual(v.x);
      expect(w.x).toBeLessThan(v.x + v.w);
      expect(w.y).toBeGreaterThanOrEqual(v.y);
      expect(w.y).toBeLessThan(v.y + v.h);
      expect(w.glyph).toBe('Ω');
      // warden is far tougher than the locals
      const normal = floor.monsters.find((m) => !m.mini && !m.elite && m.enchants.length === 0);
      if (normal) expect(w.maxHp).toBeGreaterThan(normal.maxHp * 2);
      // hoard: at least 3 ground items inside the vault rect
      const inVault = floor.items.filter((it) =>
        it.x >= v.x && it.x < v.x + v.w && it.y >= v.y && it.y < v.y + v.h);
      expect(inVault.length).toBeGreaterThanOrEqual(3);
    }
    expect(vaults).toBeGreaterThan(15);
    expect(vaults).toBeLessThan(90);
  });

  it('vaults never spawn on boss floors', () => {
    seedRng(9);
    for (let i = 0; i < 100; i++) {
      expect(genFloor(10).vault).toBeNull();
    }
  });

  it('monster counts scale with curse multiplier', () => {
    seedRng(5);
    const base = genFloor(8);
    seedRng(5);
    const horde = genFloor(8, { monsterHpMult: 1, monsterAtkMult: 1, monsterCountMult: 2 });
    expect(horde.monsters.length).toBeGreaterThan(base.monsters.length);
  });

  it('biome floors carry their natives and loot hooks; honest stone has neither', () => {
    const NATIVE_KEYS: Record<string, string[]> = {
      server: ['daemon', 'sentinel', 'coolant'],
      archive: ['archivist', 'siltchoir'],
      city: ['sexton', 'marrowtyrant'],
    };
    for (const bdef of BIOMES) {
      const depth = bdef.minDepth + 1;
      // paired generation on the same seed: the biome consumes no extra rng,
      // so loot rolls align and the pile multipliers are directly observable
      seedRng(606);
      const plain = genFloor(depth);
      seedRng(606);
      const themed = genFloor(depth, DEFAULT_MODS, false, bdef.id);

      expect(plain.biome).toBeUndefined();
      expect(themed.biome).toBe(bdef.id);

      const chests = themed.items.filter((it) => it.kind === 'chest');
      expect(chests.length).toBeGreaterThan(0);
      expect(chests.every((c) => c.special === (bdef.chestsSpecial || undefined)),
        `${bdef.id} chests`).toBe(true);

      const plainGold = plain.items.filter((it) => it.kind === 'gold');
      const themedGold = themed.items.filter((it) => it.kind === 'gold');
      expect(themedGold.length).toBe(plainGold.length);
      for (let i = 0; i < plainGold.length; i++) {
        expect(themedGold[i].amount, `${bdef.id} gold`).toBeGreaterThanOrEqual(
          Math.floor(plainGold[i].amount * bdef.goldMult) - 1);
      }

      // natives crowd their biome (weighted ×3) and never spawn on stone
      let natives = 0;
      seedRng(607);
      for (let i = 0; i < 40; i++) {
        const f = genFloor(depth, DEFAULT_MODS, false, bdef.id);
        natives += f.monsters.filter((m) => NATIVE_KEYS[bdef.id].includes(m.key)).length;
        expect(genFloor(depth).monsters.some((m) =>
          NATIVE_KEYS[bdef.id].includes(m.key)), `${bdef.id} natives on stone`).toBe(false);
      }
      expect(natives, `${bdef.id} native count`).toBeGreaterThan(15);
    }
  });

  it('biomes arrive rarely, run their streak, then cool down for a gap', () => {
    seedRng(99001);
    const game = new Game();
    for (let i = 0; i < 400 && !game.state.run; i++) game.tick(100);
    const run = game.state.run!;
    expect(run).toBeTruthy();

    // walk the crypt down from above the shallowest biome and watch
    run.depth = 11;
    const seq: (string | undefined)[] = [];
    for (let i = 0; i < 400; i++) {
      game.descend();
      seq.push(game.state.run!.floor.biome);
    }

    // collect maximal streaks with their gap to the previous streak
    const streaks: { id: string; len: number; gapBefore: number }[] = [];
    let cur: string | undefined;
    let len = 0;
    let gap = 0;
    for (const b of seq) {
      if (b === cur && b !== undefined) { len++; continue; }
      if (cur !== undefined) streaks.push({ id: cur, len, gapBefore: gap });
      if (cur !== undefined) gap = 0;
      if (b === undefined) gap++;
      cur = b;
      len = b === undefined ? 0 : 1;
    }
    expect(streaks.length).toBeGreaterThan(0);
    for (const s of streaks) {
      expect(s.len, `${s.id} streak length`).toBe(B.BIOME_FLOORS);
    }
    // gaps between consecutive streaks honor the cooldown
    for (const s of streaks.slice(1)) {
      expect(s.gapBefore, 'gap between biome visits').toBeGreaterThanOrEqual(B.BIOME_COOLDOWN);
    }
    // deep eras appear only past their threshold
    for (let i = 0; i < seq.length; i++) {
      const depth = 12 + i;
      if (seq[i] === 'archive') expect(depth).toBeGreaterThanOrEqual(50);
      if (seq[i] === 'city') expect(depth).toBeGreaterThanOrEqual(100);
    }
  });
});
