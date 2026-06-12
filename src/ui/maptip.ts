/** Map hover inspector: hover any seen cell for monster stats, vessel info,
 *  loot amounts and landmark details. Rides the shared #tooltip div via the
 *  programmatic API in tooltip.ts; anchored [data-tip] tooltips always win. */

import { TILE, type Floor, type Monster, type MonsterSpecial } from '../core/types';
import type { Game } from '../core/game';
import { CELL } from './render';
import { showTipAt, hideTip } from './tooltip';
import { modalOpen } from './ui';
import { monsterDefByKey } from '../core/data/monsters';
import { biomeById } from '../core/data/biomes';
import { enchantById } from '../core/data/enchants';
import { classById } from '../core/data/classes';
import { fmt } from '../core/format';
import * as B from '../core/balance';

let game: Game;

/** Same contract as ui.ts esc(): every dynamic string passes through here. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SPECIAL_NOTES: Record<MonsterSpecial, string> = {
  fast: 'Fast — acts twice per hero turn',
  slow: 'Slow — acts every other turn',
  poison: 'Poisonous — its hits afflict a poison dot',
  burn: 'Burning — its hits afflict a burn dot',
  vampiric: 'Vampiric — heals for 60% of damage dealt',
  ranged: 'Ranged — strikes from up to 3 tiles with line of sight',
  regen: 'Regenerating — recovers 3% max HP per turn',
  summon: 'Summoner — raises lesser dead mid-fight',
  thief: 'Thief — steals gold on hit',
  armored: 'Armored — bonus defense baked in',
  deadly: 'Deadly — 20% chance to crit',
};

let canvasEl: HTMLCanvasElement;
/** last cursor position while over the canvas; null = not hovering */
let last: { cx: number; cy: number } | null = null;
let lastHtml = '';

export function initMapTip(canvas: HTMLCanvasElement, g: Game): void {
  game = g;
  canvasEl = canvas;
  canvas.addEventListener('mousemove', (ev) => {
    last = { cx: ev.clientX, cy: ev.clientY };
    refreshMapTip();
  });
  canvas.addEventListener('mouseleave', () => {
    last = null;
    lastHtml = '';
    hideTip();
  });
}

/** Re-resolve the hovered cell against LIVE state. Called on every mousemove
 *  and once per animation frame (main.ts), so a motionless cursor still sees
 *  HP drain, monsters die, floors change — and the tip yields to modals. */
export function refreshMapTip(): void {
  if (!last) return;
  if (modalOpen()) {
    lastHtml = '';
    hideTip();
    return;
  }
  const rect = canvasEl.getBoundingClientRect();
  const x = Math.floor((last.cx - rect.left) / CELL);
  const y = Math.floor((last.cy - rect.top) / CELL);
  const html = buildTip(x, y);
  if (html) {
    if (html !== lastHtml) {
      lastHtml = html;
      showTipAt(html, last.cx, last.cy, true);
    } else {
      showTipAt(html, last.cx, last.cy, false);
    }
  } else {
    lastHtml = '';
    hideTip();
  }
}

function buildTip(x: number, y: number): string | null {
  const run = game.state.run;
  if (!run) return null;
  const floor = run.floor;
  if (x < 0 || y < 0 || x >= floor.w || y >= floor.h) return null;
  const i = y * floor.w + x;
  if (!floor.seen[i]) return null;
  const vis = floor.visible[i] === 1;

  // monsters only exist for the eye while in the field of view
  if (vis) {
    const m = floor.monsters.find((mm) => mm.x === x && mm.y === y && mm.hp > 0);
    if (m) return monsterTip(m);
  }

  if (game.heroPos.x === x && game.heroPos.y === y) return heroTip();

  const lines: string[] = [];
  for (const it of floor.items) {
    if (it.x !== x || it.y !== y) continue;
    if (it.kind === 'gold') lines.push(`<span class='tip-name c-gold'>⛁ ${fmt(it.amount)} gold</span><br><span class='tip-sub'>carried by the vessel; mostly lost on death</span>`);
    else if (it.kind === 'bones') lines.push(`<span class='tip-name c-bones'>∴ ${fmt(it.amount)} bones</span><br><span class='tip-sub'>persist through death</span>`);
    else if (it.kind === 'chest') {
      const bdef = it.special && floor.biome ? biomeById(floor.biome) : undefined;
      lines.push(it.special
        ? (bdef
          ? `<span class='tip-name' style='color:${bdef.cacheColor}'>${esc(bdef.cacheName)}</span><br><span class='tip-sub'>${esc(bdef.cacheDesc)}</span>`
          : `<span class='tip-name'>▣ Vault hoard</span><br><span class='tip-sub'>an epic — or better — sleeps inside</span>`)
        : `<span class='tip-name'>▣ A sealed chest</span><br><span class='tip-sub'>something shifts inside</span>`);
    }
    else if (it.kind === 'potion') lines.push(`<span class='tip-name' style='color:#ff6688'>! A crimson draught</span><br><span class='tip-sub'>restores the vessel's health</span>`);
  }
  if (lines.length > 0) return lines.join('<br>');

  return tileTip(floor, floor.tiles[i], vis);
}

