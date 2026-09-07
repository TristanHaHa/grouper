import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import * as THREE from 'three';
import { GuestReactions } from './guestReactions';
import { generateGroup } from './npcGenerator';
import { advanceQueuePressure, initialQueuePressure } from './queueService';
import type { GroupData } from '../types';

function fixture(t: TestContext) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = { beginPath() {}, roundRect() {}, clearRect() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, fillText() {}, strokeText() {} };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  });
  const reactions = new GuestReactions();
  t.after(() => {
    reactions.dispose();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const add = (group: GroupData) => group.members.map(npc => {
    const mesh = new THREE.Group();
    for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
      const limb = new THREE.Group();
      limb.name = name;
      mesh.add(limb);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: '#8d5524' }));
    head.name = 'head';
    mesh.add(head);
    mesh.rotation.y = -Math.PI / 2;
    t.after(() => { head.geometry.dispose(); head.material.dispose(); });
    reactions.register(npc, mesh);
    return mesh;
  });
  const pressure = (main: GroupData[], single: GroupData[], seconds: number) =>
    advanceQueuePressure(advanceQueuePressure(initialQueuePressure(), main, single, 0), main, single, seconds);
  return { reactions, add, pressure };
}

test('guest reactions escalate twice as quickly from calm to impatient to angry without bubbles', t => {
  const { reactions, add, pressure } = fixture(t);
  const main = generateGroup('main', 2);
  const [guest, friend] = add(main);

  reactions.update(0.2, [main], [], pressure([main], [], 0), false, true);
  assert.equal(guest.getObjectByName('expression_green')!.visible, true);
  assert.equal(guest.getObjectByName('guestChat'), undefined);

  reactions.update(0.2, [main], [], pressure([main], [], 13), false, true);
  assert.equal(guest.getObjectByName('expression_amber')!.visible, true);
  assert.equal(friend.getObjectByName('expression_amber')!.visible, true);
  assert.equal(guest.getObjectByName('rightArm')!.rotation.x, -0.65);

  reactions.update(0.2, [main], [], pressure([main], [], 25), false, true);
  assert.equal(guest.getObjectByName('expression_red')!.visible, true);
  assert.ok(Math.abs(guest.rotation.z) > 0.01);
  assert.ok(guest.getObjectByName('rightArm')!.rotation.z > 1, 'angry guests visibly gesture');
});

test('an empty patience bar emits warning and departure together', t => {
  const { reactions, add, pressure } = fixture(t);
  const main = generateGroup('main', 1);
  const [guest] = add(main);
  const state = pressure([main], [], 61);
  const first = reactions.update(0.25, [main], [], state, false, true);
  assert.equal(first[0]?.type, 'warning');
  assert.equal(first.some(event => event.type === 'departure'), true);
  assert.equal(guest.getObjectByName('guestSymbol')?.visible, false);
});

test('boarding during the warning window suppresses departure and resets reactions', t => {
  const { reactions, add, pressure } = fixture(t);
  const main = generateGroup('main', 1);
  const [guest] = add(main);
  const state = pressure([main], [], 61);
  reactions.update(0.6, [main], [], state, false, true);
  main.members[0].isWalking = true;
  const events = reactions.update(0.6, [], [], initialQueuePressure(), false, true);
  assert.equal(events.some(event => event.type === 'departure'), false);
  assert.equal(guest.getObjectByName('expression_green')!.visible, true);
  assert.equal(guest.getObjectByName('guestSymbol')?.visible, false);
});

test('forget and reset clean up reactions, symbols, and faces', t => {
  const { reactions, add, pressure } = fixture(t);
  const main = generateGroup('main', 2);
  const [guest, friend] = add(main);
  reactions.update(0.2, [main], [], pressure([main], [], 61), false, true);
  reactions.forget(main.members[0].id);
  assert.equal(guest.getObjectByName('guestSymbol'), undefined);
  assert.equal(guest.getObjectByName('expression_red'), undefined);
  reactions.reset();
  assert.equal(friend.getObjectByName('expression_green'), undefined);
});

test('departure freezes outside loading and emits exactly once at empty patience', t => {
  const { reactions, add, pressure } = fixture(t);
  const group = generateGroup('main', 1);
  const [mesh] = add(group);
  const state = pressure([group], [], 61);
  assert.equal(reactions.update(0.5, [group], [], state, false, true).filter(e => e.type === 'departure').length, 1);
  assert.deepEqual(reactions.update(10, [group], [], state, false, false), []);
  assert.equal(mesh.getObjectByName('guestSymbol')!.visible, false);
  assert.deepEqual(reactions.update(10, [group], [], state, false, true), []);
});

test('Zen mode cancels anger and a new leader receives a fresh warning', t => {
  const { reactions, add, pressure } = fixture(t);
  const first = generateGroup('main', 1), next = generateGroup('main', 1);
  const [mesh] = add(first); add(next);
  const base = (mesh.getObjectByName('head') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.clone();
  reactions.update(2, [first], [], pressure([first], [], 61), false, true);
  const skin = (mesh.getObjectByName('head') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color;
  assert.ok(!skin.equals(base));
  assert.deepEqual(reactions.update(10, [first], [], pressure([first], [], 61), true, true), []);
  assert.ok(skin.equals(base));
  assert.equal(mesh.getObjectByName('guestSymbol')!.visible, false);
  const events = reactions.update(0.2, [next], [], pressure([next], [], 61), false, true);
  assert.deepEqual(events.map(e => e.type), ['warning', 'departure']);
  assert.equal(mesh.getObjectByName('guestSymbol')!.visible, false);
  assert.equal(mesh.rotation.y, -Math.PI / 2);
});
