import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateGroup, getRandomGroupSize } from './npcGenerator';

test('main queue groups support up to sixteen guests', () => {
  const group = generateGroup('main', 16);
  assert.equal(group.size, 16);
  assert.equal(group.members.length, 16);
  assert.ok(group.members.every(member => member.sourceGroupSize === 16));
});

test('generated main group sizes stay within the sixteen-guest limit', () => {
  for (let index = 0; index < 100; index++) {
    const size = getRandomGroupSize(1);
    assert.ok(size >= 1 && size <= 16);
  }
});

test('standard party mix follows the specified weighted size buckets', () => {
  const originalRandom = Math.random;
  try {
    const samples = [0.049, 0.05, 0.331, 0.51, 0.75, 0.95, 0.9949, 0.999];
    const expected = [1, 2, 3, 4, 5, 8, 12, 16];
    samples.forEach((sample, index) => {
      Math.random = () => sample;
      assert.equal(getRandomGroupSize(0), expected[index]);
    });
  } finally {
    Math.random = originalRandom;
  }
});
