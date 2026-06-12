/** The big-rebalance arc, part 1: depth-scaled hero mitigation
 *  (defense as a treadmill) and Ravenous Descent (trivial floors collapse). */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import * as B from '../src/core/balance';

describe('hero mitigation scales with depth', () => {
  it('the same defense protects less the deeper you stand', () => {
    const def = 100;
    const shallow = B.heroMitigation(def, 1);
    const mid = B.heroMitigation(def, 10);
    const deep = B.heroMitigation(def, 30);
    expect(shallow).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(deep);
    // depth 1 behaves close to the old fixed-35 pivot, scaled by the asymptote
    expect(shallow).toBeCloseTo(B.HERO_MITIGATION_MAX * (100 / 131), 5);
  });

  it('approaches HERO_MITIGATION_MAX but never gets stuck at a hard cap', () => {
    for (const depth of [1, 10, 50, 200]) {
      expect(B.heroMitigation(0, depth)).toBe(0);
      expect(B.heroMitigation(1e12, depth)).toBeLessThan(B.HERO_MITIGATION_MAX);
      // the old hard clamp made marginal DEF worthless past 4*pivot;
      // now every point of DEF strictly improves mitigation
      const pivotCap = 4 * (25 + 6 * depth);
      expect(B.heroMitigation(pivotCap + 1000, depth))
        .toBeGreaterThan(B.heroMitigation(pivotCap, depth));
    }
  });

  it('monster mitigation is unchanged (fixed pivot)', () => {
    expect(B.mitigation(35)).toBeCloseTo(0.5);
    expect(B.mitigation(1e9)).toBeLessThanOrEqual(0.8);
  });
});

describe('ravenous descent', () => {
  function overpoweredGame(): Game {
    bus.clear();
    const game = new Game();
    // a vessel that one-shots early floors many times over
    game.state.upgrades['ferocity'] = 80;
    game.recalc();
    game.tick(100); // summon at depth 1
    expect(game.d.atk).toBeGreaterThan(B.RAVENOUS_OVERKILL * B.monsterHp(4));
    return game;
  }

  it('without the upgrade, descents are one floor at a time', () => {
    seedRng(51);
    const game = overpoweredGame();
    game.descend();
    expect(game.state.run!.depth).toBe(2);
  });

  it('with the upgrade, trivial floors collapse — but boss floors hold', () => {
    seedRng(52);
    const game = overpoweredGame();
    game.state.upgrades['ravenous'] = 1;

    const goldBefore = game.state.gold;
    const bonesBefore = game.state.bones;
    game.descend();

    // depths 2-4 collapsed; depth 5 is a boss floor and stands its ground
    expect(game.state.run!.depth).toBe(5);
    expect(game.state.run!.floor.isBossFloor).toBe(true);
    expect(game.state.gold).toBeGreaterThan(goldBefore);
    expect(game.state.bones).toBeGreaterThan(bonesBefore);
    expect(game.state.bestDepth).toBe(5);
  });

  it('the toggle disarms it: ravenous OFF walks every floor', () => {
    seedRng(54);
    const game = overpoweredGame();
    game.state.upgrades['ravenous'] = 1;
    game.state.settings.ravenousActive = false;
    game.descend();
    expect(game.state.run!.depth).toBe(2); // no skipping while disarmed
    game.state.settings.ravenousActive = true;
    game.descend();
    expect(game.state.run!.depth).toBe(5); // re-armed: falls to the boss
  });

  it('stops where the crypt resists: weak vessels fall one floor', () => {
    seedRng(53);
    bus.clear();
    const game = new Game();
    game.state.upgrades['ravenous'] = 1;
    game.recalc();
    game.tick(100);
    game.descend();
    expect(game.state.run!.depth).toBe(2); // base atk overwhelms nothing
  });
});
