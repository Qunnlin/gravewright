/**
 * The GRAVEWRIGHT simulation. Pure logic — no DOM, no canvas, no audio.
 * All side-effects flow out through the event bus.
 */

import {
  TILE,
  type Derived, type GameState, type Gear, type Item, type MinionState,
  type Monster, type RunState, type Slot, type Status, type StatusKind,
  type Strategy,
} from './types';
import * as B from './balance';
import { bus, log } from './events';
import { chance, pick, rndf, rndInt } from './rng';
import {
  DEFAULT_MODS, bfsMap, computeFov, genFloor, genTrialHall, isPassable,
  losClear, nearestWhere, spawnLesser, spawnMonster, type GenMods,
} from './dungeon';
import { rollSetPiece, setById, trialSetFor } from './data/sets';
import { CLASSES, classById } from './data/classes';
import {
  ALL_UPGRADES, BONE_UPGRADES, MINIONS, MINION_LEVEL_STAT_MULT,
  mendCost, minionById, minionLevelCost, upgradeById, type UpgradeDef,
} from './data/upgrades';
import { RELICS, relicById } from './data/relics';
import { enchantById } from './data/enchants';
import { CURSES, curseById } from './data/curses';
import { ACHIEVEMENTS, ACH_SOUL_BONUS } from './data/achievements';
import {
  FAVORED_WEAPON_MULT, kindAllows, kindFavors, rollItem, scoreItem,
} from './data/items';
import { DEATH_LINES, vesselName } from './data/names';
import { fmt } from './format';

const SAVE_VERSION = 1;

const STRATEGIES: Record<Strategy, { explorePct: number; healAt: number; rushStairs: boolean }> = {
  cautious: { explorePct: 0.92, healAt: 0.55, rushStairs: false },
  balanced: { explorePct: 0.72, healAt: 0.4, rushStairs: false },
  reckless: { explorePct: 0.5, healAt: 0.25, rushStairs: true },
};

const DIRS4 = [
  [0, -1], [0, 1], [-1, 0], [1, 0],
] as const;

export function defaultState(): GameState {
  const minions: Record<string, MinionState> = {};
  for (const m of MINIONS) minions[m.id] = { level: 0, alive: false, hp: 0 };
  return {
    v: SAVE_VERSION,
    gold: 0, bones: 0, souls: 0, essence: 0,
    lifetimeSouls: 0, soulsThisReap: 0,
    totalKills: 0, totalDeaths: 0, reaps: 0,
    bestDepth: 0, bestDepthThisReap: 0,
    bossesSlain: 0, shrinesUsed: 0, goldLifetime: 0, relicsFound: 0,
    minionsRaised: 0, championsSlain: 0, wardensSlain: 0, legendariesFound: 0,
    trialsSeen: 0, trialsWon: 0, trialsFailed: 0, trialPending: false,
    upgrades: {},
    minions,
    achievements: {},
    classesUnlocked: ['wretch'],
    curClass: 'wretch',
    strategy: 'balanced',
    curses: {},
    relics: [],
    keptGear: { weapon: null, armor: null, charm: null },
    inventory: [],
    run: null,
    summonCd: 0,
    // the autopilot is earned, not given — fresh games play manually until
    // the crypt has tasted a death (or depth 10); see autoUnlocked()
    auto: false,
    tutorial: {},
    rates: { souls: 0, bones: 0 },
    lastSeen: Date.now(),
    settings: {
      sound: true, autoBuyBones: true, particles: true,
      autoEquip: true, autoSalvageBelow: 0, protectRarity: 4,
      buyAmount: 1, autoMend: false, protectVestiges: true, ravenousActive: true,
    },
  };
}

export class Game {
  state: GameState;
  d: Derived;

  /** Human-readable description of the AI's current intent (for the HUD). */
  goal = 'Stirring…';

  /** Dev-room god mode: the vessel takes no damage. Never persisted. */
  devInvulnerable = false;

  private actAcc = 0;
  private autoBuyAcc = 0;
  private rateAcc = 0;
  private windowSouls = 0;
  private windowBones = 0;

  constructor(state?: GameState) {
    this.state = state ?? defaultState();
    if (!this.autoUnlocked()) this.state.auto = false;
    this.d = this.recalc();
  }

  /** The autopilot awakens after the first death (or reaching depth 10). */
  autoUnlocked(): boolean {
    return this.state.totalDeaths >= 1 || this.state.bestDepth >= 10;
  }

  /** Souls this vessel would pay out if it died right now (all multipliers). */
  deathYield(): number {
    const run = this.state.run;
    if (!run) return 0;
    return B.soulsOnDeath(run.depth, run.kills) *
      this.d.soulMult * this.curseMult('soulMult');
  }

  /** ---------------- derived stats ---------------- */

  private lvl(id: string): number {
    return this.state.upgrades[id] ?? 0;
  }

  private eff(id: string): number {
    const def = upgradeById(id);
    return def ? def.eff(this.lvl(id)) : 0;
  }

  recalc(): Derived {
    const s = this.state;
    const klass = classById(s.run?.klass ?? s.curClass);
    const gear: Gear = s.run?.gear ?? s.keptGear;
    const level = s.run?.level ?? 1;
    const levelMult = Math.pow(B.LEVEL_STAT_MULT, level - 1);

    const gearStat = (k: keyof NonNullable<Item['stats']>): number =>
      (['weapon', 'armor', 'charm'] as const).reduce(
        (sum, slot) => sum + (gear[slot]?.stats[k] ?? 0), 0);

    const achCount = Object.keys(s.achievements).length;
    const relics = s.relics.map(relicById).filter((r) => r !== undefined);
    const rmul = (k: 'soulMult' | 'boneMult' | 'goldMult' | 'atkMult' | 'hpMult' | 'xpMult' | 'minionMult') =>
      relics.reduce((m, r) => m * (r![k] ?? 1), 1);

    const eternal = Math.max(1, this.eff('eternal'));
    const curseHp = (s.run?.curseIds ?? []).reduce(
      (m, id) => m * (curseById(id)?.heroHpMult ?? 1), 1);

    const houndAlive = s.minions['hound']?.level > 0 && s.minions['hound']?.alive;
    const scavenger = houndAlive ? 1.25 : 1;

    const quick = this.lvl('quickening');
    const hasteCap = 14 + quick * 3;
    const heartBonus = relics.reduce((b, r) => b + (r!.tickBonus ?? 0), 0);

    // vestige set pieces worn, per set id
    const setCount: Record<string, number> = {};
    for (const slot of ['weapon', 'armor', 'charm'] as const) {
      const sid = gear[slot]?.setId;
      if (sid) setCount[sid] = (setCount[sid] ?? 0) + 1;
    }
    const pieces = (id: string) => setCount[id] ?? 0;
    const airgap = pieces('genugate') >= 3;
    const choirMinion = pieces('regalia') >= 3 ? 2 : pieces('regalia') >= 2 ? 1.35 : 1;
    const choirSouls = pieces('regalia') >= 3 ? 1.4 : 1;
    const vigil2 = pieces('vigil') >= 2;
    const vigil3 = pieces('vigil') >= 3;
    const watch2 = pieces('longwatch') >= 2;
    const watch3 = pieces('longwatch') >= 3;
    const gild2 = pieces('tithegilded') >= 2;
    const gild3 = pieces('tithegilded') >= 3;

    // every worn vestige piece carries a unique power
    const powers: string[] = [];
    for (const slot of ['weapon', 'armor', 'charm'] as const) {
      const it = gear[slot];
      if (!it?.setId) continue;
      const piece = setById(it.setId)?.pieces.find((pp) => pp.slot === slot);
      if (piece) powers.push(piece.powerId);
    }

    const d: Derived = {
      maxHp: Math.max(1, Math.round(
        (B.HERO_BASE_HP) *
        Math.max(1, this.eff('vigor')) *
        klass.hpMult * eternal * levelMult * rmul('hpMult') *
        (1 + gearStat('hpPct') / 100) * curseHp,
      )),
      atk: (() => {
        // favored weapon archetypes strike 20% harder in the right hands
        const rawWeaponAtk = gear.weapon?.stats.atk ?? 0;
        const favored = gear.weapon?.kind !== undefined &&
          kindFavors(gear.weapon.kind, klass.id);
        const weaponAtk = rawWeaponAtk * (favored ? FAVORED_WEAPON_MULT : 1);
        const otherAtk = gearStat('atk') - rawWeaponAtk;
        return (B.HERO_BASE_ATK + weaponAtk + otherAtk) *
          Math.max(1, this.eff('ferocity')) *
          klass.atkMult * eternal * levelMult * rmul('atkMult');
      })(),
      def:
        (B.HERO_BASE_DEF + gearStat('def') + this.eff('bulwark')) *
        Math.max(1, this.eff('soularmor')),
      crit: Math.min(95,
        B.HERO_BASE_CRIT + this.eff('sharpbone') + (klass.crit ?? 0) +
        relics.reduce((b, r) => b + (r!.crit ?? 0), 0) + gearStat('crit') +
        (powers.includes('deadeye') ? 20 : 0)),
      critDmg: watch2 ? 2.4 : B.HERO_BASE_CRITDMG,
      vision: Math.min(12,
        B.HERO_BASE_VISION + this.eff('insight') +
        relics.reduce((b, r) => b + (r!.vision ?? 0), 0)),
      tickRate:
        B.HERO_BASE_TICKRATE + quick + Math.min(this.lvl('haste'), hasteCap) +
        heartBonus + (powers.includes('fleetfoot') ? 1 : 0),
      goldMult:
        Math.max(1, this.eff('fortune')) * Math.max(1, this.eff('greed')) *
        rmul('goldMult') * (1 + gearStat('goldPct') / 100) * scavenger *
        (gild3 ? 2.2 : gild2 ? 1.5 : 1),
      soulMult:
        Math.max(1, this.eff('siphon')) * Math.max(1, this.eff('conduit')) *
        (1 + achCount * ACH_SOUL_BONUS) * (klass.soulMult ?? 1) *
        rmul('soulMult') * (1 + gearStat('soulPct') / 100) * choirSouls,
      boneMult:
        Math.max(1, this.eff('ossuary')) * rmul('boneMult') * scavenger *
        (1 + gearStat('bonePct') / 100),
      xpMult: rmul('xpMult') * (1 + gearStat('xpPct') / 100),
      lifesteal: gearStat('lifesteal'),
      regen: gearStat('regen'),
      healOnKill: this.eff('hunger') + (klass.healOnKill ?? 0),
      keepGearChance: Math.min(95,
        this.eff('reliquary') + relics.reduce((b, r) => b + (r!.keepGear ?? 0), 0)),
      marrowPct: this.eff('marrow') * (gild3 ? 2 : 1),
      dodge: Math.min(60,
        (klass.dodge ?? 0) + gearStat('dodge') + (pieces('genugate') >= 2 ? 15 : 0) +
        (watch3 ? 20 : 0)),
      blockPct: (klass.blockPct ?? 0) + (vigil2 ? 10 : 0),
      startDepth: 1 + this.eff('memory'),
      // eff('circle') is the cooldown itself (12000 at level 0, 0 at max) —
      // do NOT use || here, 0 means "instant" and is a valid value
      summonCdMax: this.eff('circle'),
      minionAtkMult: (klass.minionMult ?? 1) * rmul('minionMult') * choirMinion,
      minionHpMult: rmul('minionMult') * choirMinion,
      shrinesFree: relics.some((r) => r!.shrinesFree) || (klass.shrinesFree ?? false),
      rangedAttack: klass.ranged ?? false,
      berserk: klass.berserk ?? false,
      negateChance: airgap ? 25 : 0,
      dotImmune: airgap,
      lowHpAtk: vigil3 ? 0.6 : 0,
      oathstone: vigil3,
      fullHpAtk: watch3 ? 0.6 : 0,
      thiefProof: powers.includes('leastpriv') || (klass.thiefProof ?? false),
      powers,
    };

    // hp delta on max increase; clamp minion hp
    const run = s.run;
    if (run) {
      const prev = this.d?.maxHp ?? d.maxHp;
      if (d.maxHp > prev) run.hp += d.maxHp - prev;
      run.hp = Math.min(run.hp, d.maxHp);
    }
    for (const m of MINIONS) {
      const st = s.minions[m.id];
      if (st && st.level > 0) st.hp = Math.min(st.hp, this.minionMaxHp(m.id, d));
    }

    this.d = d;
    return d;
  }

