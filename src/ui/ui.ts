/** DOM UI: HUD, tabbed panels, shops, log, modals. */

import type { Game } from '../core/game';
import type { Item, StatusKind, Strategy } from '../core/types';
import { bus, type GameEvent } from '../core/events';
import { fmt, fmtMult, fmtTime } from '../core/format';
import * as B from '../core/balance';
import { BONE_UPGRADES, SOUL_UPGRADES, ESSENCE_UPGRADES, MINIONS, minionLevelCost, mendCost, type UpgradeDef } from '../core/data/upgrades';
import { CLASSES, classById } from '../core/data/classes';
import { CURSES } from '../core/data/curses';
import { RELICS, relicById } from '../core/data/relics';
import { setById } from '../core/data/sets';
import { ACHIEVEMENTS } from '../core/data/achievements';
import {
  AFFIX_DEFS, RARITY_COLORS, RARITY_NAMES, WEAPON_KINDS, describeItem,
  kindAllows, kindFavors, kindUsableBy, scoreItem,
} from '../core/data/items';
import type { Affix, WeaponKind } from '../core/types';
import { SAVE_KEY, encodeSave, decodeSave, hardReset, lockSaves, saveGame } from '../core/save';
import { playSound } from './sound';
import { resetTutorial } from './tutorial';

let game: Game;
let activeTab = 'vessel';
let renderQueued = false;
/** autopilot state to restore after the trial-offer pause */
let trialWasAuto = true;

const TABS: { id: string; label: string }[] = [
  { id: 'vessel', label: 'Vessel' },
  { id: 'necro', label: 'Necromancy' },
  { id: 'crypt', label: 'Crypt' },
  { id: 'reap', label: 'Reaping' },
  { id: 'feats', label: 'Feats' },
  { id: 'settings', label: 'Settings' },
];

const $ = (id: string) => document.getElementById(id)!;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function initUI(g: Game): void {
  game = g;

  $('tabs').innerHTML = TABS.map(
    (t) => `<button class="tab" data-act="tab" data-id="${t.id}">${t.label}<span class="badge" id="badge-${t.id}"></span></button>`,
  ).join('');

  document.body.addEventListener('click', onClick);
  // the speed slider lives in the topbar (static DOM, never re-rendered, so
  // the thumb can't be yanked mid-drag) and streams 'input' events
  const speedEl = $('auto-speed') as HTMLInputElement;
  speedEl.value = String(Math.round(g.state.settings.autoSpeed * 100));
  speedEl.addEventListener('input', () => {
    game.state.settings.autoSpeed = Number(speedEl.value) / 100;
    $('auto-speed-note').textContent = autoSpeedNote();
  });
  $('auto-speed-note').textContent = autoSpeedNote();
  bus.on(onEvent);
  applyCrtFilter();
  applyLogFilters();

  renderPanel();
  setInterval(() => renderPanel(), 1000);

  if (game.state.totalDeaths === 0 && game.state.totalKills === 0 && game.state.reaps === 0) {
    showIntro();
  }
}

/** ---------------- event handling ---------------- */

function onEvent(e: GameEvent): void {
  switch (e.type) {
    case 'log':
      addLog(e.msg, e.cls);
      break;
    case 'sound':
      playSound(game, e.name);
      break;
    case 'dirty':
      queueRender();
      break;
    case 'death':
      playSound(game, 'death');
      break;
    case 'achievement': {
      const a = ACHIEVEMENTS.find((x) => x.id === e.id);
      if (a) showToast(`★ <b>${esc(a.name)}</b><br><small>${esc(a.desc)} · +2% souls</small>`, 'toast-feat');
      break;
    }
    case 'relic': {
      const r = relicById(e.id);
      if (r) showToast(`❖ <b>${esc(r.name)}</b><br><small>${esc(r.desc)}</small>`, 'toast-relic');
      break;
    }
    case 'trialOffer':
      trialWasAuto = e.wasAuto;
      showModal(`
        <h2>◈ The Sealed Hall</h2>
        <p class="intro-tag">the shrine hums with old wagers — the vessel holds its breath</p>
        <p>Swearing transports the vessel into the Hall itself: one vast arena,
        <b>${fmt(B.TRIAL_TURNS)} turns of escalating onslaught</b>, then the
        <b>Avatar of the Sealed Hall</b>. There are <b>no stairs</b>. No retreat —
        only victory, death, or reclamation.</p>
        <p><b>Victory:</b> a <span class="rainbow-text">Vestige</span> — a named
        set-piece with a unique power, fitted to this vessel — and a deep draught of souls.</p>
        <p><b>Defeat:</b> <b class="c-souls">two-fifths of your held souls</b>,
        and the dead vessel pays nothing.</p>
        <button class="btn primary" data-act="trial-accept">◈ Swear the Trial</button>
        <button class="btn" data-act="trial-decline">Walk away</button>
      `);
      break;
    case 'trialResult':
      if (e.won) {
        showToast(`◈ <b class="rainbow-text">THE HALL YIELDS</b><br><small>The wager is won.</small>`, 'toast-relic');
      }
      break;
    case 'summon':
      playSound(game, 'summon');
      break;
    case 'descend':
      playSound(game, 'descend');
      break;
    case 'boss':
      playSound(game, 'boss');
      break;
    case 'offline':
      showModal(`
        <h2>While You Were Gone</h2>
        <p>The crypt kept chewing for <b>${fmtTime(e.ms)}</b>.</p>
        <p class="offline-gains">
          <span class="c-souls">+${fmt(e.souls)} souls</span><br>
          <span class="c-bones">+${fmt(e.bones)} bones</span>
        </p>
        <button class="btn primary" data-act="modal-close">Resume the Harvest</button>
      `);
      break;
    case 'reap':
      showModal(`
        <h2>✠ The Reaping</h2>
        <p>The crypt collapses into a single point of cold light. From the rubble you sieve</p>
        <p class="reap-gain c-essence">❖ ${fmt(e.essence)} essence</p>
        <p>Everything else returns to dust. The dust remembers.</p>
        <button class="btn primary" data-act="modal-close">Begin Again</button>
      `);
      break;
    default:
      break;
  }
}

