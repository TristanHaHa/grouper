import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GateState, NPCData } from '../types';
import { advancePatience, completedDoubleGates, dispatchRewards, initialPatienceClock } from './patience';
import { DIFFICULTY_PRESETS } from './constants';

const gatesWithOccupancy = (...counts: number[]): GateState[] => counts.map((count, index) => ({
  index, occupants: Array.from({ length: count }, (_, slot) => ({ id: `${index}-${slot}` } as NPCData)),
  capacity: 4, status: count ? 'full' : 'empty', vehicleIndex: Math.floor(index / 2),
}));

test('Standard gives 5 seconds of grace and 100 seconds of loading before the shift ends', () => {
  const rate = DIFFICULTY_PRESETS.STANDARD.passiveDrainRate;
  const grace = advancePatience(100, initialPatienceClock(), rate, 5);
  assert.equal(grace.patience, 100);
  assert.equal(grace.clock.graceRemaining, 0);
  const loading = advancePatience(grace.patience, grace.clock, rate, 100);
  assert.equal(loading.patience, 0);
  assert.equal(loading.clock.recoveryRemaining, 10);
  assert.equal(loading.gameOver, true);
});

test('a tick spanning grace or zero only charges the time spent in each phase', () => {
  const grace = advancePatience(100, { graceRemaining: 0.05, recoveryRemaining: null }, 1, 0.1);
  assert.equal(grace.patience, 99.95);
  const zero = advancePatience(0.05, { graceRemaining: 0, recoveryRemaining: null }, 1, 0.1);
  assert.equal(zero.clock.recoveryRemaining, 9.95);
});

test('restoring patience cancels recovery and the next zero starts a fresh countdown', () => {
  const recovered = advancePatience(4, { graceRemaining: 0, recoveryRemaining: 1 }, 1, 0.1);
  assert.equal(recovered.clock.recoveryRemaining, null);
  const zeroAgain = advancePatience(recovered.patience, recovered.clock, 1, 3.9);
  assert.equal(zeroAgain.clock.recoveryRemaining, 10);
});

test('double-group bonuses only apply when a gate newly reaches 4/4', () => {
  const before = gatesWithOccupancy(2, 3, 4, 0);
  const after = gatesWithOccupancy(4, 4, 4, 2);
  assert.deepEqual(completedDoubleGates(before, after), [0, 1]);
  assert.deepEqual(completedDoubleGates(after, after), []);
  assert.deepEqual(completedDoubleGates(gatesWithOccupancy(2), gatesWithOccupancy(4)), [0]);
});

test('a fully double-grouped station rewards boarding, staged riders, and planning separately', () => {
  assert.deepEqual(dispatchRewards(gatesWithOccupancy(...Array(8).fill(4)), 42), {
    boarding: 16, patience: 42, stagedPatience: 16, doubleGroupScore: 800,
  });
  assert.deepEqual(dispatchRewards(gatesWithOccupancy(...Array(8).fill(2)), 42), {
    boarding: 16, patience: 42, stagedPatience: 0, doubleGroupScore: 0,
  });
});

test('partial staging rewards actual riders and empty gates earn nothing', () => {
  assert.deepEqual(dispatchRewards(gatesWithOccupancy(3, 1, 0), 48), {
    boarding: 3, patience: 9, stagedPatience: 1, doubleGroupScore: 0,
  });
  assert.deepEqual(dispatchRewards(gatesWithOccupancy(0), 42), {
    boarding: 0, patience: 0, stagedPatience: 0, doubleGroupScore: 0,
  });
});

test('splitting a party across trains costs once, while multiple gates on one train are fine', async () => {
  const { groupsSplitAcrossTrains, SPLIT_TRAIN_PATIENCE_PENALTY } = await import('./patience');
  const { generateGroup } = await import('./npcGenerator');
  const group = generateGroup('main', 4);
  const gate = (occupants: typeof group.members) => ({ index: 0, occupants, capacity: 4, status: 'full' as const, vehicleIndex: 0 });
  const seen = new Set<string>();
  assert.deepEqual(groupsSplitAcrossTrains([gate(group.members.slice(0, 2)), gate(group.members.slice(2))], seen), []);
  const first = groupsSplitAcrossTrains([gate(group.members)], seen);
  assert.deepEqual(first, [group.id], 'staged riders are on the next train');
  assert.equal(first.length * SPLIT_TRAIN_PATIENCE_PENALTY, 4);
  first.forEach(id => seen.add(id));
  assert.deepEqual(groupsSplitAcrossTrains([gate(group.members.slice(2))], seen), [], 'the other track or later train cannot charge again');
  const solo = generateGroup('single', 1);
  assert.deepEqual(groupsSplitAcrossTrains([gate(solo.members)], new Set()), []);
  assert.deepEqual(groupsSplitAcrossTrains([], new Set()), []);
  seen.clear();
  assert.deepEqual(groupsSplitAcrossTrains([gate(group.members)], seen), [group.id], 'a new shift resets accounting');
});
