/** The big-rebalance arc, part 1: depth-scaled hero mitigation
 *  (defense as a treadmill) and Ravenous Descent (trivial floors collapse). */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import * as B from '../src/core/balance';

describe('hero defense: the eHP system (ratio reduction, damage floor)', () => {
  it('reduction = def/(def+K) with K tied to local enemy power', () => {
    const depth = 10;
    const k = B.defenseK(depth);
    // at def == K, exactly half the hit gets through
    expect(B.heroDamageAfterDef(100, k, depth)).toBeCloseTo(50);
    // zero armor: full damage
    expect(B.heroDamageAfterDef(123, 0, depth)).toBe(123);
  });

  it('scale-invariance: 100x defense vs 100x enemy power = same reduction', () => {
    // find a deep depth where monsterAtk is ~100x the shallow value
    const shallow = 1;
    let deep = shallow;
    while (B.monsterAtk(deep) < B.monsterAtk(shallow) * 100) deep++;
    const ratio = B.monsterAtk(deep) / B.monsterAtk(shallow);
    const def = 10;
    const sharedShallow = B.heroDamageAfterDef(100, def, shallow) / 100;
    const sharedDeep = B.heroDamageAfterDef(100, def * ratio, deep) / 100;
    expect(sharedDeep).toBeCloseTo(sharedShallow, 5);
  });

  it('the damage floor forbids immortality; eHP strictly grows with def', () => {
    const depth = 20;
    // even absurd armor lets >= MIN_DMG_FRAC of every hit through
    expect(B.heroDamageAfterDef(1000, 1e15, depth))
      .toBeCloseTo(1000 * B.DEF_MIN_DMG_FRAC);
    // eHP climbs with every single point, forever (until the floor bound)
    let prev = B.heroEffectiveHp(100, 0, depth);
    for (const def of [1, 10, 100, 1000, 10000]) {
      const cur = B.heroEffectiveHp(100, def, depth);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
    // and the floor bounds it at maxHp / MIN_DMG_FRAC
    expect(B.heroEffectiveHp(100, 1e18, depth))
      .toBeCloseTo(100 / B.DEF_MIN_DMG_FRAC);
  });

  it('fresh-run band: the first armor purchase sits in 20-40% vs depth 1', () => {
    const firstBulwark = 2 * 1 * Math.pow(1.1, 1); // Ossified Hide level 1
    const through = B.heroDamageAfterDef(100, firstBulwark, 1) / 100;
    expect(1 - through).toBeGreaterThanOrEqual(0.2);
    expect(1 - through).toBeLessThanOrEqual(0.4);
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
