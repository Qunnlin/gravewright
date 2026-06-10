/** Canvas renderer: the crypt, its inhabitants, and all the juice. */

import { TILE } from '../core/types';
import type { Game } from '../core/game';
import { bus, type GameEvent } from '../core/events';
import { FLOOR_W, FLOOR_H } from '../core/dungeon';
import { classById } from '../core/data/classes';
import { MINIONS } from '../core/data/upgrades';
import { fmtTime } from '../core/format';

export const CELL = 17;

interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  drift: number;
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let game: Game;
let floats: Float[] = [];
let shakeMs = 0;
let shakePower = 0;
let flashMs = 0;
let flashColor = '#ff0000';
let deathBannerMs = 0;
let deathBannerText = '';

export function initRender(canvasEl: HTMLCanvasElement, g: Game): void {
  canvas = canvasEl;
  game = g;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = FLOOR_W * CELL * dpr;
  canvas.height = FLOOR_H * CELL * dpr;
  canvas.style.width = `${FLOOR_W * CELL}px`;
  canvas.style.height = `${FLOOR_H * CELL}px`;
  ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  bus.on(onEvent);
}

function onEvent(e: GameEvent): void {
  if (e.type === 'float') {
    if (!game.state.settings.particles) return;
    floats.push({
      x: e.x, y: e.y, text: e.text, color: e.color,
      age: 0, drift: (Math.random() - 0.5) * 0.6,
    });
    if (floats.length > 60) floats.splice(0, floats.length - 60);
  } else if (e.type === 'shake') {
    shakeMs = 280;
    shakePower = e.power;
  } else if (e.type === 'flash') {
    flashMs = 220;
    flashColor = e.color;
  } else if (e.type === 'death') {
    deathBannerMs = 2000;
    deathBannerText = `✝ ${e.name} — depth ${e.depth} — +${Math.floor(e.souls)} souls`;
    shakeMs = 350;
    shakePower = 6;
    flashMs = 260;
    flashColor = '#aa0022';
  } else if (e.type === 'levelup') {
    flashMs = 160;
    flashColor = '#22aa44';
  } else if (e.type === 'reap') {
    // the crypt collapsed — no effect may outlive it
    floats = [];
    shakeMs = 0;
    flashMs = 0;
    deathBannerMs = 0;
  }
}

const TILE_GLYPHS: Record<number, { glyph: string; color: string }> = {
  [TILE.STAIRS]: { glyph: '▼', color: '#ff5566' },
  [TILE.SHRINE]: { glyph: '☩', color: '#ffee88' },
  [TILE.WELL]: { glyph: '◉', color: '#bb99ff' },
};

const ITEM_GLYPHS: Record<string, { glyph: string; color: string }> = {
  gold: { glyph: '$', color: '#ffd700' },
  bones: { glyph: '∴', color: '#d8d0b8' },
  chest: { glyph: '▣', color: '#cc8844' },
  potion: { glyph: '!', color: '#ff6688' },
};

let animClock = 0;

