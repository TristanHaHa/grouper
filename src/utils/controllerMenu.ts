import type { ControllerAction } from '../game/controller';

export function activeControllerMenu() {
  return [...document.querySelectorAll<HTMLElement>('[data-controller-menu]')]
    .filter(element => element.getClientRects().length > 0).at(-1) ?? null;
}

export function navigateControllerMenu(menu: HTMLElement, action?: ControllerAction) {
  const controls = [...menu.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
    .filter(element => element.getClientRects().length > 0 && !element.hasAttribute('data-controller-skip'));
  if (!controls.length) return;
  let index = controls.indexOf(document.activeElement as HTMLElement);
  if (index === -1) { index = 0; controls[0].focus(); }
  const current = controls[index];
  if (action === 'menuBack') { menu.querySelector<HTMLElement>('[data-controller-back]')?.click(); return; }
  if (action === 'menuConfirm') { current.click(); return; }
  const direction = action === 'menuLeft' || action === 'menuUp' ? -1 : 1;
  if ((action === 'menuLeft' || action === 'menuRight') && current instanceof HTMLInputElement && current.type === 'range') {
    const step = Number(current.step) || 1;
    const value = Math.max(Number(current.min) || 0, Math.min(Number(current.max) || 100, Number(current.value) + step * direction));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(current, String(value));
    current.dispatchEvent(new Event('input', { bubbles: true }));
    current.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (!action) return;
  if (['menuUp', 'menuDown', 'menuLeft', 'menuRight'].includes(action)) {
    const next = controls[(index + direction + controls.length) % controls.length];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
}
