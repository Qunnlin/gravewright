/**
 * The dev room: a floating drawer of cheats for playtesting everything fast.
 * Loaded ONLY when the page is opened with `?dev=1` (dynamic import in
 * main.ts), so it never appears in normal play. State it touches is the
 * regular game state — saves made while cheating are honestly cheated saves.
 */
import type { Game } from '../core/game';
import type { Slot } from '../core/types';
import { bus, log } from '../core/events';
import { spawnMonster, DEFAULT_MODS } from '../core/dungeon';
import { rollItem } from '../core/data/items';
import { SETS, rollSetPiece } from '../core/data/sets';
import { RELICS } from '../core/data/relics';
import { CLASSES } from '../core/data/classes';
import { ESSENCE_UPGRADES } from '../core/data/upgrades';

let game: Game;
let open = false;

export function initDevRoom(g: Game): void {
  game = g;
  const root = document.createElement('div');
  root.id = 'devroom-root';
  root.innerHTML = `<button class="btn" id="devroom-toggle">⚙ DEV</button><div id="devroom" class="hidden"></div>`;
  document.body.appendChild(root);

  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('[data-dev]') as HTMLElement | null;
    if ((ev.target as HTMLElement).id === 'devroom-toggle') {
      open = !open;
      render();
      return;
    }
    if (!target) return;
    handle(target.dataset.dev!, target.dataset.id ?? '');
    render();
  });

  log('⚙ Dev room armed. Saves made here are cheated saves.', 'system');
  render();
}

function render(): void {
  const panel = document.getElementById('devroom')!;
  panel.classList.toggle('hidden', !open);
  if (!open) return;
  const s = game.state;
  const setButtons = SETS.map((set) =>
    (['weapon', 'armor', 'charm'] as Slot[]).map((slot) =>
      `<button class="btn tiny" data-dev="set-piece" data-id="${set.id}:${slot}">${set.id}·${slot[0]}</button>`,
    ).join('')).join('');
  panel.innerHTML = `
    <div class="dev-section"><b>Currencies</b>
      <button class="btn tiny" data-dev="gold">+10k gold</button>
      <button class="btn tiny" data-dev="bones">+10k bones</button>
      <button class="btn tiny" data-dev="souls">+50k souls</button>
      <button class="btn tiny" data-dev="essence">+50 essence</button>
    </div>
    <div class="dev-section"><b>Vessel</b>
      <button class="btn tiny" data-dev="heal">full heal</button>
      <button class="btn tiny ${game.devInvulnerable ? 'toggle on' : ''}" data-dev="god">god ${game.devInvulnerable ? 'ON' : 'OFF'}</button>
      <button class="btn tiny danger" data-dev="kill">kill vessel</button>
      <button class="btn tiny" data-dev="classes">unlock classes</button>
      <button class="btn tiny" data-dev="qol">unlock QoL</button>
    </div>
    <div class="dev-section"><b>Depth</b>
      <input id="dev-depth" type="number" min="1" max="500" value="${s.run?.depth ?? 1}">
      <button class="btn tiny" data-dev="jump">jump</button>
      <button class="btn tiny" data-dev="warp">+10min sim</button>
    </div>
    <div class="dev-section"><b>Spawns</b>
      <button class="btn tiny" data-dev="spawn" data-id="elite">elite</button>
      <button class="btn tiny" data-dev="spawn" data-id="mini">warden</button>
      <button class="btn tiny" data-dev="spawn" data-id="boss">boss</button>
      <button class="btn tiny" data-dev="trial">trial next floor</button>
      <button class="btn tiny" data-dev="wrath">+1 wrath step</button>
      <button class="btn tiny" data-dev="server">server room</button>
    </div>
    <div class="dev-section"><b>Loot</b>
      <button class="btn tiny" data-dev="item" data-id="3">epic</button>
      <button class="btn tiny" data-dev="item" data-id="5">legendary</button>
      <button class="btn tiny" data-dev="relics">all relics</button><br>
      ${setButtons}
    </div>`;
}

function handle(act: string, id: string): void {
  const s = game.state;
  const run = s.run;
  switch (act) {
    case 'gold': game.gainGold(10_000, true); break;
    case 'bones': game.gainBones(10_000, true); break;
    case 'souls': game.gainSouls(50_000, true); break;
    case 'essence': s.essence += 50; break;
    case 'heal':
      if (run) run.hp = game.d.maxHp;
      break;
    case 'god':
      game.devInvulnerable = !game.devInvulnerable;
      log(`⚙ God mode ${game.devInvulnerable ? 'ON' : 'OFF'}.`, 'system');
      break;
    case 'kill':
      if (run) {
        run.hp = 0;
        game.retire(); // routes through the normal death path
      }
      break;
    case 'classes':
      for (const c of CLASSES) {
        if (!s.classesUnlocked.includes(c.id)) s.classesUnlocked.push(c.id);
      }
      break;
    case 'qol':
      for (const u of ESSENCE_UPGRADES) {
        if (['sexton', 'seal', 'tithe'].includes(u.id)) s.upgrades[u.id] = 1;
      }
      game.recalc();
      break;
    case 'jump': {
      const v = Number((document.getElementById('dev-depth') as HTMLInputElement).value);
      if (run && Number.isFinite(v) && v >= 1) {
        run.depth = Math.floor(v) - 1;
        game.descend();
      }
      break;
    }
    case 'warp':
      for (let i = 0; i < 10 * 60 * 4; i++) game.tick(250);
      break;
    case 'spawn': {
      if (!run) break;
      const floor = run.floor;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1]]) {
        const x = game.heroPos.x + dx;
        const y = game.heroPos.y + dy;
        if (floor.tiles[y * floor.w + x] === 0) continue;
        if (floor.monsters.some((m) => m.x === x && m.y === y && m.hp > 0)) continue;
        const opts = id === 'elite' ? { elite: true } : id === 'mini' ? { mini: true } : { boss: true };
        const m = spawnMonster(run.depth, x, y, DEFAULT_MODS, opts);
        m.awake = true;
        floor.monsters.push(m);
        break;
      }
      break;
    }
    case 'trial':
      s.trialPending = true;
      log('⚙ A Sealed Hall waits on the next non-boss floor.', 'system');
      break;
    case 'wrath':
      s.soulsThisReap += 6000;
      break;
    case 'server':
      if (run) {
        // recolor this floor now; the streak (natives + loot) starts below
        run.floor.biome = 'server';
        run.biomeFloorsLeft = 3;
        log('⚙ The racks hum: this floor recolored, the next 3 are full server room.', 'system');
      }
      break;
    case 'item':
      if (run) game.acquireItem(rollItem(run.depth, Number(id), run.klass));
      break;
    case 'relics':
      for (const r of RELICS) {
        if (!s.relics.includes(r.id)) s.relics.push(r.id);
        if (!s.relicsSeen.includes(r.id)) s.relicsSeen.push(r.id);
      }
      s.relicsFound = Math.max(s.relicsFound, s.relics.length);
      game.recalc();
      break;
    case 'set-piece': {
      const [setId, slot] = id.split(':');
      const piece = rollSetPiece(setId, slot as Slot, run?.depth ?? 10);
      if (piece) game.acquireItem(piece);
      break;
    }
  }
  bus.emit({ type: 'dirty' });
}
