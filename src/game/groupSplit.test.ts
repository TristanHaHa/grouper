import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GateState } from '../types';
import { analyzeGroupSplit } from './groupSplit';

const gates = (...occupancy: number[]): GateState[] => occupancy.map((count, index) => ({
  index, vehicleIndex: Math.floor(index / 2), capacity: 4, occupants: Array.from({ length: count }) as GateState['occupants'], status: count ? 'partial' : 'empty',
}));

test('uses the four-seat kart ideal for groups of 1, 4, 5, 8, and 9', () => {
  for (const [size, expected] of [[1, 1], [4, 1], [5, 2], [8, 2], [9, 3]] as const) {
    assert.equal(analyzeGroupSplit(size, gates(0, 0, 0, 0, 0, 0, 0, 0), {}).idealKartCount, expected);
  }
});

test('two gates in one kart are not a split, but using another free kart is', () => {
  const station = gates(0, 0, 0, 0, 0, 0, 0, 0);
  assert.equal(analyzeGroupSplit(4, station, { 0: 2, 1: 2 }).patiencePenalty, 0);
  const split = analyzeGroupSplit(4, station, { 0: 2, 2: 2 });
  assert.equal(split.minimumFeasibleKartCount, 1);
  assert.equal(split.patiencePenalty, 4);
  assert.deepEqual(split.alternativeKartIndices, [0]);
});

test('occupancy and staged riders can make an otherwise undesirable split unavoidable', () => {
  const station = gates(3, 4, 3, 4, 4, 4, 4, 4);
  const unavoidable = analyzeGroupSplit(2, station, { 0: 1, 2: 1 });
  assert.equal(unavoidable.minimumFeasibleKartCount, 2);
  assert.equal(unavoidable.patiencePenalty, 0);
});

test('repeated analysis and previews have no side effects', () => {
  const station = gates(0, 0, 0, 0, 0, 0, 0, 0);
  const first = analyzeGroupSplit(1, station, { 0: 1, 2: 1 });
  const second = analyzeGroupSplit(1, station, { 0: 1, 2: 1 });
  assert.deepEqual(first, second);
});
