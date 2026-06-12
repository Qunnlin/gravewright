import { describe, expect, it } from 'vitest';
import * as B from '../src/core/balance';
import { fmt } from '../src/core/format';
import { seedRng } from '../src/core/rng';
import { rollItem, scoreItem, describeItem } from '../src/core/data/items';

describe('balance formulas', () => {
  it('mitigation is bounded [0, 0.8]', () => {
    expect(B.mitigation(0)).toBe(0);
    expect(B.mitigation(35)).toBeCloseTo(0.5);
    expect(B.mitigation(1e9)).toBeLessThanOrEqual(0.8);
    for (const d of [0, 1, 10, 100, 1e6]) {
      const m = B.mitigation(d);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(0.8);
    }
  });

  it('essence gain is 0 below threshold and monotonic above', () => {
    expect(B.essenceGain(0)).toBe(0);
    expect(B.essenceGain(B.REAP_SOUL_BASE - 1)).toBe(0);
    expect(B.essenceGain(B.REAP_SOUL_BASE)).toBeGreaterThanOrEqual(1);
    let prev = 0;
    for (let s = B.REAP_SOUL_BASE; s < 1e9; s *= 3) {
      const g = B.essenceGain(s);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('soulsForEssence inverts essenceGain (within rounding)', () => {
    for (const e of [1, 2, 5, 10, 50]) {
      const souls = B.soulsForEssence(e);
      expect(B.essenceGain(souls)).toBeGreaterThanOrEqual(e);
      expect(B.essenceGain(souls * 0.97)).toBeLessThan(e + 1);
    }
  });

  it('upgrade costs grow exponentially', () => {
    expect(B.upgradeCost(10, 1.2, 0)).toBe(10);
    expect(B.upgradeCost(10, 1.2, 1)).toBe(12);
    expect(B.upgradeCost(10, 1.2, 10)).toBeGreaterThan(B.upgradeCost(10, 1.2, 9));
  });

  it('monster curves are positive and increasing', () => {
    let hp = 0;
    let atk = 0;
    for (let d = 1; d <= 100; d++) {
      const nhp = B.monsterHp(d);
      const natk = B.monsterAtk(d);
      expect(nhp).toBeGreaterThan(hp);
      expect(natk).toBeGreaterThan(atk);
      hp = nhp;
      atk = natk;
    }
  });

  it('souls on death reward depth superlinearly', () => {
    const d5 = B.soulsOnDeath(5, 0);
    const d10 = B.soulsOnDeath(10, 0);
    expect(d10).toBeGreaterThan(d5 * 2);
  });

  it('crypt wrath: dormant until reap-readiness, then climbs without bound', () => {
    expect(B.cryptWrath(0)).toBe(1);
    expect(B.cryptWrath(B.REAP_SOUL_BASE)).toBe(1);
    expect(B.cryptWrath(B.REAP_SOUL_BASE * 2)).toBeCloseTo(1.4);
    expect(B.cryptWrath(B.REAP_SOUL_BASE * 10)).toBeCloseTo(4.6);
    expect(B.cryptWrath(B.REAP_SOUL_BASE * 100)).toBeGreaterThan(20);
  });
});

describe('number formatting', () => {
  it('formats across magnitudes', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999)).toBe('999');
    expect(fmt(1000)).toBe('1.00K');
    expect(fmt(1234567)).toBe('1.23M');
    expect(fmt(1e12)).toBe('1.00T');
    expect(fmt(-1500)).toBe('-1.50K');
    expect(fmt(Infinity)).toBe('∞');
    expect(fmt(1e40)).toMatch(/e/);
  });
});

describe('item generation', () => {
  it('rolls valid items at many depths', () => {
    seedRng(2024);
    for (let depth = 1; depth <= 60; depth += 2) {
      for (let i = 0; i < 30; i++) {
        const item = rollItem(depth);
        expect(['weapon', 'armor', 'charm']).toContain(item.slot);
        expect(item.rarity).toBeGreaterThanOrEqual(0);
        expect(item.rarity).toBeLessThanOrEqual(4);
        expect(item.name.length).toBeGreaterThan(2);
        expect(Object.keys(item.stats).length).toBeGreaterThanOrEqual(1);
        expect(scoreItem(item)).toBeGreaterThan(0);
        expect(describeItem(item).length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('forced rarity floor works (boss drops)', () => {
    seedRng(7);
    for (let i = 0; i < 50; i++) {
      expect(rollItem(10, 3).rarity).toBeGreaterThanOrEqual(3);
    }
  });

  it('legendaries only exist when forced, and outclass naturals', () => {
    seedRng(11);
    // natural rolls never hit rarity 5 (weight is zero)
    for (let i = 0; i < 400; i++) {
      expect(rollItem(30).rarity).toBeLessThanOrEqual(4);
    }
    // warden drops always land exactly on the legendary tier
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const item = rollItem(10, 5);
      expect(item.rarity).toBe(5);
      total += scoreItem(item);
    }
    let naturalTotal = 0;
    for (let i = 0; i < 60; i++) naturalTotal += scoreItem(rollItem(10));
    expect(total).toBeGreaterThan(naturalTotal * 2);
  });

  it('deeper items have bigger budgets on average', () => {
    seedRng(123);
    const avg = (depth: number) => {
      let total = 0;
      for (let i = 0; i < 200; i++) total += scoreItem(rollItem(depth));
      return total / 200;
    };
    expect(avg(20)).toBeGreaterThan(avg(1) * 3);
  });
});