function onClick(ev: MouseEvent): void {
  const target = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!target) return;
  const act = target.dataset.act!;
  const id = target.dataset.id ?? '';

  switch (act) {
    case 'tab':
      activeTab = id;
      renderPanel();
      break;
    case 'buy':
      game.buyUpgradeTimes(id, game.state.settings.buyAmount);
      game.syncEssenceClasses();
      break;
    case 'buy-amount':
      game.state.settings.buyAmount = Number(id);
      queueRender();
      break;
    case 'minion':
      game.buyMinion(id);
      break;
    case 'mend':
      game.mendMinion(id);
      break;
    case 'class-pick':
      game.setClass(id);
      break;
    case 'class-buy':
      game.unlockClass(id);
      break;
    case 'strat':
      game.setStrategy(id as Strategy);
      break;
    case 'curse':
      game.toggleCurse(id);
      break;
    case 'retire':
      if (game.state.run) {
        showModal(`
          <h2>Reclaim the Vessel?</h2>
          <p>${esc(game.state.run.heroName)} still breathes. Reclaiming now yields
          <b>60%</b> of a natural death's souls.</p>
          <button class="btn danger" data-act="retire-confirm">Reclaim (60%)</button>
          <button class="btn" data-act="modal-close">Let them suffer on</button>
        `);
      }
      break;
    case 'retire-confirm':
      closeModal();
      game.retire();
      break;
    case 'auto-toggle':
      if (!game.autoUnlocked()) {
        addLog('The autopilot sleeps until the crypt tastes a death (or you reach depth 10).', 'system');
        break;
      }
      game.state.auto = !game.state.auto;
      queueRender();
      break;
    case 'lock-toggle':
      game.toggleLock(id as 'weapon' | 'armor' | 'charm');
      break;
    case 'reforge':
      game.reforgeSlot(id as 'weapon' | 'armor' | 'charm');
      break;
    case 'inv-reforge':
      game.reforgeFromInventory(Number(id));
      break;
    case 'toggle-automend':
      game.state.settings.autoMend = !game.state.settings.autoMend;
      queueRender();
      break;
    case 'toggle-protectvestige':
      game.state.settings.protectVestiges = !game.state.settings.protectVestiges;
      queueRender();
      break;
    case 'toggle-ravenous':
      game.state.settings.ravenousActive = !game.state.settings.ravenousActive;
      queueRender();
      break;
    case 'reap':
      if (game.canReap()) {
        showModal(`
          <h2>✠ Collapse the Crypt?</h2>
          <p>Reaping converts this cycle's harvest into <b class="c-essence">❖ ${fmt(game.reapGain())} essence</b>.</p>
          <p>You will lose: bones, souls, gold, all Crypt &amp; Necromancy upgrades,
          minions, classes${game.state.relics.length > (game.state.upgrades['everrelic'] ?? 0) ? ', most relics' : ''} and gear.</p>
          <p>You will keep: essence, essence upgrades, feats, and what you have learned about hope.</p>
          <button class="btn danger" data-act="reap-confirm">REAP</button>
          <button class="btn" data-act="modal-close">Not yet</button>
        `);
      }
      break;
    case 'reap-confirm':
      closeModal();
      game.doReap();
      break;
    case 'modal-close':
      closeModal();
      break;
    case 'show-intro':
      showIntro();
      break;
    case 'unequip':
      game.unequipSlot(id as 'weapon' | 'armor' | 'charm');
      break;
    case 'inv-equip': {
      const idx = Number(id);
      const item = game.state.inventory[idx];
      // the name check guards against a stale row after a panel re-render
      if (item && item.name === target.dataset.name) game.equipFromInventory(idx);
      break;
    }
    case 'inv-salvage': {
      const idx = Number(id);
      const item = game.state.inventory[idx];
      if (item && item.name === target.dataset.name) game.salvageFromInventory(idx);
      break;
    }
    case 'inv-salvage-all':
      game.salvageAllInventory();
      break;
    case 'toggle-autoequip':
      game.state.settings.autoEquip = !game.state.settings.autoEquip;
      queueRender();
      break;
    case 'cycle-autosalvage':
      game.state.settings.autoSalvageBelow = (game.state.settings.autoSalvageBelow + 1) % 7;
      queueRender();
      break;
    case 'cycle-protect': {
      const order = [3, 4, 5, 7];
      const cur = order.indexOf(game.state.settings.protectRarity);
      game.state.settings.protectRarity = order[(cur + 1) % order.length];
      queueRender();
      break;
    }
    case 'trial-accept':
      closeModal();
      game.acceptTrial();
      game.state.auto = trialWasAuto; // resume; the vessel fights the waves
      break;
    case 'trial-decline':
      closeModal();
      game.state.auto = trialWasAuto; // resume the descent, wager declined
      break;
    case 'tutorial-reset':
      resetTutorial();
      addLog('The crypt clears its throat. It will whisper everything again.', 'system');
      queueRender();
      break;
    case 'toggle-sound':
      game.state.settings.sound = !game.state.settings.sound;
      queueRender();
      break;
    case 'toggle-autobuy':
      game.state.settings.autoBuyBones = !game.state.settings.autoBuyBones;
      queueRender();
      break;
    case 'toggle-particles':
      game.state.settings.particles = !game.state.settings.particles;
      queueRender();
      break;
    case 'toggle-crt':
      game.state.settings.crtFilter = !game.state.settings.crtFilter;
      applyCrtFilter();
      queueRender();
      break;
    case 'log-filter': {
      const key = ('log' + id[0].toUpperCase() + id.slice(1)) as 'logCombat' | 'logLoot' | 'logSystem';
      game.state.settings[key] = !game.state.settings[key];
      applyLogFilters();
      break;
    }
    case 'save-now':
      saveGame(game);
      addLog('Progress committed to the ledger.', 'system');
      break;
    case 'export': {
      const blob = encodeSave(game.serialize());
      const ta = $('save-io') as HTMLTextAreaElement;
      ta.value = blob;
      ta.select();
      try { navigator.clipboard?.writeText(blob); } catch { /* ignore */ }
      addLog('Save exported (copied to clipboard).', 'system');
      break;
    }
    case 'import': {
      const ta = $('save-io') as HTMLTextAreaElement;
      try {
        decodeSave(ta.value); // validate
        lockSaves(); // the beforeunload autosave must not overwrite the import
        localStorage.setItem(SAVE_KEY, ta.value.trim());
        location.reload();
      } catch {
        addLog('That is not a valid GRAVEWRIGHT save.', 'death');
      }
      break;
    }
    case 'reset':
      showModal(`
        <h2>Burn the Ledger?</h2>
        <p>This erases <b>everything</b> — essence included. The crypt forgets you ever dug.</p>
        <button class="btn danger" data-act="reset-confirm">Erase everything</button>
        <button class="btn" data-act="modal-close">Keep digging</button>
      `);
      break;
    case 'reset-confirm':
      hardReset();
      location.reload();
      break;
    default:
      break;
  }
}

/** ---------------- HUD (cheap, every frame) ---------------- */

/** The CRT filter is a body class so its CSS layers can blanket everything. */
function applyCrtFilter(): void {
  document.body.classList.toggle('crt', game.state.settings.crtFilter);
}

/** Status indicators over the map: icon + remaining turns per active effect.
 *  Extending StatusKind forces an entry here — the chips stay exhaustive. */
const STATUS_META: Record<StatusKind, { icon: string; cls: string; label: string }> = {
  poison: { icon: '☣', cls: 'st-poison', label: 'Poisoned' },
  burn: { icon: '♨', cls: 'st-burn', label: 'Burning' },
};

let lastStatusHtml: string | null = null;

/** Chips are click-through (pointer-events: none) so the map underneath stays
 *  hoverable — full status detail lives on the hero's own hover tip. */
function statusChip(cls: string, icon: string, turns: number, expiring: boolean): string {
  return `<span class="status-chip ${cls}${expiring ? ' expiring' : ''}">${icon}<span class="st-turns">${turns}</span></span>`;
}

function statusIconsFrame(): void {
  const run = game.state.run;
  let html = '';
  if (run) {
    const chips: string[] = [];
    if (run.blessTurns > 0) {
      chips.push(statusChip('st-bless', '☩', run.blessTurns, run.blessTurns <= 3));
    }
    for (const st of run.statuses) {
      const meta = STATUS_META[st.kind];
      chips.push(statusChip(meta.cls, meta.icon, st.turns, st.turns <= 2));
    }
    html = chips.join('');
  }
  if (html !== lastStatusHtml) {
    lastStatusHtml = html;
    $('status-icons').innerHTML = html;
  }
}

