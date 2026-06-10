/** Tiny event bus decoupling the core simulation from DOM/canvas/sound. */

export type GameEvent =
  | { type: 'log'; msg: string; cls?: string }
  | { type: 'float'; x: number; y: number; text: string; color: string }
  | { type: 'shake'; power: number }
  | { type: 'flash'; color: string }
  | { type: 'sound'; name: string }
  | { type: 'death'; name: string; depth: number; souls: number; kills: number }
  | { type: 'summon'; name: string; klass: string }
  | { type: 'descend'; depth: number }
  | { type: 'levelup'; level: number }
  | { type: 'boss'; name: string }
  | { type: 'bosskill'; name: string }
  | { type: 'achievement'; id: string }
  | { type: 'relic'; id: string }
  | { type: 'item'; item: import('./types').Item; equipped: boolean }
  | { type: 'reap'; essence: number }
  | { type: 'trialOffer'; wasAuto: boolean }
  | { type: 'trialResult'; won: boolean; piece?: string }
  | { type: 'offline'; ms: number; souls: number; bones: number }
  | { type: 'dirty' };       // something changed; UI should refresh panels

type Handler = (e: GameEvent) => void;

const handlers: Handler[] = [];

export const bus = {
  on(fn: Handler): () => void {
    handlers.push(fn);
    return () => {
      const i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    };
  },
  emit(e: GameEvent): void {
    for (const fn of handlers) fn(e);
  },
  clear(): void {
    handlers.length = 0;
  },
};

export function log(msg: string, cls?: string): void {
  bus.emit({ type: 'log', msg, cls });
}
