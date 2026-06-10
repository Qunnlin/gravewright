/** Contextual tutorial: the crypt whispers a short lesson the first time
 *  each mechanic becomes relevant. Steps persist in the save. */

import type { Game } from '../core/game';
import { bus } from '../core/events';

interface Step {
  id: string;
  /** becomes eligible when this returns true */
  when: (game: Game) => boolean;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    id: 'firstdeath',
    when: (g) => g.state.totalDeaths >= 1,
    title: 'Death Is the Business Model',
    body: `Your vessel died. <b>Good.</b> Its soul now sits in your ledger —
      spend souls in the <b>Necromancy</b> tab on speed, minions and darker
      vessel shapes. A new vessel is already being drawn into the circle.`,
  },
  {
    id: 'bones',
    when: (g) => g.state.bones >= 25,
    title: 'The Bones Pile Up',
    body: `Every kill leaves <b>∴ bones</b> — they persist through death.
      The <b>Crypt</b> tab spends them on the meat itself: more health, sharper
      sinew, fatter purses. Buy early, buy often.`,
  },
  {
    id: 'gear',
    when: (g) => {
      const gear = g.state.run?.gear ?? g.state.keptGear;
      return !!(gear.weapon || gear.armor || gear.charm);
    },
    title: 'Grave Goods',
    body: `Vessels loot gear from chests and corpses, and equip whatever scores
      best — see the <b>Vessel</b> tab. Gear is <i>lost on death</i>, unless
      you invest in the Crypt's <b>Reliquary</b>.`,
  },
  {
    id: 'satchel',
    when: (g) => g.state.inventory.length >= 1,
    title: 'The Satchel',
    body: `Loot the vessel cannot — or should not — wear lands in the
      <b>Satchel</b> (Vessel tab). Equip, swap or salvage it yourself, and
      toggle <b>auto-equip</b> there. Mind the archetypes: Rangers favor bows,
      and nobody hands the Lich an axe. The satchel survives death.`,
  },
  {
    id: 'shrine',
    when: (g) => g.state.shrinesUsed >= 1,
    title: 'The Shrines Take Coin',
    body: `Shrines <b>☩</b> heal the vessel fully and bless its blade for a
      while — for gold. Vessels visit them on their own when hurt; the
      <b>Doctrine</b> setting decides how desperate they must be first.`,
  },
  {
    id: 'champion',
    when: (g) => g.state.championsSlain >= 1,
    title: 'Champions',
    body: `That blue-glowing horror was a <b>champion</b> — enchanted vermin
      with stolen gifts. <i>Gilded</i> ones burst with gold, <i>Soulbranded</i>
      ones pay triple souls, <i>Volatile</i> ones explode. Read their names
      before charging in.`,
  },
  {
    id: 'relic',
    when: (g) => g.state.relicsFound >= 1,
    title: 'A Relic',
    body: `Bosses and Vault Wardens sometimes yield <b>relics</b> — permanent
      passive boons listed on the <b>Vessel</b> tab. Relics survive every death.
      The Reaping claims them, though, unless you buy <b>Reliquary Eternal</b>
      with essence.`,
  },
  {
    id: 'vault',
    when: (g) => !!g.state.run?.floor.vault,
    title: 'A Sealed Vault',
    body: `This floor holds a <b>vault</b> — the violet-tiled room. Its
      <b>Warden Ω</b> is far stronger than anything else down here, but it
      hoards a <span style="color:#ff5d3d"><b>Legendary</b></span> relic-arm and
      a heap of treasure. Your call, Gravewright.`,
  },
  {
    id: 'wrath',
    when: (g) => g.wrath() >= 1.25,
    title: 'The Crypt Stirs',
    body: `You are hoarding souls, and the crypt has noticed. Monsters on every
      new floor now hit harder and last longer — <b>Crypt Wrath</b> climbs as
      long as you refuse the Reaping. Reap to appease it, or descend into a
      crypt that hates you. Check the <b>Reaping</b> tab.`,
  },
  {
    id: 'reap',
    when: (g) => g.canReap(),
    title: 'The Crypt Is Ripe',
    body: `You can now <b>Reap</b>. Collapsing the crypt converts this cycle's
      souls into permanent <b>❖ essence</b> — everything else resets, but
      essence buys power that survives forever. The first Reaping is always
      the hardest. Visit the <b>Reaping</b> tab.`,
  },
];

let game: Game;
let active: Step | null = null;
let root: HTMLDivElement;

export function initTutorial(g: Game): void {
  game = g;
  root = document.createElement('div');
  root.id = 'tutorial-root';
  document.body.appendChild(root);

  // clicking anywhere on the whisper dismisses it
  root.addEventListener('click', () => {
    if (active) {
      game.state.tutorial[active.id] = true;
      active = null;
      root.innerHTML = '';
    }
  });

  bus.on((e) => {
    if (e.type === 'dirty' || e.type === 'death' || e.type === 'descend') check();
  });
  setInterval(check, 2000);
}

/** Clear the persisted flags AND any card currently on screen. */
export function resetTutorial(): void {
  game.state.tutorial = {};
  active = null;
  root.innerHTML = '';
}

function check(): void {
  if (active) return;
  for (const step of STEPS) {
    if (game.state.tutorial[step.id]) continue;
    if (!step.when(game)) continue;
    active = step;
    root.innerHTML = `
      <div class="tutorial-card">
        <div class="tutorial-kicker">the crypt whispers</div>
        <div class="tutorial-title">${step.title}</div>
        <div class="tutorial-body">${step.body}</div>
        <button class="btn tutorial-btn" data-tut-dismiss>Understood</button>
      </div>`;
    return;
  }
}
