import '@fontsource/cinzel/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import './style.css';

import { Game } from './core/game';
import { loadGame, saveGame } from './core/save';
import { initRender, drawFrame, CELL } from './ui/render';
import { initUI, uiFrame, modalOpen, closeModal } from './ui/ui';
import { initTooltips } from './ui/tooltip';
import { initMapTip, refreshMapTip } from './ui/maptip';
import { initTutorial } from './ui/tutorial';
import { armAudio } from './ui/sound';

const loaded = loadGame();
const game = new Game(loaded ?? undefined);

// expose for the curious (and for debugging)
(window as unknown as { GW: Game }).GW = game;

const canvas = document.getElementById('dungeon') as HTMLCanvasElement;
initRender(canvas, game);
initUI(game);
initTooltips();
initMapTip(canvas, game);
initTutorial(game);

// the dev room only exists when explicitly summoned: ?dev=1
if (new URLSearchParams(location.search).has('dev')) {
  import('./ui/devroom').then((m) => m.initDevRoom(game));
}

// after the UI is listening — the offline modal rides the event bus
if (loaded) {
  game.applyOffline(Date.now() - loaded.lastSeen);
}

/** ---- logic loop ---- */
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = now - last;
  last = now;
  game.tick(dt);
}, 50);

/** ---- render loop ---- */
let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.min(100, now - lastFrame);
  lastFrame = now;
  drawFrame(dt);
  uiFrame();
  refreshMapTip(); // hovered cells reflect live state, not hover-time state
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/** ---- persistence ---- */
setInterval(() => saveGame(game), 15000);
window.addEventListener('beforeunload', () => saveGame(game));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(game);
});

/** ---- input ---- */
const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
};

window.addEventListener('keydown', (ev) => {
  armAudio();
  if (ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLInputElement) return;

  if (ev.key === 'Escape') {
    closeModal();
    return;
  }
  if (modalOpen()) return;

  // 'a' toggles auto unless used as a movement key while manual — give toggle
  // priority to uppercase-free single tap when auto is on.
  if ((ev.key === 'a' || ev.key === 'A') && game.state.auto) {
    game.state.auto = false;
    return;
  }
  if (ev.key === 'p' || ev.key === 'P') {
    if (game.autoUnlocked()) game.state.auto = !game.state.auto;
    return;
  }

  const move = MOVE_KEYS[ev.key];
  if (move) {
    ev.preventDefault();
    if (game.state.auto) game.state.auto = false;
    game.manualMove(move[0], move[1]);
    return;
  }
  if (ev.key === ' ' || ev.key === '>') {
    ev.preventDefault();
    game.manualDescend();
    return;
  }
});

canvas.addEventListener('click', (ev) => {
  armAudio();
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((ev.clientX - rect.left) / CELL);
  const y = Math.floor((ev.clientY - rect.top) / CELL);
  game.setManualTarget(x, y);
});

document.body.addEventListener('pointerdown', armAudio, { once: false });