const lastCurVals: Record<string, number> = {};
const lastBump: Record<string, number> = {};

/** Update a currency readout; pulse its plaque when the value grows. */
function setCurrency(id: string, v: number): void {
  const el = $(id);
  const txt = fmt(v);
  if (el.textContent !== txt) el.textContent = txt;
  const prev = lastCurVals[id];
  lastCurVals[id] = v;
  if (prev !== undefined && v > prev) {
    const now = performance.now();
    if (now - (lastBump[id] ?? 0) > 700) {
      lastBump[id] = now;
      const plaque = el.closest('.currency') as HTMLElement | null;
      if (plaque) {
        plaque.classList.remove('bump');
        void plaque.offsetWidth; // restart the animation
        plaque.classList.add('bump');
      }
    }
  }
}

export function uiFrame(): void {
  const s = game.state;
  setCurrency('cur-gold', s.gold);
  setCurrency('cur-bones', s.bones);
  setCurrency('cur-souls', s.souls);
  const essWrap = $('cur-essence-wrap');
  essWrap.style.display = s.essence > 0 || s.reaps > 0 ? '' : 'none';
  setCurrency('cur-essence', s.essence);
  const pendingEss = game.reapGain();
  $('cur-essence-pending').textContent = pendingEss > 0 ? `+${fmt(pendingEss)}` : '';

  const run = s.run;
  const d = game.d;
  if (run) {
    $('hud-name').textContent = run.heroName;
    $('hud-class').textContent = `${classById(run.klass).name} · Lv ${run.level}`;
    $('hud-depth').textContent = `Depth ${run.depth}`;
    const trial = run.trialActive;
    $('hud-goal').textContent = trial
      ? trial.phase === 'avatar'
        ? '◈ FELL THE AVATAR'
        : `◈ survive ${trial.turnsSurvived}/${trial.totalTurns}`
      : s.auto ? game.goal : 'Manual control';
    // the bar shows EFFECTIVE HP: flesh (red) plus what armor adds (grey)
    // at this depth — same drain fraction, honest capacity
    const eHp = B.heroEffectiveHp(d.maxHp, d.def, run.depth);
    const armorFactor = eHp / d.maxHp;
    const hp = Math.max(0, run.hp);
    $('hud-hp-text').textContent =
      `${fmt(Math.ceil(hp * armorFactor))} / ${fmt(Math.round(eHp))}`;
    const fleshPct = Math.min(100, (hp / eHp) * 100);
    const armorPct = Math.min(100 - fleshPct, fleshPct * (armorFactor - 1));
    ($('hud-hp-fill') as HTMLElement).style.width = `${fleshPct}%`;
    const armorEl = $('hud-armor-fill') as HTMLElement;
    armorEl.style.left = `${fleshPct}%`;
    armorEl.style.width = `${armorPct}%`;
    const xpNeed = B.xpForLevel(run.level);
    ($('hud-xp-fill') as HTMLElement).style.width =
      `${Math.max(0, Math.min(100, (run.xp / xpNeed) * 100))}%`;
  } else {
    $('hud-name').textContent = '— no vessel —';
    $('hud-class').textContent = '';
    $('hud-depth').textContent = '';
    $('hud-goal').textContent = s.summonCd > 0 ? `summoning in ${fmtTime(s.summonCd)}` : '';
    $('hud-hp-text').textContent = '';
    ($('hud-hp-fill') as HTMLElement).style.width = '0%';
    ($('hud-armor-fill') as HTMLElement).style.width = '0%';
    ($('hud-xp-fill') as HTMLElement).style.width = '0%';
  }

  $('cur-souls-pending').textContent =
    run ? `+${fmt(game.deathYield())}` : '';

  statusIconsFrame();

  const autoBtn = $('btn-auto');
  if (!game.autoUnlocked()) {
    autoBtn.textContent = '🔒 AUTO';
    autoBtn.classList.add('off');
    autoBtn.dataset.tip = 'The autopilot awakens after your first death (or reaching depth 10).';
  } else {
    autoBtn.textContent = s.auto ? '▶ AUTO' : '⏸ MANUAL';
    autoBtn.classList.toggle('off', !s.auto);
    autoBtn.dataset.tip = 'Toggle autopilot (P). Movement keys seize manual control.';
  }

  // the throttle only matters while the autopilot is driving
  $('speed-wrap').style.display = s.auto && game.autoUnlocked() ? '' : 'none';
  const speedNote = autoSpeedNote();
  const noteEl = $('auto-speed-note');
  if (noteEl.textContent !== speedNote) noteEl.textContent = speedNote;

  $('badge-reap').textContent = game.canReap() ? '!' : '';
}

/** ---------------- log ---------------- */

const logEl = () => $('log');

/** Which filter bucket a log class belongs to. Lifecycle anchors (summon,
 *  descend — the depth markers) are deliberately absent: always shown. */
const LOG_CATS: Record<string, 'combat' | 'loot' | 'system'> = {
  death: 'combat', boss: 'combat', elite: 'combat', champion: 'combat',
  monster: 'combat', levelup: 'combat', minion: 'combat',
  gold: 'loot', bones: 'loot', souls: 'loot', relic: 'loot', item: 'loot',
  shrine: 'loot', rarity0: 'loot', rarity1: 'loot', rarity2: 'loot',
  rarity3: 'loot', rarity4: 'loot', rarity5: 'loot', rarity6: 'loot',
  system: 'system', mystic: 'system', class: 'system', reap: 'system',
  achievement: 'system',
};

/** Reflect the three settings toggles as classes on #log (CSS does the
 *  filtering, so old lines filter retroactively) and on the bar chips. */
function applyLogFilters(): void {
  const st = game.state.settings;
  const el = logEl();
  el.classList.toggle('hide-combat', !st.logCombat);
  el.classList.toggle('hide-loot', !st.logLoot);
  el.classList.toggle('hide-system', !st.logSystem);
  for (const [id, on] of [['combat', st.logCombat], ['loot', st.logLoot], ['system', st.logSystem]] as const) {
    document.querySelector(`[data-act="log-filter"][data-id="${id}"]`)
      ?.classList.toggle('on', on);
  }
}

function addLog(msg: string, cls?: string): void {
  const el = logEl();

  // consecutive repeats collapse into the latest line's ×N badge
  const first = el.firstElementChild as HTMLElement | null;
  if (first && first.dataset.msg === msg && first.dataset.cls === (cls ?? '')) {
    const n = Number(first.dataset.count ?? '1') + 1;
    first.dataset.count = String(n);
    (first.querySelector('.log-x') as HTMLElement).textContent = `×${n}`;
    return;
  }

  const div = document.createElement('div');
  const cat = cls ? LOG_CATS[cls] : 'system';
  div.className = `log-line ${cls ? 'log-' + cls : ''} ${cat ? 'log-cat-' + cat : ''}`;
  div.textContent = msg;
  div.dataset.msg = msg;
  div.dataset.cls = cls ?? '';
  div.dataset.count = '1';
  const badge = document.createElement('span');
  badge.className = 'log-x';
  div.appendChild(badge);
  el.prepend(div);
  while (el.children.length > 120) el.removeChild(el.lastChild!);
}

