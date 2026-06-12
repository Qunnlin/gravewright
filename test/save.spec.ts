import { describe, expect, it } from 'vitest';
import { Game, defaultState } from '../src/core/game';
import { encodeSave, decodeSave } from '../src/core/save';
import { seedRng } from '../src/core/rng';

describe('save round-trip', () => {
  it('encode → decode preserves everything that matters', () => {
    seedRng(31337);
    const game = new Game();
    const s = game.state;
    s.souls = 12345.6;
    s.bones = 999;
    s.essence = 7;
    s.lifetimeSouls = 99999;
    s.upgrades = { vigor: 5, haste: 3, eternal: 2 };
    s.achievements = { firstblood: true, depth5: true };
    s.classesUnlocked = ['wretch', 'footman'];
    s.curClass = 'footman';
    s.relics = ['femur', 'chalice'];
    s.reaps = 2;
    s.minions.skeleton = { level: 3, alive: true, hp: 50 };

    const decoded = decodeSave(encodeSave(game.serialize()));
    expect(decoded.souls).toBeCloseTo(12345.6);
    expect(decoded.bones).toBe(999);
    expect(decoded.essence).toBe(7);
    expect(decoded.upgrades).toEqual({ vigor: 5, haste: 3, eternal: 2 });
    expect(decoded.achievements).toEqual({ firstblood: true, depth5: true });
    expect(decoded.classesUnlocked).toEqual(['wretch', 'footman']);
    expect(decoded.curClass).toBe('footman');
    expect(decoded.relics).toEqual(['femur', 'chalice']);
    expect(decoded.minions.skeleton.level).toBe(3);
    expect(decoded.run).toBeNull();

    // the decoded state boots a working game
    const revived = new Game(decoded);
    expect(revived.d.maxHp).toBeGreaterThan(0);
    expect(revived.d.atk).toBeGreaterThan(0);
  });

  it('persists the live run gear as keptGear', () => {
    seedRng(4242);
    const game = new Game();
    // play until a vessel exists
    for (let i = 0; i < 200 && !game.state.run; i++) game.tick(100);
    expect(game.state.run).not.toBeNull();
    game.state.run!.gear.weapon = {
      slot: 'weapon', name: 'Test Cleaver', rarity: 2, depth: 3,
      stats: { atk: 7 }, score: 14,
    };
    const decoded = decodeSave(encodeSave(game.serialize()));
    expect(decoded.keptGear.weapon?.name).toBe('Test Cleaver');
  });

  it('rejects garbage', () => {
    expect(() => decodeSave('not a save')).toThrow();
    expect(() => decodeSave(btoa(JSON.stringify({ hello: 'world' })))).toThrow();
  });

  it('sanitizes corrupted/tampered saves: NaN, over-max levels, unknown ids', () => {
    const evil = {
      v: 1,
      souls: -999999,
      bones: 'NaN-bait',
      gold: Number.NaN,
      lastSeen: 'yesterday',
      upgrades: { vigor: 9999, haste: 999, circle: 50, bogusUpgrade: 3, siphon: 2.7 },
      relics: ['femur', 'definitely-not-a-relic', 'chalice'],
      curses: { iron: true, fakeCurse: true, blood: 'yes' },
      classesUnlocked: ['wretch', 'footman', 'godmode'],
      curClass: 'godmode',
      strategy: 'yolo',
      keptGear: { weapon: { slot: 'weapon', name: 'x', rarity: 99, stats: null } },
      minions: { skeleton: { level: -5, alive: true, hp: Number.NaN } },
    };
    const decoded = decodeSave(btoa(JSON.stringify(evil)));

    expect(decoded.souls).toBe(0);
    expect(decoded.bones).toBe(0);
    expect(decoded.gold).toBe(0);
    expect(typeof decoded.lastSeen).toBe('number');
    expect(Number.isFinite(decoded.lastSeen)).toBe(true);
    expect(decoded.upgrades['vigor']).toBe(9999); // uncapped upgrade: allowed
    expect(decoded.upgrades['haste']).toBe(14); // clamped to max
    expect(decoded.upgrades['circle']).toBe(6); // clamped to max
    expect(decoded.upgrades['bogusUpgrade']).toBeUndefined();
    expect(decoded.upgrades['siphon']).toBe(2); // floored to integer
    expect(decoded.relics).toEqual(['femur', 'chalice']);
    expect(Object.keys(decoded.curses)).toEqual(['iron']);
    expect(decoded.classesUnlocked).toEqual(['wretch', 'footman']);
    expect(decoded.curClass).toBe('wretch');
    expect(decoded.strategy).toBe('balanced');
    expect(decoded.keptGear.weapon).toBeNull();
    expect(decoded.minions.skeleton.level).toBe(0);
    expect(decoded.minions.skeleton.alive).toBe(false);

    // the sanitized state boots and plays with no NaN poisoning
    const game = new Game(decoded);
    for (let i = 0; i < 100; i++) game.tick(100);
    expect(Number.isFinite(game.state.souls)).toBe(true);
    expect(Number.isFinite(game.d.atk)).toBe(true);
  });

  it('merges old/partial saves over defaults (forward compatibility)', () => {
    const partial = { v: 1, souls: 50, totalKills: 3 };
    const decoded = decodeSave(btoa(JSON.stringify(partial)));
    const base = defaultState();
    expect(decoded.souls).toBe(50);
    expect(decoded.totalKills).toBe(3);
    expect(decoded.bones).toBe(base.bones);
    expect(decoded.settings.sound).toBe(base.settings.sound);
    expect(decoded.settings.crtFilter).toBe(false); // new setting defaults off
    expect(decoded.minions.skeleton).toBeDefined();
    expect(decoded.classesUnlocked).toContain('wretch');
  });

  it('coerces the crtFilter setting strictly (default-off vanity)', () => {
    const tampered = { v: 1, settings: { crtFilter: 'yes' } };
    expect(decodeSave(btoa(JSON.stringify(tampered))).settings.crtFilter).toBe(false);
    const enabled = { v: 1, settings: { crtFilter: true } };
    expect(decodeSave(btoa(JSON.stringify(enabled))).settings.crtFilter).toBe(true);
  });

  it('sanitizes relicsSeen: dedupes, drops unknown ids, backfills held relics', () => {
    const raw = {
      v: 1,
      relics: ['femur'],
      relicsSeen: ['chalice', 'chalice', 'not-a-relic', 42],
    };
    const decoded = decodeSave(btoa(JSON.stringify(raw)));
    expect(decoded.relicsSeen.sort()).toEqual(['chalice', 'femur']);
    // pre-relicsSeen saves: held relics count as seen
    const old = { v: 1, relics: ['femur', 'chalice'] };
    expect(decodeSave(btoa(JSON.stringify(old))).relicsSeen.sort())
      .toEqual(['chalice', 'femur']);
  });

  it('clamps the autopilot speed throttle to [0.25, 1]', () => {
    const cases: [unknown, number][] = [
      [undefined, 1], ['fast', 1], [0, 0.25], [Number.NaN, 1],
      [0.1, 0.25], [0.5, 0.5], [5, 1],
    ];
    for (const [v, want] of cases) {
      const decoded = decodeSave(btoa(JSON.stringify({ v: 1, settings: { autoSpeed: v } })));
      expect(decoded.settings.autoSpeed, `autoSpeed ${String(v)}`).toBe(want);
    }
  });

  it('log filter toggles default on and survive round-trips', () => {
    const partial = { v: 1 };
    const d1 = decodeSave(btoa(JSON.stringify(partial)));
    expect(d1.settings.logCombat).toBe(true);
    expect(d1.settings.logLoot).toBe(true);
    expect(d1.settings.logSystem).toBe(true);
    const muted = { v: 1, settings: { logLoot: false, logSystem: 'junk' } };
    const d2 = decodeSave(btoa(JSON.stringify(muted)));
    expect(d2.settings.logLoot).toBe(false);
    expect(d2.settings.logSystem).toBe(true); // junk coerces to the default
  });
});
