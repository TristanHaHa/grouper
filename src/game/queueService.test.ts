import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GateState, NPCData } from '../types';
import { generateGroup } from './npcGenerator';
import { advanceQueuePressure, balancedService, initialQueuePressure, initialServiceTargets, observeServiceTargets, queueExtraDrain, queueServiceBonus, queueUrgency } from './queueService';

const gatesFor = (...occupants: NPCData[][]): GateState[] => occupants.map((riders, index) => ({
  index, occupants: riders, capacity: 4, status: 'partial', vehicleIndex: Math.floor(index / 2),
}));

test('queue pressure crosses reward and drain thresholds with a small combined cap', () => {
  const main = [generateGroup('main', 4)];
  const single = [generateGroup('single')];
  const start = advanceQueuePressure(initialQueuePressure(), main, single, 0);
  const calm = advanceQueuePressure(start, main, single, 24.9);
  assert.equal(queueUrgency(calm.main.waitSeconds), 'green');
  assert.equal(queueServiceBonus(calm.main.waitSeconds, 4), 0);
  const amber = advanceQueuePressure(start, main, single, 25);
  assert.equal(queueUrgency(amber.main.waitSeconds), 'amber');
  assert.equal(queueServiceBonus(amber.main.waitSeconds, 4), 4);
  const red = advanceQueuePressure(start, main, single, 50);
  assert.equal(queueUrgency(red.main.waitSeconds), 'red');
  assert.equal(red.single.waitSeconds, 35, 'single riders lose patience at the slower rate');
  assert.equal(queueServiceBonus(red.main.waitSeconds, 4), 8);
  assert.equal(queueExtraDrain(red), 0, 'red queues have ten seconds to recover before extra drain');
  const neglected = advanceQueuePressure(start, main, single, 60);
  assert.equal(queueExtraDrain(neglected), 0.15);
  const relieved = advanceQueuePressure(neglected, [generateGroup('main', 2)], single, 0);
  assert.equal(relieved.main.waitSeconds, 52, 'the next group receives only a small line-advance boost');
  assert.equal(relieved.single.waitSeconds, 42, 'single riders accrue patience loss more slowly');
  assert.equal(queueExtraDrain(relieved), 0);
});

test('selection and paused time do not reset pressure; serving preserves pressure with a small boost', () => {
  const main = [generateGroup('main', 2), generateGroup('main', 4)];
  const start = advanceQueuePressure(initialQueuePressure(), main, [], 0);
  const waiting = advanceQueuePressure(start, main, [], 70);
  assert.deepEqual(advanceQueuePressure(waiting, main, [], 0), waiting);
  assert.equal(queueServiceBonus(70, 0), 0, 'zero confirmed riders earn no bonus');
  const served = advanceQueuePressure(waiting, main.slice(1), [], 0);
  assert.equal(served.main.waitSeconds, 62);
  assert.equal(queueExtraDrain(served), 0.15);
  const empty = advanceQueuePressure(waiting, [], [], 30);
  assert.equal(empty.main.groupId, null);
  assert.equal(queueExtraDrain(empty), 0);
});

test('balanced dispatch needs one complete main group and two single riders', () => {
  const main = generateGroup('main', 4);
  const singles = [generateGroup('single'), generateGroup('single')];
  const targets = observeServiceTargets(initialServiceTargets(), [main], singles, []);
  const partial = gatesFor(main.members.slice(0, 2), singles.flatMap(group => group.members));
  assert.equal(balancedService(partial, targets).earned, false, 'half of a main group is insufficient');
  const full = gatesFor(main.members.slice(0, 2), main.members.slice(2), singles.flatMap(group => group.members));
  assert.deepEqual(balancedService(full, targets), {
    completeMainGroups: 1, singleRiders: 2, earned: true, patience: 5, score: 250,
  });
  assert.equal(balancedService(gatesFor(main.members.slice(0, 2), main.members.slice(2), singles[0].members), targets).earned, false);
});

test('double-grouped riders count for the train they actually board', () => {
  const main = generateGroup('main', 4);
  const single = () => generateGroup('single').members[0];
  const gates = gatesFor(
    [single(), single(), ...main.members.slice(0, 2)],
    [single(), single(), ...main.members.slice(2)],
    [single(), single(), single(), single()],
  );
  const targets = { mainGroups: 1, singleRiders: 2 };
  assert.equal(balancedService(gates, targets).completeMainGroups, 0);
  assert.equal(balancedService(gates, targets).singleRiders, 6);
  assert.equal(balancedService(gates, targets).earned, false);
  const nextTrain = gates.map(gate => ({ ...gate, occupants: gate.occupants.slice(2) }));
  const nextTargets = observeServiceTargets(initialServiceTargets(), [], [], nextTrain);
  assert.deepEqual(nextTargets, targets, 'staged riders carry their queue identity into the next train');
  assert.equal(balancedService(nextTrain, nextTargets).earned, true);
});

test('unavailable queues are waived but serving a queue does not erase its target', () => {
  const single = generateGroup('single');
  const targets = observeServiceTargets(initialServiceTargets(), [], [single], []);
  assert.deepEqual(targets, { mainGroups: 0, singleRiders: 1 });
  assert.equal(balancedService(gatesFor(single.members), targets).earned, true);
  const bothTargets = observeServiceTargets(targets, [generateGroup('main', 2)], [single, generateGroup('single')], []);
  assert.deepEqual(observeServiceTargets(bothTargets, [], [], []), bothTargets);
  assert.equal(balancedService([], bothTargets).earned, false);
  assert.equal(balancedService([], initialServiceTargets()).score, 0);
});
