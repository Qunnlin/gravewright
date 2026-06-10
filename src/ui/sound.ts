import { ZZFX, zzfx } from 'zzfx';
import type { Game } from '../core/game';

/** ZzFX presets — tuned for "wet crypt synth". */
const SOUNDS: Record<string, (number | undefined)[]> = {
  hit:        [.4, , 129, .01, , .08, , 2.8, , , , , , .8, , .1, , .6, .02],
  crit:       [.6, , 196, .01, .02, .15, , 3.2, -2, , , , , 1.2, , .2, , .55, .03],
  hurt:       [.5, , 88, .01, .03, .14, 2, 1.6, -4, , , , , 1.5, , .3, , .5, .05],
  zap:        [.4, , 488, , .02, .1, 1, 2.4, -8, , , , .02, , , .1, , .6, .02],
  kill:       [.5, , 71, .02, .05, .22, 2, 1.2, , , , , , 1.8, , .4, , .45, .08],
  gold:       [.35, , 1675, , .04, .14, 1, 1.8, , , 837, .06, , , , , , .6, .02],
  bones:      [.35, , 224, .01, .03, .12, 4, 1.1, , , , , , .6, , .1, , .5, .02],
  heal:       [.4, , 524, .03, .18, .25, 1, 1.4, , , 196, .08, .05, , , , , .5, .1],
  chest:      [.4, , 110, .02, .12, .3, 1, .9, , , 224, .09, .08, , , , , .55, .12],
  equip:      [.4, , 336, .01, .08, .18, 1, 1.7, , , 112, .07, .04, , , , , .55, .05],
  shrine:     [.45, , 392, .04, .25, .4, 1, 1.2, , , 98, .1, .1, , , .1, , .5, .15],
  well:       [.5, , 261, .05, .3, .5, 1, .8, , 2, 130, .12, .12, , , .15, , .5, .2],
  buy:        [.3, , 658, .01, .03, .08, 1, 1.9, , , 220, .04, , , , , , .5, .02],
  raise:      [.5, , 65, .05, .2, .4, 2, .7, , 1, , , .1, 1.2, , .2, , .5, .15],
  miniondown: [.45, , 97, .02, .08, .25, 2, 1.1, -2, , , , , 1.4, , .25, , .5, .08],
  levelup:    [.5, , 392, .02, .2, .3, 1, 1.6, , , 261, .1, .06, , , , , .55, .1],
  death:      [.7, , 49, .08, .3, .9, 2, .6, -1, , , , .15, 1.6, , .4, .2, .45, .25],
  summon:     [.45, , 130, .06, .25, .45, 2, .8, , 1, 65, .1, .12, , , .15, , .5, .2],
  descend:    [.4, , 73, .04, .15, .35, 2, .9, -2, , , , .08, .8, , .2, , .5, .12],
  boss:       [.7, , 41, .1, .4, .8, 2, .5, , -1, , , .2, 1.8, , .5, .3, .4, .3],
  bosskill:   [.8, , 55, .05, .4, 1.1, 2, .6, -1, 1, , , .2, 2, , .5, .25, .4, .35],
  relic:      [.55, , 523, .03, .3, .5, 1, 1.3, , , 261, .12, .1, , , , , .5, .2],
  achievement:[.45, , 440, .02, .2, .35, 1, 1.5, , , 220, .1, .08, , , , , .55, .12],
  classunlock:[.5, , 349, .03, .25, .45, 1, 1.2, , , 174, .12, .1, , , , , .5, .18],
  reap:       [.9, , 36, .15, .6, 1.6, 2, .4, , -.5, , , .3, 2.2, , .6, .4, .35, .5],
};

const lastPlayed: Record<string, number> = {};
let unlocked = false;

/** Browsers require a user gesture before audio; arm on first interaction. */
export function armAudio(): void {
  if (unlocked) return;
  unlocked = true;
  ZZFX.volume = 0.22;
}

export function playSound(game: Game, name: string): void {
  if (!unlocked || !game.state.settings.sound) return;
  const params = SOUNDS[name];
  if (!params) return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -1000) < 70) return; // anti machine-gun
  lastPlayed[name] = now;
  try {
    zzfx(...params);
  } catch {
    /* audio context unavailable */
  }
}
