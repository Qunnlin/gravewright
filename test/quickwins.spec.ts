/** P1 quick wins: manual-first onboarding, death-yield indicator,
 *  equipment locks, auto-mend. */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import * as B from '../src/core/balance';
import { TILE, type Item } from '../src/core/types';

function freshGame(): Game {
  bus.clear();
  const game = new Game();
  game.tick(100); // summon
  return game;
}

/** Kill the current vessel via an unsurvivable poison tick. */
function killVessel(game: Game): void {
  const run = game.state.run!;
  run.hp = 1;
  run.statuses = [{ kind: 'poison', turns: 1, power: 9999999 }];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
  const dir = dirs.find(([dx, dy]) =>
    run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
  game.manualMove(dir[0], dir[1]);
}

describe('manual-first onboarding', () => {
  it('fresh games start without autopilot; the first death awakens it', () => {
    seedRng(41);
    const game = freshGame();
    expect(game.state.auto).toBe(false);
    expect(game.autoUnlocked()).toBe(false);

    // ticking time moves nothing while manual — no background self-play
    const turn = game.state.run!.turn;
    for (let i = 0; i < 40; i++) game.tick(250);
    expect(game.state.run!.turn).toBe(turn);

    killVessel(game);
    expect(game.state.totalDeaths).toBe(1);
    expect(game.autoUnlocked()).toBe(true);
    expect(game.state.auto).toBe(true); // awakened automatically
  });

  it('depth 10 also unlocks the autopilot', () => {
    bus.clear();
    const game = new Game();
    game.state.bestDepth = 10;
    expect(game.autoUnlocked()).toBe(true);
  });

  it('a tampered save cannot start auto-locked-but-on', () => {
    bus.clear();
    const game = new Game({ ...new Game().state, auto: true });
    expect(game.state.auto).toBe(false); // constructor enforces the gate
  });
});

describe('death-yield indicator', () => {
  it('matches the death formula with all multipliers; zero between vessels', () => {
    seedRng(42);
    const game = freshGame();
    const run = game.state.run!;
    run.depth = 7;
    run.kills = 12;
    const expected = B.soulsOnDeath(7, 12) * game.d.soulMult;
    expect(game.deathYield()).toBeCloseTo(expected, 8);

    game.retire();
    expect(game.state.run).toBeNull();
    expect(game.deathYield()).toBe(0);
  });
});

describe('equipment locks', () => {
  const mk = (name: string, atk: number, locked = false): Item => ({
    slot: 'weapon', name, rarity: 2, depth: 5,
    stats: { atk }, score: atk * 2, kind: 'blade', locked,
  });

  it('auto-equip never replaces a locked item (lock needs the Seal)', () => {
    seedRng(43);
    const game = freshGame();
    game.acquireItem(mk('Cherished Blade', 10));
    expect(game.state.run!.gear.weapon?.name).toBe('Cherished Blade');

    // without the Quartermaster's Seal, locking is refused
    game.toggleLock('weapon');
    expect(game.state.run!.gear.weapon?.locked).toBeFalsy();

    game.state.upgrades['seal'] = 1;
    game.toggleLock('weapon');
    expect(game.state.run!.gear.weapon?.locked).toBe(true);

    game.acquireItem(mk('Vastly Better Blade', 9999));
    expect(game.state.run!.gear.weapon?.name).toBe('Cherished Blade');
    expect(game.state.inventory.some((i) => i.name === 'Vastly Better Blade')).toBe(true);

    // unlock → the next upgrade goes through
    game.toggleLock('weapon');
    game.acquireItem(mk('Even Better Blade', 99999));
    expect(game.state.run!.gear.weapon?.name).toBe('Even Better Blade');
  });

  it('locked satchel items survive salvage-all, manual scrap, and overflow', () => {
    seedRng(44);
    const game = freshGame();
    game.state.settings.autoEquip = false;
    game.state.settings.protectRarity = 7; // protect "nothing" — locks still hold
    game.acquireItem(mk('Heirloom', 5, true));
    expect(game.state.inventory[0]?.locked).toBe(true);

    expect(game.salvageFromInventory(0)).toBe(false); // refused
    game.salvageAllInventory();
    expect(game.state.inventory.some((i) => i.name === 'Heirloom')).toBe(true);

    // overflow scraps anything else before a locked item
    for (let i = 0; i < B.INVENTORY_CAP; i++) game.acquireItem(mk(`Filler ${i}`, 10 + i));
    expect(game.state.inventory.some((i) => i.name === 'Heirloom')).toBe(true);
  });
});

describe('dev god mode', () => {
  it('an invulnerable vessel shrugs off attacks and dots', () => {
    seedRng(46);
    const game = freshGame();
    const run = game.state.run!;
    game.devInvulnerable = true;

    run.hp = 5;
    run.statuses = [{ kind: 'poison', turns: 3, power: 9999999 }];
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
    const dir = dirs.find(([dx, dy]) =>
      run.floor.tiles[(game.heroPos.y + dy) * run.floor.w + (game.heroPos.x + dx)] !== TILE.WALL)!;
    game.manualMove(dir[0], dir[1]);
    expect(game.state.run).not.toBeNull();
    expect(game.state.run!.hp).toBe(5);

    game.devInvulnerable = false;
    game.manualMove(-dir[0], -dir[1]);
    expect(game.state.run).toBeNull(); // mortality restored
  });
});

describe('auto-mend', () => {
  it('re-raises fallen minions from bones when enabled', () => {
    seedRng(45);
    const game = freshGame();
    game.state.souls = 1000;
    game.buyMinion('skeleton');
    const st = game.state.minions['skeleton'];
    expect(st.alive).toBe(true);

    st.alive = false;
    st.hp = 0;
    game.state.bones = 1000;

    // off: stays dead
    game.state.settings.autoMend = false;
    for (let i = 0; i < 16; i++) game.tick(250);
    expect(st.alive).toBe(false);

    // setting on but the Sexton not bought: still dead (essence gate)
    game.state.settings.autoMend = true;
    for (let i = 0; i < 16; i++) game.tick(250);
    expect(st.alive).toBe(false);

    // Sexton owned: mended within the automaton cadence
    game.state.upgrades['sexton'] = 1;
    for (let i = 0; i < 16; i++) game.tick(250);
    expect(st.alive).toBe(true);
    expect(st.hp).toBeGreaterThan(0);

    // no bones, no mend
    st.alive = false;
    st.hp = 0;
    game.state.bones = 0;
    for (let i = 0; i < 16; i++) game.tick(250);
    expect(st.alive).toBe(false);
  });
});
