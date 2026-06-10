/** Custom tooltip system: any element with a `data-tip` attribute gets a
 *  styled floating tooltip (HTML allowed — builders must escape dynamic text). */

let tipEl: HTMLDivElement | null = null;
let anchor: HTMLElement | null = null;

export function initTooltips(): void {
  tipEl = document.createElement('div');
  tipEl.id = 'tooltip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);

  document.body.addEventListener('mouseover', (ev) => {
    const el = (ev.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
    if (el === anchor) return;
    anchor = el;
    if (el) {
      tipEl!.innerHTML = el.dataset.tip ?? '';
      tipEl!.classList.add('show');
    } else {
      tipEl!.classList.remove('show');
    }
  });

  document.body.addEventListener('mousemove', (ev) => {
    if (!anchor || !tipEl) return;
    position(ev.clientX, ev.clientY);
  });

  // tooltips vanish if their anchor is removed by a panel re-render
  setInterval(() => {
    if (anchor && !document.body.contains(anchor)) {
      anchor = null;
      tipEl?.classList.remove('show');
    }
  }, 500);
}

function position(mx: number, my: number): void {
  const t = tipEl!;
  const pad = 14;
  const rect = t.getBoundingClientRect();
  let x = mx + pad;
  let y = my + pad;
  if (x + rect.width > window.innerWidth - 8) x = mx - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = my - rect.height - pad;
  t.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
}
