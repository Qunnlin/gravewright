/** The big-rebalance arc, part 1: depth-scaled hero mitigation
 *  (defense as a treadmill) and Ravenous Descent (trivial floors collapse). */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import * as B from '../src/core/balance';

describe('hero defense: flat soak, capped per hit', () => {
  it('soaks exactly def below the cap, and the cap share above it', () => {
    // small hit, big armor: the cap binds — 25% always gets through
    expect(B.heroDamageAfterDef(100, 1e6)).toBeCloseTo(100 * (1 - B.DEF_SOAK_CAP));
    // big hit, small armor: flat soak binds — damage = raw − def
    expect(B.heroDamageAfterDef(1000, 100)).toBe(900);
    // zero armor: full damage
    expect(B.heroDamageAfterDef(123, 0)).toBe(123);
  });

  it('every point of DEF helps until the cap, and depth dilutes the share', () => {
    // below the cap line, +1 def = exactly −1 damage (maximal legibility)
    expect(B.heroDamageAfterDef(1000, 101)).toBe(B.heroDamageAfterDef(1000, 100) - 1);
    // the same armor soaks a smaller SHARE of a deeper monster's swing
    const def = 100;
    const shallowShare = 1 - B.heroDamageAfterDef(B.monsterAtk(5), def) / B.monsterAtk(5);
    const deepShare = 1 - B.heroDamageAfterDef(B.monsterAtk(30), def) / B.monsterAtk(30);
    expect(deepShare).toBeLessThan(shallowShare);
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
