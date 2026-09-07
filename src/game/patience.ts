import type { GateState } from '../types';

export const STARTUP_GRACE_SECONDS = 5;
export const RECOVERY_SECONDS = 10;

export interface PatienceClock {
  graceRemaining: number;
  recoveryRemaining: number | null;
}

export interface PatienceNotice {
  id: number;
  amount: number;
  label: string;
  gateIndex?: number;
  remaining: number;
}

export const initialPatienceClock = (): PatienceClock => ({
  graceRemaining: STARTUP_GRACE_SECONDS,
  recoveryRemaining: null,
});

// Advance only by playable loading time; pauses and train animations do not count.
export function advancePatience(patience: number, clock: PatienceClock, drainRate: number, seconds: number) {
  const graceUsed = Math.min(clock.graceRemaining, seconds);
  const activeSeconds = seconds - graceUsed;
  const nextPatience = Math.max(0, patience - drainRate * activeSeconds);
  const zeroSeconds = patience > 0 ? Math.max(0, activeSeconds - patience / drainRate) : activeSeconds;
  const recoveryRemaining = nextPatience > 0 ? null : Math.max(0, (clock.recoveryRemaining ?? RECOVERY_SECONDS) - zeroSeconds);
  return {
    patience: nextPatience,
    clock: { graceRemaining: clock.graceRemaining - graceUsed, recoveryRemaining },
    // Overall guest patience ends the shift the instant it reaches zero.
    gameOver: nextPatience === 0,
  };
}

export function completedDoubleGates(before: GateState[], after: GateState[]) {
  return after.filter((gate, index) => before[index].occupants.length < 4 && gate.occupants.length === 4)
    .map(gate => gate.index);
}

export function dispatchRewards(gates: GateState[], maxReward: number) {
  const boarding = gates.reduce((sum, gate) => sum + Math.min(2, gate.occupants.length), 0);
  return {
    boarding,
    patience: maxReward * boarding / 16,
    stagedPatience: gates.reduce((sum, gate) => sum + Math.max(0, gate.occupants.length - 2), 0),
    doubleGroupScore: gates.filter(gate => gate.occupants.length === 4).length * 100,
  };
}
