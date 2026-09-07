/**
 * Coordinates, visual dimensions, and game constants for Ride Grouper Simulation.
 */

import { DifficultyConfig } from '../types';

export const GATE_COUNT = 8;
export const VEHICLE_COUNT = 4;
export const SEATS_PER_GATE = 2;
export const GATE_QUEUE_CAPACITY = 4;
export const TOTAL_SEATS = 16;

// Spatial Coordinates (3D Three.js Units)
// Symmetrical Station Layout:
// Platform center is around X = 0
// Inside Track runs along Z axis at X = -5.6 (Gates at X = -3.8, Queue at X = -1.6)
// Outside Track runs along Z axis at X = +5.6 (Gates at X = +3.8, Queue at X = +1.6)
// Control Console with dual dispatch buttons is centered at (0, 0, 5.5)
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

// Dual Track Coordinates
export const INSIDE_TRACK_X = -5.6;
export const OUTSIDE_TRACK_X = 5.6;
export const INSIDE_GATE_LINE_X = -3.8;
export const OUTSIDE_GATE_LINE_X = 3.8;

// Inside and Outside Queue Line Coordinates
export const INSIDE_MAIN_QUEUE_STOP_X = -1.6;
export const INSIDE_SINGLE_QUEUE_STOP_X = -1.6;
export const OUTSIDE_MAIN_QUEUE_STOP_X = 1.6;
export const OUTSIDE_SINGLE_QUEUE_STOP_X = 1.6;

// Backward Compatibility Aliases
export const TRACK_X = INSIDE_TRACK_X;
export const GATE_LINE_X = INSIDE_GATE_LINE_X;
export const PLATFORM_CENTER_X = 0;
export const MAIN_QUEUE_STOP_X = INSIDE_MAIN_QUEUE_STOP_X;
export const MAIN_QUEUE_STOP_Z = 2.0;
export const SINGLE_QUEUE_STOP_X = INSIDE_SINGLE_QUEUE_STOP_X;
export const SINGLE_QUEUE_STOP_Z = -2.0;

export const CONSOLE_POS = { x: 0, y: 0, z: 5.5 };

// Unified radiant highlight color for all queues
export const QUEUE_HIGHLIGHT_COLOR = '#fbbf24';

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
    passiveDrainRate: 0.6, // ~167s per full bar, after startup grace
    drainAcceleration: 0.08,
    maxReward: 48,
    emptySeatPenalty: 1.5,
    singleRiderSpawnRate: 0.45,
  },
  STANDARD: {
    name: 'STANDARD',
    initialPatience: 100,
    passiveDrainRate: 1.0, // 100s per full bar, after startup grace
    drainAcceleration: 0.15,
    maxReward: 42,
    emptySeatPenalty: 2.5,
    singleRiderSpawnRate: 0.35,
  },
  RUSH_HOUR: {
    name: 'RUSH_HOUR',
    initialPatience: 90,
    passiveDrainRate: 1.6, // ~56s from 90 patience, after startup grace
    drainAcceleration: 0.25,
    maxReward: 38,
    emptySeatPenalty: 4.0,
    singleRiderSpawnRate: 0.25,
  },
};