function monsterTip(m: Monster): string {
  const lines: string[] = [];
  const rank = m.boss ? 'Boss'
    : m.mini ? 'Vault Warden'
    : m.elite ? 'Dread elite'
    : m.enchants.length > 0 ? 'Champion'
    : `Tier ${m.tier}`;
  lines.push(`<span class='tip-name' style='color:${m.color}'>${esc(m.glyph)} ${esc(m.name)}</span>`);
  lines.push(`<span class='tip-sub'>${rank}${m.awake ? '' : ' · asleep'}</span>`);
  lines.push(`<span class='tip-affix'>HP ${fmt(Math.ceil(m.hp))} / ${fmt(m.maxHp)} · ATK ${fmt(Math.round(m.atk))} · DEF ${fmt(Math.round(m.def))}</span>`);
  if (m.def > 0) {
    const eHp = Math.round(m.maxHp / (1 - B.mitigation(m.def)));
    lines.push(`<span class='tip-kind'>armored — takes ~${fmt(eHp)} raw damage to put down</span>`);
  }
  for (const sp of m.specials) {
    lines.push(`<span class='tip-kind'>◦ ${esc(SPECIAL_NOTES[sp])}</span>`);
  }
  for (const id of m.enchants) {
    const e = enchantById(id);
    if (e) lines.push(`<span class='tip-enchant'>✦ ${esc(e.prefix)} — ${esc(e.desc)}</span>`);
  }
  const def = monsterDefByKey(m.key);
  if (def && !m.boss && !m.mini) lines.push(`<span class='tip-flavor'>${esc(def.flavor)}</span>`);
  return lines.join('<br>');
}

function heroTip(): string {
  const run = game.state.run!;
  const d = game.d;
  const lines: string[] = [];
  const klass = classById(run.klass);
  lines.push(`<span class='tip-name' style='color:${klass.glyphColor}'>@ ${esc(run.heroName)}</span>`);
  lines.push(`<span class='tip-sub'>${esc(klass.name)} · Lv ${run.level}</span>`);
  lines.push(`<span class='tip-affix'>HP ${fmt(Math.max(0, Math.ceil(run.hp)))} / ${fmt(d.maxHp)} · ATK ${fmt(Math.round(d.atk))} · DEF ${fmt(Math.round(d.def))}</span>`);

  if (run.blessTurns > 0) lines.push(`<span class='tip-kind' style='color:#ffee88'>☩ Blessed — +25% damage, ${run.blessTurns} turns left</span>`);
  for (const st of run.statuses) {
    const label = st.kind === 'poison' ? 'Poisoned' : 'Burning';
    const color = st.kind === 'poison' ? '#7fdd6a' : '#ff8844';
    lines.push(`<span class='tip-kind' style='color:${color}'>◦ ${label} — ${fmt(Math.ceil(st.power))} HP/turn, ${st.turns} turns left</span>`);
  }
  return lines.join('<br>');
}

function tileTip(floor: Floor, t: number, vis: boolean): string | null {
  const fog = vis ? '' : `<br><span class='tip-sub'>remembered through the fog</span>`;
  switch (t) {
    case TILE.STAIRS: {
      // Ravenous Descent may collapse floors mid-fall — never promise a number
      // we can't keep (the skip chain consumes rng; it can't be previewed)
      const ravenous = (game.state.upgrades['ravenous'] ?? 0) > 0
        && game.state.settings.ravenousActive && !game.state.run!.trialActive;
      const sub = ravenous
        ? '≫ descend — Ravenous Descent collapses trivial floors below'
        : `descend to depth ${floor.depth + 1}`;
      return `<span class='tip-name' style='color:#ff5566'>▼ Stairs</span><br><span class='tip-sub'>${sub} (Space when standing here)</span>` + fog;
    }
    case TILE.SHRINE: {
      if (floor.shrine?.used) return `<span class='tip-name' style='color:#4a4658'>☩ A spent shrine</span><br><span class='tip-sub'>cold and grey; it has nothing left to give</span>` + fog;
      const cost = game.d.shrinesFree ? 'free for this vessel' : `⛁ ${fmt(B.shrineCost(floor.depth))} gold`;
      return `<span class='tip-name' style='color:#ffee88'>☩ Shrine</span><br><span class='tip-sub'>full heal + ${B.BLESS_TURNS} turns of +25% damage — ${cost}</span>` + fog;
    }
    case TILE.WELL:
      return floor.well?.used
        ? `<span class='tip-name' style='color:#4a4658'>◉ A drained soul well</span>` + fog
        : `<span class='tip-name' style='color:#bb99ff'>◉ Soul well</span><br><span class='tip-sub'>a free draught of ~✦ ${fmt(Math.round(B.wellSouls(floor.depth) * game.d.soulMult))} souls</span>` + fog;
    case TILE.TRIAL:
      return floor.trial?.used
        ? `<span class='tip-name' style='color:#3a2a55'>◈ The spent altar</span><br><span class='tip-sub'>the Hall has already made its wager</span>` + fog
        : `<span class='tip-name rainbow-text'>◈ The Sealed Hall</span><br><span class='tip-sub'>step here to hear the wager: survive the onslaught for a Vestige — or forfeit souls</span>` + fog;
    case TILE.VAULT:
      return `<span class='tip-name' style='color:#c4a5ff'>◆ The Vault</span><br><span class='tip-sub'>a sealed treasure room; its Warden guards the hoard</span>` + fog;
    default:
      return null;
  }
}
