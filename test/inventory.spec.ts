import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import { INVENTORY_CAP } from '../src/core/balance';
import { kindAllows, kindFavors, rollItem } from '../src/core/data/items';
import { encodeSave, decodeSave } from '../src/core/save';
import type { Item } from '../src/core/types';

function mkWeapon(kind: Item['kind'], atk = 10, name = 'Test Weapon'): Item {
  return { slot: 'weapon', name, rarity: 2, depth: 5, stats: { atk }, score: atk * 2, kind };
}

function freshGame(): Game {
  bus.clear();
  const game = new Game();
  game.tick(100); // summon the first vessel
  return game;
}

describe('weapon proficiency', () => {
  it('kind gating matches the design table', () => {
    expect(kindAllows('blade', 'wretch')).toBe(true);
    expect(kindAllows('blade', 'lich')).toBe(true);
    expect(kindAllows('bow', 'ranger')).toBe(true);
    expect(kindAllows('bow', 'wretch')).toBe(false);
    expect(kindAllows('bow', 'footman')).toBe(false);
    expect(kindAllows('focus', 'lich')).toBe(true);
    expect(kindAllows('focus', 'berserker')).toBe(false);
    expect(kindAllows('heavy', 'berserker')).toBe(true);
    expect(kindAllows('heavy', 'ranger')).toBe(false);
    expect(kindFavors('bow', 'ranger')).toBe(true);
    expect(kindFavors('blade', 'shadow')).toBe(true);
    expect(kindFavors('blade', 'wretch')).toBe(false);
  });

  it('a wretch cannot equip a bow; it lands in the satchel instead', () => {
    seedRng(1);
    const game = freshGame();
    expect(game.state.run!.klass).toBe('wretch');
    game.acquireItem(mkWeapon('bow', 50, 'Forbidden Warbow'));
    expect(game.state.run!.gear.weapon).toBeNull();
    expect(game.state.inventory.some((i) => i.name === 'Forbidden Warbow')).toBe(true);
    // and manual equip is refused too
    const idx = game.state.inventory.findIndex((i) => i.name === 'Forbidden Warbow');
    expect(game.equipFromInventory(idx)).toBe(false);
    expect(game.state.run!.gear.weapon).toBeNull();
  });

  it('favored weapons grant +20% weapon ATK', () => {
    seedRng(2);
    const game = freshGame();
    game.state.run!.klass = 'footman';
    game.state.classesUnlocked.push('footman');

    game.state.run!.gear.weapon = mkWeapon('polearm', 100); // favored by footman
    game.recalc();
    const favoredAtk = game.d.atk;

    game.state.run!.gear.weapon = mkWeapon('heavy', 100); // allowed, not favored
    game.recalc();
    const plainAtk = game.d.atk;

    expect(favoredAtk).toBeGreaterThan(plainAtk);
    // +20% on the weapon's 100 ATK only: (base 5 + 120) vs (base 5 + 100)
    expect(favoredAtk / plainAtk).toBeCloseTo(125 / 105, 4);
  });

  it('an off-class inherited weapon is stowed at summon', () => {
    seedRng(3);
    bus.clear();
    const game = new Game();
    game.state.keptGear.weapon = mkWeapon('bow', 30, 'Heirloom Bow');
    game.tick(100); // summon a wretch
    expect(game.state.run!.gear.weapon).toBeNull();
    expect(game.state.inventory.some((i) => i.name === 'Heirloom Bow')).toBe(true);
  });
});

