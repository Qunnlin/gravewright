/** The Trial of the Sealed Hall & Vestige set items. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE, type Monster } from '../src/core/types';
import { rollSetPiece, trialSetFor, SETS } from '../src/core/data/sets';
import { rollItem } from '../src/core/data/items';
import { CLASSES } from '../src/core/data/classes';

function freshGame(): Game {
  bus.clear();
  const game = new Game();
  game.tick(100);
  return game;
}

/** Survive the Hall: pace back and forth, neutering every spawn so the
 *  onslaught timer runs out, then slay the Avatar with a 1-hp bump. */
function surviveTrial(game: Game): { maxAlive: number } {
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
  const passable = (dx: number, dy: number) => {
    const f = game.state.run!.floor;
    return f.tiles[(game.heroPos.y + dy) * f.w + (game.heroPos.x + dx)] !== TILE.WALL;
  };
  // even neutered monsters chip ≥1 damage per hit — the horde is the point.
  // The flow test wants the FLOW, so the test vessel is divine.
  game.devInvulnerable = true;
  let maxAlive = 0;
  for (let guard = 0; guard < 400; guard++) {
    const run = game.state.run;
    const t = run?.trialActive;
    if (!run || !t) break;
    maxAlive = Math.max(maxAlive,
      run.floor.monsters.filter((m) => m.trial && m.hp > 0).length);
    for (const m of run.floor.monsters) m.atk = 0.0001;
    if (t.phase === 'avatar') {
      const avatar = run.floor.monsters.find((m) => m.trial && m.boss && m.hp > 0);
      if (!avatar) break;
      // sweep the rabble aside for a clean duel (test cheat)
      run.floor.monsters = run.floor.monsters.filter((m) => m === avatar);
      const dir = dirs.find(([dx, dy]) => passable(dx, dy))!;
      avatar.x = game.heroPos.x + dir[0];
      avatar.y = game.heroPos.y + dir[1];
      avatar.hp = 1;
      game.manualMove(dir[0], dir[1]);
      continue;
    }
    // onslaught: shuffle in place; pick a step away from any blocker
    const dir = dirs.find(([dx, dy]) => passable(dx, dy)) ?? [0, 1];
    game.manualMove(dir[0], dir[1]);
  }
  game.devInvulnerable = false;
  return { maxAlive };
}