  minionMaxHp(id: string, d: Derived = this.d): number {
    const def = minionById(id);
    const st = this.state.minions[id];
    if (!def || !st || st.level === 0) return 0;
    return Math.max(1, Math.round(
      d.maxHp * def.hpFrac *
      Math.pow(MINION_LEVEL_STAT_MULT, st.level - 1) * d.minionHpMult));
  }

  minionAtk(id: string, d: Derived = this.d): number {
    const def = minionById(id);
    const st = this.state.minions[id];
    if (!def || !st || st.level === 0) return 0;
    return d.atk * def.atkFrac *
      Math.pow(MINION_LEVEL_STAT_MULT, st.level - 1) * d.minionAtkMult;
  }

  /** ---------------- currency awards ---------------- */

  private curseMult(kind: 'soulMult' | 'goldMult'): number {
    const ids = this.state.run?.curseIds ?? [];
    return ids.reduce((m, id) => {
      const c = curseById(id);
      if (!c) return m;
      const v = kind === 'soulMult' ? c.soulMult : (c.goldMult ?? 1);
      return m * v;
    }, 1);
  }

  gainSouls(base: number, raw = false): number {
    const v = raw ? base : base * this.d.soulMult * this.curseMult('soulMult');
    const s = this.state;
    s.souls += v;
    s.soulsThisReap += v;
    s.lifetimeSouls += v;
    this.windowSouls += v;
    return v;
  }

  gainBones(base: number, raw = false): number {
    const v = raw ? base : base * this.d.boneMult;
    this.state.bones += v;
    this.windowBones += v;
    return v;
  }

  gainGold(base: number, raw = false): number {
    const v = raw ? base : base * this.d.goldMult * this.curseMult('goldMult');
    this.state.gold += v;
    this.state.goldLifetime += v;
    return v;
  }

  /** ---------------- vessel lifecycle ---------------- */

  /** Current Crypt Wrath multiplier (applies to newly generated floors). */
  wrath(): number {
    return B.cryptWrath(this.state.soulsThisReap);
  }

  private genMods(curseIds: string[]): GenMods {
    const mods: GenMods = { ...DEFAULT_MODS };
    for (const id of curseIds) {
      const c = curseById(id);
      if (!c) continue;
      mods.monsterHpMult *= c.monsterHpMult ?? 1;
      mods.monsterAtkMult *= c.monsterAtkMult ?? 1;
      mods.monsterCountMult *= c.monsterCountMult ?? 1;
    }
    const wrath = this.wrath();
    mods.monsterHpMult *= wrath;
    mods.monsterAtkMult *= wrath;
    return mods;
  }

  summon(): void {
    const s = this.state;
    if (s.run) return;
    if (!s.classesUnlocked.includes(s.curClass)) s.curClass = 'wretch';

    const curseIds = Object.keys(s.curses).filter((id) => s.curses[id]);
    const depth = 1 + this.eff('memory');
    const floor = genFloor(depth, this.genMods(curseIds), this.rollTrial(depth));

    const run: RunState = {
      depth,
      heroName: vesselName(),
      klass: s.curClass,
      level: 1,
      xp: 0,
      hp: 1, // set after recalc
      gear: s.keptGear,
      statuses: [],
      kills: 0,
      turn: 0,
      floor,
      blessTurns: 0,
      curseIds,
      manualTarget: null,
      trialActive: null,
      oathUsed: false,
      shrinesThisRun: 0,
      lastHitTurn: 0,
    };
    s.keptGear = { weapon: null, armor: null, charm: null };
    s.run = run;
    if (depth > s.bestDepth) s.bestDepth = depth;
    if (depth > s.bestDepthThisReap) s.bestDepthThisReap = depth;

    // a vessel that cannot wield the inherited weapon stows it instead
    const w = run.gear.weapon;
    if (w && !this.canEquip(w, run.klass)) {
      run.gear.weapon = null;
      log(`${run.heroName} cannot wield the ${w.name}.`, 'item');
      this.stash(w);
    }

    this.trail = [];
    this.recalc();
    run.hp = this.d.maxHp;

    // raise the dead
    for (const m of MINIONS) {
      const st = s.minions[m.id];
      if (st && st.level > 0) {
        if (!st.alive) s.minionsRaised++;
        st.alive = true;
        st.hp = this.minionMaxHp(m.id);
      }
    }

    computeFov(floor, floor.entry.x, floor.entry.y, this.d.vision);
    if (classById(run.klass).revealMap) floor.seen.fill(1);
    Object.assign(this.heroPos, floor.entry);
    bus.emit({ type: 'summon', name: run.heroName, klass: run.klass });
    log(`☥ ${run.heroName} shuffles into the crypt (depth ${depth}).`, 'summon');
    if (floor.isBossFloor) {
      const boss = floor.monsters.find((m) => m.boss);
      if (boss) {
        bus.emit({ type: 'boss', name: boss.name });
        log(`☠ Something old is awake here: ${boss.name}.`, 'boss');
      }
    }
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
  }

  /** Hero position lives outside RunState for cheap access; synced to floor.entry on spawn. */
  heroPos = { x: 0, y: 0 };

  /** Recent tiles the hero vacated — the procession marches along these. */
  trail: { x: number; y: number }[] = [];

  private pushTrail(): void {
    this.trail.unshift({ x: this.heroPos.x, y: this.heroPos.y });
    if (this.trail.length > 8) this.trail.pop();
  }

  /** Whether the next floor bears a Sealed Hall. */
  private rollTrial(depth: number): boolean {
    const s = this.state;
    if (depth % 5 === 0) return false; // never on boss floors
    let want = false;
    if (s.trialPending) want = true;
    else if (s.trialsSeen === 0 && depth >= B.TRIAL_GUARANTEE_DEPTH) want = true;
    else if (depth >= B.TRIAL_MIN_DEPTH && chance(B.TRIAL_CHANCE)) want = true;
    if (want) {
      s.trialPending = false;
      s.trialsSeen++;
    }
    return want;
  }

  /** A floor "cannot resist" when the vessel out-damages its wrath-scaled
   *  monsters by RAVENOUS_OVERKILL — Ravenous Descent collapses it. */
  private overpowered(depth: number): boolean {
    const run = this.state.run;
    if (!run) return false;
    const mods = this.genMods(run.curseIds);
    return this.d.atk >= B.RAVENOUS_OVERKILL * B.monsterHp(depth) * mods.monsterHpMult;
  }

  descend(): void {
    const s = this.state;
    const run = s.run;
    if (!run) return;

    // Ravenous Descent: depths that cannot resist are skipped before they are
    // even generated (vaults fall with them); bosses and Sealed Halls always
    // stand their ground. Never skips while a trial rages.
    if (this.lvl('ravenous') > 0 && this.state.settings.ravenousActive && !run.trialActive) {
      let skipped = 0;
      let goldScraps = 0;
      let boneScraps = 0;
      let guard = 0;
      while (guard++ < 40) {
        const next = run.depth + 1;
        if (next % 5 === 0) break; // bosses stand their ground
        if (s.trialPending) break; // a sealed hall waits below
        if (s.trialsSeen === 0 && next >= B.TRIAL_GUARANTEE_DEPTH) break;
        if (!this.overpowered(next)) break;
        // a hall may reveal itself mid-fall — the chain stops above it
        if (next >= B.TRIAL_MIN_DEPTH && chance(B.TRIAL_CHANCE)) {
          s.trialPending = true;
          break;
        }
        run.depth = next;
        skipped++;
        goldScraps += B.goldPile(next) * 3;
        boneScraps += B.bonePile(next) * 2 + B.boneDrop(next, 1) * 4;
      }
      if (skipped > 0) {
        const gold = this.gainGold(goldScraps);
        const bones = this.gainBones(boneScraps);
        log(`≫ ${skipped} depth${skipped === 1 ? '' : 's'} offer${skipped === 1 ? 's' : ''} no resistance. Their scraps are tributed (+${fmt(gold)} gold, +${fmt(bones)} bones).`, 'descend');
      }
    }

    this.descendOnce();
  }

  private descendOnce(): void {
    const s = this.state;
    const run = s.run;
    if (!run) return;

    // descending mid-trial is flight — the Hall keeps the wager
    if (run.trialActive) this.failTrial('fled');

    run.depth++;
    if (run.depth > s.bestDepth) s.bestDepth = run.depth;
    if (run.depth > s.bestDepthThisReap) s.bestDepthThisReap = run.depth;
    run.floor = genFloor(run.depth, this.genMods(run.curseIds), this.rollTrial(run.depth));
    Object.assign(this.heroPos, run.floor.entry);
    this.trail = [];
    run.oathUsed = false;
    run.manualTarget = null;
    run.hp = Math.min(this.d.maxHp, run.hp + Math.round(this.d.maxHp * 0.15));
    computeFov(run.floor, this.heroPos.x, this.heroPos.y, this.d.vision);
    if (classById(run.klass).revealMap) run.floor.seen.fill(1);
    bus.emit({ type: 'descend', depth: run.depth });
    log(`▼ Depth ${run.depth}. The air forgets warmth.`, 'descend');
    // the riddle of the Sealed Hall, murmured rarely
    if (run.depth >= 10 && chance(0.03)) {
      log('The crypt murmurs: three blessings in one life unseal a hall…', 'mystic');
    } else if (chance(0.004)) {
      log('Somewhere far above, a hackathon ends. The code remains.', 'mystic');
    }
    if (run.floor.isBossFloor) {
      const boss = run.floor.monsters.find((m) => m.boss);
      if (boss) {
        bus.emit({ type: 'boss', name: boss.name });
        log(`☠ Something old is awake here: ${boss.name}.`, 'boss');
      }
    }
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
  }

