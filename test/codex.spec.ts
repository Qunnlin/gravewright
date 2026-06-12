/** The codex: unlock counters written by play, sanitized on load. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE } from '../src/core/types';
import { rollSetPiece } from '../src/core/data/sets';
import { genTrialHall } from '../src/core/dungeon';
import * as B from '../src/core/balance';

function freshGame(seed: number): Game {
  seedRng(seed);
  bus.clear();
  const game = new Game();
  game.tick(100); // summon
  game.state.auto = false;
  return game;
}

describe('the codex', () => {
  it('kills are written down per monster kind', () => {
    const game = freshGame(21);
    const run = game.state.run!;
    // drag a floor monster next to the hero: weak, awake, on open ground
    const m = run.floor.monsters[0];
    m.x = game.heroPos.x + 1;
    m.y = game.heroPos.y;
    run.floor.tiles[m.y * run.floor.w + m.x] = TILE.FLOOR;
    m.hp = 1;
    m.awake = true;
    game.manualMove(1, 0); // bump-attack
    expect(game.state.codex['mon:' + m.key]).toBe(1);
  });

  it('a district counts once per visit — across floors and Hall interruptions', () => {
    const game = freshGame(22);
    const run = game.state.run!;
    // mid-visit state: the floor is themed and the streak has floors left
    run.floor.biome = 'server';
    run.biomeId = 'server';
    run.biomeFloorsLeft = 2;
    run.biomeCooldown = 0;
    game.state.codex['bio:server'] = 1; // the entry that started this visit
    game.descend(); // continuation floor — same visit
    expect(game.state.run!.floor.biome).toBe('server');
    expect(game.state.codex['bio:server']).toBe(1);
    // a Sealed Hall replaces the floor mid-streak (no biome field on it);
    // returning to the streak must not count as a fresh visit
    run.floor = genTrialHall(run.depth);
    run.depth--;
    game.descend();
    expect(game.state.run!.floor.biome).toBe('server');
    expect(game.state.codex['bio:server']).toBe(1);
  });

  it('set pieces and sworn pacts are recorded; breaking a pact is not', () => {
    const game = freshGame(23);
    const piece = rollSetPiece('genugate', 'weapon', 10);
    expect(piece).toBeTruthy();
    game.acquireItem(piece!);
    expect(game.state.codex['set:genugate']).toBe(1);
    game.state.upgrades['rites'] = 1;
    game.toggleCurse('iron');
    expect(game.state.codex['curse:iron']).toBe(1);
    game.toggleCurse('iron'); // breaking the pact
    expect(game.state.codex['curse:iron']).toBe(1);
  });
});

describe('summoner cap (lich deadlock fix)', () => {
  it('summoners stop raising adds while SUMMONED_CAP lessers stand', () => {
    const game = freshGame(31);
    const run = game.state.run!;
    const m = run.floor.monsters[0];
    run.floor.monsters = [m];
    m.x = game.heroPos.x + 3;
    m.y = game.heroPos.y;
    m.hp = m.maxHp = 1e9;
    m.atk = 0;
    m.awake = true;
    m.specials = ['summon'];
    m.summonCd = 0;
    run.hp = game.d.maxHp;
    // open ground around the summoner so spawns always find room
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        run.floor.tiles[(m.y + dy) * run.floor.w + (m.x + dx)] = TILE.FLOOR;
      }
    }
    const dirs = [[0, 1], [0, -1]] as const;
    for (let i = 0; i < 40; i++) {
      const [dx, dy] = dirs[i % 2];
      if (run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== 0) {
        game.manualMove(dx, dy);
      }
      const standing = run.floor.monsters.filter((x) => x.summoned && x.hp > 0).length;
      expect(standing).toBeLessThanOrEqual(B.SUMMONED_CAP);
    }
    expect(run.floor.monsters.some((x) => x.summoned)).toBe(true);
  });
});
