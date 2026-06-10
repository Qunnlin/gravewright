/** The Trial of the Sealed Hall & Vestige set items. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { TILE, type Monster } from '../src/core/types';
import { rollSetPiece, trialSetFor, SETS } from '../src/core/data/sets';

function freshGame(): Game {
  bus.clear();
  const game = new Game();
  game.tick(100);
  return game;
}

/** Slay the CURRENT wave only: teleport each of its monsters next to the
 *  hero with 1 hp and bump it. Stops as soon as the wave advances or ends
 *  (killing the last one auto-spawns the next wave). */
function slayTrialWave(game: Game): void {
  const start = game.state.run?.trialActive?.wave;
  if (start === undefined) return;
  for (let guard = 0; guard < 20; guard++) {
    const run = game.state.run;
    if (!run || run.trialActive?.wave !== start) return;
    const floor = run.floor;
    // the test hero is here to win, not to be fair
    for (const m of floor.monsters) m.atk = 0.0001;
    const target = floor.monsters.find((m) => m.trial && m.hp > 0);
    if (!target) return;
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const nx = game.heroPos.x + dx;
      const ny = game.heroPos.y + dy;
      if (floor.tiles[ny * floor.w + nx] === TILE.WALL) continue;
      if (floor.monsters.some((m) => m !== target && m.x === nx && m.y === ny && m.hp > 0)) continue;
      target.x = nx;
      target.y = ny;
      target.hp = 1;
      target.atk = 0.0001;
      game.manualMove(dx, dy);
      break;
    }
  }
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

  it('the hardened crypt yields the Gate; classes get their sets otherwise', () => {
    expect(trialSetFor('wretch', true)).toBe('genugate');
    expect(trialSetFor('lich', true)).toBe('genugate');
    expect(trialSetFor('cleric', false)).toBe('regalia');
    expect(trialSetFor('lich', false)).toBe('regalia');
    expect(trialSetFor('footman', false)).toBe('vigil');
    expect(trialSetFor('wretch', false)).toBe('vigil');
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
    expect(game.state.run!.hp).toBe(1);
    expect(game.state.run!.oathUsed).toBe(true);

    // ...but only once (step back the way we came — guaranteed passable)
    game.state.run!.hp = 1;
    game.state.run!.statuses = [{ kind: 'poison', turns: 1, power: 999999 }];
    game.manualMove(-dir[0], -dir[1]);
    expect(game.state.run).toBeNull();
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
    expect(game.state.run!.trialActive).toEqual({ wave: 1, totalWaves: 3 });
    expect(game.state.run!.floor.monsters.filter((m) => m.trial && m.hp > 0).length).toBeGreaterThan(0);

    slayTrialWave(game); // wave 1 → wave 2 spawns
    expect(game.state.run!.trialActive!.wave).toBe(2);
    slayTrialWave(game); // wave 2 → wave 3
    expect(game.state.run!.trialActive!.wave).toBe(3);
    slayTrialWave(game); // wave 3 → victory

    expect(game.state.run!.trialActive).toBeNull();
    expect(game.state.trialsWon).toBe(1);
    expect(game.state.souls).toBeGreaterThan(soulsBefore);
    expect(game.state.achievements['trial1']).toBe(true);

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
    // an executioner waits adjacent
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      floor.tiles[(game.heroPos.y + dy) * floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    const killer = floor.monsters.find((m) => m.trial)!;
    killer.x = game.heroPos.x + dir[0];
    killer.y = game.heroPos.y + dir[1];
    killer.atk = 1e9;
    killer.hp = 1e9;
    killer.maxHp = 1e9;
    game.state.run!.hp = 1;
    game.manualMove(dir[0], dir[1]); // bump; the killer answers

    expect(game.state.run).toBeNull();
    expect(game.state.trialsFailed).toBe(1);
    // 40% forfeit, and the death itself paid zero souls
    expect(game.state.souls).toBeCloseTo(600, 5);
  });

  it('fleeing down the stairs forfeits the same wager', () => {
    seedRng(33);
    const game = freshGame();
    game.state.auto = false;
    game.state.run!.depth = 13;
    game.descend();
    game.acceptTrial();
    game.state.souls = 1000;

    game.descend(); // flight
    expect(game.state.run).not.toBeNull();
    expect(game.state.run!.trialActive).toBeNull();
    expect(game.state.trialsFailed).toBe(1);
    expect(game.state.souls).toBeCloseTo(600, 5);
    // the fled hall's keepers do not follow
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
    for (let i = 0; i < 3; i++) slayTrialWave(game);

    const all = [...Object.values(game.state.run!.gear), ...game.state.inventory];
    const vestige = all.find((i) => i?.rarity === 6);
    expect(vestige).toBeDefined();
    expect(vestige!.setId).toBe('genugate');
  });
});