export function drawFrame(dt: number): void {
  const w = FLOOR_W * CELL;
  const h = FLOOR_H * CELL;
  animClock += dt;

  ctx.save();

  // screen shake
  if (shakeMs > 0) {
    shakeMs -= dt;
    const p = (shakeMs / 280) * shakePower;
    ctx.translate((Math.random() - 0.5) * p, (Math.random() - 0.5) * p);
  }

  ctx.fillStyle = '#07070d';
  ctx.fillRect(-10, -10, w + 20, h + 20);

  const run = game.state.run;
  if (run) {
    drawFloor();
    drawEntities();
    drawProcession();
    drawHero();
    drawNameTags();
  }
  drawFloats(dt);

  ctx.restore();

  // flash overlay
  if (flashMs > 0) {
    flashMs -= dt;
    ctx.save();
    ctx.globalAlpha = Math.max(0, (flashMs / 220) * 0.25);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // boss floor vignette
  if (run?.floor.isBossFloor && run.floor.monsters.some((m) => m.boss)) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h / 3, w / 2, h / 2, h);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(120,0,30,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  if (!run) drawSummoning();

  if (deathBannerMs > 0) {
    deathBannerMs -= dt;
    ctx.save();
    ctx.globalAlpha = Math.min(1, deathBannerMs / 600);
    ctx.fillStyle = 'rgba(8,4,10,0.75)';
    ctx.fillRect(0, h / 2 - 36, w, 72);
    ctx.font = '700 22px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff6677';
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 18;
    ctx.fillText(deathBannerText, w / 2, h / 2);
    ctx.restore();
  }
}

function drawFloor(): void {
  const floor = game.state.run!.floor;
  ctx.font = `${CELL - 3}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < floor.h; y++) {
    for (let x = 0; x < floor.w; x++) {
      const i = y * floor.w + x;
      if (!floor.seen[i]) continue;
      const vis = floor.visible[i] === 1;
      const t = floor.tiles[i];
      const px = x * CELL;
      const py = y * CELL;

      if (t === TILE.WALL) {
        ctx.fillStyle = vis ? '#23233a' : '#15151f';
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = vis ? '#2e2e4a' : '#1b1b29';
        ctx.fillRect(px, py, CELL, 2);
      } else {
        const isVault = t === TILE.VAULT;
        ctx.fillStyle = isVault
          ? (vis ? '#1a1130' : '#100a1d')
          : (vis ? '#0d0d18' : '#090911');
        ctx.fillRect(px, py, CELL, CELL);
        if (t === TILE.TRIAL) {
          // the Sealed Hall's shrine shimmers through every color it has eaten
          const hue = Math.floor(animClock / 9) % 360;
          const c = vis ? `hsl(${hue} 90% 65%)` : '#3a2a55';
          ctx.fillStyle = c;
          if (vis) {
            ctx.shadowColor = c;
            ctx.shadowBlur = 10;
          }
          ctx.fillText('◈', px + CELL / 2, py + CELL / 2 + 1);
          ctx.shadowBlur = 0;
          continue;
        }
        const special = TILE_GLYPHS[t];
        if (special) {
          // spent shrines and wells go cold and grey — no glow, no promise
          const spent =
            (t === TILE.SHRINE && floor.shrine?.used) ||
            (t === TILE.WELL && floor.well?.used);
          if (spent) {
            ctx.fillStyle = vis ? '#4a4658' : '#2a2734';
          } else {
            ctx.fillStyle = vis ? special.color : dim(special.color);
            if (vis && (t === TILE.SHRINE || t === TILE.WELL)) {
              ctx.shadowColor = special.color;
              ctx.shadowBlur = 8;
            }
          }
          ctx.fillText(special.glyph, px + CELL / 2, py + CELL / 2 + 1);
          ctx.shadowBlur = 0;
        } else if (vis) {
          ctx.fillStyle = isVault ? '#41306b' : '#1f1f30';
          ctx.fillText(isVault ? '◆' : '·', px + CELL / 2, py + CELL / 2 + 1);
        }
      }
    }
  }
}

function drawEntities(): void {
  const floor = game.state.run!.floor;
  ctx.font = `${CELL - 3}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const it of floor.items) {
    const i = it.y * floor.w + it.x;
    if (!floor.seen[i]) continue;
    const g = ITEM_GLYPHS[it.kind];
    ctx.fillStyle = floor.visible[i] ? g.color : dim(g.color);
    ctx.fillText(g.glyph, it.x * CELL + CELL / 2, it.y * CELL + CELL / 2 + 1);
  }

  for (const m of floor.monsters) {
    const i = m.y * floor.w + m.x;
    if (!floor.visible[i]) continue;
    const px = m.x * CELL + CELL / 2;
    const py = m.y * CELL + CELL / 2 + 1;
    if (m.boss || m.mini || m.elite || m.enchants.length > 0) {
      ctx.shadowColor = m.color;
      ctx.shadowBlur = m.boss ? 14 : m.mini ? 12 : m.elite ? 8 : 7;
    }
    ctx.fillStyle = m.color;
    if (!m.awake) ctx.globalAlpha = 0.55;
    ctx.fillText(m.glyph, px, py);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // corner badge marks the dangerous ones at a glance
    if (m.elite || m.enchants.length > 0) {
      ctx.font = `8px "JetBrains Mono", monospace`;
      ctx.fillStyle = m.elite ? '#ffd700' : '#7fc7ff';
      ctx.fillText(m.elite ? '✦' : '◆', m.x * CELL + CELL - 4, m.y * CELL + 5);
      ctx.font = `${CELL - 3}px "JetBrains Mono", monospace`;
    }

    if (m.hp < m.maxHp) {
      const frac = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = '#000';
      ctx.fillRect(m.x * CELL + 2, m.y * CELL - 2, CELL - 4, 3);
      ctx.fillStyle = frac > 0.5 ? '#5fbb4f' : frac > 0.25 ? '#ccaa33' : '#cc3344';
      ctx.fillRect(m.x * CELL + 2, m.y * CELL - 2, (CELL - 4) * frac, 3);
    }
  }
}

