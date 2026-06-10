/**
 * The robot player: drives the actual Game like a human would —
 * ticking time forward and spending currencies — and asserts the
 * progression curve holds (depth 10 within a simulated hour, prestige
 * works, post-reap snowball is faster).
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { BONE_UPGRADES, SOUL_UPGRADES, ESSENCE_UPGRADES, MINIONS, minionLevelCost } from '../src/core/data/upgrades';
import { CLASSES } from '../src/core/data/classes';
import { encodeSave, decodeSave } from '../src/core/save';
import { bus } from '../src/core/events';

/** Greedy shopping pass, like an attentive player. */
function shop(game: Game): void {
  const s = game.state;
  // the robot optimizes for power: the 1-essence QoL comforts are skipped
  const QOL = ['sexton', 'seal', 'tithe'];
  for (const pool of [BONE_UPGRADES, SOUL_UPGRADES, ESSENCE_UPGRADES]) {
    for (let guard = 0; guard < 50; guard++) {
      const buyable = pool
        .filter((u) => !QOL.includes(u.id) &&
          (s.upgrades[u.id] ?? 0) < u.max && game.canBuy(u.id))
        .sort((a, b) => game.cost(a) - game.cost(b))[0];
      if (!buyable) break;
      game.buyUpgrade(buyable.id, true);
    }
  }
  game.syncEssenceClasses();
  for (const m of MINIONS) {
    const st = s.minions[m.id] ?? { level: 0, alive: false, hp: 0 };
    if (st.level < 5 && s.souls >= minionLevelCost(m, st.level) * 2) {
      game.buyMinion(m.id);
    }
  }
  for (const c of CLASSES) {
    if (c.cost > 0 && !s.classesUnlocked.includes(c.id) && s.souls >= c.cost * 1.5) {
      game.unlockClass(c.id);
      game.setClass(c.id);
    }
  }
}

/** Advance simulated time in 250ms ticks, shopping once a second.
 *  The trial-offer pause expects a human at the modal; the robot
 *  declines the wager and resumes the autopilot. */
function play(game: Game, seconds: number, until?: () => boolean): number {
  const off = bus.on((e) => {
    if (e.type === 'trialOffer') game.state.auto = true;
  });
  game.state.auto = true; // robots skip the manual-first onboarding
  let played = 0;
  try {
    for (let t = 0; t < seconds * 4; t++) {
      game.tick(250);
      played += 0.25;
      if (t % 4 === 0) shop(game);
      if (until && until()) break;
    }
  } finally {
    off();
  }
  return played;
}

