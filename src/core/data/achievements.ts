import type { GameState } from '../types';

/** Each unlocked achievement grants +2% souls, permanently (survives reaping). */
export const ACH_SOUL_BONUS = 0.02;

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (g: GameState) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstblood',  name: 'First Blood',        desc: 'Kill a monster.',                      check: (g) => g.totalKills >= 1 },
  { id: 'firstdeath',  name: 'As Intended',        desc: 'Lose your first vessel.',              check: (g) => g.totalDeaths >= 1 },
  { id: 'depth5',      name: 'Below the Roots',    desc: 'Reach depth 5.',                       check: (g) => g.bestDepth >= 5 },
  { id: 'depth10',     name: 'Where Light Forgets',desc: 'Reach depth 10.',                      check: (g) => g.bestDepth >= 10 },
  { id: 'depth20',     name: 'The Old Dark',       desc: 'Reach depth 20.',                      check: (g) => g.bestDepth >= 20 },
  { id: 'depth30',     name: 'Past All Prayer',    desc: 'Reach depth 30.',                      check: (g) => g.bestDepth >= 30 },
  { id: 'depth50',     name: 'The Crypt Blinks',   desc: 'Reach depth 50.',                      check: (g) => g.bestDepth >= 50 },
  { id: 'kills100',    name: 'Century of Bones',   desc: 'Kill 100 monsters.',                   check: (g) => g.totalKills >= 100 },
  { id: 'kills1000',   name: 'Charnel Engine',     desc: 'Kill 1,000 monsters.',                 check: (g) => g.totalKills >= 1000 },
  { id: 'kills10000',  name: 'Extinction Clause',  desc: 'Kill 10,000 monsters.',                check: (g) => g.totalKills >= 10000 },
  { id: 'deaths10',    name: 'Renewable Resource', desc: 'Lose 10 vessels.',                     check: (g) => g.totalDeaths >= 10 },
  { id: 'deaths100',   name: 'Mass Production',    desc: 'Lose 100 vessels.',                    check: (g) => g.totalDeaths >= 100 },
  { id: 'souls1k',     name: 'A Modest Harvest',   desc: 'Harvest 1,000 lifetime souls.',        check: (g) => g.lifetimeSouls >= 1e3 },
  { id: 'souls100k',   name: 'The Choir Grows',    desc: 'Harvest 100,000 lifetime souls.',      check: (g) => g.lifetimeSouls >= 1e5 },
  { id: 'souls10m',    name: 'Sea of Voices',      desc: 'Harvest 10 million lifetime souls.',   check: (g) => g.lifetimeSouls >= 1e7 },
  { id: 'firstboss',   name: 'Regicide',           desc: 'Slay a crypt boss.',                   check: (g) => g.bossesSlain >= 1 },
  { id: 'boss10',      name: 'Serial Regicide',    desc: 'Slay 10 crypt bosses.',                check: (g) => g.bossesSlain >= 10 },
  { id: 'firstreap',   name: 'The First Reaping',  desc: 'Collapse the crypt and reap essence.', check: (g) => g.reaps >= 1 },
  { id: 'reap5',       name: 'Harvest Rotation',   desc: 'Reap 5 times.',                        check: (g) => g.reaps >= 5 },
  { id: 'allminions',  name: 'Full Procession',    desc: 'Unlock every minion.',                 check: (g) => Object.values(g.minions).filter((m) => m.level > 0).length >= 4 },
  { id: 'allclasses',  name: 'A Vessel for Every Sin', desc: 'Unlock 6 vessel classes.',         check: (g) => g.classesUnlocked.length >= 6 },
  { id: 'relic1',      name: 'Finders Keepers',    desc: 'Claim a relic.',                       check: (g) => g.relicsFound >= 1 },
  { id: 'relic6',      name: 'Private Collection', desc: 'Claim 6 relics.',                      check: (g) => g.relicsFound >= 6 },
  { id: 'gold1m',      name: 'Grave Robber Baron', desc: 'Loot 1M lifetime gold.',               check: (g) => g.goldLifetime >= 1e6 },
  { id: 'shrine50',    name: 'Devout Customer',    desc: 'Use shrines 50 times.',                check: (g) => g.shrinesUsed >= 50 },
  { id: 'minions100',  name: 'Standing Army',      desc: 'Raise 100 minions.',                   check: (g) => g.minionsRaised >= 100 },
  { id: 'champion1',   name: 'Pedigreed Prey',     desc: 'Slay a champion.',                     check: (g) => g.championsSlain >= 1 },
  { id: 'champion25',  name: 'Trophy Wall',        desc: 'Slay 25 champions.',                   check: (g) => g.championsSlain >= 25 },
  { id: 'vault1',      name: 'Vaultbreaker',       desc: 'Slay a Vault Warden.',                 check: (g) => g.wardensSlain >= 1 },
  { id: 'legend1',     name: 'Apocrypha',          desc: 'Claim a legendary item.',              check: (g) => g.legendariesFound >= 1 },
  { id: 'trial1',      name: 'Oathbound',          desc: 'Conquer the Trial of the Sealed Hall.', check: (g) => g.trialsWon >= 1 },
  { id: 'trial5',      name: 'Keeper of Wagers',   desc: 'Conquer 5 Trials.',                    check: (g) => g.trialsWon >= 5 },
  {
    id: 'genuset', name: 'Defense in Depth', desc: 'Wear the complete genuGate.',
    check: (g) => {
      const gear = g.run?.gear ?? g.keptGear;
      return (['weapon', 'armor', 'charm'] as const)
        .every((s) => gear[s]?.setId === 'genugate');
    },
  },
];
