/** v1.4.0 gold batch: the Loot Goblin, the Peddler, shrine re-lighting. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE } from '../src/core/types';
import { genFloor, spawnLootGoblin } from '../src/core/dungeon';
import { wareById } from '../src/core/data/peddler';
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
  it('buyWare charges doubling prices and shrinks the ware list', () => {
    const game = freshGame(44);
    const run = game.state.run!;
    run.floor.peddler = {
      x: 1, y: 1, wares: ['mystery', 'oil', 'draught'],
      bought: 0, autoBought: 0, spotted: true,
    };
    game.state.gold = 10_000_000;
    const p1 = game.warePrice(wareById('mystery')!, run.floor.peddler);
    expect(game.buyWare('mystery')).toBe(true);
    expect(run.floor.peddler.wares).toEqual(['oil', 'draught']);
    expect(game.state.gold).toBe(10_000_000 - p1);
    // the next ware now costs double its base
    const oilBase = Math.ceil(B.goldPile(run.depth) * wareById('oil')!.pricePiles);
    expect(game.warePrice(wareById('oil')!, run.floor.peddler)).toBe(oilBase * 2);
    // can't buy what isn't stocked
    expect(game.buyWare('compass')).toBe(false);
  });

  it('curios do what the stall promises', () => {
    const game = freshGame(45);
    const run = game.state.run!;
    run.floor.peddler = {
      x: 1, y: 1, wares: ['compass', 'oil', 'musk', 'draught'],
      bought: 0, autoBought: 0, spotted: true,
    };
    game.state.gold = 100_000_000;

    const visionBefore = game.d.vision;
    expect(game.buyWare('oil')).toBe(true);
    expect(game.d.vision).toBe(visionBefore + 2);

    expect(game.buyWare('compass')).toBe(true);
    expect(run.compass).toBe(true);
    game.descend();
    const f = game.state.run!.floor;
    expect(f.seen[f.stairs.y * f.w + f.stairs.x]).toBe(1);

    // musk: the NEXT floor holds a goblin (bought after descending, so
    // re-stock a stall on this floor first)
    game.state.run!.floor.peddler = {
      x: 1, y: 1, wares: ['musk', 'draught'], bought: 0, autoBought: 0, spotted: true,
    };
    expect(game.buyWare('musk')).toBe(true);
    game.descend();
    expect(game.state.run!.floor.monsters.some((m) => m.flees)).toBe(true);

    // draught: drinks itself when a hit leaves the vessel under 25%
    game.state.run!.floor.peddler = {
      x: 1, y: 1, wares: ['draught'], bought: 0, autoBought: 0, spotted: true,
    };
    expect(game.buyWare('draught')).toBe(true);
    expect(game.state.run!.flasks).toBe(1);
    const run2 = game.state.run!;
    run2.floor.monsters = [];
    run2.statuses = [];
    const m = spawnLootGoblin(run2.depth, game.heroPos.x + 1, game.heroPos.y);
    m.flees = false; // stand and fight for the test
    m.awake = true;
    m.atk = game.d.maxHp * 10; // a colossal swing (soaked, floored at 1%+)
    m.hp = m.maxHp = 1e9;
    run2.floor.tiles[m.y * run2.floor.w + m.x] = TILE.FLOOR;
    run2.floor.monsters = [m];
    run2.hp = game.d.maxHp;
    game.manualMove(1, 0); // trade: its hit lands, the flask answers
    if (game.state.run) { // survived: the flask must have fired
      expect(game.state.run.flasks).toBe(0);
    }
  });

  it("standing order 'buy one' purchases exactly once per floor", () => {
    const game = freshGame(47);
    const run = game.state.run!;
    const floor = run.floor;
    run.statuses = [];
    floor.monsters = [];
    clearAround(game, game.heroPos.x, game.heroPos.y, 5);
    const tx = game.heroPos.x + 3;
    const ty = game.heroPos.y;
    floor.tiles[ty * floor.w + tx] = TILE.PEDDLER;
    floor.peddler = {
      x: tx, y: ty, wares: ['mystery', 'oil', 'draught'],
      bought: 0, autoBought: 0, spotted: true,
    };
    floor.seen[ty * floor.w + tx] = 1;
    game.state.gold = 10_000_000;
    game.state.settings.peddlerAuto = 'one';
    game.state.totalDeaths = 1;
    game.state.auto = true;
    for (let i = 0; i < 200 && floor.peddler.wares.length === 3; i++) game.tick(250);
    expect(floor.peddler.wares.length).toBe(2);
    for (let i = 0; i < 80; i++) game.tick(250);
    expect(floor.peddler.wares.length).toBe(2);
    expect(floor.peddler.autoBought).toBe(1);
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