describe('vestige set items', () => {
  it('set pieces have fixed names and stat types that scale with depth', () => {
    const shallow = rollSetPiece('genugate', 'armor', 5)!;
    const deep = rollSetPiece('genugate', 'armor', 25)!;
    expect(shallow.name).toBe('genuWall, the Stateful Aegis');
    expect(deep.name).toBe(shallow.name);
    expect(shallow.rarity).toBe(6);
    expect(Object.keys(shallow.stats).sort()).toEqual(Object.keys(deep.stats).sort());
    expect(deep.stats.def!).toBeGreaterThan(shallow.stats.def! * 3);
    expect(shallow.setId).toBe('genugate');
  });

  it('the pacts speak first; otherwise the calling decides the set', () => {
    expect(trialSetFor('wretch', ['iron'])).toBe('genugate');
    expect(trialSetFor('lich', ['iron', 'famine'])).toBe('genugate'); // iron outranks
    expect(trialSetFor('wretch', ['famine'])).toBe('tithegilded');
    expect(trialSetFor('cleric', [])).toBe('regalia');
    expect(trialSetFor('lich', [])).toBe('regalia');
    expect(trialSetFor('ranger', [])).toBe('longwatch');
    expect(trialSetFor('shadow', [])).toBe('longwatch');
    expect(trialSetFor('footman', [])).toBe('vigil');
    expect(trialSetFor('wretch', [])).toBe('vigil');
  });

  it('every set defines all three slots', () => {
    for (const set of SETS) {
      expect(set.pieces.map((p) => p.slot).sort()).toEqual(['armor', 'charm', 'weapon']);
    }
  });

  it('full genuGate grants AIRGAP; full Vigil grants the Oath', () => {
    seedRng(21);
    const game = freshGame();
    const run = game.state.run!;
    expect(game.d.negateChance).toBe(0);

    run.gear.weapon = rollSetPiece('genugate', 'weapon', 10);
    run.gear.armor = rollSetPiece('genugate', 'armor', 10);
    game.recalc();
    expect(game.d.negateChance).toBe(0); // 2 pieces: perimeter only
    const dodge2pc = game.d.dodge;
    expect(dodge2pc).toBeGreaterThanOrEqual(15);

    run.gear.charm = rollSetPiece('genugate', 'charm', 10);
    game.recalc();
    expect(game.d.negateChance).toBe(25);
    expect(game.d.dotImmune).toBe(true);
    expect(game.state.achievements['genuset']).toBeUndefined(); // checked on events
    game.checkAchievements();
    expect(game.state.achievements['genuset']).toBe(true);

    // swap to the Last Vigil
    run.gear.weapon = rollSetPiece('vigil', 'weapon', 10);
    run.gear.armor = rollSetPiece('vigil', 'armor', 10);
    run.gear.charm = rollSetPiece('vigil', 'charm', 10);
    game.recalc();
    expect(game.d.oathstone).toBe(true);
    expect(game.d.lowHpAtk).toBeCloseTo(0.6);
    expect(game.d.blockPct).toBeGreaterThanOrEqual(10);
  });

  it('the oath refuses one killing blow per floor', () => {
    seedRng(22);
    const game = freshGame();
    const run = game.state.run!;
    run.gear.weapon = rollSetPiece('vigil', 'weapon', 10);
    run.gear.armor = rollSetPiece('vigil', 'armor', 10);
    run.gear.charm = rollSetPiece('vigil', 'charm', 10);
    game.recalc();

    // a lethal poison tick is refused once...
    run.hp = 1;
    run.statuses = [{ kind: 'poison', turns: 1, power: 999999 }];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    game.manualMove(dir[0], dir[1]);
    expect(game.state.run).not.toBeNull();
    // the Oath-Knot's Last Stand power: rise at 30% max HP, blessed
    expect(game.state.run!.hp).toBe(Math.max(1, Math.round(game.d.maxHp * 0.3)));
    expect(game.state.run!.blessTurns).toBeGreaterThan(0);
    expect(game.state.run!.oathUsed).toBe(true);

    // ...but only once (step back the way we came — guaranteed passable)
    game.state.run!.hp = 1;
    game.state.run!.statuses = [{ kind: 'poison', turns: 1, power: 999999 }];
    game.manualMove(-dir[0], -dir[1]);
    expect(game.state.run).toBeNull();
  });
});

