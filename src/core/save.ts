import type { GameState, Item, Slot, Strategy } from './types';
import { Game, defaultState } from './game';
import { upgradeById } from './data/upgrades';
import { relicById } from './data/relics';
import { curseById } from './data/curses';
import { CLASSES } from './data/classes';
import { WEAPON_KINDS } from './data/items';
import { setById } from './data/sets';
import { INVENTORY_CAP } from './balance';

export const SAVE_KEY = 'gravewright-save-v1';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validItem(item: unknown, slot: Slot): item is Item {
  if (typeof item !== 'object' || item === null) return false;
  const it = item as Partial<Item>;
  return (
    it.slot === slot &&
    typeof it.name === 'string' &&
    num(it.rarity) && it.rarity >= 0 && it.rarity <= 6 &&
    num(it.depth) &&
    num(it.score) &&
    typeof it.stats === 'object' && it.stats !== null &&
    // no cursed gear exists by design — negative stats mean corruption
    Object.values(it.stats).every((v) => num(v) && v >= 0)
  );
}

/** Weapons from older saves (or tampered ones) get a sane archetype,
 *  and set-membership claims must point at a real set. */
function fixWeaponKind(item: Item | null): void {
  if (!item) return;
  if (item.setId !== undefined && (typeof item.setId !== 'string' || !setById(item.setId))) {
    delete item.setId;
  }
  if (item.locked !== undefined) item.locked = item.locked === true;
  if (item.slot !== 'weapon') return;
  if (!item.kind || !(item.kind in WEAPON_KINDS)) item.kind = 'blade';
}

/** Deep-merge loaded data over defaults so older saves gain new fields,
 *  then sanitize: corrupt or tampered saves must never produce NaN,
 *  negative currencies, over-max upgrades, or unknown ids. */
