/**
 * Coordinates, visual dimensions, and game constants for Ride Grouper Simulation.
 */

import { DifficultyConfig } from '../types';

export const GATE_COUNT = 8;
export const VEHICLE_COUNT = 4;
export const SEATS_PER_GATE = 2;
export const TOTAL_SEATS = 16;

// Spatial Coordinates (3D Three.js Units)
// Station Layout:
// Platform center is around (0, 0, 0)
// Track runs along Z axis at X = -3.5
// Gates 1-8 are lined up along Z axis at X = -1.8, spaced Z from +5.25 down to -5.25
// Main Queue is at X = 3.5, Single Rider Queue is at X = 4.8
// Control Console is at (0, 0, 4.2)
export const GATE_Z_POSITIONS = [
  5.25,  // Gate 1 (Vehicle 1, Row 1)
  3.75,  // Gate 2 (Vehicle 1, Row 2)
  2.25,  // Gate 3 (Vehicle 2, Row 1)
  0.75,  // Gate 4 (Vehicle 2, Row 2)
  -0.75, // Gate 5 (Vehicle 3, Row 1)
  -2.25, // Gate 6 (Vehicle 3, Row 2)
  -3.75, // Gate 7 (Vehicle 4, Row 1)
  -5.25  // Gate 8 (Vehicle 4, Row 2)
];

export const VEHICLE_Z_CENTERS = [
  4.5,   // Vehicle 1 (Gates 1 & 2)
  1.5,   // Vehicle 2 (Gates 3 & 4)
  -1.5,  // Vehicle 3 (Gates 5 & 6)
  -4.5   // Vehicle 4 (Gates 7 & 8)
];

export const TRACK_X = -3.5;
export const GATE_LINE_X = -1.75;
export const PLATFORM_CENTER_X = 0;
export const MAIN_QUEUE_STOP_X = 2.8;
export const MAIN_QUEUE_STOP_Z = 2.0;
export const SINGLE_QUEUE_STOP_X = 2.8;
export const SINGLE_QUEUE_STOP_Z = -2.0;
export const CONSOLE_POS = { x: 0.8, y: 0, z: 5.5 };

export const NPC_PALETTES = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#e11d48', // Rose
];

export const DIFFICULTY_PRESETS: Record<string, DifficultyConfig> = {
  TRAINEE: {
    name: 'TRAINEE',
    initialPatience: 100,
    passiveDrainRate: 2.2, // ~45s per full bar
    drainAcceleration: 0.08,
    maxReward: 48,
    emptySeatPenalty: 1.5,
    singleRiderSpawnRate: 0.45,
  },
  STANDARD: {
    name: 'STANDARD',
    initialPatience: 100,
    passiveDrainRate: 3.5, // ~28s per full bar
    drainAcceleration: 0.15,
    maxReward: 42,
    emptySeatPenalty: 2.5,
    singleRiderSpawnRate: 0.35,
  },
  RUSH_HOUR: {
    name: 'RUSH_HOUR',
    initialPatience: 90,
    passiveDrainRate: 5.0, // ~18s per bar! Intense
    drainAcceleration: 0.25,
    maxReward: 38,
    emptySeatPenalty: 4.0,
    singleRiderSpawnRate: 0.25,
  },
};