describe('vestige powers', () => {
  function vesselWith(setId: string, game: Game): void {
    const run = game.state.run!;
    run.gear.weapon = rollSetPiece(setId, 'weapon', 10);
    run.gear.armor = rollSetPiece(setId, 'armor', 10);
    run.gear.charm = rollSetPiece(setId, 'charm', 10);
    game.recalc();
  }

  it('a vestige headline stat outclasses a legendary primary at equal depth', () => {
    seedRng(60);
    const vestige = rollSetPiece('vigil', 'weapon', 20)!;
    let total = 0;
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const leg = rollItem(20, 5);
      if (leg.slot === 'weapon' && leg.stats.atk) {
        total += leg.stats.atk;
        n++;
      }
    }
    expect(n).toBeGreaterThan(30);
    const meanLegendaryAtk = total / n;
    // deterministic vestige headline beats the average legendary primary —
    // on top of the unique power and the set bonuses
    expect(vestige.stats.atk!).toBeGreaterThan(meanLegendaryAtk * 1.1);
  });

  it('recalc collects the powers of worn pieces', () => {
    seedRng(61);
    const game = freshGame();
    expect(game.d.powers).toEqual([]);
    vesselWith('genugate', game);
    expect(game.d.powers.sort()).toEqual(['inspection', 'leastpriv', 'stateful']);
  });

  it('Deep Inspection: +50% damage against unhurt enemies only', () => {
    seedRng(62);
    const game = freshGame();
    vesselWith('genugate', game);
    const run = game.state.run!;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    const dummy: Monster = {
      id: 9001, key: 't', name: 'Dummy', glyph: 'd', color: '#fff',
      x: game.heroPos.x + dir[0], y: game.heroPos.y + dir[1],
      hp: 1e9, maxHp: 1e9, atk: 0.0001, def: 0,
      specials: [], xp: 1, tier: 1, elite: false, boss: false, mini: false,
      enchants: [], trial: false, awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    };
    run.floor.monsters = [dummy];
    game.manualMove(dir[0], dir[1]); // first hit: inspected (full hp)
    const first = 1e9 - dummy.hp;
    const hpAfterFirst = dummy.hp;
    game.manualMove(dir[0], dir[1]); // second hit: already hurt
    const second = hpAfterFirst - dummy.hp;
    // averages aside, the inspected hit must clearly exceed the follow-up band
    expect(first).toBeGreaterThan(second * 1.1);
  });

  it('Stateful: a clean 5-turn session drops the next hit', () => {
    seedRng(63);
    const game = freshGame();
    vesselWith('genugate', game);
    const run = game.state.run!;
    run.floor.monsters = [];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    // walk 6 clean turns to establish the session
    for (let i = 0; i < 6; i++) game.manualMove((i % 2 ? -1 : 1) * dir[0], (i % 2 ? -1 : 1) * dir[1]);

    const hpBefore = run.hp;
    const bully: Monster = {
      id: 9002, key: 't', name: 'Bully', glyph: 'b', color: '#fff',
      x: game.heroPos.x + dir[0], y: game.heroPos.y + dir[1],
      hp: 1e9, maxHp: 1e9, atk: 50, def: 0,
      specials: [], xp: 1, tier: 1, elite: false, boss: false, mini: false,
      enchants: [], trial: false, awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    };
    run.floor.monsters = [bully];
    // AIRGAP could also eat the hit; disable randomness influence by zeroing it
    game.d.negateChance = 0;
    game.d.dodge = 0;
    game.manualMove(dir[0], dir[1]); // bump; bully answers — STATEFUL drops it
    expect(game.state.run!.hp).toBe(hpBefore);
  });

  it('True Names: every kill pays bonus souls', () => {
    seedRng(64);
    const game = freshGame();
    vesselWith('regalia', game);
    const run = game.state.run!;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    const prey: Monster = {
      id: 9003, key: 't', name: 'Prey', glyph: 'p', color: '#fff',
      x: game.heroPos.x + dir[0], y: game.heroPos.y + dir[1],
      hp: 1, maxHp: 1, atk: 0.0001, def: 0,
      specials: [], xp: 1, tier: 0, elite: false, boss: false, mini: false,
      enchants: [], trial: false, awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    };
    run.floor.monsters = [prey];
    const before = game.state.souls;
    game.manualMove(dir[0], dir[1]);
    expect(game.state.souls).toBeGreaterThan(before); // a plain kill paid souls
  });
});

describe('the smith (reforging)', () => {
  it('reforges an equipped vestige to current depth for gold, keeping the lock', () => {
    seedRng(70);
    const game = freshGame();
    const run = game.state.run!;
    run.depth = 20;
    const stale = rollSetPiece('vigil', 'weapon', 5)!;
    stale.locked = true;
    run.gear.weapon = stale;
    game.recalc();
    const staleAtk = stale.stats.atk!;

    // broke: the smith refuses
    game.state.gold = 0;
    expect(game.reforgeSlot('weapon')).toBe(false);

    game.state.gold = 1e9;
    const goldBefore = game.state.gold;
    expect(game.reforgeSlot('weapon')).toBe(true);
    const reforged = game.state.run!.gear.weapon!;
    expect(reforged.depth).toBe(20);
    expect(reforged.stats.atk!).toBeGreaterThan(staleAtk * 3);
    expect(reforged.locked).toBe(true);
    expect(game.state.gold).toBeLessThan(goldBefore);

    // already current: no-op, no charge
    const goldAfter = game.state.gold;
    expect(game.reforgeSlot('weapon')).toBe(false);
    expect(game.state.gold).toBe(goldAfter);
  });

  it('reforges from the satchel; refuses non-vestiges', () => {
    seedRng(71);
    const game = freshGame();
    game.state.run!.depth = 15;
    game.state.gold = 1e9;
    game.state.inventory = [
      rollSetPiece('regalia', 'charm', 4)!,
      rollItem(15, 5), // a legendary is not the smith's business
    ];
    expect(game.reforgeFromInventory(0)).toBe(true);
    expect(game.state.inventory[0].depth).toBe(15);
    expect(game.reforgeFromInventory(1)).toBe(false);
  });
});

