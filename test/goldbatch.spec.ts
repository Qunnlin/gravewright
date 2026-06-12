/** v1.4.0 gold batch: the Loot Goblin, the Peddler, shrine re-lighting. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE } from '../src/core/types';
import { genFloor, spawnLootGoblin } from '../src/core/dungeon';
import * as B from '../src/core/balance';

function freshGame(seed: number): Game {
  seedRng(seed);
  bus.clear();
  const game = new Game();
  game.tick(100);
  game.state.auto = false;
  return game;
}

/** Clear ground in a radius so movement tests aren't wall-dependent. */
function clearAround(game: Game, cx: number, cy: number, r: number): void {
  const floor = game.state.run!.floor;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x > 0 && y > 0 && x < floor.w - 1 && y < floor.h - 1) {
        floor.tiles[y * floor.w + x] = TILE.FLOOR;
      }
    }
  }
}

describe('the loot goblin', () => {
  it('flees uphill from the hero instead of fighting', () => {
    const game = freshGame(41);
    const run = game.state.run!;
    run.floor.monsters = [];
    clearAround(game, game.heroPos.x, game.heroPos.y, 6);
    const g = spawnLootGoblin(run.depth, game.heroPos.x + 2, game.heroPos.y);
    g.awake = true;
    run.floor.monsters = [g];
    const hpBefore = run.hp;
    const distBefore = Math.abs(g.x - game.heroPos.x) + Math.abs(g.y - game.heroPos.y);
    game.manualMove(1, 0); // step toward it; its turn follows
    const distAfter = Math.abs(g.x - game.heroPos.x) + Math.abs(g.y - game.heroPos.y);
    expect(distAfter).toBeGreaterThanOrEqual(distBefore); // it ran (it acts twice)
    expect(run.hp).toBe(hpBefore); // it never fights
  });

  it('despawns with its hoard after its timer', () => {
    const game = freshGame(42);
    const run = game.state.run!;
    run.floor.monsters = [];
    clearAround(game, game.heroPos.x, game.heroPos.y, 4);
    const g = spawnLootGoblin(run.depth, game.heroPos.x + 3, game.heroPos.y);
    g.awake = true;
    g.despawnIn = 2;
    run.floor.monsters = [g];
    game.manualMove(0, 1);
    game.manualMove(0, -1);
    expect(run.floor.monsters.includes(g)).toBe(false);
  });

  it('bursts gold and drops a vestige or legendary when caught', () => {
    const game = freshGame(43);
    const run = game.state.run!;
    run.floor.monsters = [];
    const g = spawnLootGoblin(run.depth, game.heroPos.x + 1, game.heroPos.y);
    run.floor.tiles[g.y * run.floor.w + g.x] = TILE.FLOOR;
    g.hp = 1;
    g.awake = true;
    run.floor.monsters = [g];
    const goldBefore = game.state.gold;
    const haulBefore = game.state.inventory.length +
      Number(!!run.gear.weapon) + Number(!!run.gear.armor) + Number(!!run.gear.charm);
    game.manualMove(1, 0); // catch it
    expect(g.hp).toBeLessThanOrEqual(0);
    expect(game.state.gold).toBeGreaterThan(goldBefore);
    const haulAfter = game.state.inventory.length +
      Number(!!run.gear.weapon) + Number(!!run.gear.armor) + Number(!!run.gear.charm);
    expect(haulAfter).toBeGreaterThan(haulBefore); // the sack held something
  });
});

describe('the peddler', () => {
  it('sells mystery items for escalating gold on deliberate visits', () => {
    const game = freshGame(44);
    const run = game.state.run!;
    const floor = run.floor;
    run.statuses = [];
    floor.monsters = [];
    const tx = game.heroPos.x + 1;
    const ty = game.heroPos.y;
    floor.tiles[ty * floor.w + tx] = TILE.PEDDLER;
    floor.peddler = { x: tx, y: ty, stock: B.PEDDLER_STOCK };
    game.state.gold = 10_000_000;
    const p1 = Math.ceil(B.goldPile(run.depth) * B.PEDDLER_PRICE_PILES);
    game.manualMove(1, 0); // deliberate visit
    expect(floor.peddler.stock).toBe(B.PEDDLER_STOCK - 1);
    expect(game.state.gold).toBe(10_000_000 - p1);
    // second purchase costs double
    const goldAfterFirst = game.state.gold;
    game.manualMove(-1, 0);
    game.manualMove(1, 0);
    expect(floor.peddler.stock).toBe(B.PEDDLER_STOCK - 2);
    expect(game.state.gold).toBe(goldAfterFirst - p1 * 2);
  });
});

describe('shrine re-lighting', () => {
  it('a spent shrine re-lights deliberately at an escalating price', () => {
    const game = freshGame(45);
    const run = game.state.run!;
    const floor = run.floor;
    run.statuses = [];
    floor.monsters = [];
    const tx = game.heroPos.x + 1;
    const ty = game.heroPos.y;
    floor.tiles[ty * floor.w + tx] = TILE.SHRINE;
    floor.shrine = { x: tx, y: ty, used: false, uses: 0 };
    game.state.gold = 10_000_000;
    const base = Math.ceil(B.shrineCost(run.depth));
    game.manualMove(1, 0); // first blessing
    expect(floor.shrine.uses).toBe(1);
    // the granting turn itself ticks the blessing once
    expect(run.blessTurns).toBeGreaterThanOrEqual(B.BLESS_TURNS - 1);
    const goldAfterFirst = game.state.gold;
    expect(goldAfterFirst).toBe(10_000_000 - base);
    // walk off and back on: the re-light costs ×SHRINE_RELIGHT_MULT
    run.blessTurns = 0;
    game.manualMove(-1, 0);
    game.manualMove(1, 0);
    expect(floor.shrine.uses).toBe(2);
    expect(run.blessTurns).toBeGreaterThan(0);
    expect(game.state.gold).toBe(goldAfterFirst -
      Math.ceil(B.shrineCost(run.depth) * B.SHRINE_RELIGHT_MULT));
  });
});

describe('placement rules', () => {
  it('goblins and peddlers never appear on boss or trial floors', () => {
    seedRng(46);
    for (let i = 0; i < 120; i++) {
      const boss = genFloor(10);
      expect(boss.monsters.some((m) => m.flees)).toBe(false);
      expect(boss.peddler).toBeNull();
      const trial = genFloor(13, undefined, true);
      expect(trial.monsters.some((m) => m.flees)).toBe(false);
    }
  });
});