/** The procession: living minions march along the hero's recent path. */
function drawProcession(): void {
  const trail = game.trail;
  if (trail.length === 0) return;
  const floor = game.state.run!.floor;
  ctx.font = `${CELL - 5}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let ti = 0;
  for (const def of MINIONS) {
    const st = game.state.minions[def.id];
    if (!st || st.level === 0 || !st.alive) continue;
    const pos = trail[ti++];
    if (!pos) break;
    if (!floor.visible[pos.y * floor.w + pos.x]) continue;
    if (pos.x === game.heroPos.x && pos.y === game.heroPos.y) continue;
    if (floor.monsters.some((m) => m.x === pos.x && m.y === pos.y)) continue;
    ctx.globalAlpha = 0.82;
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 5;
    ctx.fillStyle = def.color;
    ctx.fillText(def.glyph, pos.x * CELL + CELL / 2, pos.y * CELL + CELL / 2 + 1);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

/** Name tags over visible special monsters — read the enchants before charging. */
function drawNameTags(): void {
  const floor = game.state.run!.floor;
  const w = FLOOR_W * CELL;
  ctx.font = `700 9px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const m of floor.monsters) {
    if (!(m.boss || m.mini || m.elite || m.enchants.length > 0)) continue;
    if (!floor.visible[m.y * floor.w + m.x]) continue;
    let name = m.name;
    if (name.length > 28) name = name.slice(0, 27) + '…';
    const tw = ctx.measureText(name).width;
    const px = Math.min(w - tw / 2 - 4, Math.max(tw / 2 + 4, m.x * CELL + CELL / 2));
    // stagger neighbors so adjacent tags don't overlap; flip below near the top edge
    let py = m.y * CELL - 9 - ((m.x + m.y) % 2) * 9;
    if (py < 8) py = m.y * CELL + CELL + 8;
    ctx.fillStyle = 'rgba(5,4,12,0.86)';
    ctx.fillRect(px - tw / 2 - 4, py - 6, tw + 8, 12);
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = 0.55;
    ctx.strokeRect(px - tw / 2 - 4.5, py - 6.5, tw + 9, 13);
    ctx.globalAlpha = 1;
    ctx.fillStyle = m.color;
    ctx.fillText(name, px, py + 0.5);
  }
}

function drawHero(): void {
  const run = game.state.run!;
  const { x, y } = game.heroPos;
  const px = x * CELL + CELL / 2;
  const py = y * CELL + CELL / 2 + 1;
  const klass = classById(run.klass);

  // manual target marker
  if (run.manualTarget) {
    ctx.strokeStyle = 'rgba(255,255,150,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(run.manualTarget.x * CELL + 2, run.manualTarget.y * CELL + 2, CELL - 4, CELL - 4);
  }

  ctx.font = `700 ${CELL - 2}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = klass.glyphColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = klass.glyphColor;
  ctx.fillText('@', px, py);
  ctx.shadowBlur = 0;

  // blessed aura
  if (run.blessTurns > 0) {
    ctx.strokeStyle = 'rgba(255,238,136,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // status pips
  let pip = 0;
  for (const st of run.statuses) {
    ctx.fillStyle = st.kind === 'poison' ? '#7fdd6a' : '#ff8844';
    ctx.fillRect(x * CELL + 2 + pip * 5, y * CELL + CELL - 3, 4, 3);
    pip++;
  }
}

function drawFloats(dt: number): void {
  for (const f of floats) f.age += dt;
  floats = floats.filter((f) => f.age < 950);
  ctx.font = `700 12px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  for (const f of floats) {
    const t = f.age / 950;
    ctx.globalAlpha = 1 - t * t;
    ctx.fillStyle = f.color;
    ctx.fillText(
      f.text,
      f.x * CELL + CELL / 2 + f.drift * f.age * 0.04,
      f.y * CELL - t * 22,
    );
  }
  ctx.globalAlpha = 1;
}

function drawSummoning(): void {
  const w = FLOOR_W * CELL;
  const h = FLOOR_H * CELL;
  ctx.fillStyle = 'rgba(7,7,13,0.92)';
  ctx.fillRect(0, 0, w, h);

  const cd = game.state.summonCd;
  const pulse = 0.6 + 0.4 * Math.sin(animClock / 300);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 26px Cinzel, serif';
  ctx.fillStyle = `rgba(157,123,255,${pulse})`;
  ctx.shadowColor = '#9d7bff';
  ctx.shadowBlur = 20;
  ctx.fillText('SUMMONING', w / 2, h / 2 - 18);
  ctx.shadowBlur = 0;
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8888aa';
  ctx.fillText(
    cd > 0 ? `a fresh vessel arrives in ${fmtTime(cd)}` : 'the circle is drawn…',
    w / 2, h / 2 + 16,
  );
}

function dim(hex: string): string {
  // crude 45% darken for fog-of-war memory
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * 0.45);
  const g = Math.floor(((n >> 8) & 255) * 0.45);
  const b = Math.floor((n & 255) * 0.45);
  return `rgb(${r},${g},${b})`;
}