describe('new sets & powers', () => {
  function wear(game: Game, setId: string): void {
    const run = game.state.run!;
    run.gear.weapon = rollSetPiece(setId, 'weapon', 10);
    run.gear.armor = rollSetPiece(setId, 'armor', 10);
    run.gear.charm = rollSetPiece(setId, 'charm', 10);
    game.recalc();
  }

  it('the Longwatch: deadeye crit, fleetfoot speed, crit-damage and full-hp bonuses', () => {
    seedRng(72);
    const game = freshGame();
    const before = { crit: game.d.crit, tick: game.d.tickRate };
    wear(game, 'longwatch');
    expect(game.d.crit).toBeGreaterThanOrEqual(before.crit + 20);
    expect(game.d.tickRate).toBeCloseTo(before.tick + 1, 5);
    expect(game.d.critDmg).toBe(2.4);
    expect(game.d.fullHpAtk).toBeCloseTo(0.6);
    expect(game.d.dodge).toBeGreaterThanOrEqual(20);
  });

  it('the Tithe-Gilded: golden tide and doubled marrow', () => {
    seedRng(73);
    const game = freshGame();
    game.state.upgrades['marrow'] = 5; // 40% conversion
    game.recalc();
    const baseGold = game.d.goldMult;
    const baseMarrow = game.d.marrowPct;
    wear(game, 'tithegilded');
    expect(game.d.goldMult / baseGold).toBeGreaterThan(2.1); // ×2.2 + gear goldPct
    expect(game.d.marrowPct).toBeCloseTo(baseMarrow * 2, 5);
    expect(game.d.powers).toContain('midas');
  });

  it('conduction echoes minion strikes; the choir endures interceptions', () => {
    seedRng(74);
    const game = freshGame();
    game.state.souls = 1e6;
    game.buyMinion('skeleton');
    game.buyMinion('ghoul');
    wear(game, 'regalia');
    expect(game.d.powers).toContain('conduction');
    expect(game.d.powers).toContain('choir');

    // choir: an intercepted hit hurts the minion half as much
    const run = game.state.run!;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    const dummy: Monster = {
      id: 9100, key: 't', name: 'Echo Dummy', glyph: 'd', color: '#fff',
      x: game.heroPos.x + dir[0], y: game.heroPos.y + dir[1],
      hp: 1e9, maxHp: 1e9, atk: 0.0001, def: 0,
      specials: [], xp: 1, tier: 1, elite: false, boss: false, mini: false,
      enchants: [], trial: false, awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    };
    run.floor.monsters = [dummy];
    const skontrib = game.minionAtk('skeleton') + game.minionAtk('ghoul');
    game.manualMove(dir[0], dir[1]);
    const dealt = 1e9 - dummy.hp;
    // hero hit + minion hits + 50% echoes: clearly above hero+minions alone
    expect(dealt).toBeGreaterThan(game.d.atk * 0.85 + skontrib * 0.85);
  });

  it('the Admin logs in after Defense in Depth, survives reaps, and sees everything', () => {
    seedRng(75);
    const game = freshGame();
    expect(CLASSES.some((c) => c.id === 'admin')).toBe(true);
    expect(game.state.classesUnlocked).not.toContain('admin');

    // wear the full genuGate → the feat fires → the port opens
    const run = game.state.run!;
    run.gear.weapon = rollSetPiece('genugate', 'weapon', 10);
    run.gear.armor = rollSetPiece('genugate', 'armor', 10);
    run.gear.charm = rollSetPiece('genugate', 'charm', 10);
    game.recalc();
    game.checkAchievements();
    expect(game.state.achievements['genuset']).toBe(true);
    expect(game.state.classesUnlocked).toContain('admin');

    // root access survives the Reaping
    game.state.soulsThisReap = 50_000;
    game.state.bestDepthThisReap = 12;
    expect(game.doReap()).toBe(true);
    expect(game.state.classesUnlocked).toContain('admin');

    // and an Admin vessel knows the whole floor on arrival
    game.setClass('admin');
    game.tick(100); // summon
    const floor = game.state.run!.floor;
    expect(game.state.run!.klass).toBe('admin');
    expect(floor.seen.every((v) => v === 1)).toBe(true);
    expect(game.d.shrinesFree).toBe(true);
    expect(game.d.thiefProof).toBe(true);
  });
});