/** ---------------- panel rendering ---------------- */

function queueRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    renderPanel();
  }, 60);
}

function renderPanel(): void {
  const panel = $('panel');
  const scroll = panel.scrollTop;
  let html = '';
  switch (activeTab) {
    case 'vessel': html = panelVessel(); break;
    case 'necro': html = panelNecro(); break;
    case 'crypt': html = panelCrypt(); break;
    case 'reap': html = panelReap(); break;
    case 'feats': html = panelFeats(); break;
    case 'settings': html = panelSettings(); break;
  }
  panel.innerHTML = html;
  panel.scrollTop = scroll;

  for (const t of TABS) {
    document.querySelector(`[data-act="tab"][data-id="${t.id}"]`)
      ?.classList.toggle('active', t.id === activeTab);
  }
}

/** Shop batch selector: ×1 / ×10 / ×max (plus optional extra controls). */
function buyAmountBar(extra = ''): string {
  const cur = game.state.settings.buyAmount;
  const btn = (amount: number, label: string) =>
    `<button class="btn tiny ${cur === amount ? 'toggle on' : ''}" data-act="buy-amount" data-id="${amount}">${label}</button>`;
  return `<div class="satchel-bar buy-bar"><span class="h3-note">BUY</span>${btn(1, '×1')}${btn(10, '×10')}${btn(0, '×max')}${extra}</div>`;
}

function upgradeCard(def: UpgradeDef): string {
  const lvl = game.state.upgrades[def.id] ?? 0;
  const capped = lvl >= def.max;
  const amount = game.state.settings.buyAmount;
  const { count, totalCost } = capped ? { count: 0, totalCost: 0 } : game.bulkInfo(def, amount);
  const afford = !capped && count >= 1;
  // when nothing is affordable, still show the single-level price
  const shownCost = count >= 1 ? totalCost : game.cost(def);
  const suffix = count > 1 ? ` <small>+${count}</small>` : '';
  const cur = { bones: '∴', souls: '✦', essence: '❖' }[def.pool];
  return `
    <div class="card card-${def.pool} ${afford ? 'afford' : ''} ${capped ? 'capped' : ''}">
      <div class="card-head">
        <span class="card-name">${esc(def.name)}</span>
        <span class="card-lvl">${capped ? 'MAX' : `Lv ${lvl}${def.max !== Infinity ? '/' + def.max : ''}`}</span>
      </div>
      <div class="card-desc">${esc(def.desc)}</div>
      <div class="card-foot">
        <span class="card-eff">${esc(def.effDesc(lvl))}</span>
        ${capped ? '' : `<button class="btn buy ${afford ? '' : 'cant'}" data-act="buy" data-id="${def.id}">${cur} ${fmt(shownCost)}${suffix}</button>`}
      </div>
    </div>`;
}

function curClassId(): string {
  return game.state.run?.klass ?? game.state.curClass;
}

/** Weapon-archetype chip: kind label, ★ when the class favors it. */
function kindChip(item: Item): string {
  if (!item.kind) return '';
  const def = WEAPON_KINDS[item.kind];
  const fav = kindFavors(item.kind, curClassId());
  const tip = `${def.label} — usable by ${kindUsableBy(item.kind)}.` +
    (fav ? ' Favored by this vessel: +20% weapon ATK.' : '');
  return `<span class="kind-chip ${fav ? 'fav' : ''}" data-tip="${esc(tip)}">${def.label}${fav ? ' ★' : ''}</span>`;
}

/** Tooltip HTML lives inside a double-quoted attribute: escape quotes only;
 *  dynamic text lines are esc()'d individually, our own markup stays intact. */