describe('the satchel', () => {
  it('auto-equip OFF sends loot to the satchel; manual equip swaps', () => {
    seedRng(4);
    const game = freshGame();
    game.state.settings.autoEquip = false;

    const sword = mkWeapon('blade', 20, 'Satchel Sword');
    game.acquireItem(sword);
    expect(game.state.run!.gear.weapon).toBeNull();
    expect(game.state.inventory).toHaveLength(1);

    expect(game.equipFromInventory(0)).toBe(true);
    expect(game.state.run!.gear.weapon?.name).toBe('Satchel Sword');
    expect(game.state.inventory).toHaveLength(0);

    // equipping another weapon swaps the old one back into the satchel
    game.acquireItem(mkWeapon('blade', 5, 'Worse Sword'));
    expect(game.state.inventory).toHaveLength(1);
    const idx = game.state.inventory.findIndex((i) => i.name === 'Worse Sword');
    expect(game.equipFromInventory(idx)).toBe(true);
    expect(game.state.run!.gear.weapon?.name).toBe('Worse Sword');
    expect(game.state.inventory.some((i) => i.name === 'Satchel Sword')).toBe(true);
  });

  it('unequip moves gear to the satchel; salvage pays gold', () => {
    seedRng(5);
    const game = freshGame();
    game.acquireItem(mkWeapon('blade', 20, 'Pawn Sword'));
    expect(game.state.run!.gear.weapon?.name).toBe('Pawn Sword');

    expect(game.unequipSlot('weapon')).toBe(true);
    expect(game.state.run!.gear.weapon).toBeNull();
    expect(game.state.inventory).toHaveLength(1);

    const goldBefore = game.state.gold;
    expect(game.salvageFromInventory(0)).toBe(true);
    expect(game.state.gold).toBeGreaterThan(goldBefore);
    expect(game.state.inventory).toHaveLength(0);
  });

  it('overflow scraps the lowest-scoring item', () => {
    seedRng(6);
    const game = freshGame();
    game.state.settings.autoEquip = false;
    for (let i = 0; i < INVENTORY_CAP; i++) {
      game.acquireItem(mkWeapon('blade', 10 + i, `Filler ${i}`));
    }
    expect(game.state.inventory).toHaveLength(INVENTORY_CAP);

    // a great item displaces the worst (Filler 0, atk 10)
    game.acquireItem(mkWeapon('blade', 999, 'Excalibone'));
    expect(game.state.inventory).toHaveLength(INVENTORY_CAP);
    expect(game.state.inventory.some((i) => i.name === 'Excalibone')).toBe(true);
    expect(game.state.inventory.some((i) => i.name === 'Filler 0')).toBe(false);

    // junk worse than everything is scrapped directly
    game.acquireItem(mkWeapon('blade', 1, 'Pure Junk'));
    expect(game.state.inventory.some((i) => i.name === 'Pure Junk')).toBe(false);
  });

  it('survives death, save round-trips, and is claimed by the reaping', () => {
    seedRng(7);
    const game = freshGame();
    game.state.settings.autoEquip = false;
    game.acquireItem(mkWeapon('blade', 30, 'Persistent Blade'));

    game.retire(); // vessel dies
    expect(game.state.run).toBeNull();
    expect(game.state.inventory.some((i) => i.name === 'Persistent Blade')).toBe(true);

    const revived = new Game(decodeSave(encodeSave(game.serialize())));
    expect(revived.state.inventory.some((i) => i.name === 'Persistent Blade')).toBe(true);

    revived.state.soulsThisReap = 50_000;
    revived.state.bestDepthThisReap = 12;
    expect(revived.doReap()).toBe(true);
    expect(revived.state.inventory).toHaveLength(0);
  });

  it('auto-equip has hysteresis: near-equal items do not flap', () => {
    seedRng(11);
    const game = freshGame();
    game.acquireItem(mkWeapon('blade', 100, 'Incumbent'));
    expect(game.state.run!.gear.weapon?.name).toBe('Incumbent');
    // 3% better — below the 5% hysteresis: stays stashed
    game.acquireItem(mkWeapon('blade', 103, 'Marginal'));
    expect(game.state.run!.gear.weapon?.name).toBe('Incumbent');
    expect(game.state.inventory.some((i) => i.name === 'Marginal')).toBe(true);
    // 10% better — clears the bar: swaps in
    game.acquireItem(mkWeapon('blade', 110, 'Clearly Better'));
    expect(game.state.run!.gear.weapon?.name).toBe('Clearly Better');
  });

  it('auto-scrap below threshold skips the satchel; protected rarities never scrapped', () => {
    seedRng(12);
    const game = freshGame();
    game.state.settings.autoEquip = false;
    game.state.settings.autoSalvageBelow = 2; // scrap common & fine
    game.state.settings.protectRarity = 4;

    const goldBefore = game.state.gold;
    const common: Item = { slot: 'charm', name: 'Junk Ring', rarity: 0, depth: 1, stats: { crit: 1 }, score: 1 };
    game.acquireItem(common);
    expect(game.state.inventory).toHaveLength(0);
    expect(game.state.gold).toBeGreaterThan(goldBefore);

    const rare: Item = { slot: 'charm', name: 'Decent Ring', rarity: 2, depth: 1, stats: { crit: 5 }, score: 6 };
    game.acquireItem(rare);
    expect(game.state.inventory).toHaveLength(1);

    // overflow must scrap unprotected things first, never the legendary
    game.state.inventory = [];
    const legendary: Item = { slot: 'charm', name: 'Protected Relic-Arm', rarity: 5, depth: 1, stats: { crit: 1 }, score: 1 };
    game.acquireItem(legendary); // low score but protected
    for (let i = 0; i < INVENTORY_CAP; i++) {
      game.acquireItem(mkWeapon('blade', 50 + i, `Stuffing ${i}`));
    }
    expect(game.state.inventory.some((i) => i.name === 'Protected Relic-Arm')).toBe(true);

    // salvage-all keeps it too
    game.salvageAllInventory();
    expect(game.state.inventory).toHaveLength(1);
    expect(game.state.inventory[0].name).toBe('Protected Relic-Arm');
  });

  it('new affixes (xpPct, bonePct, dodge) feed derived stats', () => {
    seedRng(13);
    const game = freshGame();
    const base = { xp: game.d.xpMult, bone: game.d.boneMult, dodge: game.d.dodge };
    game.state.run!.gear.charm = {
      slot: 'charm', name: 'Test Memento', rarity: 3, depth: 5,
      stats: { xpPct: 50, bonePct: 40, dodge: 10 }, score: 50,
    };
    game.recalc();
    expect(game.d.xpMult).toBeCloseTo(base.xp * 1.5, 5);
    expect(game.d.boneMult).toBeCloseTo(base.bone * 1.4, 5);
    expect(game.d.dodge).toBe(base.dodge + 10);
  });

  it('protect "nothing" + auto-scrap "everything": even legendaries burn', () => {
    seedRng(14);
    const game = freshGame();
    game.state.settings.autoEquip = false;
    game.state.settings.autoSalvageBelow = 6; // everything
    game.state.settings.protectRarity = 7;    // nothing protected

    const goldBefore = game.state.gold;
    const legendary: Item = {
      slot: 'charm', name: 'Doomed Relic-Arm', rarity: 5, depth: 9,
      stats: { soulPct: 40 }, score: 36,
    };
    game.acquireItem(legendary);
    expect(game.state.inventory).toHaveLength(0); // straight to scrap
    expect(game.state.gold).toBeGreaterThan(goldBefore);

    // salvage-all with protect "nothing" empties the satchel completely
    game.state.settings.autoSalvageBelow = 0;
    game.acquireItem({ ...legendary, name: 'Another Relic-Arm' });
    expect(game.state.inventory).toHaveLength(1);
    game.salvageAllInventory();
    expect(game.state.inventory).toHaveLength(0);
  });

  it('class-biased loot mostly rolls usable weapon kinds', () => {
    seedRng(8);
    let usable = 0;
    let weapons = 0;
    for (let i = 0; i < 600; i++) {
      const item = rollItem(10, 0, 'ranger');
      if (item.slot !== 'weapon') continue;
      weapons++;
      if (kindAllows(item.kind!, 'ranger')) usable++;
    }
    expect(weapons).toBeGreaterThan(100);
    expect(usable / weapons).toBeGreaterThan(0.7);
  });
});
