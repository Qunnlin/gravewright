/** Affix pinning (equipment-audit lock-in): every item affix wired
 *  end-to-end into Derived and the income paths, with exact numbers. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import type { Item, Slot } from '../src/core/types';

function mkItem(slot: Slot, stats: Item['stats'], kind?: Item['kind']): Item {
  return { slot, name: 'Audit Probe', rarity: 3, depth: 5, stats, score: 0, kind };
}

function freshGame(seed: number): Game {
  seedRng(seed);
  bus.clear();
  const game = new Game();
  game.tick(100); // summon
  game.state.auto = false;
  return game;
}

describe('affix pinning', () => {
  it('atk: flat, and the favored-weapon ×1.2 hits only the weapon line', () => {
    const game = freshGame(1);
    const run = game.state.run!;
    run.klass = 'shadow'; // favors blades
    game.recalc();
    const base = game.d.atk;
    run.gear.charm = mkItem('charm', { atk: 10 });
    game.recalc();
    const charmDelta = game.d.atk - base; // un-favored path
    run.gear.charm = null;
    run.gear.weapon = mkItem('weapon', { atk: 10 }, 'blade');
    game.recalc();
    const weaponDelta = game.d.atk - base; // favored path
    expect(weaponDelta / charmDelta).toBeCloseTo(1.2, 5);
  });

  it('def, crit (cap 95), dodge (clamp 60), lifesteal, xpPct wire exactly', () => {
    const game = freshGame(2);
    const run = game.state.run!;
    run.gear.armor = mkItem('armor', { def: 20, dodge: 12 });
    run.gear.weapon = mkItem('weapon', { crit: 20, lifesteal: 25 }, 'blade');
    run.gear.charm = mkItem('charm', { xpPct: 50 });
    game.recalc();
    expect(game.d.def).toBe(20);
    expect(game.d.crit).toBe(4 + 20); // HERO_BASE_CRIT + gear
    expect(game.d.dodge).toBe(12);
    expect(game.d.lifesteal).toBe(25);
    expect(game.d.xpMult).toBeCloseTo(1.5);
    // caps and clamps
    run.gear.weapon = mkItem('weapon', { crit: 200 }, 'blade');
    run.gear.armor = mkItem('armor', { dodge: 100 });
    game.recalc();
    expect(game.d.crit).toBe(95);
    expect(game.d.dodge).toBe(60);
  });

  it('hpPct multiplies final max HP by exactly the stated percent', () => {
    const game = freshGame(3);
    const run = game.state.run!;
    const before = game.d.maxHp;
    run.gear.armor = mkItem('armor', { hpPct: 50 });
    game.recalc();
    expect(game.d.maxHp).toBe(Math.round(before * 1.5));
  });

  it('gold/soul/bone percent affixes multiply the actual income calls', () => {
    const game = freshGame(4);
    const run = game.state.run!;
    run.gear.charm = mkItem('charm', { goldPct: 100, soulPct: 80 });
    run.gear.weapon = mkItem('weapon', { bonePct: 50 }, 'blade');
    game.recalc();
    expect(game.gainGold(10)).toBeCloseTo(20);
    expect(game.gainSouls(10)).toBeCloseTo(18);
    expect(game.gainBones(10)).toBeCloseTo(15);
  });

  it('regen applies on keyboard turns too (audit regression: manualMove)', () => {
    const game = freshGame(5);
    const run = game.state.run!;
    run.gear.armor = mkItem('armor', { regen: 7 });
    game.recalc();
    // a clean step: no statuses, no monsters anywhere near
    run.statuses = [];
    run.floor.monsters = [];
    run.hp = game.d.maxHp - 20;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== 0)!;
    const before = run.hp;
    game.manualMove(dir[0], dir[1]);
    expect(run.hp).toBeCloseTo(before + 7);
  });
});

describe('phase-2 affixes', () => {
  it('dotResist blunts poison ticks by exactly the stated share', () => {
    const game = freshGame(6);
    const run = game.state.run!;
    run.gear.armor = mkItem('armor', { dotResist: 50 });
    game.recalc();
    run.floor.monsters = [];
    run.hp = game.d.maxHp;
    run.statuses = [{ kind: 'poison', turns: 2, power: 10 }];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== 0)!;
    game.manualMove(dir[0], dir[1]);
    expect(run.hp).toBeCloseTo(game.d.maxHp - 5); // 10 × (1 − 50%)
  });

  it('thorns kills the melee attacker back (and the codex counts it)', () => {
    const game = freshGame(7);
    const run = game.state.run!;
    run.gear.armor = mkItem('armor', { thorns: 99999, dodge: 0 });
    game.recalc();
    // a tanky awake melee monster right next to the hero: we trade blows —
    // its swing back triggers the thorns, which vastly exceed its hp
    const m = run.floor.monsters[0];
    run.floor.monsters = [m];
    m.x = game.heroPos.x + 1;
    m.y = game.heroPos.y;
    run.floor.tiles[m.y * run.floor.w + m.x] = 1;
    m.hp = 50000;
    m.maxHp = 50000;
    m.def = 0;
    m.atk = 1;
    m.awake = true;
    m.specials = [];
    run.hp = game.d.maxHp;
    const kills = game.state.codex['mon:' + m.key] ?? 0;
    for (let i = 0; i < 6 && m.hp > 0; i++) game.manualMove(1, 0); // bump-trade
    expect(m.hp).toBeLessThanOrEqual(0);
    expect(game.state.codex['mon:' + m.key] ?? 0).toBe(kills + 1);
  });

  it('cleave splashes the strike to enemies adjacent to the target', () => {
    const game = freshGame(8);
    const run = game.state.run!;
    run.gear.weapon = mkItem('weapon', { atk: 5, cleave: 50 }, 'blade');
    game.recalc();
    const [m1, m2] = run.floor.monsters;
    run.floor.monsters = [m1, m2];
    m1.x = game.heroPos.x + 1; m1.y = game.heroPos.y;
    m2.x = game.heroPos.x + 2; m2.y = game.heroPos.y;
    run.floor.tiles[m1.y * run.floor.w + m1.x] = 1;
    run.floor.tiles[m2.y * run.floor.w + m2.x] = 1;
    m1.hp = m1.maxHp = 100000; m2.hp = m2.maxHp = 100000;
    m1.awake = false; m2.awake = false;
    game.manualMove(1, 0); // bump-attack m1
    expect(m1.hp).toBeLessThan(m1.maxHp);
    expect(m2.hp).toBeLessThan(m2.maxHp); // the splash landed
    expect(m2.hp).toBeGreaterThan(m1.hp); // ...at half strength
  });
});
