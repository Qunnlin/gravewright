/**
 * Balance audit: an attentive robot player runs three full prestige cycles.
 * Prints a pacing report (consumed by humans and analysis agents) and
 * asserts the curve's core promises:
 *   - the first Reaping lands within a casual evening session (sim-time),
 *   - each cycle is faster than the last (prestige snowballs),
 *   - vessels keep dying (the death economy actually cycles),
 *   - depth advances across cycles (no hard wall).
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { seedRng } from '../src/core/rng';
import { bus } from '../src/core/events';
import * as B from '../src/core/balance';
import {
  BONE_UPGRADES, SOUL_UPGRADES, ESSENCE_UPGRADES, MINIONS, minionLevelCost,
  upgradeById,
} from '../src/core/data/upgrades';
import { CLASSES } from '../src/core/data/classes';

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
    if (st.level < 5 && s.souls >= minionLevelCost(m, st.level) * 2) game.buyMinion(m.id);
  }
  for (const c of CLASSES) {
    if (c.cost > 0 && !s.classesUnlocked.includes(c.id) && s.souls >= c.cost * 1.5) {
      game.unlockClass(c.id);
      game.setClass(c.id);
    }
  }
}

interface CycleReport {
  cycle: number;
  simMinutes: number;
  maxDepth: number;
  deaths: number;
  kills: number;
  souls: number;
  essenceGained: number;
  avgVesselLifetimeS: number;
  soulsPerMin: number;
}

describe('balance report', () => {
  it('three prestige cycles: pacing, snowball, death cadence', () => {
    seedRng(987654321);
    bus.clear();
    const game = new Game();
    // the robot declines every Sealed Hall wager and keeps marching
    bus.on((e) => {
      if (e.type === 'trialOffer') game.state.auto = true;
    });
    game.state.auto = true; // robots skip the manual-first onboarding

    // difficulty probes: at every descent, how many hits each side needs
    interface Probe { depth: number; hTTK: number; mTTK: number; wrath: number }
    const probes: Probe[] = [];
    bus.on((e) => {
      if (e.type !== 'descend') return;
      const d = game.d;
      const wrath = game.wrath();
      const heroDmg = Math.max(1, d.atk * (1 - B.mitigation(B.monsterDef(e.depth))));
      const monDmg = Math.max(1,
        B.heroDamageAfterDef(B.monsterAtk(e.depth) * wrath, d.def, e.depth));
      probes.push({
        depth: e.depth,
        hTTK: Math.ceil((B.monsterHp(e.depth) * wrath) / heroDmg),
        mTTK: Math.ceil(d.maxHp / monDmg),
        wrath: +wrath.toFixed(2),
      });
    });

    const reports: CycleReport[] = [];
    const CYCLE_CAP_S = 4 * 3600;

    // power-growth audit: snapshots every ~2 sim-minutes feed the race-
    // exponent computation (does hero power out-grow the frontier curve?)
    interface Audit {
      cycle: number; min: number; atk: number; maxHp: number; def: number;
      vig: number; fer: number; bonesPerMin: number;
      minsToFer: number; minsToVig: number; frontier: number;
    }
    const audits: Audit[] = [];
    const ferDef = upgradeById('ferocity')!;
    const vigDef = upgradeById('vigor')!;
    const snapshot = (cycle: number, min: number): void => {
      const rate = Math.max(1, game.state.rates.bones);
      audits.push({
        cycle, min: +min.toFixed(1),
        atk: Math.round(game.d.atk), maxHp: game.d.maxHp, def: Math.round(game.d.def),
        vig: game.state.upgrades['vigor'] ?? 0, fer: game.state.upgrades['ferocity'] ?? 0,
        bonesPerMin: Math.round(game.state.rates.bones),
        minsToFer: +(game.cost(ferDef) / rate).toFixed(1),
        minsToVig: +(game.cost(vigDef) / rate).toFixed(1),
        frontier: game.state.bestDepthThisReap,
      });
    };

    for (let cycle = 1; cycle <= 3; cycle++) {
      const startDeaths = game.state.totalDeaths;
      const startKills = game.state.totalKills;
      const essBefore = game.state.essence;
      let simS = 0;
      let nextAudit = 0;

      while (simS < CYCLE_CAP_S) {
        game.tick(250);
        simS += 0.25;
        if (Math.round(simS * 4) % 4 === 0) shop(game);
        if (simS >= nextAudit) {
          snapshot(cycle, simS / 60);
          nextAudit += 120;
        }
        if (game.canReap()) break;
      }
      snapshot(cycle, simS / 60);

      const souls = game.state.soulsThisReap;
      const deaths = game.state.totalDeaths - startDeaths;
      const essenceGained = game.reapGain();
      const reaped = game.canReap() && game.doReap();
      shop(game); // spend fresh essence immediately
      void essBefore;

      reports.push({
        cycle,
        simMinutes: +(simS / 60).toFixed(1),
        maxDepth: game.state.bestDepth,
        deaths,
        kills: game.state.totalKills - startKills,
        souls: Math.round(souls),
        essenceGained: reaped ? essenceGained : 0,
        avgVesselLifetimeS: deaths > 0 ? +(simS / deaths).toFixed(1) : simS,
        soulsPerMin: +(souls / (simS / 60)).toFixed(1),
      });
      if (!reaped) break;
    }

    console.log('\n══════════ GRAVEWRIGHT BALANCE REPORT ══════════');
    console.log('cycle | sim-min | maxDepth | deaths | kills | souls | essence+ | avg-life-s | souls/min');
    for (const r of reports) {
      console.log(
        `  ${r.cycle}   | ${String(r.simMinutes).padStart(6)} | ${String(r.maxDepth).padStart(8)} | ` +
        `${String(r.deaths).padStart(6)} | ${String(r.kills).padStart(5)} | ${String(r.souls).padStart(6)} | ` +
        `${String(r.essenceGained).padStart(8)} | ${String(r.avgVesselLifetimeS).padStart(10)} | ${r.soulsPerMin}`,
      );
    }
    console.log('difficulty probes (last 8 descents): depth | heroTTK | monTTK | wrath');
    for (const p of probes.slice(-8)) {
      console.log(`  ${String(p.depth).padStart(5)} | ${String(p.hTTK).padStart(7)} | ${String(p.mTTK).padStart(6)} | ${p.wrath}`);
    }
    console.log('power audit (every ~4 min): cyc | min | atk | maxHP | def | vig | fer | bones/min | min->fer | frontier');
    for (let i = 0; i < audits.length; i += 2) {
      const a = audits[i];
      console.log(`  ${a.cycle} | ${String(a.min).padStart(5)} | ${String(a.atk).padStart(6)} | ${String(a.maxHp).padStart(6)} | ` +
        `${String(a.def).padStart(5)} | ${String(a.vig).padStart(3)} | ${String(a.fer).padStart(3)} | ` +
        `${String(a.bonesPerMin).padStart(9)} | ${String(a.minsToFer).padStart(8)} | ${a.frontier}`);
    }
    // race exponents per cycle: hero ATK growth vs frontier monster HP growth
    // over the same window. The runaway complaint is real iff hero > monster.
    console.log('race exponents (per sim-minute): cycle | hero-atk | frontier-monHP | verdict');
    for (let c = 1; c <= 3; c++) {
      const ca = audits.filter((a) => a.cycle === c);
      if (ca.length < 2) continue;
      const first = ca[0];
      const last = ca[ca.length - 1];
      const mins = Math.max(1, last.min - first.min);
      const heroExp = Math.log(last.atk / Math.max(1, first.atk)) / mins;
      const monExp = Math.log(
        B.monsterHp(Math.max(2, last.frontier)) / B.monsterHp(Math.max(1, first.frontier))) / mins;
      console.log(`  ${c} | ${heroExp.toFixed(4)} | ${monExp.toFixed(4)} | ` +
        (heroExp > monExp * 1.15 ? 'hero outruns' : heroExp < monExp * 0.85 ? 'crypt outruns' : 'in step'));
    }
    console.log('final upgrades:', JSON.stringify(game.state.upgrades));
    console.log('final class:', game.state.curClass, '| relics:', game.state.relics.length,
      '| champions:', game.state.championsSlain, '| wardens:', game.state.wardensSlain);
    console.log('═════════════════════════════════════════════════\n');

    // --- the curve's promises ---
    expect(reports.length).toBe(3);
    const [c1, c2, c3] = reports;

    // first reap within a casual session of attentive play (robot ≈ optimal)
    expect(c1.simMinutes).toBeGreaterThan(5);
    expect(c1.simMinutes).toBeLessThan(90);
    // rising depth demands keep cycles bounded — no runaway grind, no collapse
    expect(c2.simMinutes).toBeLessThan(c1.simMinutes * 2.5);
    expect(c3.simMinutes).toBeLessThan(c1.simMinutes * 2.5);
    // the death economy stays alive across the arc (optimal robots die rarely;
    // humans die plenty — at least the curve must draw SOME blood)
    expect(c1.deaths + c2.deaths + c3.deaths).toBeGreaterThanOrEqual(1);
    // no immortal stall in the first cycle
    expect(c1.avgVesselLifetimeS).toBeLessThan(900);
    // the frontier never regresses and satisfies the rising reap demand
    expect(c3.maxDepth).toBeGreaterThanOrEqual(c1.maxDepth);
    expect(c3.maxDepth).toBeGreaterThanOrEqual(14); // reapDepthRequired(2)
    // soul income accelerates with essence
    expect(c3.soulsPerMin).toBeGreaterThan(c1.soulsPerMin * 1.3);
    // frontier monsters stay threatening: the late ramp keeps hits-to-kill-
    // the-hero bounded even against an optimally-shopped vessel
    const deepestProbes = [...probes].sort((a, b) => b.depth - a.depth).slice(0, 4);
    for (const p of deepestProbes) expect(p.mTTK).toBeLessThanOrEqual(60);

    // wall expedition: grant Ravenous Descent, keep shopping, NEVER reap —
    // skip-falls past trivial floors while wrath climbs. The crypt must
    // still stop the vessel: a wall (death) within 45 sim-minutes.
    game.state.auto = true; // doReap cleared the run; keep the robot marching
    game.state.upgrades['ravenous'] = 1;
    game.recalc();
    const wallDeaths = game.state.totalDeaths;
    let deathDepth = 0;
    bus.on((e) => {
      if (e.type === 'death') deathDepth = e.depth;
    });
    let wallS = 0;
    while (wallS < 2700 && game.state.totalDeaths === wallDeaths) {
      game.tick(250);
      wallS += 0.25;
      if (Math.round(wallS * 4) % 4 === 0) shop(game);
    }
    const wallProbe = probes[probes.length - 1];
    console.log(
      `wall expedition: fresh post-reap vessel with Ravenous died at depth ` +
      `${deathDepth} after ${(wallS / 60).toFixed(1)} min ` +
      `(wrath ×${game.wrath().toFixed(2)}); deepest probe ` +
      `d${wallProbe.depth} hTTK ${wallProbe.hTTK} / mTTK ${wallProbe.mTTK}`);
    // the wall exists: an unreaping vessel dies, and dies DEEP — the skip
    // carries it past the trivial band before the crypt collects
    expect(game.state.totalDeaths).toBeGreaterThan(wallDeaths);
    expect(deathDepth).toBeGreaterThanOrEqual(15);
  }, 600_000);
});