function mergeState(loaded: Partial<GameState>): GameState {
  const base = defaultState();
  const merged: GameState = { ...base, ...loaded };
  merged.upgrades = { ...(loaded.upgrades ?? {}) };
  merged.achievements = { ...base.achievements, ...(loaded.achievements ?? {}) };
  merged.curses = { ...(loaded.curses ?? {}) };
  merged.settings = { ...base.settings, ...(loaded.settings ?? {}) };
  merged.rates = { ...base.rates, ...(loaded.rates ?? {}) };
  merged.keptGear = { ...base.keptGear, ...(loaded.keptGear ?? {}) };
  merged.minions = { ...base.minions };
  for (const [id, st] of Object.entries(loaded.minions ?? {})) {
    if (merged.minions[id]) merged.minions[id] = { ...merged.minions[id], ...st };
  }

  // --- numeric fields: finite and non-negative, else default ---
  const NUM_FIELDS = [
    'gold', 'bones', 'souls', 'essence', 'lifetimeSouls', 'soulsThisReap',
    'totalKills', 'totalDeaths', 'reaps', 'bestDepth', 'bestDepthThisReap',
    'bossesSlain', 'shrinesUsed', 'goldLifetime', 'relicsFound',
    'minionsRaised', 'summonCd', 'championsSlain', 'wardensSlain',
    'legendariesFound', 'trialsSeen', 'trialsWon', 'trialsFailed',
  ] as const;
  for (const k of NUM_FIELDS) {
    if (!num(merged[k]) || merged[k] < 0) merged[k] = base[k];
  }
  if (!num(merged.lastSeen) || merged.lastSeen < 0) merged.lastSeen = Date.now();
  for (const k of ['souls', 'bones'] as const) {
    if (!num(merged.rates[k]) || merged.rates[k] < 0) merged.rates[k] = 0;
  }

  // --- upgrades: known ids only, integer levels clamped to [1, max] ---
  const upgrades: Record<string, number> = {};
  for (const [id, lvl] of Object.entries(merged.upgrades)) {
    const def = upgradeById(id);
    if (!def || !num(lvl)) continue;
    const v = Math.floor(Math.min(Math.max(0, lvl), def.max));
    if (v > 0) upgrades[id] = v;
  }
  merged.upgrades = upgrades;

  // --- ids that must exist in data tables ---
  merged.relics = Array.isArray(merged.relics)
    ? merged.relics.filter((id) => relicById(id) !== undefined)
    : [];
  merged.curses = Object.fromEntries(
    Object.entries(merged.curses).filter(([id, on]) => curseById(id) && on === true));

  // --- minions: sane levels/hp ---
  for (const st of Object.values(merged.minions)) {
    st.level = num(st.level) && st.level > 0 ? Math.floor(st.level) : 0;
    st.hp = num(st.hp) && st.hp > 0 ? st.hp : 0;
    st.alive = st.level > 0 && st.alive === true;
  }

  // --- classes & strategy ---
  const known = new Set(CLASSES.map((c) => c.id));
  merged.classesUnlocked = Array.isArray(merged.classesUnlocked)
    ? merged.classesUnlocked.filter((id) => known.has(id))
    : [];
  if (!merged.classesUnlocked.includes('wretch')) merged.classesUnlocked.unshift('wretch');
  if (!known.has(merged.curClass) || !merged.classesUnlocked.includes(merged.curClass)) {
    merged.curClass = 'wretch';
  }
  if (!(['cautious', 'balanced', 'reckless'] as Strategy[]).includes(merged.strategy)) {
    merged.strategy = 'balanced';
  }

  // --- gear ---
  for (const slot of ['weapon', 'armor', 'charm'] as const) {
    const item = merged.keptGear[slot];
    if (item && !validItem(item, slot)) merged.keptGear[slot] = null;
    fixWeaponKind(merged.keptGear[slot]);
  }

  // --- satchel ---
  merged.inventory = (Array.isArray(merged.inventory) ? merged.inventory : [])
    .filter((it): it is Item =>
      !!it && typeof it === 'object' &&
      ['weapon', 'armor', 'charm'].includes((it as Item).slot) &&
      validItem(it, (it as Item).slot))
    .slice(0, INVENTORY_CAP);
  for (const it of merged.inventory) fixWeaponKind(it);

  // --- tutorial: only true flags survive ---
  merged.tutorial = Object.fromEntries(
    Object.entries(loaded.tutorial ?? {}).filter(([, v]) => v === true));

  // --- settings: clamp the numeric knobs ---
  const st = merged.settings;
  st.autoSalvageBelow = num(st.autoSalvageBelow)
    ? Math.min(6, Math.max(0, Math.floor(st.autoSalvageBelow))) : 0;
  // 'protect nothing' moved from 6 to 7 when Vestiges (rarity 6) arrived
  if (st.protectRarity === 6) st.protectRarity = 7;
  if (![3, 4, 5, 7].includes(st.protectRarity)) st.protectRarity = 4;
  if (![0, 1, 10].includes(st.buyAmount)) st.buyAmount = 1;
  st.protectVestiges = st.protectVestiges !== false;
  st.ravenousActive = st.ravenousActive !== false;
  st.crtFilter = st.crtFilter === true; // default-off vanity, strict coercion
  st.logCombat = st.logCombat !== false;
  st.logLoot = st.logLoot !== false;
  st.logSystem = st.logSystem !== false;
  st.autoSpeed = num(st.autoSpeed)
    ? Math.min(1, Math.max(0.25, st.autoSpeed)) : 1;

  merged.trialPending = merged.trialPending === true;

  merged.auto = merged.auto !== false;
  merged.run = null; // mid-run state is never persisted
  return merged;
}

export function encodeSave(state: GameState): string {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSave(blob: string): GameState {
  const json = decodeURIComponent(escape(atob(blob.trim())));
  const parsed = JSON.parse(json) as Partial<GameState>;
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.v !== 'number') {
    throw new Error('Not a GRAVEWRIGHT save.');
  }
  return mergeState(parsed);
}

/** Once locked (import/reset about to reload the page), no further writes —
 *  otherwise the beforeunload autosave fires *during* location.reload() and
 *  overwrites the imported/erased save with the old state. */
let savesLocked = false;

export function lockSaves(): void {
  savesLocked = true;
}

export function saveGame(game: Game): void {
  if (savesLocked) return;
  try {
    localStorage.setItem(SAVE_KEY, encodeSave(game.serialize()));
  } catch {
    /* storage full or unavailable — keep playing */
  }
}

export function loadGame(): GameState | null {
  try {
    const blob = localStorage.getItem(SAVE_KEY);
    if (!blob) return null;
    return decodeSave(blob);
  } catch {
    return null;
  }
}

export function hardReset(): void {
  lockSaves();
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