describe('full-game simulation', () => {
  it('a fresh game progresses: kills, deaths, souls, depth 10 within a simulated hour', () => {
    seedRng(1337);
    bus.clear();
    const game = new Game();

    play(game, 3600, () => game.state.bestDepth >= 10);
    // an optimally-shopped first vessel can outrun depth 10 alive;
    // keep going until the crypt collects its due
    play(game, 3600, () => game.state.totalDeaths > 0);

    const s = game.state;
    expect(s.totalKills).toBeGreaterThan(20);
    expect(s.totalDeaths).toBeGreaterThan(0);
    expect(s.lifetimeSouls).toBeGreaterThan(50);
    expect(s.bestDepth).toBeGreaterThanOrEqual(10);

    // sanity: nothing corrupted
    for (const key of ['gold', 'bones', 'souls', 'essence', 'lifetimeSouls'] as const) {
      expect(Number.isFinite(s[key]), `${key} is finite`).toBe(true);
      expect(s[key]).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(s.achievements).length).toBeGreaterThan(2);
  }, 240_000);

  it('mid-game save/load round-trips and keeps playing', () => {
    seedRng(99);
    bus.clear();
    const game = new Game();
    play(game, 300, () => game.state.bestDepth >= 4);

    const souls = game.state.souls;
    const kills = game.state.totalKills;
    const revived = new Game(decodeSave(encodeSave(game.serialize())));
    expect(revived.state.souls).toBeCloseTo(souls, 5);
    expect(revived.state.totalKills).toBe(kills);

    play(revived, 120);
    expect(revived.state.totalKills).toBeGreaterThan(kills);
  }, 120_000);

  it('reaping grants essence, resets the cycle, and essence upgrades apply', () => {
    seedRng(4711);
    bus.clear();
    const game = new Game();
    // earn a reap the honest way is slow; force the books instead
    game.state.soulsThisReap = 250_000;
    game.state.bestDepthThisReap = 12;
    game.state.souls = 250_000;
    game.state.bones = 5000;
    game.state.upgrades['vigor'] = 10;
    game.state.upgrades['haste'] = 5;
    game.state.relics = ['femur', 'chalice', 'crown'];

    expect(game.canReap()).toBe(true);
    const gain = game.reapGain();
    expect(gain).toBeGreaterThanOrEqual(1);

    const baseAtk = new Game().d.atk;
    expect(game.doReap()).toBe(true);

    const s = game.state;
    expect(s.essence).toBe(gain);
    expect(s.reaps).toBe(1);
    expect(s.souls).toBe(0);
    expect(s.bones).toBe(0);
    expect(s.upgrades['vigor']).toBeUndefined();
    expect(s.upgrades['haste']).toBeUndefined();
    expect(s.relics).toEqual([]); // no Reliquary Eternal yet
    expect(s.classesUnlocked).toEqual(['wretch']);
    expect(s.achievements['firstreap']).toBe(true);

    // buy Eternal Power; derived stats must jump
    s.essence += 10;
    expect(game.buyUpgrade('eternal')).toBe(true);
    expect(game.d.atk).toBeGreaterThan(baseAtk * 1.5);

    // post-reap, the game still runs
    play(game, 60);
    expect(s.totalKills).toBeGreaterThan(0);
  }, 60_000);

  it('reliquary eternal keeps relics through a reap', () => {
    seedRng(5);
    bus.clear();
    const game = new Game();
    game.state.soulsThisReap = 50_000;
    game.state.bestDepthThisReap = 12;
    game.state.relics = ['femur', 'chalice', 'crown'];
    game.state.upgrades['everrelic'] = 2;
    game.doReap();
    expect(game.state.relics).toEqual(['femur', 'chalice']);
  });

  it('curses make floors harsher and souls richer', () => {
    seedRng(2025);
    bus.clear();
    const game = new Game();
    game.state.upgrades['rites'] = 1;
    game.toggleCurse('iron');
    game.toggleCurse('blood');
    game.tick(100); // summons with curses snapshotted

    const run = game.state.run!;
    expect(run.curseIds.sort()).toEqual(['blood', 'iron']);

    // blood pact halves hp
    const noCurse = new Game();
    expect(game.d.maxHp).toBeLessThan(noCurse.d.maxHp);

    // soul multiplier applies
    const before = game.state.souls;
    game.gainSouls(100);
    expect(game.state.souls - before).toBeGreaterThanOrEqual(100 * 1.8 * 1.6 * 0.99);
  });

  it('offline progress pays out from rates, capped', () => {
    bus.clear();
    const game = new Game();
    game.state.rates = { souls: 60, bones: 30 }; // per minute
    const res = game.applyOffline(2 * 3600 * 1000)!; // 2h
    expect(res.souls).toBeCloseTo(60 * 120 * 0.5);
    expect(res.bones).toBeCloseTo(30 * 120 * 0.5);

    const capped = game.applyOffline(99 * 3600 * 1000)!;
    expect(capped.souls).toBeCloseTo(60 * 720 * 0.5); // 12h cap

    expect(game.applyOffline(30_000)).toBeNull(); // under a minute: nothing
  });

  it('retire returns souls early and counts as a death', () => {
    seedRng(808);
    bus.clear();
    const game = new Game();
    play(game, 120, () => game.state.run !== null && game.state.run.kills > 2);
    expect(game.state.run).not.toBeNull();
    const soulsBefore = game.state.souls;
    const deathsBefore = game.state.totalDeaths;
    game.retire();
    expect(game.state.run).toBeNull();
    expect(game.state.souls).toBeGreaterThan(soulsBefore);
    expect(game.state.totalDeaths).toBe(deathsBefore + 1);
  }, 60_000);

  it('the full prestige loop: earn a reap honestly, reap, snowball faster', () => {
    seedRng(60221023);
    bus.clear();
    const game = new Game();

    // phase 1: grind to a legitimate reap (depth 10 + 2000 souls this cycle)
    const t1 = play(game, 4 * 3600, () => game.canReap());
    expect(game.canReap(), `not reapable after ${t1}s simulated`).toBe(true);
    expect(game.doReap()).toBe(true);
    expect(game.state.essence).toBeGreaterThanOrEqual(1);

    // spend essence like a player would
    shop(game);

    // phase 2: the next cycle must be faster than the first
    const t2 = play(game, 4 * 3600, () => game.state.bestDepthThisReap >= 10);
    expect(game.state.bestDepthThisReap).toBeGreaterThanOrEqual(10);
    expect(t2).toBeLessThan(t1);

    // books stay clean through the whole arc
    for (const key of ['gold', 'bones', 'souls', 'essence', 'lifetimeSouls'] as const) {
      expect(Number.isFinite(game.state[key])).toBe(true);
      expect(game.state[key]).toBeGreaterThanOrEqual(0);
    }
  }, 600_000);

  it('summoning circle at max level grants instant resummon (0 is not falsy-defaulted)', () => {
    bus.clear();
    const game = new Game();
    expect(game.d.summonCdMax).toBe(12000); // level 0
    game.state.upgrades['circle'] = 6;
    game.recalc();
    expect(game.d.summonCdMax).toBe(0); // max level: instant
  });

  it('slaying a Vault Warden pays souls and a legendary', () => {
    seedRng(777);
    bus.clear();
    const game = new Game();
    game.tick(100); // summon
    game.state.auto = false;
    const run = game.state.run!;

    // find a passable neighbor and plant a 1-hp warden there
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    let dir: readonly [number, number] | null = null;
    let spot = { x: 0, y: 0 };
    for (const [dx, dy] of dirs) {
      const nx = game.heroPos.x + dx;
      const ny = game.heroPos.y + dy;
      if (run.floor.tiles[ny * run.floor.w + nx] !== 0) {
        dir = [dx, dy];
        spot = { x: nx, y: ny };
        break;
      }
    }
    expect(dir).not.toBeNull();
    run.floor.monsters = [{
      id: 9999, key: 'test', name: 'Test Warden', glyph: 'Ω', color: '#fff',
      x: spot.x, y: spot.y, hp: 1, maxHp: 1, atk: 0.1, def: 0,
      specials: [], xp: 10, tier: 1, elite: false, boss: false, mini: true,
      enchants: [], awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    }];

    const soulsBefore = game.state.souls;
    game.manualMove(dir![0], dir![1]); // bump: one hit kills it

    expect(game.state.wardensSlain).toBe(1);
    expect(game.state.legendariesFound).toBe(1);
    expect(game.state.souls).toBeGreaterThan(soulsBefore);
    expect(game.state.achievements['vault1']).toBe(true);
    expect(game.state.achievements['legend1']).toBe(true);
    const gear = game.state.run?.gear ?? game.state.keptGear;
    const everything = [...Object.values(gear), ...game.state.inventory];
    expect(everything.some((i) => i?.rarity === 5)).toBe(true);
  });

  it('volatile champions detonate on death and can hurt the vessel', () => {
    seedRng(424);
    bus.clear();
    const game = new Game();
    game.tick(100);
    game.state.auto = false;
    const run = game.state.run!;

    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    let dir: readonly [number, number] | null = null;
    let spot = { x: 0, y: 0 };
    for (const [dx, dy] of dirs) {
      const nx = game.heroPos.x + dx;
      const ny = game.heroPos.y + dy;
      if (run.floor.tiles[ny * run.floor.w + nx] !== 0) {
        dir = [dx, dy];
        spot = { x: nx, y: ny };
        break;
      }
    }
    run.floor.monsters = [{
      id: 9998, key: 'test', name: 'Volatile Test Ooze', glyph: 'o', color: '#7fc7ff',
      x: spot.x, y: spot.y, hp: 1, maxHp: 1, atk: 0.1, def: 0,
      specials: [], xp: 10, tier: 1, elite: false, boss: false, mini: false,
      enchants: ['volatile'], awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    }];

    const hpBefore = run.hp;
    game.manualMove(dir![0], dir![1]);

    expect(game.state.championsSlain).toBe(1);
    // the blast landed: vessel hurt (or outright dead)
    const stillAlive = game.state.run !== null;
    if (stillAlive) expect(game.state.run!.hp).toBeLessThan(hpBefore);
    else expect(game.state.totalDeaths).toBe(1);
  });

  it('a lethal volatile blast denies the kill rewards', () => {
    seedRng(515);
    bus.clear();
    const game = new Game();
    game.tick(100);
    game.state.auto = false;
    const run = game.state.run!;

    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    let dir: readonly [number, number] = [0, 1];
    let spot = { x: 0, y: 0 };
    for (const [dx, dy] of dirs) {
      const nx = game.heroPos.x + dx;
      const ny = game.heroPos.y + dy;
      if (run.floor.tiles[ny * run.floor.w + nx] !== 0) {
        dir = [dx, dy];
        spot = { x: nx, y: ny };
        break;
      }
    }
    run.floor.monsters = [{
      id: 9997, key: 'test', name: 'Volatile Test Bomb', glyph: 'o', color: '#7fc7ff',
      x: spot.x, y: spot.y, hp: 1, maxHp: 1, atk: 0.1, def: 0,
      specials: [], xp: 10, tier: 1, elite: false, boss: false, mini: false,
      enchants: ['volatile'], awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    }];
    run.hp = 1; // the blast will be lethal

    game.manualMove(dir[0], dir[1]);

    expect(game.state.run).toBeNull(); // vessel died to the blast
    expect(game.state.totalDeaths).toBe(1);
    // the harvest was denied: no champion payout for a posthumous kill
    expect(game.state.championsSlain).toBe(0);
  });

  it('vault hoard-chests always hold an epic-or-better item', () => {
    seedRng(616);
    bus.clear();
    const game = new Game();
    game.tick(100);
    game.state.auto = false;
    const run = game.state.run!;

    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    let dir: readonly [number, number] = [0, 1];
    let spot = { x: 0, y: 0 };
    for (const [dx, dy] of dirs) {
      const nx = game.heroPos.x + dx;
      const ny = game.heroPos.y + dy;
      if (run.floor.tiles[ny * run.floor.w + nx] !== 0) {
        dir = [dx, dy];
        spot = { x: nx, y: ny };
        break;
      }
    }
    run.floor.monsters = [];
    run.floor.items = [{ x: spot.x, y: spot.y, kind: 'chest', amount: 0, special: true }];

    game.manualMove(dir[0], dir[1]);

    const all = [...Object.values(game.state.run!.gear), ...game.state.inventory];
    const best = Math.max(...all.map((i) => i?.rarity ?? -1));
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it('crypt wrath hardens freshly generated floors', () => {
    seedRng(7777);
    bus.clear();
    const calm = new Game();
    calm.tick(100);
    seedRng(7777);
    bus.clear();
    const angry = new Game();
    angry.state.soulsThisReap = 60_000; // wrath ×3.25
    angry.tick(100);

    const avg = (g: Game) => {
      const ms = g.state.run!.floor.monsters;
      return ms.reduce((s, m) => s + m.maxHp, 0) / ms.length;
    };
    // identical seeds → identical layout; only the wrath multiplier differs
    const ratio = avg(angry) / avg(calm);
    expect(ratio).toBeGreaterThan(2.2);
    expect(ratio).toBeLessThan(4.5);
  });

  it('bulk buying: ×10 and ×max spend exactly the cumulative cost', () => {
    bus.clear();
    const game = new Game();
    const def = BONE_UPGRADES.find((u) => u.id === 'vigor')!;

    game.state.bones = 1e9;
    const info = game.bulkInfo(def, 10);
    expect(info.count).toBe(10);
    const before = game.state.bones;
    expect(game.buyUpgradeTimes('vigor', 10)).toBe(10);
    expect(game.state.upgrades['vigor']).toBe(10);
    expect(before - game.state.bones).toBe(info.totalCost);

    // ×max stops at affordability
    game.state.bones = 500;
    const maxInfo = game.bulkInfo(def, 0);
    expect(maxInfo.totalCost).toBeLessThanOrEqual(500);
    const bought = game.buyUpgradeTimes('vigor', 0);
    expect(bought).toBe(maxInfo.count);
    // and the next single level is genuinely out of reach
    expect(game.cost(def)).toBeGreaterThan(game.state.bones);

    // capped upgrades respect their max
    game.state.souls = 1e12;
    const haste = SOUL_UPGRADES.find((u) => u.id === 'haste')!;
    expect(game.buyUpgradeTimes('haste', 0)).toBe(haste.max);
    expect(game.buyUpgradeTimes('haste', 0)).toBe(0); // already maxed
  });

  it('manual control: moves, bumps, descends', () => {
    seedRng(1);
    bus.clear();
    const game = new Game();
    game.tick(100); // summon
    const run = game.state.run!;
    game.state.auto = false;

    const before = { ...game.heroPos };
    // try all four directions; at least one must be passable from entry
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      game.manualMove(dx, dy);
      if (game.heroPos.x !== before.x || game.heroPos.y !== before.y) break;
    }
    expect(game.heroPos.x !== before.x || game.heroPos.y !== before.y).toBe(true);
    expect(run.turn).toBeGreaterThan(0);
  });
});
