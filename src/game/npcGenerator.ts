/**
 * NPC and Group Generator with weighted randomization.
 * Generates guest groups (sizes 1-16, with the station's standard party-size weights) and single riders.
 */

import { GroupData, NPCData, QueueType } from '../types';
import { NPC_PALETTES } from './constants';

const GUEST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery', 
  'Quinn', 'Skyler', 'Cameron', 'Dakota', 'Reese', 'Rowan', 'Jesse', 'Kai',
  'Charlie', 'Finley', 'Hayden', 'Peyton', 'Logan', 'Parker', 'Harper', 'Eden'
];

const HATS: NPCData['hatType'][] = ['none', 'cap', 'beanie', 'headphones', 'ears', 'none', 'none'];

let idCounter = 1000;

// Weighted distribution for main queue group sizes (1-16 riders).
// Supports custom randomness parameter (0.0 = standard distribution, 1.0 = equal uniform 1-16).
// Default is 1.0 for maximum variety.
export function getRandomGroupSize(randomness: number = 1): number {
  // Standard distribution: 1–8 have explicit odds; the 9–12 and 13–16
  // buckets are split evenly across each size in their respective range.
  const baseWeights = [5, 28, 18, 24, 11, 6, 3, 2, 0.625, 0.625, 0.625, 0.625, 0.125, 0.125, 0.125, 0.125];
  const uniformWeight = 100 / 16;
  const clampedR = Math.max(0, Math.min(1, randomness));

  const blendedWeights = baseWeights.map((w) => w * (1 - clampedR) + uniformWeight * clampedR);
  const totalWeight = blendedWeights.reduce((a, b) => a + b, 0);

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < blendedWeights.length; i++) {
    if (rand < blendedWeights[i]) {
      return i + 1;
    }
    rand -= blendedWeights[i];
  }
  return Math.floor(Math.random() * 16) + 1;
}

export function generateGroup(type: QueueType, forcedSize?: number, randomness: number = 1): GroupData {
  const groupId = `grp_${idCounter++}`;
  const size = type === 'single' ? 1 : Math.max(1, Math.min(16, forcedSize || getRandomGroupSize(randomness)));
  const color = type === 'single' ? '#06b6d4' : NPC_PALETTES[Math.floor(Math.random() * NPC_PALETTES.length)];

  const members: NPCData[] = [];
  for (let i = 0; i < size; i++) {
    const npcId = `npc_${idCounter++}`;
    const name = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
    const hat = HATS[Math.floor(Math.random() * HATS.length)];
    
    members.push({
      id: npcId,
      groupId,
      sourceQueue: type,
      sourceGroupSize: size,
      name,
      color,
      hatType: hat,
      bodyType: Math.floor(Math.random() * 3),
      height: 0.9 + Math.random() * 0.2, // variation in height
      assignedGate: null,
      assignedSeat: null,
      walkProgress: 0,
      isWalking: false,
    });
  }

  return {
    id: groupId,
    size,
    type,
    color,
    members,
    status: 'Waiting',
    waitingSince: Date.now(),
    patienceDecayModifier: 1.0,
  };
}

export function createInitialQueues(randomness: number = 1): { mainQueue: GroupData[]; singleQueue: GroupData[] } {
  const mainQueue: GroupData[] = [];
  const singleQueue: GroupData[] = [];

  // Populate initial main queue line with high variety and randomness
  for (let i = 0; i < 10; i++) {
    mainQueue.push(generateGroup('main', undefined, randomness));
  }

  // Populate initial single rider line (deep queue)
  for (let i = 0; i < 10; i++) {
    singleQueue.push(generateGroup('single', 1, randomness));
  }

  return { mainQueue, singleQueue };
}