  /** The Hall keeps its wager: forfeit souls, clear the trial. */
  private failTrial(how: 'died' | 'fled'): void {
    const s = this.state;
    const run = s.run;
    if (!run?.trialActive) return;
    run.trialActive = null;
    s.trialsFailed++;
    const forfeit = s.souls * B.TRIAL_FORFEIT;
    s.souls -= forfeit;
    // the trial's spawn are unmade with the wager
    run.floor.monsters = run.floor.monsters.filter((m) => !m.trial);
    bus.emit({ type: 'trialResult', won: false });
    bus.emit({ type: 'flash', color: '#aa0022' });
    bus.emit({ type: 'sound', name: 'death' });
    log(
      how === 'fled'
        ? `◈ You flee the Sealed Hall. It keeps ${fmt(forfeit)} souls for the insult.`
        : `◈ The Hall claims its wager: ${fmt(forfeit)} souls are forfeit.`,
      'death',
    );
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
  }

  private die(retired = false): void {
    const s = this.state;
    const run = s.run;
    if (!run) return;

    // dying mid-trial: the wager is lost AND the death pays nothing
    const inTrial = run.trialActive !== null;
    if (inTrial) this.failTrial('died');

    const factor = inTrial ? 0 : retired ? 0.6 : 1;
    const souls = factor > 0
      ? this.gainSouls(B.soulsOnDeath(run.depth, run.kills) * factor)
      : 0;

    // marrow memory: gold -> bones
    if (this.d.marrowPct > 0 && s.gold > 0) {
      const conv = s.gold * this.d.marrowPct;
      this.gainBones(conv, true);
      log(`The crypt digests ${fmt(conv)} bones from the vessel's purse.`, 'bones');
    }
    s.gold = 0;

    // gear retention
    const kept: Gear = { weapon: null, armor: null, charm: null };
    for (const slot of ['weapon', 'armor', 'charm'] as const) {
      const item = run.gear[slot];
      if (item && chance(this.d.keepGearChance / 100)) {
        kept[slot] = item;
        log(`✦ ${item.name} survives its bearer.`, 'item');
      }
    }
    s.keptGear = kept;

    s.totalDeaths++;
    s.run = null;
    s.summonCd = this.d.summonCdMax;
    this.actAcc = 0;

    // the first death awakens the autopilot — the engine starts here
    if (s.totalDeaths === 1 && !s.auto) {
      s.auto = true;
      log('⚙ The autopilot awakens. Vessels now act on their own (P to pause).', 'mystic');
    }

    bus.emit({
      type: 'death',
      name: run.heroName, depth: run.depth, souls, kills: run.kills,
    });
    log(
      retired
        ? `✝ ${run.heroName} is reclaimed at depth ${run.depth}. +${fmt(souls)} souls.`
        : `✝ ${run.heroName} dies at depth ${run.depth}. +${fmt(souls)} souls. ${pick(DEATH_LINES)}`,
      'death',
    );
    this.recalc();
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
  }

  /** Voluntarily reclaim the vessel for 60% of its death-souls. */
  retire(): void {
    if (this.state.run) this.die(true);
  }

  /** ---------------- main tick ---------------- */

  tick(dtMs: number): void {
    const s = this.state;
    dtMs = Math.min(dtMs, 2000);

    if (!s.run) {
      s.summonCd -= dtMs;
      if (s.summonCd <= 0) {
        s.summonCd = 0;
        this.summon();
      }
    } else if (s.auto || s.run.manualTarget) {
      this.actAcc += dtMs;
      const per = 1000 / this.d.tickRate;
      let guard = 30;
      while (this.actAcc >= per && this.state.run && guard-- > 0) {
        this.actAcc -= per;
        this.heroAct();
      }
      if (this.actAcc > per * 3) this.actAcc = per * 3;
    }

    // bone automaton & auto-mend
    this.autoBuyAcc += dtMs;
    if (this.autoBuyAcc >= 2500) {
      this.autoBuyAcc = 0;
      if (s.settings.autoMend && s.run && this.lvl('sexton') > 0) {
        for (const m of MINIONS) {
          const st = s.minions[m.id];
          if (st && st.level > 0 && !st.alive) this.mendMinion(m.id);
        }
      }
      if (s.settings.autoBuyBones && this.lvl('automaton') > 0) {
        let bought = 0;
        for (let i = 0; i < 5; i++) {
          const cheapest = BONE_UPGRADES
            .filter((u) => this.lvl(u.id) < u.max)
            .sort((a, b) => this.cost(a) - this.cost(b))[0];
          if (cheapest && s.bones >= this.cost(cheapest)) {
            this.buyUpgrade(cheapest.id, true);
            bought++;
          } else break;
        }
        if (bought > 0) bus.emit({ type: 'dirty' });
      }
    }

    // earn-rate EMA for offline progress (30s windows -> per minute)
    this.rateAcc += dtMs;
    if (this.rateAcc >= 30000) {
      this.rateAcc = 0;
      s.rates.souls = s.rates.souls * 0.6 + this.windowSouls * 2 * 0.4;
      s.rates.bones = s.rates.bones * 0.6 + this.windowBones * 2 * 0.4;
      this.windowSouls = 0;
      this.windowBones = 0;
    }
  }

  /** ---------------- hero turn ---------------- */

  heroAct(): void {
    const s = this.state;
    const run = s.run;
    if (!run) return;
    const floor = run.floor;
    const { x: hx, y: hy } = this.heroPos;
    run.turn++;

    // status effects
    if (this.tickStatuses()) return; // died to dot

    // regen
    const klass = classById(run.klass);
    let regen = this.d.regen + (klass.regen ? this.d.maxHp * klass.regen / 100 : 0);
    if (this.d.powers.includes('unbroken') && run.hp < this.d.maxHp / 2) {
      regen += this.d.maxHp * 0.015; // Bastion of the Ninth Vault
    }
    if (regen > 0 && run.hp < this.d.maxHp) {
      run.hp = Math.min(this.d.maxHp, run.hp + regen);
    }

    const dist = bfsMap(floor, hx, hy);

    let acted = false;

    // 1. adjacent monster -> melee
    const adj = this.adjacentMonsters();
    if (adj.length > 0) {
      const target = adj.reduce((a, b) => (a.hp < b.hp ? a : b));
      this.goal = `Fighting ${target.name}`;
      this.heroAttack(target);
      acted = true;
    }

    // 2. ranged class attack
    if (!acted && this.d.rangedAttack) {
      const target = this.rangedTarget();
      if (target) {
        this.goal = `Shooting ${target.name}`;
        this.heroAttack(target);
        acted = true;
      }
    }

    // 3. movement toward a goal
    if (!acted && this.state.run) {
      const step = this.pickDestination(dist);
      if (step) {
        const m = floor.monsters.find((mm) => mm.x === step.x && mm.y === step.y && mm.hp > 0);
        if (m) {
          this.heroAttack(m);
        } else {
          this.pushTrail();
          this.heroPos.x = step.x;
          this.heroPos.y = step.y;
          this.enterTile(step.x, step.y);
        }
        acted = true;
      } else {
        this.goal = 'Waiting…';
      }
    }

    if (!this.state.run) return; // died or descended into nothing

    // blessing burns down after the action so all granted turns benefit
    if (this.state.run.blessTurns > 0) this.state.run.blessTurns--;

    computeFov(this.state.run.floor, this.heroPos.x, this.heroPos.y, this.d.vision);
    this.monstersAct();
    if (this.state.run) {
      this.trialTick();
      this.checkLevelUp();
    }
  }

  private tickStatuses(): boolean {
    const run = this.state.run!;
    for (const st of run.statuses) {
      if ((st.kind === 'poison' || st.kind === 'burn') && !this.devInvulnerable) {
        run.hp -= st.power;
        bus.emit({
          type: 'float', x: this.heroPos.x, y: this.heroPos.y,
          text: `-${fmt(st.power)}`, color: st.kind === 'poison' ? '#7fdd6a' : '#ff8844',
        });
      }
      st.turns--;
    }
    run.statuses = run.statuses.filter((st) => st.turns > 0);
    return this.lethalCheck();
  }