function attrSafe(html: string): string {
  return html.replace(/"/g, '&quot;');
}

const SLOT_LABELS = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' } as const;

/** Rich item tooltip: identity, affixes, archetype, salvage value — and a
 *  per-affix comparison against whatever is equipped in the same slot. */
function itemTip(item: Item, compareWith?: Item | null): string {
  const lines: string[] = [];
  lines.push(`<span class='tip-name${rCls(item)}' style='${rStyle(item)}'>${esc(item.name)}</span>`);
  lines.push(`<span class='tip-sub'>${RARITY_NAMES[item.rarity]} ${SLOT_LABELS[item.slot]} · found at depth ${item.depth}</span>`);
  lines.push(...describeItem(item).map((l) => `<span class='tip-affix'>${esc(l)}</span>`));

  if (item.kind) {
    const fav = kindFavors(item.kind, curClassId());
    lines.push(`<span class='tip-kind'>${esc(`${WEAPON_KINDS[item.kind].label} — usable by ${kindUsableBy(item.kind)}`)}${fav ? ' · <b class="tip-fav">favored ★ +20% ATK</b>' : ''}</span>`);
  }

  // vestige set membership & bonuses
  if (item.setId) {
    const set = setById(item.setId);
    if (set) {
      const gear = game.state.run?.gear ?? game.state.keptGear;
      const worn = (['weapon', 'armor', 'charm'] as const)
        .filter((s) => gear[s]?.setId === item.setId).length;
      lines.push(`<span class='rainbow-text tip-set'>${esc(set.name)}</span> <span class='tip-sub'>· ${worn}/3 worn</span>`);
      const piece = set.pieces.find((pp) => pp.slot === item.slot);
      if (piece) {
        lines.push(`<span class='tip-fav'>✦ ${esc(piece.powerName)}</span> <span class='tip-kind'>${esc(piece.powerDesc)}</span>`);
      }
      lines.push(`<span class='tip-sub'>${esc(set.flavor)}</span>`);
      lines.push(`<span class='${worn >= 2 ? 'tip-diff-up' : 'tip-sub'}'>[2] ${esc(set.bonus2)}</span>`);
      lines.push(`<span class='${worn >= 3 ? 'tip-diff-up' : 'tip-sub'}'>[3] ${esc(set.bonus3)}</span>`);
    }
  }

  if (compareWith !== undefined) {
    if (compareWith === null) {
      lines.push(`<span class='tip-diff-up'>▲ the slot is empty — pure upgrade</span>`);
    } else {
      const keys = new Set<Affix>([
        ...(Object.keys(item.stats) as Affix[]),
        ...(Object.keys(compareWith.stats) as Affix[]),
      ]);
      const diffs: string[] = [];
      for (const def of AFFIX_DEFS) {
        if (!keys.has(def.affix)) continue;
        const dv = Math.round((item.stats[def.affix] ?? 0) - (compareWith.stats[def.affix] ?? 0));
        if (dv === 0) continue;
        diffs.push(`<span class='${dv > 0 ? 'tip-diff-up' : 'tip-diff-down'}'>${dv > 0 ? '▲' : '▼'} ${esc(def.label(Math.abs(dv)))}</span>`);
      }
      if (diffs.length > 0) {
        lines.push(`<span class='tip-sub'>vs ${esc(compareWith.name)}:</span>`);
        lines.push(diffs.join('<br>'));
      } else {
        lines.push(`<span class='tip-sub'>identical stats to ${esc(compareWith.name)}</span>`);
      }
      const ds = Math.round(scoreItem(item) - scoreItem(compareWith));
      lines.push(`<span class='${ds >= 0 ? 'tip-diff-up' : 'tip-diff-down'}'>overall ${ds >= 0 ? '▲ better' : '▼ worse'} (score ${ds >= 0 ? '+' : ''}${ds})</span>`);
    }
  }

  lines.push(`<span class='tip-salvage'>⚒ salvages for ${fmt(B.SALVAGE_GOLD_BY_RARITY[item.rarity])} gold</span>`);
  return attrSafe(lines.join('<br>'));
}

/** The smith's button for a Vestige that has fallen behind the depths. */
function reforgeBtn(item: Item, act: string, id: string): string {
  if (item.rarity !== 6 || !item.setId) return '';
  const target = game.reforgeTargetDepth();
  if (item.depth >= target) return '';
  const cost = B.reforgeCost(target);
  const afford = game.state.gold >= cost;
  return `<button class="btn tiny ${afford ? '' : 'cant'}" data-act="${act}" data-id="${id}"
    data-tip="Reforge to depth ${target} strength — the smith charges ⛁ ${fmt(cost)} gold.">⚒ d${item.depth}→${target}</button>`;
}

function gearLine(slot: 'weapon' | 'armor' | 'charm', item: Item | null): string {
  const slotNames = { weapon: 'Weapon', armor: 'Armor', charm: 'Charm' };
  if (!item) {
    return `<div class="gear-slot"><span class="gear-kind">${slotNames[slot]}</span><span class="gear-empty">— nothing —</span></div>`;
  }
  return `
    <div class="gear-slot">
      <span class="gear-kind">${slotNames[slot]}
        <button class="btn tiny" data-act="unequip" data-id="${slot}" data-tip="Unequip into the satchel">▼</button>
        ${game.qolUnlocked('seal') ? `<button class="btn tiny ${item.locked ? 'toggle on' : ''}" data-act="lock-toggle" data-id="${slot}"
          data-tip="${item.locked ? 'Locked: auto-equip will never replace this. Click to unlock.' : 'Lock this item so auto-equip can never replace it.'}">${item.locked ? '🔒' : '🔓'}</button>` : ''}
        ${reforgeBtn(item, 'reforge', slot)}
      </span>
      <span class="gear-name${rCls(item)}" style="${rStyle(item)}" data-tip="${itemTip(item)}">${esc(item.name)} ${kindChip(item)}</span>
      <span class="gear-stats">${describeItem(item).join(' · ')}</span>
    </div>`;
}

const SALVAGE_MODES = ['never', 'common', '≤ fine', '≤ rare', '≤ epic', '≤ mythic', 'everything'];
const PROTECT_MODES: Record<number, string> = { 3: 'epic+', 4: 'mythic+', 5: 'legendary+', 7: 'nothing' };

/** Vestiges (rarity 6) render as animated rainbow text instead of a flat color. */
const rCls = (item: Item) => (item.rarity === 6 ? ' rainbow-text' : '');
const rStyle = (item: Item) => (item.rarity === 6 ? '' : `color:${RARITY_COLORS[item.rarity]}`);

function satchelSection(): string {
  const s = game.state;
  const inv = s.inventory;
  const gear = s.run?.gear ?? s.keptGear;
  const rows = inv.map((item, idx) => {
    const usable = game.canEquip(item);
    const equipped = gear[item.slot] ?? null;
    return `
      <div class="inv-row ${usable ? '' : 'inv-unusable'}">
        <div class="inv-main">
          <span class="slot-chip">${SLOT_LABELS[item.slot]}</span>
          ${item.locked ? '<span class="slot-chip" data-tip="Locked: protected from every automatic scrap.">🔒</span>' : ''}
          <span class="inv-name${rCls(item)}" style="${rStyle(item)}" data-tip="${itemTip(item, equipped)}">${esc(item.name)}</span>
          ${kindChip(item)}
          <span class="inv-actions">
            <button class="btn tiny ${usable ? '' : 'cant'}" data-act="inv-equip" data-id="${idx}" data-name="${esc(item.name)}"
              data-tip="${usable ? 'Equip (swaps with the current item)' : esc(`This vessel cannot wield ${WEAPON_KINDS[item.kind!]?.label ?? 'this'} weapons.`)}">equip</button>
            ${reforgeBtn(item, 'inv-reforge', String(idx))}
            <button class="btn tiny danger" data-act="inv-salvage" data-id="${idx}" data-name="${esc(item.name)}"
              data-tip="Scrap for ${fmt(B.SALVAGE_GOLD_BY_RARITY[item.rarity])} gold">⚒</button>
          </span>
        </div>
        <div class="inv-statline">${describeItem(item).join(' · ')}</div>
      </div>`;
  }).join('');
  return `
    <h3>Satchel <span class="h3-note">${inv.length}/${B.INVENTORY_CAP}</span></h3>
    <div class="satchel-bar">
      <button class="btn tiny toggle ${s.settings.autoEquip ? 'on' : ''}" data-act="toggle-autoequip"
        data-tip="When on, looted items the vessel can wield are equipped automatically when clearly better (+5%).">auto-equip ${s.settings.autoEquip ? 'ON' : 'OFF'}</button>
      ${game.qolUnlocked('tithe') ? `<button class="btn tiny ${s.settings.protectVestiges ? 'toggle on' : ''}" data-act="toggle-protectvestige"
        data-tip="Vestiges (rainbow set pieces) are exempt from every automatic scrap — overflow, auto-scrap and salvage-all — regardless of the protect tier. Manual scrapping still works.">vestiges ${s.settings.protectVestiges ? 'SAFE' : 'BURNABLE'}</button>` : ''}
      ${game.qolUnlocked('tithe') ? `<button class="btn tiny ${s.settings.autoSalvageBelow > 0 ? 'toggle on' : ''}" data-act="cycle-autosalvage"
        data-tip="Unequipped loot below this rarity is scrapped on pickup instead of cluttering the satchel. Protected rarities are always safe. Set to 'everything' (with protect: nothing) and the satchel stays empty.">auto-scrap: ${SALVAGE_MODES[s.settings.autoSalvageBelow]}</button>` : ''}
      <button class="btn tiny" data-act="cycle-protect"
        data-tip="Items at or above this rarity are never auto-scrapped — not by overflow, not by auto-scrap, not by salvage-all. 'Nothing' protects nothing: even legendaries burn.">protect: ${PROTECT_MODES[s.settings.protectRarity]}</button>
      ${inv.length > 0 ? `<button class="btn tiny danger" data-act="inv-salvage-all" data-tip="Scrap the whole satchel (protected rarities stay).">salvage all</button>` : ''}
    </div>
    ${rows || '<div class="hint">Empty. Loot the vessel cannot or should not wear lands here. It survives death; reaping claims it.</div>'}
  `;
}

function panelVessel(): string {
  const s = game.state;
  const d = game.d;
  const run = s.run;
  const klass = classById(run?.klass ?? s.curClass);
  // defense is shown as EFFECTIVE HP vs the local depth — keep the words
  // simple even though the math underneath isn't (playtest request)
  const mitDepth = Math.max(1, run?.depth ?? game.d.startDepth);
  const eHp = B.heroEffectiveHp(d.maxHp, d.def, mitDepth);

  const statRows: [string, string, string][] = [
    ['Max HP', fmt(d.maxHp),
      'The vessel’s health. Refilled on summon; partially restored on descent and level-up.'],
    ['Attack', fmt(Math.round(d.atk)),
      'Damage per strike, before the enemy’s mitigation. Includes upgrades, class, gear, level and essence.'],
    ['Defense', fmt(Math.round(d.def)),
      'Armor. More defense = more effective HP, always. Deeper monsters punch harder through it.'],
    ['Effective HP', fmt(Math.round(eHp)),
      'The total damage your vessel can take here, armor included — the grey part of the health bar. Poison and burn ignore armor.'],
    ['Crit', `${Math.round(d.crit)}% ×${d.critDmg}`,
      'Chance to strike for double damage.'],
    ['Speed', `${d.tickRate.toFixed(1)} act/s`,
      'Hero actions per second on autopilot. Raised by Dark Haste and The Quickening.'],
    ['Vision', `${d.vision}`,
      'How far the vessel sees. Explored tiles stay on the map.'],
    ['Gold gain', fmtMult(d.goldMult),
      'All gold multipliers combined. Gold is carried by the vessel and mostly lost on death.'],
    ['Soul gain', fmtMult(d.soulMult),
      'All soul multipliers combined: Siphon, essence, class, gear, relics, feats. Curses multiply on top.'],
    ['Bone gain', fmtMult(d.boneMult),
      'All bone multipliers combined. Bones persist through death.'],
  ];
  if (d.dodge > 0) statRows.push(['Dodge', `${d.dodge}%`, 'Chance to avoid an attack entirely.']);
  if (d.blockPct > 0) statRows.push(['Block', `${d.blockPct}%`, 'Percentage damage reduction applied after the armor soak.']);
  if (d.lifesteal > 0) statRows.push(['Lifesteal', `${Math.round(d.lifesteal)}%`, 'Heals this share of damage dealt.']);
  if (d.healOnKill > 0) statRows.push(['Heal on kill', `${Math.round(d.healOnKill)}%`, 'Max HP restored with every kill.']);
  if (d.keepGearChance > 0) statRows.push(['Keep gear', `${Math.round(d.keepGearChance)}%`, 'Chance per equipped item to survive the vessel’s death.']);
  if (game.wrath() > 1.01) statRows.push(['Crypt wrath', `×${game.wrath().toFixed(2)}`, 'The crypt resents your hoarded souls: monsters on new floors hit harder and last longer. Reap to appease it.']);
  if (run) statRows.push(['Death yield', `✦ ${fmt(game.deathYield())}`, 'Souls harvested if this vessel died right now: depth^1.62 plus kills, times every soul multiplier and curse.']);

  const gear = run?.gear ?? s.keptGear;

  const minionRows = MINIONS.filter((m) => (s.minions[m.id]?.level ?? 0) > 0).map((m) => {
    const st = s.minions[m.id];
    const maxHp = game.minionMaxHp(m.id);
    const frac = st.alive ? Math.max(0, Math.min(1, st.hp / Math.max(1, maxHp))) : 0;
    const cost = mendCost(run?.depth ?? 1);
    return `
      <div class="minion-row ${st.alive ? '' : 'dead'}" data-tip="${esc(m.desc)}">
        <span class="minion-glyph" style="color:${m.color}">${m.glyph}</span>
        <span class="minion-name">${esc(m.name)} <small>Lv ${st.level}</small></span>
        <span class="minion-bar"><span class="minion-fill" style="width:${frac * 100}%"></span></span>
        ${st.alive
          ? `<span class="minion-state">${fmt(Math.ceil(st.hp))}/${fmt(maxHp)}</span>`
          : `<button class="btn buy ${s.bones >= cost ? '' : 'cant'}" data-act="mend" data-id="${m.id}">mend ∴${fmt(cost)}</button>`}
      </div>`;
  }).join('') || '<div class="hint">No minions raised. See the Necromancy tab.</div>';

  const strat = s.strategy;
  const stratBtn = (id: Strategy, label: string, hint: string) =>
    `<button class="btn strat ${strat === id ? 'active' : ''}" data-act="strat" data-id="${id}" data-tip="${esc(hint)}">${label}</button>`;

  return `
    <h2>${run ? esc(run.heroName) : 'Next Vessel'}</h2>
    <div class="hint">${esc(klass.name)} — ${esc(klass.title)}. ${esc(klass.perk)}</div>
    <div class="stats-grid">
      ${statRows.map(([k, v, tip]) => `<div class="stat" data-tip="${esc(tip)}"><span>${k}</span><b>${v}</b></div>`).join('')}
    </div>

    <h3>Doctrine</h3>
    <div class="strat-row">
      ${stratBtn('cautious', 'Cautious', 'Explore 92% of each floor, heal below 55% HP')}
      ${stratBtn('balanced', 'Balanced', 'Explore 72% of each floor, heal below 40% HP')}
      ${stratBtn('reckless', 'Reckless', 'Rush the stairs on sight, heal below 25% HP')}
    </div>
    ${(s.upgrades['ravenous'] ?? 0) > 0 ? `
    <div class="satchel-bar">
      <button class="btn tiny toggle ${s.settings.ravenousActive ? 'on' : ''}" data-act="toggle-ravenous"
        data-tip="Ravenous Descent: floors you overwhelm collapse unentered, tributing scraps. Toggle OFF to walk every floor for full loot, XP and souls.">ravenous descent ${s.settings.ravenousActive ? 'ON' : 'OFF'}</button>
    </div>` : ''}

    <h3>Gear</h3>
    ${gearLine('weapon', gear.weapon)}
    ${gearLine('armor', gear.armor)}
    ${gearLine('charm', gear.charm)}

    ${satchelSection()}

    <h3>Procession</h3>
    ${MINIONS.some((m) => (s.minions[m.id]?.level ?? 0) > 0) && game.qolUnlocked('sexton') ? `
    <div class="satchel-bar">
      <button class="btn tiny toggle ${s.settings.autoMend ? 'on' : ''}" data-act="toggle-automend"
        data-tip="Automatically spend bones to re-raise fallen minions mid-run.">auto-mend ${s.settings.autoMend ? 'ON' : 'OFF'}</button>
    </div>` : ''}
    ${minionRows}

    ${s.relics.length > 0 ? `
      <h3>Relics <span class="h3-note">${s.relics.length}/${RELICS.length}</span></h3>
      <div class="hint">Trophies torn from bosses (30%) and Vault Wardens (12%). Their boons are
      passive and permanent — they survive every death, but the Reaping claims them
      unless bound by <b>Reliquary Eternal</b>.</div>
      ${s.relics.map((id) => {
        const r = relicById(id);
        return r ? `<div class="relic-row" data-tip="${esc(r.desc)}">❖ ${esc(r.name)}</div>` : '';
      }).join('')}` : ''}

    ${run ? `<div class="panel-actions"><button class="btn danger" data-act="retire">Reclaim Vessel (60% souls)</button></div>` : ''}
  `;
}

function panelNecro(): string {
  const s = game.state;

  const minionCards = MINIONS.map((m) => {
    const st = s.minions[m.id] ?? { level: 0, alive: false, hp: 0 };
    const cost = minionLevelCost(m, st.level);
    const afford = s.souls >= cost;
    return `
      <div class="card ${afford ? 'afford' : ''}">
        <div class="card-head">
          <span class="card-name" style="color:${m.color}">${m.glyph} ${esc(m.name)}</span>
          <span class="card-lvl">${st.level > 0 ? `Lv ${st.level}` : 'unraised'}</span>
        </div>
        <div class="card-desc">${esc(m.desc)}</div>
        <div class="card-foot">
          <span class="card-eff">${st.level > 0 ? `ATK ${fmt(Math.round(game.minionAtk(m.id)))} · HP ${fmt(game.minionMaxHp(m.id))}` : ''}</span>
          <button class="btn buy ${afford ? '' : 'cant'}" data-act="minion" data-id="${m.id}">✦ ${fmt(cost)}</button>
        </div>
      </div>`;
  }).join('');

  const weaponNote = (cid: string): string => {
    const kinds = Object.keys(WEAPON_KINDS) as WeaponKind[];
    const allowed = kinds.filter((k) => kindAllows(k, cid)).map((k) => WEAPON_KINDS[k].label);
    const fav = kinds.filter((k) => kindFavors(k, cid)).map((k) => WEAPON_KINDS[k].label);
    return `Wields ${allowed.join(', ')}${fav.length ? ` · favors ${fav.join(' & ')} ★` : ''}`;
  };

  const classCards = CLASSES.map((c) => {
    // achievement-hidden classes are invisible until earned (not in your face)
    if (c.hiddenUnlock && !s.classesUnlocked.includes(c.id)) return '';
    if (c.cost < 0 && !c.hiddenUnlock && !game.classUnlockedByEssence(c.id)) {
      return `
        <div class="card locked">
          <div class="card-head"><span class="card-name">${esc(c.name)}</span><span class="card-lvl">essence</span></div>
          <div class="card-desc">Unlocked through the Reaping tab (${c.essenceUnlock === 'lichdom' ? 'Lichdom' : 'essence'}).</div>
        </div>`;
    }
    const unlocked = s.classesUnlocked.includes(c.id);
    const active = s.curClass === c.id;
    const afford = s.souls >= c.cost;
    return `
      <div class="card ${active ? 'active-class' : ''} ${unlocked || afford ? 'afford' : ''}">
        <div class="card-head">
          <span class="card-name" style="color:${c.glyphColor}">@ ${esc(c.name)}</span>
          <span class="card-lvl">${active ? 'CURRENT' : unlocked ? 'owned' : ''}</span>
        </div>
        <div class="card-desc">${esc(c.perk)}</div>
        <div class="card-weapons">${esc(weaponNote(c.id))}</div>
        <div class="card-foot">
          <span class="card-eff">HP ×${c.hpMult} · ATK ×${c.atkMult}</span>
          ${unlocked
            ? (active ? '' : `<button class="btn buy" data-act="class-pick" data-id="${c.id}">use next</button>`)
            : `<button class="btn buy ${afford ? '' : 'cant'}" data-act="class-buy" data-id="${c.id}">✦ ${fmt(c.cost)}</button>`}
        </div>
      </div>`;
  }).join('');

  return `
    <h2>Necromancy</h2>
    <div class="hint">Souls are harvested when vessels die. Deeper deaths feed better.</div>
    ${buyAmountBar()}
    ${SOUL_UPGRADES.map(upgradeCard).join('')}
    <h3>The Procession</h3>
    <div class="hint">Undead retainers that fight beside each vessel. They are re-raised free with every summon.</div>
    ${minionCards}
    <h3>Vessel Shapes</h3>
    <div class="hint">The chosen shape applies to the <i>next</i> summon.</div>
    ${classCards}
  `;
}

function panelCrypt(): string {
  const s = game.state;
  const automaton = (s.upgrades['automaton'] ?? 0) > 0
    ? `<span class="bar-gap"></span><button class="btn tiny toggle ${s.settings.autoBuyBones ? 'on' : ''}" data-act="toggle-autobuy"
        data-tip="The Bone Automaton buys the cheapest affordable Crypt upgrade every few seconds, all by itself.">⚙ automaton ${s.settings.autoBuyBones ? 'ON' : 'OFF'}</button>`
    : '';
  return `
    <h2>The Crypt</h2>
    <div class="hint">Bones come from kills and ossuary piles. Spend them on the meat itself.</div>
    ${buyAmountBar(automaton)}
    ${BONE_UPGRADES.map(upgradeCard).join('')}
  `;
}

function panelReap(): string {
  const s = game.state;
  const gain = game.reapGain();
  const can = game.canReap();
  const depthNeed = game.reapDepthNeeded();
  const depthOk = s.bestDepthThisReap >= depthNeed;
  const nextAt = B.soulsForEssence(gain + 1);

  const curseRows = game.cursesUnlocked()
    ? CURSES.map((c) => `
        <div class="card ${s.curses[c.id] ? 'curse-on' : ''}">
          <div class="card-head"><span class="card-name">${esc(c.name)}</span>
          <span class="card-lvl">${s.curses[c.id] ? 'ACTIVE' : ''}</span></div>
          <div class="card-desc">${esc(c.desc)}</div>
          <div class="card-foot"><span></span>
            <button class="btn buy" data-act="curse" data-id="${c.id}">${s.curses[c.id] ? 'break pact' : 'swear pact'}</button>
          </div>
        </div>`).join('')
    : '';

  return `
    <h2>The Reaping</h2>
    <div class="hint">Collapse the crypt. Distill every scream of this cycle into permanent essence.</div>
    <div class="reap-status">
      <div class="stat" data-tip="Permanent prestige currency. Spent below; survives every collapse."><span>Essence held</span><b class="c-essence">❖ ${fmt(s.essence)}</b></div>
      <div class="stat" data-tip="All souls harvested since your last Reaping. This number sets your essence payout."><span>Souls this cycle</span><b class="c-souls">✦ ${fmt(s.soulsThisReap)}</b></div>
      <div class="stat" data-tip="A Reaping requires reaching depth ${depthNeed} this cycle. Every Reaping raises the demand by 2 — the crypt grows hungrier."><span>Depth this cycle</span><b>${s.bestDepthThisReap} ${depthOk ? '✓' : `/ ${depthNeed}`}</b></div>
      <div class="stat" data-tip="Essence = (souls this cycle ÷ ${fmt(B.REAP_SOUL_BASE)})^0.62, rounded down."><span>Reap now for</span><b class="c-essence">❖ ${fmt(gain)}</b></div>
      <div class="stat" data-tip="Harvest this many souls in the cycle to push the payout one higher."><span>Next essence at</span><b>✦ ${fmt(nextAt)}</b></div>
      <div class="stat"><span>Reapings</span><b>${s.reaps}</b></div>
      <div class="stat" data-tip="Hoarding souls past reap-readiness angers the crypt: monsters on new floors gain +25% HP &amp; ATK per extra soul-threshold harvested this cycle. Reaping appeases it.">
        <span>Crypt wrath</span><b ${game.wrath() > 1.01 ? 'style="color:var(--danger)"' : ''}>×${game.wrath().toFixed(2)}</b></div>
    </div>
    <button class="btn reap-btn ${can ? 'primary' : 'cant'}" data-act="reap">
      ${can ? `✠ REAP — gain ❖ ${fmt(gain)}` : depthOk ? 'Not enough souls this cycle' : `Reach depth ${depthNeed} to reap`}
    </button>
    <h3>Essence Works</h3>
    ${buyAmountBar()}
    ${ESSENCE_UPGRADES.filter((u) => (u.minReaps ?? 0) <= s.reaps).map(upgradeCard).join('')}
    ${ESSENCE_UPGRADES.some((u) => (u.minReaps ?? 0) > s.reaps)
      ? '<div class="hint">Further works reveal themselves after more Reapings.</div>' : ''}
    ${game.cursesUnlocked() ? `<h3>Pacts</h3><div class="hint">Sworn pacts apply to the next vessel. Stack freely; suffer accordingly.</div>${curseRows}` : ''}
  `;
}

function panelFeats(): string {
  const s = game.state;
  const done = Object.keys(s.achievements).length;
  return `
    <h2>Feats</h2>
    <div class="hint">${done}/${ACHIEVEMENTS.length} feats. Each grants +2% souls, forever.</div>
    <div class="feats-grid">
      ${ACHIEVEMENTS.map((a) => `
        <div class="feat ${s.achievements[a.id] ? 'done' : ''}" title="${esc(a.desc)}">
          <span class="feat-name">${esc(a.name)}</span>
          <span class="feat-desc">${esc(a.desc)}</span>
        </div>`).join('')}
    </div>
  `;
}

function autoSpeedNote(): string {
  const s = game.state.settings;
  return `×${s.autoSpeed.toFixed(2)} · ${(game.d.tickRate * s.autoSpeed).toFixed(1)}/s`;
}

function panelSettings(): string {
  const s = game.state;
  const toggle = (label: string, on: boolean, act: string, hint = '') => `
    <div class="setting-row" ${hint ? `data-tip="${esc(hint)}"` : ''}>
      <span>${label}</span>
      <button class="btn toggle ${on ? 'on' : ''}" data-act="${act}">${on ? 'ON' : 'OFF'}</button>
    </div>`;
  return `
    <h2>Settings</h2>
    ${toggle('Sound', s.settings.sound, 'toggle-sound')}
    ${toggle('Damage numbers', s.settings.particles, 'toggle-particles')}
    ${toggle('CRT filter', s.settings.crtFilter, 'toggle-crt',
      'Phosphor and curved glass: heavy scanlines, glow, vignette and a whisper of color fringing. Pure vanity.')}
    <div class="hint">Loot automation (auto-equip, auto-scrap, protect tiers,
      vestige safety) lives where the loot does — the Satchel bar on the
      Vessel tab.</div>
    <div class="setting-row" data-tip="Forget every dismissed whisper; the contextual tutorial plays again as each mechanic comes up.">
      <span>Tutorial whispers</span>
      <button class="btn" data-act="tutorial-reset">Replay tutorial</button>
    </div>
    ${(s.upgrades['automaton'] ?? 0) > 0
      ? toggle('Bone Automaton (auto-buy Crypt)', s.settings.autoBuyBones, 'toggle-autobuy')
      : ''}
    <h3>Ledger</h3>
    <div class="setting-row"><span>Autosaves every 15s</span>
      <button class="btn" data-act="save-now">Save now</button></div>
    <textarea id="save-io" rows="4" spellcheck="false" placeholder="Exported saves appear here; paste one to import."></textarea>
    <div class="setting-row">
      <button class="btn" data-act="export">Export save</button>
      <button class="btn" data-act="import">Import save</button>
    </div>
    <div class="setting-row">
      <button class="btn" data-act="show-intro">How to play</button>
      <button class="btn danger" data-act="reset">Hard reset</button>
    </div>
    <h3>Statistics</h3>
    <div class="stats-grid">
      <div class="stat"><span>Lifetime souls</span><b>${fmt(s.lifetimeSouls)}</b></div>
      <div class="stat"><span>Total kills</span><b>${fmt(s.totalKills)}</b></div>
      <div class="stat"><span>Vessels lost</span><b>${fmt(s.totalDeaths)}</b></div>
      <div class="stat"><span>Best depth</span><b>${s.bestDepth}</b></div>
      <div class="stat"><span>Bosses slain</span><b>${fmt(s.bossesSlain)}</b></div>
      <div class="stat"><span>Lifetime gold</span><b>${fmt(s.goldLifetime)}</b></div>
      <div class="stat" data-tip="How many of the ${RELICS.length} relics in the catalog you have ever held, across every Reaping."><span>Distinct relics</span><b>${s.relicsSeen.length}/${RELICS.length}</b></div>
      <div class="stat" data-tip="Every relic drop ever claimed — Reapings reclaim relics, so the same one can be found again."><span>Relics claimed</span><b>${fmt(s.relicsFound)}</b></div>
      <div class="stat"><span>Minions raised</span><b>${fmt(s.minionsRaised)}</b></div>
      <div class="stat"><span>Champions slain</span><b>${fmt(s.championsSlain)}</b></div>
      <div class="stat"><span>Wardens slain</span><b>${fmt(s.wardensSlain)}</b></div>
      <div class="stat"><span>Legendaries</span><b>${fmt(s.legendariesFound)}</b></div>
      <div class="stat"><span>Trials won</span><b>${fmt(s.trialsWon)}</b></div>
      <div class="stat"><span>Trials lost</span><b>${fmt(s.trialsFailed)}</b></div>
    </div>
    <div class="about">GRAVEWRIGHT v1.0 — an incremental necromancy roguelike.<br>
    Keys: WASD/arrows seize manual control · <b>Space</b> descend on ▼ · <b>P</b> toggle autopilot · click map to send the vessel.</div>
  `;
}

/** ---------------- modals ---------------- */

/** ---------------- toasts ---------------- */

function showToast(html: string, cls: string): void {
  const root = $('toast-root');
  const div = document.createElement('div');
  div.className = `toast ${cls}`;
  div.innerHTML = html;
  root.appendChild(div);
  while (root.children.length > 4) root.removeChild(root.firstChild!);
  setTimeout(() => {
    div.classList.add('fade');
    setTimeout(() => div.remove(), 600);
  }, 3500);
}

function showModal(html: string): void {
  const root = $('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">${html}</div>
    </div>`;
}

export function closeModal(): void {
  $('modal-root').innerHTML = '';
}

export function modalOpen(): boolean {
  return $('modal-root').children.length > 0;
}

function showIntro(): void {
  showModal(`
    <h2>☠ GRAVEWRIGHT</h2>
    <p class="intro-tag">an incremental necromancy roguelike</p>
    <p>You are the <b>Gravewright</b>, chained beneath an endless crypt.
    You summon <b>vessels</b> — cheap, hopeful heroes — and send them down.</p>
    <p>They explore, fight, loot… and die. <b>That is the point.</b>
    Every death is harvested as <b class="c-souls">✦ souls</b>; every kill leaves
    <b class="c-bones">∴ bones</b>. Spend both to make the next vessel crueler.</p>
    <p>Reach <b>depth ${B.REAP_MIN_DEPTH}</b> and the <b>Reaping</b> unlocks: collapse the
    crypt for <b class="c-essence">❖ essence</b> and permanent power.</p>
    <p class="intro-hint">Guide the vessel yourself with WASD/arrows or clicks — once the crypt
    has tasted its first death, the <b>autopilot</b> awakens and vessels act on their own.</p>
    <button class="btn primary" data-act="modal-close">Summon the first vessel</button>
  `);
}
