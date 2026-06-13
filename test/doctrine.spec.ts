import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE } from '../src/core/types';

function freshGame(seed: number): Game {
  seedRng(seed);
  bus.clear();
  const g = new Game();
  g.tick(100);
  g.state.auto = false;
  return g;
}

describe('reckless doctrine', () => {
  /** Wall the whole floor, then carve a clean horizontal corridor on the
   *  hero's row so paths are unambiguous (no generated loops). */
  function corridor(game: Game, west: number, east: number): { hx: number; hy: number } {
    const floor = game.state.run!.floor;
    floor.tiles.fill(TILE.WALL);
    floor.monsters = [];
    floor.items = [];
    floor.shrine = null;
    floor.well = null;
    floor.peddler = null;
    const hx = game.heroPos.x;
    const hy = game.heroPos.y;
    for (let dx = west; dx <= east; dx++) floor.tiles[hy * floor.w + (hx + dx)] = TILE.FLOOR;
    floor.seen.fill(1);
    return { hx, hy };
  }

  it('beelines to seen stairs, leaving behind loot that is a detour past them', () => {
    const game = freshGame(71);
    const run = game.state.run!;
    const floor = run.floor;
    game.setStrategy('reckless');
    const { hx, hy } = corridor(game, -3, 4);
    floor.stairs = { x: hx + 4, y: hy };
    floor.tiles[hy * floor.w + (hx + 4)] = TILE.STAIRS;
    floor.items = [{ x: hx - 3, y: hy, kind: 'gold', amount: 100 }]; // opposite way
    const goldBefore = game.state.gold;
    const startDepth = run.depth;
    game.state.auto = true;
    for (let i = 0; i < 20 && game.state.run && game.state.run.depth === startDepth; i++) game.tick(250);
    expect(game.state.run!.depth).toBeGreaterThan(startDepth); // descended
    expect(game.state.gold).toBe(goldBefore); // never doubled back for the gold
  });

  it('still grabs loot that lies on the path to the stairs', () => {
    const game = freshGame(72);
    const run = game.state.run!;
    const floor = run.floor;
    game.setStrategy('reckless');
    const { hx, hy } = corridor(game, 0, 6);
    floor.stairs = { x: hx + 6, y: hy };
    floor.tiles[hy * floor.w + (hx + 6)] = TILE.STAIRS;
    floor.items = [{ x: hx + 2, y: hy, kind: 'gold', amount: 50 }]; // on the way
    const goldBefore = game.state.gold;
    game.state.auto = true;
    const startDepth = run.depth;
    for (let i = 0; i < 20 && game.state.run && game.state.run.depth === startDepth; i++) game.tick(250);
    expect(game.state.gold).toBeGreaterThan(goldBefore); // grabbed it en route
  });
});