  /** Apply a would-be death; Last Vigil's full set survives one per floor.
   *  Returns true if the vessel actually died. */
  private lethalCheck(): boolean {
    const run = this.state.run;
    if (!run || run.hp > 0) return false;
    if (this.d.oathstone && !run.oathUsed) {
      run.oathUsed = true;
      // the Oath-Knot turns refusal into a counter-charge
      if (this.d.powers.includes('laststand')) {
        run.hp = Math.max(1, Math.round(this.d.maxHp * 0.3));
        run.blessTurns = Math.max(run.blessTurns, 25);
        log('☩ LAST STAND: the Oath refuses the blow — the vessel rises, blessed.', 'shrine');
      } else {
        run.hp = 1;
        log('☩ The Last Vigil holds the door: the killing blow is refused.', 'shrine');
      }
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: 'THE OATH HOLDS', color: '#ffee88',
      });
      bus.emit({ type: 'sound', name: 'shrine' });
      return false;
    }
    this.die();
    return true;
  }

  private adjacentMonsters(): Monster[] {
    const run = this.state.run!;
    return run.floor.monsters.filter(
      (m) => m.hp > 0 &&
        Math.abs(m.x - this.heroPos.x) + Math.abs(m.y - this.heroPos.y) === 1,
    );
  }

  private rangedTarget(): Monster | null {
    const run = this.state.run!;
    const { x: hx, y: hy } = this.heroPos;
    let best: Monster | null = null;
    let bestD = 99;
    for (const m of run.floor.monsters) {
      if (m.hp <= 0) continue;
      const d = Math.abs(m.x - hx) + Math.abs(m.y - hy);
      if (d <= 3 && d < bestD &&
          run.floor.visible[m.y * run.floor.w + m.x] &&
          losClear(run.floor, hx, hy, m.x, m.y)) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  /** Choose where to walk; returns next step or null. */
  private pickDestination(dist: Int16Array): { x: number; y: number } | null {
    const run = this.state.run!;
    const floor = run.floor;
    const strat = STRATEGIES[this.state.strategy];
    const hpFrac = run.hp / this.d.maxHp;

    // manual override
    if (run.manualTarget) {
      const t = run.manualTarget;
      if (t.x === this.heroPos.x && t.y === this.heroPos.y) {
        run.manualTarget = null;
      } else {
        const step = this.firstStep(dist, t.x, t.y);
        if (step) {
          this.goal = 'Following orders';
          return step;
        }
        run.manualTarget = null;
      }
    }

    // shrine when hurt
    const shrine = floor.shrine;
    if (
      shrine && !shrine.used && hpFrac < strat.healAt &&
      floor.seen[shrine.y * floor.w + shrine.x] &&
      (this.d.shrinesFree || this.state.gold >= B.shrineCost(run.depth))
    ) {
      const step = this.firstStep(dist, shrine.x, shrine.y);
      if (step) {
        this.goal = 'Seeking the shrine';
        return step;
      }
    }

    // visible loot (and the soul well)
    let lootBest: { x: number; y: number; d: number } | null = null;
    for (const it of floor.items) {
      const i = it.y * floor.w + it.x;
      if (!floor.seen[i]) continue;
      const d = dist[i];
      if (d > 0 && (lootBest === null || d < lootBest.d)) lootBest = { x: it.x, y: it.y, d };
    }
    if (floor.well && !floor.well.used) {
      const i = floor.well.y * floor.w + floor.well.x;
      if (floor.seen[i] && dist[i] > 0 && (lootBest === null || dist[i] < lootBest.d)) {
        lootBest = { x: floor.well.x, y: floor.well.y, d: dist[i] };
      }
    }

    // awake monsters: meet them head-on
    let monBest: { x: number; y: number; d: number } | null = null;
    for (const m of floor.monsters) {
      if (m.hp <= 0 || !m.awake) continue;
      const d = dist[m.y * floor.w + m.x];
      if (d > 0 && (monBest === null || d < monBest.d)) monBest = { x: m.x, y: m.y, d };
    }

    if (monBest && (lootBest === null || monBest.d <= lootBest.d)) {
      const step = this.firstStep(dist, monBest.x, monBest.y);
      if (step) {
        this.goal = 'Hunting';
        return step;
      }
    }
    if (lootBest) {
      const step = this.firstStep(dist, lootBest.x, lootBest.y);
      if (step) {
        this.goal = 'Looting';
        return step;
      }
    }

    // explore or descend
    const exploredFrac = this.exploredFrac();
    const stairsSeen = floor.seen[floor.stairs.y * floor.w + floor.stairs.x] === 1;
    const wantStairs =
      (strat.rushStairs && stairsSeen) ||
      exploredFrac >= strat.explorePct ||
      this.noUnseenReachable(dist);

    if (wantStairs && stairsSeen) {
      if (this.heroPos.x === floor.stairs.x && this.heroPos.y === floor.stairs.y) {
        this.goal = 'Descending';
        this.descend();
        return null;
      }
      const step = this.firstStep(dist, floor.stairs.x, floor.stairs.y);
      if (step) {
        this.goal = 'Descending';
        return step;
      }
    }

    // explore nearest unseen tile
    const unseen = nearestWhere(floor, dist, (x, y, i) =>
      floor.seen[i] === 0 && floor.tiles[i] !== TILE.WALL);
    if (unseen) {
      const step = this.firstStep(dist, unseen.x, unseen.y);
      if (step) {
        this.goal = 'Exploring';
        return step;
      }
    }

    // nothing else: stand on stairs if known
    if (stairsSeen) {
      if (this.heroPos.x === floor.stairs.x && this.heroPos.y === floor.stairs.y) {
        this.goal = 'Descending';
        this.descend();
        return null;
      }
      const step = this.firstStep(dist, floor.stairs.x, floor.stairs.y);
      if (step) {
        this.goal = 'Descending';
        return step;
      }
    }
    return null;
  }

  exploredFrac(): number {
    const f = this.state.run?.floor;
    if (!f) return 0;
    let seen = 0;
    for (let i = 0; i < f.tiles.length; i++) {
      if (f.tiles[i] !== TILE.WALL && f.seen[i]) seen++;
    }
    return seen / Math.max(1, f.floorTileCount);
  }

  private noUnseenReachable(dist: Int16Array): boolean {
    const f = this.state.run!.floor;
    for (let i = 0; i < f.tiles.length; i++) {
      if (f.tiles[i] !== TILE.WALL && !f.seen[i] && dist[i] > 0) return false;
    }
    return true;
  }

  /** First step from hero toward (tx,ty), walking a hero-rooted BFS field downhill. */
  private firstStep(dist: Int16Array, tx: number, ty: number): { x: number; y: number } | null {
    const f = this.state.run!.floor;
    let x = tx;
    let y = ty;
    let d = dist[y * f.w + x];
    if (d <= 0) return null;
    let guard = f.w * f.h;
    while (d > 1 && guard-- > 0) {
      let moved = false;
      for (const [ox, oy] of DIRS4) {
        const nx = x + ox;
        const ny = y + oy;
        if (!isPassable(f, nx, ny)) continue;
        const nd = dist[ny * f.w + nx];
        if (nd === d - 1) {
          x = nx; y = ny; d = nd; moved = true;
          break;
        }
      }
      if (!moved) return null;
    }
    return { x, y };
  }

  /** Handle stepping onto a tile: loot, shrine, well. (Stairs require intent.) */
  private enterTile(x: number, y: number): void {
    const s = this.state;
    const run = s.run!;
    const floor = run.floor;
    const i = y * floor.w + x;

    // ground items
    const here = floor.items.filter((it) => it.x === x && it.y === y);
    for (const it of here) {
      if (it.kind === 'gold') {
        const v = this.gainGold(it.amount);
        bus.emit({ type: 'float', x, y, text: `+${fmt(v)}g`, color: '#ffd700' });
        bus.emit({ type: 'sound', name: 'gold' });
      } else if (it.kind === 'bones') {
        const v = this.gainBones(it.amount);
        bus.emit({ type: 'float', x, y, text: `+${fmt(v)}♅`, color: '#d8d0b8' });
        bus.emit({ type: 'sound', name: 'bones' });
      } else if (it.kind === 'potion') {
        const heal = Math.round(this.d.maxHp * 0.35);
        run.hp = Math.min(this.d.maxHp, run.hp + heal);
        bus.emit({ type: 'float', x, y, text: `+${fmt(heal)}♥`, color: '#ff6688' });
        bus.emit({ type: 'sound', name: 'heal' });
        log('A dusty draught. Probably medicinal.', 'item');
      } else if (it.kind === 'chest') {
        this.openChest(x, y, it.special === true);
      }
    }
    if (here.length > 0) {
      floor.items = floor.items.filter((it) => !(it.x === x && it.y === y));
    }

    // shrine
    if (floor.tiles[i] === TILE.SHRINE && floor.shrine && !floor.shrine.used) {
      const cost = this.d.shrinesFree ? 0 : Math.ceil(
        B.shrineCost(run.depth) * (this.d.powers.includes('leastpriv') ? 0.5 : 1));
      if (run.hp < this.d.maxHp && s.gold >= cost) {
        s.gold -= cost;
        run.hp = this.d.maxHp;
        run.blessTurns = 25;
        floor.shrine.used = true;
        s.shrinesUsed++;
        run.shrinesThisRun++;
        // the Ledgerstone: every payment returns 150% of its cost in bones
        if (cost > 0 && this.d.powers.includes('usury')) {
          const refund = this.gainBones(cost * 1.5, true);
          log(`The Ledgerstone compounds: +${fmt(refund)} bones.`, 'bones');
        }
        bus.emit({ type: 'sound', name: 'shrine' });
        bus.emit({ type: 'float', x, y, text: 'BLESSED', color: '#ffee88' });
        log(cost > 0
          ? `The shrine takes ${fmt(cost)} gold and gives back tomorrow. Healed & blessed.`
          : 'The shrine recognizes your ledger. Healed & blessed, gratis.', 'shrine');
        // the ritual: three blessings in one life unseal a hall
        if (run.shrinesThisRun === 3 && !s.trialPending) {
          s.trialPending = true;
          bus.emit({ type: 'sound', name: 'well' });
          log('Somewhere below, a seal grinds open.', 'mystic');
        }
        this.checkAchievements();
      }
    }

    // trial shrine: offer the wager (always the player's choice, never auto)
    if (
      floor.tiles[i] === TILE.TRIAL && floor.trial && !floor.trial.used &&
      !run.trialActive
    ) {
      // re-offer on deliberate (manual) steps; only once for the autopilot
      if (!floor.trialOffered || !this.state.auto) {
        floor.trialOffered = true;
        // pause the world while the wager is considered — otherwise the
        // autopilot clears the floor behind an unread modal
        const wasAuto = this.state.auto;
        this.state.auto = false;
        this.actAcc = 0;
        bus.emit({ type: 'sound', name: 'well' });
        bus.emit({ type: 'trialOffer', wasAuto });
      }
    }

    // soul well
    if (floor.tiles[i] === TILE.WELL && floor.well && !floor.well.used) {
      floor.well.used = true;
      const v = this.gainSouls(B.wellSouls(run.depth));
      bus.emit({ type: 'sound', name: 'well' });
      bus.emit({ type: 'float', x, y, text: `+${fmt(v)} souls`, color: '#bb99ff' });
      log(`The soul well overflows: +${fmt(v)} souls.`, 'souls');
    }
  }

  private openChest(x: number, y: number, vaultHoard = false): void {
    const run = this.state.run!;
    bus.emit({ type: 'sound', name: 'chest' });
    if (vaultHoard) {
      // the vault's own chest never disappoints: epic or better
      log('The hoard-chest creaks open.', 'item');
      this.acquireItem(rollItem(run.depth, 3, run.klass));
      return;
    }
    const roll = rndInt(1, 100);
    if (roll <= 55) {
      this.acquireItem(rollItem(run.depth, 0, run.klass));
    } else if (roll <= 85) {
      const v = this.gainGold(B.goldPile(run.depth) * 3);
      bus.emit({ type: 'float', x, y, text: `+${fmt(v)}g`, color: '#ffd700' });
      log(`A chest of grave-goods: +${fmt(v)} gold.`, 'gold');
    } else {
      const heal = Math.round(this.d.maxHp * 0.35);
      run.hp = Math.min(this.d.maxHp, run.hp + heal);
      log('The chest holds a sealed draught. Down it goes.', 'item');
    }
  }

  /** Effective comparison score: a favored weapon counts its bonus ATK. */
  private effScore(item: Item, classId: string): number {
    let score = scoreItem(item);
    if (item.slot === 'weapon' && item.kind && kindFavors(item.kind, classId)) {
      score += (item.stats.atk ?? 0) * 2 * (FAVORED_WEAPON_MULT - 1);
    }
    return score;
  }

  /** Whether the current (or next) vessel may hold this item at all. */
  canEquip(item: Item, classId = this.state.run?.klass ?? this.state.curClass): boolean {
    if (item.slot !== 'weapon' || !item.kind) return true;
    return kindAllows(item.kind, classId);
  }

  /** Salvage value is fixed (no gold multipliers) but still honors curse
   *  multipliers — under Famine, "no gold drops anywhere" includes salvage. */
  private salvageItem(item: Item, silent = false): number {
    const midas = this.d.powers.includes('midas') ? 3 : 1;
    const v = this.gainGold(
      B.SALVAGE_GOLD_BY_RARITY[item.rarity] * midas * this.curseMult('goldMult'), true);
    if (!silent) log(`Salvaged ${item.name} (+${fmt(v)} gold).`, 'item');
    return v;
  }

  /** Put an item in the Satchel. When full, the worst thing is scrapped —
   *  unprotected rarities first, then by score. Protected rarities
   *  (settings.protectRarity and above) are only scrapped as a last resort. */
  private stash(item: Item): void {
    const inv = this.state.inventory;
    if (inv.length < B.INVENTORY_CAP) {
      inv.push(item);
      log(`▣ ${item.name} goes into the satchel.`, `rarity${item.rarity}`);
      return;
    }
    const prot = this.state.settings.protectRarity;
    const pv = this.state.settings.protectVestiges;
    // locked items are sacrosanct; protected vestiges next; protected
    // rarities go only as a last resort before the rest
    const rank = (it: Item) =>
      it.locked ? 3 : pv && it.rarity === 6 ? 2 : it.rarity >= prot ? 1 : 0;
    const candidates = [
      ...inv.map((it, i) => ({ it, i })),
      { it: item, i: -1 },
    ].sort((a, b) => rank(a.it) - rank(b.it) || scoreItem(a.it) - scoreItem(b.it));
    const scrap = candidates[0];
    if (scrap.i === -1) {
      this.salvageItem(item);
    } else {
      inv.splice(scrap.i, 1);
      inv.push(item);
      this.salvageItem(scrap.it);
      log(`▣ ${item.name} goes into the satchel.`, `rarity${item.rarity}`);
    }
  }

  /** Is this item a piece of a fully-worn 3-piece vestige set? */
  private completesWornSet(item: Item | null | undefined): boolean {
    const run = this.state.run;
    if (!item?.setId || !run) return false;
    return (['weapon', 'armor', 'charm'] as const)
      .every((slot) => run.gear[slot]?.setId === item.setId);
  }

  /** Loot intake: auto-equip when allowed & clearly better (5% hysteresis so
   *  near-equal items don't flap), auto-salvage configured junk, else stash.
   *  A completed set is never broken silently — only the player's own hand
   *  may unmake AIRGAP or the Oath. */
  acquireItem(item: Item): void {
    const run = this.state.run;
    const s = this.state.settings;
    const klass = run?.klass ?? this.state.curClass;
    const cur = run?.gear[item.slot];
    const wantsEquip =
      s.autoEquip && run !== null &&
      this.canEquip(item, klass) &&
      !this.completesWornSet(cur) &&
      !cur?.locked &&
      (!cur || this.effScore(item, klass) > this.effScore(cur, klass) * 1.05);

    bus.emit({ type: 'item', item, equipped: wantsEquip });
    if (wantsEquip && run) {
      run.gear[item.slot] = item;
      if (cur) this.stash(cur);
      bus.emit({ type: 'sound', name: 'equip' });
      log(`⚔ Equipped: ${item.name}.`, `rarity${item.rarity}`);
      this.recalc();
    } else if (
      this.qolUnlocked('tithe') &&
      s.autoSalvageBelow > 0 &&
      item.rarity < s.autoSalvageBelow &&
      item.rarity < s.protectRarity
    ) {
      this.salvageItem(item);
    } else {
      this.stash(item);
    }
    bus.emit({ type: 'dirty' });
  }

  equipFromInventory(index: number): boolean {
    const inv = this.state.inventory;
    const item = inv[index];
    if (!item) return false;
    if (!this.canEquip(item)) {
      log(`This vessel cannot wield the ${item.name}.`, 'system');
      return false;
    }
    inv.splice(index, 1);
    const gear = this.state.run?.gear ?? this.state.keptGear;
    const old = gear[item.slot];
    gear[item.slot] = item;
    if (old) inv.push(old); // space guaranteed: we just removed one
    this.recalc();
    bus.emit({ type: 'sound', name: 'equip' });
    log(`⚔ Equipped: ${item.name}.`, `rarity${item.rarity}`);
    bus.emit({ type: 'dirty' });
    return true;
  }

  unequipSlot(slot: Slot): boolean {
    const gear = this.state.run?.gear ?? this.state.keptGear;
    const item = gear[slot];
    if (!item) return false;
    if (this.state.inventory.length >= B.INVENTORY_CAP) {
      log('The satchel is full — salvage something first.', 'system');
      return false;
    }
    gear[slot] = null;
    this.state.inventory.push(item);
    this.recalc();
    bus.emit({ type: 'dirty' });
    return true;
  }

  salvageFromInventory(index: number): boolean {
    const item = this.state.inventory[index];
    if (!item) return false;
    if (item.locked) {
      log(`${item.name} is locked — unlock it before scrapping.`, 'system');
      return false;
    }
    this.state.inventory.splice(index, 1);
    this.salvageItem(item);
    bus.emit({ type: 'dirty' });
    return true;
  }

  /** The QoL automations are cheap essence unlocks (playtest experiment). */
  qolUnlocked(id: 'sexton' | 'seal' | 'tithe'): boolean {
    return this.lvl(id) > 0;
  }

  /** The smith's target depth: where the vessel stands (or would start). */
  reforgeTargetDepth(): number {
    return this.state.run?.depth ?? this.d.startDepth;
  }

  /** Re-anvil a Vestige to current-depth strength, for gold. */
  private reforgeItem(item: Item): Item | null {
    if (item.rarity !== 6 || !item.setId) return null;
    const target = this.reforgeTargetDepth();
    if (item.depth >= target) {
      log(`${item.name} is already forged for this depth.`, 'system');
      return null;
    }
    const cost = B.reforgeCost(target);
    if (this.state.gold < cost) {
      log(`The smith wants ${fmt(cost)} gold to reforge ${item.name}.`, 'system');
      return null;
    }
    const reforged = rollSetPiece(item.setId, item.slot, target);
    if (!reforged) return null;
    this.state.gold -= cost;
    reforged.locked = item.locked;
    bus.emit({ type: 'sound', name: 'equip' });
    log(`⚒ ${item.name} is reforged for depth ${target} (−${fmt(cost)} gold).`, 'rarity6');
    return reforged;
  }

  reforgeSlot(slot: Slot): boolean {
    const gear = this.state.run?.gear ?? this.state.keptGear;
    const item = gear[slot];
    if (!item) return false;
    const reforged = this.reforgeItem(item);
    if (!reforged) return false;
    gear[slot] = reforged;
    this.recalc();
    bus.emit({ type: 'dirty' });
    return true;
  }

  reforgeFromInventory(index: number): boolean {
    const item = this.state.inventory[index];
    if (!item) return false;
    const reforged = this.reforgeItem(item);
    if (!reforged) return false;
    this.state.inventory[index] = reforged;
    bus.emit({ type: 'dirty' });
    return true;
  }

  /** Toggle the player lock on an equipped item (needs the Quartermaster's Seal). */
  toggleLock(slot: Slot): void {
    if (!this.qolUnlocked('seal')) {
      log('Locking requires the Quartermaster’s Seal (Reaping tab).', 'system');
      return;
    }
    const gear = this.state.run?.gear ?? this.state.keptGear;
    const item = gear[slot];
    if (!item) return;
    item.locked = !item.locked;
    log(item.locked
      ? `🔒 ${item.name} is locked in place.`
      : `🔓 ${item.name} is unlocked.`, 'system');
    bus.emit({ type: 'dirty' });
  }

  /** Scrap the whole satchel — except protected rarities, which stay put. */
  salvageAllInventory(): void {
    const inv = this.state.inventory;
    if (inv.length === 0) return;
    const prot = this.state.settings.protectRarity;
    const pv = this.state.settings.protectVestiges;
    const safe = (it: Item) => it.locked || (pv && it.rarity === 6) || it.rarity >= prot;
    const kept = inv.filter(safe);
    const scrapped = inv.filter((it) => !safe(it));
    if (scrapped.length === 0) {
      log('Everything in the satchel is protected. Nothing scrapped.', 'system');
      return;
    }
    let total = 0;
    for (const item of scrapped) total += this.salvageItem(item, true);
    this.state.inventory = kept;
    log(`Salvaged ${scrapped.length} item${scrapped.length === 1 ? '' : 's'} (+${fmt(total)} gold)` +
      `${kept.length > 0 ? `; ${kept.length} protected kept` : ''}.`, 'item');
    bus.emit({ type: 'dirty' });
  }

  /** ---------------- combat ---------------- */

  private heroAttack(m: Monster): void {
    const run = this.state.run!;
    const d = this.d;

    let raw = d.atk * rndf(1 - B.DMG_VARIANCE, 1 + B.DMG_VARIANCE);
    if (run.blessTurns > 0) raw *= 1.25;
    if (d.berserk) {
      const missing = 1 - run.hp / d.maxHp;
      raw *= 1 + 1.5 * missing;
    }
    if (d.lowHpAtk > 0 && run.hp / d.maxHp < 0.5) raw *= 1 + d.lowHpAtk;
    // genuScreen: first contact is fully inspected
    if (d.powers.includes('inspection') && m.hp >= m.maxHp) raw *= 1.5;
    // the Longwatch strikes hardest before it bleeds
    if (d.fullHpAtk > 0 && run.hp >= d.maxHp) raw *= 1 + d.fullHpAtk;
    // Vigilkeeper's Edge: hold the line against the named horrors
    if (d.powers.includes('holdline') &&
        (m.elite || m.boss || m.mini || m.enchants.length > 0)) raw *= 1.4;
    const isCrit = chance(d.crit / 100);
    if (isCrit) raw *= d.critDmg;

    let dmg = Math.max(1, raw * (1 - B.mitigation(m.def)));
    m.hp -= dmg;
    m.awake = true;

    if (d.lifesteal > 0) {
      run.hp = Math.min(d.maxHp, run.hp + dmg * d.lifesteal / 100);
    }

    bus.emit({
      type: 'float', x: m.x, y: m.y,
      text: `${isCrit ? '✸' : ''}${fmt(Math.round(dmg))}`,
      color: isCrit ? '#ffdd33' : '#ffffff',
    });
    bus.emit({ type: 'sound', name: isCrit ? 'crit' : 'hit' });

    // minions pile on
    for (const def of MINIONS) {
      const st = this.state.minions[def.id];
      if (!st || st.level === 0 || !st.alive || m.hp <= 0) continue;
      const matk = this.minionAtk(def.id);
      if (matk <= 0) continue;
      const pierce = def.tags.includes('piercing');
      const mdmg = Math.max(1, matk * rndf(0.85, 1.15) * (pierce ? 1 : 1 - B.mitigation(m.def)));
      m.hp -= mdmg;
      // Sceptre of the First Grave: the choir echoes every strike
      if (this.d.powers.includes('conduction')) m.hp -= mdmg * 0.5;
    }

    if (m.hp <= 0) this.killMonster(m);
  }

  private killMonster(m: Monster): void {
    const s = this.state;
    const run = s.run!;
    const floor = run.floor;

    floor.monsters = floor.monsters.filter((mm) => mm !== m);
    run.kills++;
    s.totalKills++;

    // volatile champions detonate — the blast can finish the vessel
    if (m.enchants.includes('volatile')) {
      const dist = Math.abs(m.x - this.heroPos.x) + Math.abs(m.y - this.heroPos.y);
      if (dist <= 1 && !this.devInvulnerable) {
        const blast = Math.max(1,
          B.monsterAtk(run.depth) * 1.6 * (1 - B.heroMitigation(this.d.def, run.depth)));
        run.hp -= blast;
        bus.emit({ type: 'shake', power: 5 });
        bus.emit({ type: 'sound', name: 'hurt' });
        bus.emit({
          type: 'float', x: this.heroPos.x, y: this.heroPos.y,
          text: `-${fmt(Math.round(blast))}`, color: '#ff8844',
        });
        log(`${m.name} detonates!`, 'monster');
        // the blast denies the harvest — no rewards reach a dead vessel
        if (this.lethalCheck()) return;
      }
    }

    // rewards
    const xp = m.xp * this.d.xpMult;
    run.xp += xp;
    this.gainBones(B.boneDrop(run.depth, m.tier));
    if (chance(0.5)) this.gainGold(B.monsterGold(run.depth));
    if (m.stolenGold > 0) this.gainGold(m.stolenGold, true);

    if (this.d.healOnKill > 0) {
      run.hp = Math.min(this.d.maxHp, run.hp + this.d.maxHp * this.d.healOnKill / 100);
    }

    // Phylactery of True Names: every kill surrenders its name
    if (this.d.powers.includes('truenames')) {
      this.gainSouls(1 + run.depth * 0.25);
    }

    // Coinblade: every kill pays its toll
    if (this.d.powers.includes('tollkeeper')) {
      this.gainGold(B.monsterGold(run.depth) * 2);
    }

    // the Marked Coin: elites and champions pay double when felled
    if (this.d.powers.includes('quarry') && (m.elite || m.enchants.length > 0)) {
      this.gainGold(B.monsterGold(run.depth) * 2);
      this.gainBones(B.boneDrop(run.depth, m.tier));
    }

    if (m.boss) {
      s.bossesSlain++;
      const v = this.gainSouls(B.bossSouls(run.depth));
      bus.emit({ type: 'bosskill', name: m.name });
      bus.emit({ type: 'sound', name: 'bosskill' });
      bus.emit({ type: 'shake', power: 8 });
      log(`☠ ${m.name} is unmade. +${fmt(v)} souls.`, 'boss');
      // guaranteed epic+ item; deep bosses can carry legendaries
      if (run.depth >= 20 && chance(0.1)) {
        s.legendariesFound++;
        this.acquireItem(rollItem(run.depth, 5, run.klass));
      } else {
        this.acquireItem(rollItem(run.depth, 3, run.klass));
      }
      // relic chance
      if (chance(0.3)) this.grantRelic();
    } else if (m.mini) {
      s.wardensSlain++;
      const v = this.gainSouls(B.minibossSouls(run.depth));
      bus.emit({ type: 'bosskill', name: m.name });
      bus.emit({ type: 'sound', name: 'bosskill' });
      bus.emit({ type: 'shake', power: 6 });
      log(`Ω ${m.name} is unmade. The vault is yours. +${fmt(v)} souls.`, 'boss');
      // wardens always carry a legendary
      s.legendariesFound++;
      this.acquireItem(rollItem(run.depth, 5, run.klass));
      if (chance(0.12)) this.grantRelic();
    } else if (m.elite) {
      const v = this.gainSouls(B.eliteSouls(run.depth));
      log(`✦ ${m.name} falls. +${fmt(v)} souls.`, 'elite');
      if (chance(0.35)) this.acquireItem(rollItem(run.depth, 1, run.klass));
    } else if (m.enchants.length > 0) {
      s.championsSlain++;
      let soulMult = 1;
      for (const id of m.enchants) {
        const e = enchantById(id);
        if (!e) continue;
        soulMult *= e.soulMult ?? 1;
        if (e.goldDrop) {
          const g = this.gainGold(B.monsterGold(run.depth) * e.goldDrop);
          bus.emit({ type: 'float', x: m.x, y: m.y, text: `+${fmt(g)}g`, color: '#ffd700' });
        }
        if (e.boneDrop) {
          const b = this.gainBones(B.boneDrop(run.depth, m.tier) * e.boneDrop);
          bus.emit({ type: 'float', x: m.x, y: m.y, text: `+${fmt(b)}∴`, color: '#d8d0b8' });
        }
      }
      const v = this.gainSouls(B.championSouls(run.depth) * soulMult);
      bus.emit({ type: 'sound', name: 'kill' });
      log(`◆ ${m.name} falls. +${fmt(v)} souls.`, 'champion');
      if (chance(0.35)) this.acquireItem(rollItem(run.depth, 1, run.klass));
    } else {
      bus.emit({ type: 'sound', name: 'kill' });
      if (chance(0.06)) this.acquireItem(rollItem(run.depth, 0, run.klass));
    }

    // felling the Avatar ends the trial (the hero must still be standing)
    if (m.trial && m.boss && this.state.run?.trialActive?.phase === 'avatar') {
      this.trialVictory();
    }

    this.checkAchievements();
  }

  private grantRelic(): void {
    const s = this.state;
    const unowned = RELICS.filter((r) => !s.relics.includes(r.id));
    if (unowned.length === 0) return;
    const relic = pick(unowned);
    s.relics.push(relic.id);
    s.relicsFound++;
    bus.emit({ type: 'relic', id: relic.id });
    bus.emit({ type: 'sound', name: 'relic' });
    log(`❖ RELIC: ${relic.name} — ${relic.desc}`, 'relic');
    this.recalc();
    this.checkAchievements();
  }

  private checkLevelUp(): void {
    const run = this.state.run;
    if (!run) return;
    let need = B.xpForLevel(run.level);
    let leveled = false;
    while (run.xp >= need) {
      run.xp -= need;
      run.level++;
      leveled = true;
      need = B.xpForLevel(run.level);
    }
    if (leveled) {
      this.recalc();
      run.hp = Math.min(this.d.maxHp, run.hp + Math.round(this.d.maxHp * 0.5));
      bus.emit({ type: 'levelup', level: run.level });
      bus.emit({ type: 'sound', name: 'levelup' });
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: `LEVEL ${run.level}`, color: '#88ffaa',
      });
      log(`${run.heroName} reaches level ${run.level}.`, 'levelup');
    }
  }

  /** ---------------- monster turns ---------------- */

  private monstersAct(): void {
    const run = this.state.run;
    if (!run) return;
    const floor = run.floor;
    const dist = bfsMap(floor, this.heroPos.x, this.heroPos.y);

    const occupied = new Set<number>();
    for (const m of floor.monsters) occupied.add(m.y * floor.w + m.x);
    occupied.add(this.heroPos.y * floor.w + this.heroPos.x);

    for (const m of [...floor.monsters]) {
      if (!this.state.run) break;
      if (m.hp <= 0) continue;
      // wake on sight
      if (!m.awake && floor.visible[m.y * floor.w + m.x]) m.awake = true;
      if (!m.awake) continue;

      // specials that tick regardless
      if (m.specials.includes('regen') && m.hp < m.maxHp) {
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.03);
      }

      if (m.specials.includes('slow')) {
        m.slowSkip = !m.slowSkip;
        if (m.slowSkip) continue;
      }

      const acts = m.specials.includes('fast') ? 2 : 1;
      for (let a = 0; a < acts; a++) {
        if (!this.state.run) return;
        this.monsterAct(m, dist, occupied);
        if (!this.state.run) return;
      }
    }
  }

  private monsterAct(m: Monster, dist: Int16Array, occupied: Set<number>): void {
    const run = this.state.run!;
    const floor = run.floor;
    const distToHero = Math.abs(m.x - this.heroPos.x) + Math.abs(m.y - this.heroPos.y);

    // summoners raise help
    if (m.specials.includes('summon')) {
      m.summonCd--;
      if (m.summonCd <= 0 && floor.monsters.length < 30 && distToHero <= 8) {
        m.summonCd = 6;
        const spot = this.freeAdjacent(m.x, m.y, occupied);
        if (spot) {
          const lesser = spawnLesser(run.depth, spot.x, spot.y, this.genMods(run.curseIds));
          floor.monsters.push(lesser);
          occupied.add(spot.y * floor.w + spot.x);
          log(`${m.name} drags something out of the floor.`, 'monster');
        }
      }
    }

    // phasing champions blink to the vessel's side when kept at range
    if (m.enchants.includes('phasing') && distToHero > 2) {
      m.summonCd--;
      if (m.summonCd <= 0) {
        const spot = this.freeAdjacent(this.heroPos.x, this.heroPos.y, occupied);
        if (spot) {
          m.summonCd = 7;
          occupied.delete(m.y * floor.w + m.x);
          m.x = spot.x;
          m.y = spot.y;
          occupied.add(spot.y * floor.w + spot.x);
          bus.emit({ type: 'float', x: spot.x, y: spot.y, text: '⊘', color: '#7fc7ff' });
          this.monsterAttack(m);
          return;
        }
      }
    }

    if (distToHero === 1) {
      this.monsterAttack(m);
      return;
    }

    if (m.specials.includes('ranged') && distToHero <= 3 &&
        losClear(floor, m.x, m.y, this.heroPos.x, this.heroPos.y)) {
      this.monsterAttack(m, true);
      return;
    }

    // chase: step downhill on the hero-rooted field
    const cur = dist[m.y * floor.w + m.x];
    if (cur <= 1) return;
    let best: { x: number; y: number } | null = null;
    let bestD = cur;
    for (const [ox, oy] of DIRS4) {
      const nx = m.x + ox;
      const ny = m.y + oy;
      if (!isPassable(floor, nx, ny)) continue;
      const ni = ny * floor.w + nx;
      if (occupied.has(ni)) continue;
      const nd = dist[ni];
      if (nd !== -1 && nd < bestD) {
        bestD = nd;
        best = { x: nx, y: ny };
      }
    }
    if (best) {
      occupied.delete(m.y * floor.w + m.x);
      m.x = best.x;
      m.y = best.y;
      occupied.add(best.y * floor.w + best.x);
    }
  }

  private freeAdjacent(x: number, y: number, occupied: Set<number>): { x: number; y: number } | null {
    const floor = this.state.run!.floor;
    for (const [ox, oy] of DIRS4) {
      const nx = x + ox;
      const ny = y + oy;
      if (!isPassable(floor, nx, ny)) continue;
      if (occupied.has(ny * floor.w + nx)) continue;
      if (nx === this.heroPos.x && ny === this.heroPos.y) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  private monsterAttack(m: Monster, ranged = false): void {
    const s = this.state;
    const run = s.run!;
    const d = this.d;

    if (this.devInvulnerable) return;

    // dodge
    if (chance(d.dodge / 100)) {
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: 'dodge', color: '#bb99ff',
      });
      return;
    }

    // genuGate AIRGAP: the packet is silently discarded
    if (d.negateChance > 0 && chance(d.negateChance / 100)) {
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: 'dropped', color: '#7fffd4',
      });
      return;
    }

    // genuWall: an established session drops the first unexpected packet
    if (d.powers.includes('stateful') && run.turn - run.lastHitTurn >= 5) {
      run.lastHitTurn = run.turn;
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: 'STATEFUL', color: '#7fffd4',
      });
      return;
    }

    let raw = m.atk * rndf(1 - B.DMG_VARIANCE, 1 + B.DMG_VARIANCE);
    if (m.specials.includes('deadly') && chance(0.2)) raw *= 2;

    let dmg = Math.max(1, raw * (1 - B.heroMitigation(d.def, run.depth)));
    dmg *= 1 - d.blockPct / 100;
    dmg = Math.max(1, dmg);

    // minion interception
    const interceptors = MINIONS.filter((def) => {
      const st = s.minions[def.id];
      return st && st.level > 0 && st.alive && def.intercept > 0;
    });
    const totalIntercept = Math.min(65, interceptors.reduce(
      (sum, def) => sum + def.intercept, 0));
    if (interceptors.length > 0 && chance(totalIntercept / 100)) {
      const weights = interceptors.map((def) => def.intercept);
      let roll = rndf(0, weights.reduce((a, b) => a + b, 0));
      let chosen = interceptors[0];
      for (let i = 0; i < interceptors.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          chosen = interceptors[i];
          break;
        }
      }
      const st = s.minions[chosen.id];
      // Shroud of the Hollow Choir: the choir endures
      st.hp -= this.d.powers.includes('choir') ? dmg * 0.5 : dmg;
      if (st.hp <= 0) {
        st.alive = false;
        st.hp = 0;
        bus.emit({ type: 'sound', name: 'miniondown' });
        log(`${chosen.name} is smashed apart shielding ${run.heroName}.`, 'minion');
        this.recalc();
        bus.emit({ type: 'dirty' });
      }
      return;
    }

    run.hp -= dmg;
    run.lastHitTurn = run.turn;
    bus.emit({
      type: 'float', x: this.heroPos.x, y: this.heroPos.y,
      text: `-${fmt(Math.round(dmg))}`, color: '#ff5555',
    });
    bus.emit({ type: 'sound', name: ranged ? 'zap' : 'hurt' });

    // on-hit specials
    if (m.specials.includes('vampiric')) {
      m.hp = Math.min(m.maxHp, m.hp + dmg * 0.6);
    }
    if (m.specials.includes('poison')) {
      this.addStatus('poison', 4, Math.max(1, raw * 0.25));
    }
    if (m.specials.includes('burn')) {
      this.addStatus('burn', 3, Math.max(1, raw * 0.35));
    }
    if (m.specials.includes('thief') && s.gold > 0 && !d.thiefProof) {
      const steal = Math.min(s.gold, Math.ceil(B.monsterGold(run.depth) * 3));
      s.gold -= steal;
      m.stolenGold += steal;
      bus.emit({
        type: 'float', x: this.heroPos.x, y: this.heroPos.y,
        text: `-${fmt(steal)}g`, color: '#ffd700',
      });
    }

    this.lethalCheck();
  }

  private addStatus(kind: StatusKind, turns: number, power: number): void {
    // AIRGAP filters every malicious payload
    if (this.d.dotImmune && (kind === 'poison' || kind === 'burn')) return;
    const run = this.state.run!;
    const existing = run.statuses.find((st) => st.kind === kind);
    if (existing) {
      existing.turns = Math.max(existing.turns, turns);
      existing.power = Math.max(existing.power, power);
    } else {
      run.statuses.push({ kind, turns, power });
    }
  }

  /** ---------------- manual control ---------------- */

  manualMove(dx: number, dy: number): void {
    const run = this.state.run;
    if (!run) return;
    run.manualTarget = null;
    const nx = this.heroPos.x + dx;
    const ny = this.heroPos.y + dy;
    if (!isPassable(run.floor, nx, ny)) return;

    run.turn++;
    if (this.tickStatuses()) return;

    const m = run.floor.monsters.find((mm) => mm.x === nx && mm.y === ny && mm.hp > 0);
    if (m) {
      this.heroAttack(m);
    } else {
      this.pushTrail();
      this.heroPos.x = nx;
      this.heroPos.y = ny;
      this.enterTile(nx, ny);
    }
    if (!this.state.run) return;
    if (this.state.run.blessTurns > 0) this.state.run.blessTurns--;
    computeFov(this.state.run.floor, this.heroPos.x, this.heroPos.y, this.d.vision);
    this.monstersAct();
    if (this.state.run) {
      this.trialTick();
      this.checkLevelUp();
    }
  }

  /** Manual descend (when standing on stairs). */
  manualDescend(): void {
    const run = this.state.run;
    if (!run) return;
    if (this.heroPos.x === run.floor.stairs.x && this.heroPos.y === run.floor.stairs.y) {
      this.descend();
    }
  }

  setManualTarget(x: number, y: number): void {
    const run = this.state.run;
    if (!run) return;
    if (!isPassable(run.floor, x, y)) return;
    if (!run.floor.seen[y * run.floor.w + x]) return;
    run.manualTarget = { x, y };
  }

  /** ---------------- the Trial of the Sealed Hall ---------------- */

  acceptTrial(): void {
    const run = this.state.run;
    const floor = run?.floor;
    if (!run || !floor?.trial || floor.trial.used || run.trialActive) return;
    floor.trial.used = true;

    // the wager transports the vessel to the Sealed Hall itself
    run.trialActive = {
      turnsSurvived: 0,
      totalTurns: B.TRIAL_TURNS,
      returnDepth: run.depth,
      phase: 'onslaught',
      mods: this.genMods(run.curseIds), // frozen: mid-trial souls must not escalate it
    };
    run.floor = genTrialHall(run.depth, this.genMods(run.curseIds));
    Object.assign(this.heroPos, run.floor.entry);
    this.trail = [];
    run.manualTarget = null;
    run.oathUsed = false;
    computeFov(run.floor, this.heroPos.x, this.heroPos.y, this.d.vision);

    bus.emit({ type: 'sound', name: 'boss' });
    bus.emit({ type: 'shake', power: 6 });
    bus.emit({ type: 'flash', color: '#9d7bff' });
    log('◈ The wager is sworn. The floor opens; the Sealed Hall swallows you whole.', 'mystic');
    log(`◈ Survive ${B.TRIAL_TURNS} turns of onslaught, then fell the Avatar. There are no stairs.`, 'boss');
    bus.emit({ type: 'dirty' });
  }

  /** One hero turn elapses inside the Hall: count, spawn, escalate. */
  private trialTick(): void {
    const run = this.state.run;
    const t = run?.trialActive;
    if (!run || !t || t.phase !== 'onslaught') return;
    t.turnsSurvived++;

    if (t.turnsSurvived >= t.totalTurns) {
      t.phase = 'avatar';
      const spot = this.trialSpawnSpot();
      const avatar = spawnMonster(
        run.depth + 4, spot.x, spot.y, t.mods, { boss: true });
      avatar.name = 'Avatar of the Sealed Hall';
      avatar.glyph = '◈';
      avatar.trial = true;
      avatar.awake = true;
      run.floor.monsters.push(avatar);
      bus.emit({ type: 'sound', name: 'boss' });
      bus.emit({ type: 'shake', power: 8 });
      log('◈ The onslaught stills. The AVATAR OF THE SEALED HALL descends.', 'boss');
      return;
    }

    if (t.turnsSurvived % B.TRIAL_SPAWN_EVERY === 0) this.spawnTrialPack();
  }

  /** A random open hall tile, kept off the vessel's doorstep. */
  private trialSpawnSpot(): { x: number; y: number } {
    const floor = this.state.run!.floor;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = rndInt(2, floor.w - 3);
      const y = rndInt(2, floor.h - 3);
      if (!isPassable(floor, x, y)) continue;
      if (Math.abs(x - this.heroPos.x) + Math.abs(y - this.heroPos.y) < 7) continue;
      if (floor.monsters.some((m) => m.x === x && m.y === y && m.hp > 0)) continue;
      return { x, y };
    }
    return { ...floor.entry };
  }

  /** The onslaught: packs grow larger, harder and deeper as the trial wears on. */
  private spawnTrialPack(): void {
    const run = this.state.run;
    const t = run?.trialActive;
    if (!run || !t) return;
    const floor = run.floor;
    const alive = floor.monsters.filter((m) => m.trial && m.hp > 0).length;
    if (alive >= B.TRIAL_MAX_ALIVE) return;

    const progress = t.turnsSurvived / t.totalTurns;
    const effDepth = run.depth + Math.floor(progress * 6);
    const count = 2 + Math.floor(progress * 3);

    for (let i = 0; i < count; i++) {
      const spot = this.trialSpawnSpot();
      const m = spawnMonster(effDepth, spot.x, spot.y, t.mods,
        { elite: chance(0.1 + progress * 0.3) });
      m.trial = true;
      m.awake = true;
      floor.monsters.push(m);
    }
    bus.emit({ type: 'sound', name: 'zap' });
  }

  private trialVictory(): void {
    const s = this.state;
    const run = s.run!;
    const returnDepth = run.trialActive?.returnDepth ?? run.depth;
    run.trialActive = null;
    s.trialsWon++;

    const iron = run.curseIds.includes('iron');
    const setId = trialSetFor(run.klass, run.curseIds);

    // award the first piece this player doesn't yet hold anywhere
    const owned = new Set<string>();
    const consider = (it: Item | null) => {
      if (it?.setId) owned.add(`${it.setId}:${it.slot}`);
    };
    for (const slot of ['weapon', 'armor', 'charm'] as const) {
      consider(run.gear[slot]);
      consider(s.keptGear[slot]);
    }
    for (const it of s.inventory) consider(it);

    const missing = (['weapon', 'armor', 'charm'] as const)
      .find((slot) => !owned.has(`${setId}:${slot}`));

    const v = this.gainSouls(B.wellSouls(returnDepth) * 8);
    bus.emit({ type: 'trialResult', won: true, piece: missing });
    bus.emit({ type: 'sound', name: 'reap' });
    bus.emit({ type: 'shake', power: 8 });

    if (missing) {
      const piece = rollSetPiece(setId, missing, returnDepth);
      if (piece) {
        log(`◈ THE HALL YIELDS: ${piece.name}. +${fmt(v)} souls.`, 'rarity6');
        this.acquireItem(piece);
      }
    } else {
      const jackpot = this.gainSouls(B.wellSouls(returnDepth) * 16);
      log(`◈ The set is complete already — the Hall pays tribute instead: +${fmt(v + jackpot)} souls.`, 'rarity6');
    }
    // the gate hint, for those who keep winning the soft way
    if (!iron && chance(0.5)) {
      log('A voice like a closing door: “Only a hardened crypt yields the Gate.”', 'mystic');
    }

    // the Hall releases its victor where it took them
    run.depth = returnDepth - 1;
    this.descendOnce();
    log('◈ The Hall releases you. The crypt resumes as if nothing happened.', 'mystic');
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
  }

  /** ---------------- shops ---------------- */

  cost(def: UpgradeDef): number {
    return B.upgradeCost(def.base, def.growth, this.lvl(def.id));
  }

  private pool(def: UpgradeDef): 'bones' | 'souls' | 'essence' {
    return def.pool;
  }

  canBuy(id: string): boolean {
    const def = upgradeById(id);
    if (!def) return false;
    if (this.lvl(id) >= def.max) return false;
    return this.state[this.pool(def)] >= this.cost(def);
  }

  buyUpgrade(id: string, silent = false): boolean {
    const def = upgradeById(id);
    if (!def || !this.canBuy(id)) return false;
    const cost = this.cost(def);
    this.state[this.pool(def)] -= cost;
    this.state.upgrades[id] = this.lvl(id) + 1;
    this.recalc();
    if (!silent) {
      bus.emit({ type: 'sound', name: 'buy' });
      bus.emit({ type: 'dirty' });
    }
    return true;
  }

  /** How many levels a bulk purchase would grab right now, and their total cost.
   *  `amount` 0 means "as many as affordable". */
  bulkInfo(def: UpgradeDef, amount: number): { count: number; totalCost: number } {
    const want = amount === 0 ? Infinity : amount;
    const funds = this.state[this.pool(def)];
    let lvl = this.lvl(def.id);
    let total = 0;
    let count = 0;
    while (count < want && lvl < def.max && count < 500) {
      const c = B.upgradeCost(def.base, def.growth, lvl);
      if (total + c > funds && count > 0) break;
      if (total + c > funds) break;
      total += c;
      lvl++;
      count++;
    }
    return { count, totalCost: total };
  }

  /** Buy up to `amount` levels (0 = max affordable). Returns levels bought. */
  buyUpgradeTimes(id: string, amount: number): number {
    const def = upgradeById(id);
    if (!def) return 0;
    const { count } = this.bulkInfo(def, amount);
    for (let i = 0; i < count; i++) {
      if (!this.buyUpgrade(id, true)) break;
    }
    if (count > 0) {
      bus.emit({ type: 'sound', name: 'buy' });
      bus.emit({ type: 'dirty' });
    }
    return count;
  }

  buyMinion(id: string): boolean {
    const def = minionById(id);
    if (!def) return false;
    const st = this.state.minions[id] ?? { level: 0, alive: false, hp: 0 };
    const cost = minionLevelCost(def, st.level);
    if (this.state.souls < cost) return false;
    this.state.souls -= cost;
    st.level++;
    if (st.level === 1 || !st.alive) {
      st.alive = true;
      this.state.minionsRaised++;
    }
    this.state.minions[id] = st;
    this.recalc();
    st.hp = this.minionMaxHp(id);
    bus.emit({ type: 'sound', name: 'raise' });
    log(st.level === 1
      ? `⚰ ${def.name} claws free of the ossuary.`
      : `⚰ ${def.name} grows stronger (level ${st.level}).`, 'minion');
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
    return true;
  }

  mendMinion(id: string): boolean {
    const def = minionById(id);
    const st = this.state.minions[id];
    if (!def || !st || st.level === 0 || st.alive) return false;
    const depth = this.state.run?.depth ?? 1;
    const cost = mendCost(depth);
    if (this.state.bones < cost) return false;
    this.state.bones -= cost;
    st.alive = true;
    st.hp = this.minionMaxHp(id);
    this.state.minionsRaised++;
    this.recalc();
    bus.emit({ type: 'sound', name: 'raise' });
    log(`⚰ ${def.name} is mended with fresh bone.`, 'minion');
    bus.emit({ type: 'dirty' });
    return true;
  }

  unlockClass(id: string): boolean {
    const s = this.state;
    const klass = CLASSES.find((c) => c.id === id);
    if (!klass || s.classesUnlocked.includes(id)) return false;
    if (klass.cost < 0) return false; // essence-gated
    if (s.souls < klass.cost) return false;
    s.souls -= klass.cost;
    s.classesUnlocked.push(id);
    bus.emit({ type: 'sound', name: 'classunlock' });
    log(`A new vessel shape is permitted: ${klass.name}.`, 'class');
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
    return true;
  }

  setClass(id: string): void {
    if (this.state.classesUnlocked.includes(id)) {
      this.state.curClass = id;
      bus.emit({ type: 'dirty' });
    }
  }

  setStrategy(strat: Strategy): void {
    this.state.strategy = strat;
    bus.emit({ type: 'dirty' });
  }

  toggleCurse(id: string): void {
    if (this.lvl('rites') === 0) return;
    if (!curseById(id)) return;
    this.state.curses[id] = !this.state.curses[id];
    bus.emit({ type: 'dirty' });
  }

  cursesUnlocked(): boolean {
    return this.lvl('rites') > 0;
  }

  classUnlockedByEssence(id: string): boolean {
    const klass = CLASSES.find((c) => c.id === id);
    if (!klass?.essenceUnlock) return false;
    return this.lvl(klass.essenceUnlock) > 0;
  }

  /** Essence-gated and achievement-hidden classes sync from their sources. */
  syncEssenceClasses(): void {
    for (const c of CLASSES) {
      const earned =
        (c.essenceUnlock && this.lvl(c.essenceUnlock) > 0) ||
        (c.hiddenUnlock && this.state.achievements[c.hiddenUnlock]);
      if (earned && !this.state.classesUnlocked.includes(c.id)) {
        this.state.classesUnlocked.push(c.id);
        log(`A new vessel shape is permitted: ${c.name}.`, 'class');
      }
    }
  }

  /** ---------------- prestige ---------------- */

  reapGain(): number {
    return B.essenceGain(this.state.soulsThisReap);
  }

  /** Depth the crypt demands before it will collapse again. */
  reapDepthNeeded(): number {
    return B.reapDepthRequired(this.state.reaps);
  }

  canReap(): boolean {
    return this.state.bestDepthThisReap >= this.reapDepthNeeded() && this.reapGain() >= 1;
  }

  doReap(): boolean {
    const s = this.state;
    if (!this.canReap()) return false;
    const gain = this.reapGain();
    s.essence += gain;
    s.reaps++;

    // keep only essence upgrades
    const keptUpgrades: Record<string, number> = {};
    for (const [id, levelN] of Object.entries(s.upgrades)) {
      const def = upgradeById(id);
      if (def?.pool === 'essence') keptUpgrades[id] = levelN;
    }
    s.upgrades = keptUpgrades;

    s.gold = 0;
    s.bones = 0;
    s.souls = 0;
    s.soulsThisReap = 0;
    s.bestDepthThisReap = 0;

    for (const m of MINIONS) s.minions[m.id] = { level: 0, alive: false, hp: 0 };

    const everN = this.lvl('everrelic');
    s.relics = s.relics.slice(0, everN);

    s.classesUnlocked = ['wretch'];
    this.syncEssenceClasses();
    if (!s.classesUnlocked.includes(s.curClass)) s.curClass = 'wretch';

    s.keptGear = { weapon: null, armor: null, charm: null };
    s.inventory = [];
    s.run = null;
    s.summonCd = 0;
    s.curses = {};

    this.recalc();
    bus.emit({ type: 'reap', essence: gain });
    bus.emit({ type: 'sound', name: 'reap' });
    log(`✠ THE REAPING. The crypt collapses inward. +${fmt(gain)} essence.`, 'reap');
    this.checkAchievements();
    bus.emit({ type: 'dirty' });
    return true;
  }

  /** ---------------- achievements ---------------- */

  checkAchievements(): void {
    const s = this.state;
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (!s.achievements[a.id] && a.check(s)) {
        s.achievements[a.id] = true;
        any = true;
        bus.emit({ type: 'achievement', id: a.id });
        bus.emit({ type: 'sound', name: 'achievement' });
        log(`★ Achievement: ${a.name} — ${a.desc} (+2% souls)`, 'achievement');
        if (a.id === 'genuset') {
          log('Somewhere, a port opens. The Admin may now log in.', 'mystic');
          this.syncEssenceClasses();
        }
      }
    }
    if (any) {
      this.recalc();
      bus.emit({ type: 'dirty' });
    }
  }

  /** ---------------- offline progress ---------------- */

  applyOffline(elapsedMs: number): { souls: number; bones: number } | null {
    const s = this.state;
    if (elapsedMs < 60000) return null;
    const capped = Math.min(elapsedMs, B.OFFLINE_CAP_MS);
    const minutes = capped / 60000;
    const souls = s.rates.souls * minutes * B.OFFLINE_EFFICIENCY;
    const bones = s.rates.bones * minutes * B.OFFLINE_EFFICIENCY;
    if (souls < 1 && bones < 1) return null;
    this.gainSouls(souls, true);
    this.gainBones(bones, true);
    bus.emit({ type: 'offline', ms: capped, souls, bones });
    this.checkAchievements();
    return { souls, bones };
  }

  /** ---------------- serialization ---------------- */

  serialize(): GameState {
    const s = this.state;
    // Mid-run state isn't persisted; the vessel's gear is.
    const keptGear = s.run ? s.run.gear : s.keptGear;
    return {
      ...s,
      run: null,
      keptGear,
      summonCd: 0,
      lastSeen: Date.now(),
    };
  }
}
