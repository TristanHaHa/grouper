import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrackField, TrackScope } from './trackState';

test('each track retains independent state across switches and delayed callbacks', () => {
  const scope = new TrackScope();
  const field = createTrackField(scope, () => ({ seats: 0, phase: 'load' }));
  field.ref.current = { seats: 4, phase: 'dispatch' };
  const finishInside = () => scope.run('inside', () => { field.ref.current = { seats: 0, phase: 'load' }; });
  scope.current = 'outside';
  field.ref.current = { seats: 8, phase: 'dispatch' };
  finishInside();
  assert.equal(scope.current, 'outside');
  assert.deepEqual(field.ref.current, { seats: 8, phase: 'dispatch' });
  assert.deepEqual(field.values.inside, { seats: 0, phase: 'load' });
  assert.throws(() => scope.run('inside', () => { throw Error('test'); }));
  assert.equal(scope.current, 'outside', 'scope is restored even on failure');
});
