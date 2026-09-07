import type { GateState, GroupData, QueueType } from '../types';

export const QUEUE_AMBER_SECONDS = 25;
export const QUEUE_RED_SECONDS = 50;
export const QUEUE_DRAIN_SECONDS = 60;
export const QUEUE_EXTRA_DRAIN = 0.15;
export const LINE_ADVANCE_PATIENCE_BOOST_SECONDS = 8;
export const SINGLE_RIDER_PATIENCE_RATE = 0.7;
export const MAX_QUEUE_EXTRA_DRAIN = 0.3;
export const BALANCED_PATIENCE = 5;
export const BALANCED_SCORE = 250;
export const QUEUE_NAMES = { main: 'Main queue', single: 'Single riders' };

export type QueuePressure = Record<QueueType, { groupId: string | null; waitSeconds: number }>;
export interface ServiceTargets { mainGroups: number; singleRiders: number }

export const initialQueuePressure = (): QueuePressure => ({
  main: { groupId: null, waitSeconds: 0 }, single: { groupId: null, waitSeconds: 0 },
});
export const initialServiceTargets = (): ServiceTargets => ({ mainGroups: 0, singleRiders: 0 });

// Front-of-line service time uses active loading seconds, not wall-clock age.
// Serving a group relieves its queue; selecting it never changes this clock.
export function advanceQueuePressure(state: QueuePressure, main: GroupData[], single: GroupData[], seconds: number): QueuePressure {
  const advance = (type: QueueType, queue: GroupData[]) => {
    const groupId = queue[0]?.id ?? null;
    if (!groupId) return { groupId: null, waitSeconds: 0 };
    const elapsed = seconds * (type === 'single' ? SINGLE_RIDER_PATIENCE_RATE : 1);
    // A group advancing gets relief, not a fresh full patience timer.
    const carriedWait = state[type].groupId === groupId
      ? state[type].waitSeconds
      : Math.max(0, state[type].waitSeconds - LINE_ADVANCE_PATIENCE_BOOST_SECONDS);
    return { groupId, waitSeconds: carriedWait + elapsed };
  };
  return { main: advance('main', main), single: advance('single', single) };
}

export function queueUrgency(waitSeconds: number) {
  return waitSeconds >= QUEUE_RED_SECONDS ? 'red' : waitSeconds >= QUEUE_AMBER_SECONDS ? 'amber' : 'green';
}

export function queueServiceBonus(waitSeconds: number, riders: number) {
  return riders * (waitSeconds >= QUEUE_RED_SECONDS ? 2 : waitSeconds >= QUEUE_AMBER_SECONDS ? 1 : 0);
}

export function queueExtraDrain(pressure: QueuePressure) {
  return Math.min(MAX_QUEUE_EXTRA_DRAIN, Object.values(pressure)
    .filter(queue => queue.groupId !== null && queue.waitSeconds >= QUEUE_DRAIN_SECONDS).length * QUEUE_EXTRA_DRAIN);
}

// Retain targets throughout loading, even after the relevant queue is served.
// Staged riders make their source queue available to the next train as well.
export function observeServiceTargets(targets: ServiceTargets, main: GroupData[], single: GroupData[], gates: GateState[]): ServiceTargets {
  const occupants = gates.flatMap(gate => gate.occupants);
  return {
    mainGroups: Math.max(targets.mainGroups, main.length > 0 || occupants.some(npc => npc.sourceQueue === 'main') ? 1 : 0),
    singleRiders: Math.max(targets.singleRiders, Math.min(2, single.length + occupants.filter(npc => npc.sourceQueue === 'single').length)),
  };
}

export function balancedService(gates: GateState[], targets: ServiceTargets) {
  const boarding = gates.flatMap(gate => gate.occupants.slice(0, 2));
  const mainGroups = new Map<string, { boarded: number; size: number }>();
  for (const npc of boarding) {
    if (npc.sourceQueue !== 'main') continue;
    const group = mainGroups.get(npc.groupId) ?? { boarded: 0, size: npc.sourceGroupSize };
    group.boarded++;
    mainGroups.set(npc.groupId, group);
  }
  const completeMainGroups = [...mainGroups.values()].filter(group => group.boarded === group.size).length;
  const singleRiders = boarding.filter(npc => npc.sourceQueue === 'single').length;
  const earned = boarding.length > 0 && (targets.mainGroups > 0 || targets.singleRiders > 0)
    && completeMainGroups >= targets.mainGroups && singleRiders >= targets.singleRiders;
  return { completeMainGroups, singleRiders, earned, patience: earned ? BALANCED_PATIENCE : 0, score: earned ? BALANCED_SCORE : 0 };
}
