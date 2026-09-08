import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { test } from 'node:test';
import { TrackScope } from './trackState';
import { RideStation3D } from './threeScene';
import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';

test('gate clicks use only the current scene after a StrictMode remount', (t) => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const container = new EventTarget();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowTarget });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTarget });
  t.after(() => {
    for (const [name, descriptor] of [['window', originalWindow], ['document', originalDocument]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const clickedGates: number[] = [];

  // Exercise the real input lifecycle without constructing a WebGL renderer.
  const mountScene = () => {
    const scene = Object.assign(Object.create(RideStation3D.prototype), {
      container,
      trackScope: new TrackScope(), activeTrack: 'inside', currentHoverTarget: { type: 'none' },
      eventListenerController: new AbortController(),
      animationFrameId: null,
      renderer: { dispose() {}, domElement: { parentElement: null } },
      guestReactions: { dispose() {} },
      callbacks: { onToggleGateSelection: (gate: number) => clickedGates.push(gate) },
      selectedGroup: { size: 4, type: 'main' },
      hoveredGateIndex: 0,
      gateGhostHighlights: [],
      lastGateSelectionClickTime: 0,
      isPointerLocked: true,
      isPaused: false,
    });
    scene.setupEventListeners();
    return scene as RideStation3D;
  };

  const retiredScene = mountScene();
  retiredScene.dispose();
  const scene = mountScene();
  t.after(() => scene.dispose());

  const click = () => {
    now += 200;
    container.dispatchEvent(Object.assign(new Event('pointerdown'), { button: 0 }));
  };

  click();
  scene.setHoveredGate(1);
  click();
  click();
  assert.deepEqual(clickedGates, [0, 1, 1], 'select Gate 1, select Gate 2, then deselect only Gate 2');

  scene.dispose();
  for (const [target, events] of [
    [windowTarget, ['resize', 'keydown', 'keyup', 'mouseup', 'auxclick']],
    [documentTarget, ['mousemove', 'pointerlockchange']],
    [container, ['pointerdown', 'contextmenu', 'mousedown']],
  ] as const) {
    for (const event of events) {
      assert.equal(getEventListeners(target, event).length, 0, `${event} listeners removed on disposal`);
    }
  }
});

function animationFixture() {
  const world = new THREE.Scene();
  const train = new THREE.Group();
  world.add(train);
  const rider = new THREE.Group();
  rider.position.set(1, 0, 5);
  for (const name of ['leftLeg', 'rightLeg']) {
    const leg = new THREE.Group();
    leg.name = name;
    rider.add(leg);
  }
  world.add(rider);
  const phases: string[] = [];
  return Object.assign(Object.create(RideStation3D.prototype), {
    trackScope: new TrackScope(), activeTrack: 'inside',
    scene: world, trainGroup: train, activeTrain: { group: train, vehicleMeshes: [], lapBarGroups: [] }, isPaused: false,
    guestReactions: { reset() {}, forget() {} },
    dispatchSequence: null, resetAnimation: null, trainSpeedZ: 0, lapBarAngle: 0,
    gateIndicators: [{ gateBarrier: new THREE.Group() }],
    npcMeshes: new Map([['rider', rider]]), gatesState: [{ occupants: [{ id: 'rider', height: 1 }] }],
    walkingNPCs: [{ npc: { id: 'rider' } }],
    waitingTrainQueue: [], lapBarGroups: [], launchParticles: null,
    callbacks: { onDispatchProgress: (label: string) => phases.push(label) },
    phases,
  });
}

test('dispatch animates boarding and restraints, then launches at five seconds exactly once', (t) => {
  t.mock.method(soundEngine, 'playDispatchButton', () => {});
  const lockSound = t.mock.method(soundEngine, 'playLapBarsLock', () => {});
  const launchSound = t.mock.method(soundEngine, 'playCoasterLaunch', () => {});
  const scene = animationFixture();
  const rider = scene.npcMeshes.get('rider') as THREE.Group;
  const start = rider.position.clone();
  let finished = 0;
  scene.triggerDispatchAnimation(() => { finished++; });
  scene.triggerDispatchAnimation(() => { finished += 100; });
  assert.equal(scene.walkingNPCs.length, 0, 'boarding removes the old gate walk');
  scene.updateDispatchAnimation(1.5);
  assert.notDeepEqual(rider.position, start, 'rider moves smoothly toward the seat');
  assert.notEqual(rider.parent, scene.trainGroup, 'rider is still boarding');
  assert.notEqual(scene.gateIndicators[0].gateBarrier.rotation.y, 0);
  assert.equal(scene.trainSpeedZ, 0);
  scene.updateDispatchAnimation(1.5);
  assert.equal(rider.parent, scene.trainGroup, 'seated riders attach to the train');
  scene.updateDispatchAnimation(1.99);
  assert.equal(scene.trainSpeedZ, 0, 'train stays stationary at 4.99 seconds');
  assert.equal(Math.abs(scene.gateIndicators[0].gateBarrier.rotation.y), 0, 'gates close before departure');
  assert.ok(scene.lapBarAngle > 0);
  assert.equal(lockSound.mock.callCount(), 1);
  assert.equal(launchSound.mock.callCount(), 0);
  scene.updateDispatchAnimation(0.01);
  assert.ok(scene.trainSpeedZ > 0);
  assert.equal(launchSound.mock.callCount(), 1);
  assert.equal(finished, 0);
  scene.updateDispatchAnimation(1.81);
  scene.updateDispatchAnimation(5);
  assert.equal(finished, 1);
  assert.equal(launchSound.mock.callCount(), 1);
});

test('pausing freezes departure and restarting cancels pending animations', (t) => {
  t.mock.method(soundEngine, 'playDispatchButton', () => {});
  const launchSound = t.mock.method(soundEngine, 'playCoasterLaunch', () => {});
  const scene = animationFixture();
  let finished = false;
  scene.triggerDispatchAnimation(() => { finished = true; });
  scene.updateDispatchAnimation(1);
  scene.isPaused = true;
  scene.updateDispatchAnimation(20);
  assert.equal(scene.dispatchSequence.elapsed, 1);
  assert.equal(scene.trainSpeedZ, 0);
  scene.resetRide();
  scene.isPaused = false;
  scene.updateDispatchAnimation(20);
  assert.equal(scene.dispatchSequence, null);
  assert.equal(scene.resetAnimation, null);
  assert.equal(scene.npcMeshes.size, 0);
  assert.equal(scene.trainGroup.position.z, 0);
  assert.equal(launchSound.mock.callCount(), 0);
  assert.equal(finished, false);
});

test('dispatch immediately promotes staged riders and restart cancels train arrival', (t) => {
  t.mock.method(soundEngine, 'playTrainBrakes', () => {});
  const scene = animationFixture();
  scene.walkingNPCs = [];
  scene.lastMainQueue = [];
  scene.lastSingleQueue = [];
  scene.trainColorPalette = ['red', 'blue'];
  scene.trainColorCounter = 0;
  scene.createTrainInstance = (_color: string, z: number) => {
    const group = new THREE.Group();
    group.position.z = z;
    scene.scene.add(group);
    return { group, vehicleMeshes: [], lapBarGroups: [] };
  };
  scene.waitingTrainQueue = [scene.createTrainInstance('blue', -17)];
  const stagedMesh = new THREE.Group();
  scene.scene.add(stagedMesh);
  scene.npcMeshes.set('staged', stagedMesh);
  scene.gatesState[0].occupants.push({ id: 'second' }, { id: 'staged' });
  scene.npcMeshes.get('rider').userData.isRider = true;
  scene.activeTrain.group.attach(scene.npcMeshes.get('rider'));
  scene.updateGates = (gates: any[]) => { scene.gatesState = gates; };
  scene.releaseBoardingRow(scene.gatesState.map((gate: any) => ({ ...gate, occupants: gate.occupants.slice(2) })));
  let arrivals = 0;
  scene.triggerResetAnimation(() => { arrivals++; });
  assert.equal(scene.npcMeshes.has('rider'), false, 'departed rider is removed');
  assert.equal(scene.walkingNPCs.length, 1, 'staged rider starts moving forward');
  assert.equal(scene.walkingNPCs[0].npc.id, 'staged');
  scene.resetAnimation(0.65);
  assert.ok(scene.trainGroup.position.z > -17 && scene.trainGroup.position.z < 0);
  scene.resetAnimation(0.65);
  assert.equal(scene.trainGroup.position.z, 0);
  assert.equal(scene.resetAnimation, null);
  assert.equal(arrivals, 1);

  scene.triggerResetAnimation(() => { arrivals++; });
  scene.resetAnimation(0.2);
  scene.resetRide();
  assert.equal(scene.resetAnimation, null);
  assert.equal(scene.trainGroup.position.z, 0);
  assert.equal(arrivals, 1, 'restart does not finish the old arrival or award its rewards');
});

test('walkouts animate the whole group once and clean up only after reaching the exit', () => {
  const scene = animationFixture();
  scene.walkingNPCs = [];
  scene.npcMeshes.clear();
  const forgotten: string[] = [];
  scene.guestReactions.forget = (id: string) => forgotten.push(id);
  for (const id of ['a', 'b']) {
    const mesh = new THREE.Group();
    mesh.userData.npc = { id, groupId: 'angry', sourceQueue: 'main', isWalking: false };
    mesh.userData.groupId = 'angry';
    scene.scene.add(mesh);
    scene.npcMeshes.set(id, mesh);
  }
  scene.removeDepartedGroup('angry');
  scene.removeDepartedGroup('angry');
  assert.equal(scene.walkingNPCs.length, 2);
  assert.equal(scene.npcMeshes.size, 2, 'guests remain visible during the walkout');
  for (const walker of scene.walkingNPCs) {
    assert.equal(walker.npc.isWalking, true);
    assert.equal(walker.mesh.userData.isDeparting, true);
    assert.equal(walker.waypoints.at(-1).z, 16);
    walker.onComplete();
    assert.equal(walker.mesh.parent, null);
  }
  assert.equal(scene.npcMeshes.size, 0);
  assert.deepEqual(forgotten, ['a', 'b']);
});

test('both trains dispatch independently and returning one cannot remove the other riders', t => {
  t.mock.method(soundEngine, 'playDispatchButton', () => {});
  t.mock.method(soundEngine, 'playLapBarsLock', () => {});
  t.mock.method(soundEngine, 'playCoasterLaunch', () => {});
  const scene = animationFixture();
  const outside = new THREE.Group(); scene.scene.add(outside);
  const rider = new THREE.Group(); scene.scene.add(rider); scene.npcMeshes.set('outside-rider', rider);
  let insideDone = 0, outsideDone = 0;
  scene.withTrack('outside', () => {
    scene.trainGroup = outside; scene.activeTrain = { group: outside, vehicleMeshes: [], lapBarGroups: [] };
    scene.gatesState = [{ occupants: [{ id: 'outside-rider', height: 1 }] }];
    scene.triggerDispatchAnimation(() => { outsideDone++; });
  });
  scene.triggerDispatchAnimation(() => { insideDone++; });
  scene.updateDispatchAnimation(2.6);
  scene.withTrack('outside', () => scene.updateDispatchAnimation(2.6));
  assert.equal(rider.parent, outside);
  assert.ok(rider.position.x > 0, 'outside rider sits on the positive-X track');
  assert.ok(scene.npcMeshes.get('rider').position.x < 0);
  scene.updateDispatchAnimation(4.2);
  assert.equal(insideDone, 1); assert.equal(outsideDone, 0);
  scene.withTrack('outside', () => scene.updateDispatchAnimation(4.2));
  assert.equal(outsideDone, 1);
  scene.waitingTrainQueue = [{ group: new THREE.Group(), vehicleMeshes: [], lapBarGroups: [] }];
  scene.createTrainInstance = () => ({ group: new THREE.Group(), vehicleMeshes: [], lapBarGroups: [] });
  scene.trainColorPalette = ['#ffffff']; scene.trainColorCounter = 0;
  scene.triggerResetAnimation(() => {});
  assert.equal(scene.npcMeshes.has('outside-rider'), true);
  assert.equal(rider.parent, outside, 'inside reset leaves the outside train intact');
  scene.resetRide();
  for (const track of ['inside', 'outside']) scene.withTrack(track, () => {
    assert.equal(scene.dispatchSequence, null); assert.equal(scene.resetAnimation, null);
  });
});

test('large parties fit their own queue lanes and single riders have only one shared mesh', async () => {
  const { generateGroup } = await import('./npcGenerator');
  const scene = animationFixture();
  scene.npcMeshes.clear(); scene.guestReactions.register = () => {};
  const inside = generateGroup('main', 16), outside = generateGroup('main', 16), single = generateGroup('single', 1);
  scene.syncQueues([inside], [single]);
  scene.withTrack('outside', () => scene.syncQueues([outside], [single]));
  assert.equal(scene.npcMeshes.size, 33);
  for (const [group, center] of [[inside, -3.7], [outside, 3.7]] as const) {
    const positions = group.members.map(npc => scene.npcMeshes.get(npc.id).position);
    assert.ok(positions.every(p => Math.abs(p.x - center) <= 0.76));
    assert.equal(new Set(positions.map(p => p.z)).size, 4, 'sixteen guests stand in four rows');
  }
  const assignments = [{ npc: single.members[0], gateIndex: 0, seatSlot: 0 }];
  scene.withTrack('outside', () => scene.walkGroupToGates(single, assignments));
  const walker = scene.walkingNPCs.at(-1);
  assert.equal(walker.waypoints.at(-1).x, 7.8);
  walker.onComplete();
  assert.equal(walker.mesh.rotation.y, Math.PI / 2);
});