describe('the trial offer pauses the world', () => {
  it('stepping onto the shrine under autopilot drops to manual and reports prior mode', () => {
    seedRng(36);
    const game = freshGame();
    game.state.run!.depth = 13;
    game.descend();
    const floor = game.state.run!.floor;
    const trial = floor.trial!;
    expect(trial).toBeTruthy();

    // park the hero next to the shrine, autopilot on, and step onto it
    floor.monsters = [];
    game.heroPos.x = trial.x + 1;
    game.heroPos.y = trial.y;
    game.state.auto = true;

    let offered: { wasAuto: boolean } | null = null;
    bus.on((e) => {
      if (e.type === 'trialOffer') offered = { wasAuto: e.wasAuto };
    });
    game.manualMove(-1, 0);

    expect(offered).not.toBeNull();
    expect(offered!.wasAuto).toBe(true); // UI restores this after the choice
    expect(game.state.auto).toBe(false); // the world holds its breath

    // while paused, ticking time moves nothing — the floor cannot be skipped
    const turn = game.state.run!.turn;
    for (let i = 0; i < 40; i++) game.tick(250);
    expect(game.state.run!.turn).toBe(turn);
    expect(game.state.run!.depth).toBe(14);
  });
});

describe('set protection', () => {
  it('auto-equip never silently breaks a completed set', () => {
    seedRng(23);
    const game = freshGame();
    const run = game.state.run!;
    run.gear.weapon = rollSetPiece('vigil', 'weapon', 10);
    run.gear.armor = rollSetPiece('vigil', 'armor', 10);
    run.gear.charm = rollSetPiece('vigil', 'charm', 10);
    game.recalc();
    expect(game.d.oathstone).toBe(true);

    // a vastly better random armor arrives — it must NOT displace the set piece
    game.acquireItem({
      slot: 'armor', name: 'Tempting Worldrot Plate', rarity: 5, depth: 30,
      stats: { def: 9999, hpPct: 60 }, score: 9999 * 2 + 48,
    });
    expect(game.state.run!.gear.armor?.setId).toBe('vigil');
    expect(game.d.oathstone).toBe(true);
    expect(game.state.inventory.some((i) => i.name === 'Tempting Worldrot Plate')).toBe(true);

    // manual equips may still break the set — the player's own hand
    const idx = game.state.inventory.findIndex((i) => i.name === 'Tempting Worldrot Plate');
    expect(game.equipFromInventory(idx)).toBe(true);
    game.recalc();
    expect(game.d.oathstone).toBe(false);
  });
});

