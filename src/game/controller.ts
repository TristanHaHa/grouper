export type ControllerAction = 'previousGate' | 'nextGate' | 'selectGate' | 'confirmGroup' | 'mainQueue' | 'singleQueue' | 'switchTrack'
  | 'cancel' | 'interact' | 'jump' | 'pause' | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'menuConfirm' | 'menuBack';
export type ControllerMode = 'gameplay' | 'menu';
export type ControllerFamily = 'xbox' | 'playstation';
export interface ControllerAxes { moveX: number; moveY: number; lookX: number; lookY: number; sprint: boolean }
export const neutralControllerAxes = (): ControllerAxes => ({ moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false });

export function controllerLabels(family: ControllerFamily) {
  return family === 'playstation'
    ? { previous: 'L1', next: 'R1', select: 'Square', confirm: 'L2', accept: 'Cross', back: 'Circle', interact: 'R2', jump: 'Cross', pause: 'Options', switchTrack: 'Triangle' }
    : { previous: 'LB', next: 'RB', select: 'X', confirm: 'LT', accept: 'A', back: 'B', interact: 'RT', jump: 'A', pause: 'Menu', switchTrack: 'Y' };
}

export function stickWithDeadzone(x: number, y: number, deadzone: number): [number, number] {
  const length = Math.hypot(x, y);
  const threshold = Math.max(0.05, Math.min(0.4, deadzone));
  if (length <= threshold) return [0, 0];
  const magnitude = (Math.min(1, length) - threshold) / (1 - threshold);
  return [x / length * magnitude, y / length * magnitude];
}

// W3C standard mapping: https://www.w3.org/TR/gamepad/#remapping
// Shoulders are buttons 4/5; analog triggers are buttons 6/7.
export class ControllerInput {
  private identity: string | null = null;
  private previous: boolean[] = [];
  private repeatAt = new Map<number, number>();
  private mode: ControllerMode | null = null;
  private device: Gamepad | null = null;

  public reset() {
    this.identity = null;
    this.previous = [];
    this.repeatAt.clear();
    this.mode = null;
    this.device = null;
  }

  public sample(pads: readonly (Gamepad | null)[], now: number, mode: ControllerMode, deadzone = 0.18) {
    const supported = pads.filter((pad): pad is Gamepad => !!pad?.connected && pad.mapping === 'standard');
    const pad = supported.find(value => `${value.index}:${value.id}` === this.identity) ?? supported[0];
    const disconnected = this.device !== null && (!pad || `${pad.index}:${pad.id}` !== this.identity);
    if (!pad) {
      this.reset();
      return { connected: false, disconnected, unsupported: pads.some(value => value?.connected), active: false,
        family: 'xbox' as ControllerFamily, actions: [] as ControllerAction[], axes: neutralControllerAxes() };
    }
    const identity = `${pad.index}:${pad.id}`;
    const changed = identity !== this.identity || mode !== this.mode;
    const pressed = pad.buttons.map((button, index) => index === 6 || index === 7
      ? button.value >= (this.previous[index] && !changed ? 0.35 : 0.6)
      : button.pressed);
    const [moveX, moveY] = stickWithDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, deadzone);
    const [lookX, lookY] = stickWithDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, deadzone);
    const actions: ControllerAction[] = [];
    const bindings: [number, ControllerAction, boolean][] = mode === 'gameplay'
      ? [[4, 'previousGate', true], [5, 'nextGate', true], [2, 'selectGate', false], [6, 'confirmGroup', false],
        [3, 'switchTrack', false],
        [12, 'mainQueue', false], [13, 'singleQueue', false], [1, 'cancel', false], [7, 'interact', false],
        [0, 'jump', false], [9, 'pause', false]]
      : [[12, 'menuUp', true], [13, 'menuDown', true], [14, 'menuLeft', true], [15, 'menuRight', true],
        [0, 'menuConfirm', false], [1, 'menuBack', false], [9, 'menuBack', false]];
    if (changed) this.repeatAt.clear();
    else for (const [index, action, repeat] of bindings) {
      if (pressed[index] && !this.previous[index]) {
        actions.push(action);
        if (repeat) this.repeatAt.set(index, now + 450);
      } else if (pressed[index] && repeat && now >= (this.repeatAt.get(index) ?? Infinity)) {
        actions.push(action);
        this.repeatAt.set(index, now + 180);
      } else if (!pressed[index]) this.repeatAt.delete(index);
    }
    this.identity = identity;
    this.previous = pressed;
    this.mode = mode;
    this.device = pad;
    return { connected: true, disconnected, unsupported: false,
      active: pressed.some(Boolean) || !!(moveX || moveY || lookX || lookY),
      family: /054c|sony|playstation|dualshock|dualsense/i.test(pad.id) ? 'playstation' as const : 'xbox' as const,
      actions, axes: mode === 'gameplay' ? { moveX, moveY, lookX, lookY, sprint: !!pressed[10] } : neutralControllerAxes() };
  }

  public vibrate(duration: number, strength = 0.3) {
    const actuator = this.device?.vibrationActuator;
    if (!actuator?.playEffect) return;
    try {
      void actuator.playEffect('dual-rumble', { duration, startDelay: 0, strongMagnitude: strength, weakMagnitude: strength }).catch(() => {});
    } catch { /* Vibration is optional and must never interrupt gameplay. */ }
  }
}