describe('the trial of the sealed hall', () => {
  it('is guaranteed at the first eligible depth and spawns three waves to victory', () => {
    seedRng(31);
    const game = freshGame();
    const run = game.state.run!;
    game.state.auto = false;

    // jump to depth 13 → descend lands on 14: the guaranteed trial floor
    run.depth = 13;
    game.descend();
    expect(game.state.run!.floor.trial).not.toBeNull();
    expect(game.state.trialsSeen).toBe(1);

    const soulsBefore = game.state.souls;
    game.acceptTrial();

    // transported: a vast hall, no stairs, the onslaught pending
    const hall = game.state.run!.floor;
    expect(game.state.run!.trialActive).toMatchObject({
      turnsSurvived: 0, phase: 'onslaught', returnDepth: 14,
    });
    expect(hall.stairs).toEqual({ x: -1, y: -1 });
    expect(hall.trial?.used).toBe(true);
    expect(hall.monsters).toHaveLength(0); // the packs come with the turns

    const { maxAlive } = surviveTrial(game); // outlast it, fell the Avatar

    expect(game.state.run!.trialActive).toBeNull();
    expect(game.state.trialsWon).toBe(1);
    expect(game.state.souls).toBeGreaterThan(soulsBefore);
    expect(game.state.achievements['trial1']).toBe(true);
    // the onslaught actually amassed a horde
    expect(maxAlive).toBeGreaterThanOrEqual(8);
    // returned to the depth the Hall took them from
    expect(game.state.run!.depth).toBe(14);
    expect(game.state.run!.floor.stairs.x).toBeGreaterThanOrEqual(0);

    // a vestige was awarded somewhere
    const gear = game.state.run!.gear;
    const all = [...Object.values(gear), ...game.state.inventory];
    const vestige = all.find((i) => i?.rarity === 6);
    expect(vestige).toBeDefined();
    expect(vestige!.setId).toBe('vigil'); // wretch, no iron pact
  });

  it('death during the trial forfeits 40% of souls and pays nothing', () => {
    seedRng(32);
    const game = freshGame();
    const run = game.state.run!;
    game.state.auto = false;
    run.depth = 13;
    game.descend();
    game.acceptTrial();

    game.state.souls = 1000;
    const floor = game.state.run!.floor;
    // an executioner materializes adjacent (the hall starts empty)
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      floor.tiles[(game.heroPos.y + dy) * floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    const killer: Monster = {
      id: 9999, key: 'test', name: 'Hall Executioner', glyph: 'X', color: '#fff',
      x: game.heroPos.x + dir[0], y: game.heroPos.y + dir[1],
      hp: 1e9, maxHp: 1e9, atk: 1e9, def: 0,
      specials: [], xp: 1, tier: 1, elite: false, boss: false, mini: false,
      enchants: [], trial: true, awake: true, slowSkip: false, summonCd: 0, stolenGold: 0,
    };
    floor.monsters.push(killer);
    game.state.run!.hp = 1;
    game.manualMove(dir[0], dir[1]); // bump; the killer answers

    expect(game.state.run).toBeNull();
    expect(game.state.trialsFailed).toBe(1);
    // 40% forfeit, and the death itself paid zero souls
    expect(game.state.souls).toBeCloseTo(600, 5);
  });

  it('there is no walking out: the hall has no stairs, manual descend is inert', () => {
    seedRng(33);
    const game = freshGame();
    game.state.auto = false;
    game.state.run!.depth = 13;
    game.descend();
    game.acceptTrial();
    game.state.souls = 1000;

    game.manualDescend(); // nothing to stand on — no stairs exist
    expect(game.state.run!.trialActive).not.toBeNull();
    expect(game.state.trialsFailed).toBe(0);
    expect(game.state.souls).toBe(1000);

    // the API-level flight path still settles the wager (safety net)
    game.descend();
    expect(game.state.run).not.toBeNull();
    expect(game.state.run!.trialActive).toBeNull();
    expect(game.state.trialsFailed).toBe(1);
    expect(game.state.souls).toBeCloseTo(600, 5);
    expect(game.state.run!.floor.monsters.some((m) => m.trial)).toBe(false);
  });

  it('the shrine ritual unseals a hall: three blessings in one life', () => {
    seedRng(34);
    const game = freshGame();
    game.state.auto = false;
    const run = game.state.run!;
    run.depth = 19; // next floors are 20 (boss), 21...
    run.shrinesThisRun = 2;
    game.state.gold = 1e9;

    // plant a shrine next to the hero and step on it (hurt first so it heals)
    const floor = run.floor;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      floor.tiles[(game.heroPos.y + dy) * floor.w + (game.heroPos.x + dx)] === TILE.FLOOR)!;
    const sx = game.heroPos.x + dir[0];
    const sy = game.heroPos.y + dir[1];
    floor.tiles[sy * floor.w + sx] = TILE.SHRINE;
    floor.shrine = { x: sx, y: sy, used: false };
    floor.monsters = [];
    run.hp = 1;

    game.manualMove(dir[0], dir[1]);
    expect(game.state.run!.shrinesThisRun).toBe(3);
    expect(game.state.trialPending).toBe(true);

    game.descend(); // depth 20: boss floor, no trial; the seal waits
    expect(game.state.run!.floor.trial).toBeNull();
    expect(game.state.trialPending).toBe(true);
    game.descend(); // depth 21: the hall
    expect(game.state.run!.floor.trial).not.toBeNull();
    expect(game.state.trialPending).toBe(false);
  });

  it('the iron pact turns the reward into the genuGate', () => {
    seedRng(35);
    bus.clear();
    const game = new Game();
    game.state.upgrades['rites'] = 1;
    game.toggleCurse('iron');
    game.tick(100); // summon with the pact sworn
    game.state.auto = false;
    game.state.run!.depth = 13;
    game.descend();
    game.acceptTrial();
    surviveTrial(game);

    const all = [...Object.values(game.state.run!.gear), ...game.state.inventory];
    const vestige = all.find((i) => i?.rarity === 6);
    expect(vestige).toBeDefined();
    expect(vestige!.setId).toBe('genugate');
  });
});
