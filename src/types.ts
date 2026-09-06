/**
 * Types and interfaces for the Theme Park Ride Grouper Simulation
 */

export type GameState = 'TITLE' | 'LOAD_STATE' | 'READY_STATE' | 'DISPATCH_STATE' | 'RESET_STATE' | 'GAME_OVER' | 'PAUSED';

export type QueueType = 'main' | 'single';

export type GroupStatus = 'Waiting' | 'Targeted' | 'Assigned' | 'Boarding' | 'Boarded' | 'Dispatched';

export interface NPCData {
  id: string;
  groupId: string;
  name: string;
  color: string;
  hatType: 'none' | 'cap' | 'beanie' | 'headphones' | 'ears';
  bodyType: number;
  height: number;
  assignedGate: number | null; // 0-7
  assignedSeat: number | null; // 0-15
  walkProgress: number; // 0 to 1
  isWalking: boolean;
}

export interface GroupData {
  id: string;
  size: number; // 1-6 for main, 1 for single
  type: QueueType;
  color: string;
  members: NPCData[];
  status: GroupStatus;
  waitingSince: number;
  patienceDecayModifier: number;
}

export interface GateState {
  index: number; // 0-7 (corresponds to Gates 1-8)
  occupants: NPCData[]; // up to 4 (2 in front row for current train, 2 in queue behind)
  capacity: number; // max queue size is 4
  status: 'empty' | 'partial' | 'full';
  vehicleIndex: number; // 0-3
}

export interface VehicleState {
  index: number; // 0-3
  gateIndices: [number, number]; // e.g. [0, 1] for Vehicle 1
  seatOccupants: (NPCData | null)[]; // 4 seats per vehicle (2 per row/gate)
  lapBarsDown: boolean;
}

export interface SimulationStats {
  score: number;
  trainsDispatched: number;
  perfectTrains: number;
  guestsProcessed: number;
  totalSeatsFilled: number;
  totalSeatsAvailable: number;
  averageEfficiency: number;
  currentStreak: number;
  bestStreak: number;
  timeElapsed: number;
  shiftRating: 'ROOKIE' | 'OPERATOR' | 'SPECIALIST' | 'MASTER GROUPER' | 'LEGEND';
}

export interface DifficultyConfig {
  name: 'TRAINEE' | 'STANDARD' | 'RUSH_HOUR';
  initialPatience: number;
  passiveDrainRate: number; // per second
  drainAcceleration: number; // per dispatched train
  maxReward: number;
  emptySeatPenalty: number;
  singleRiderSpawnRate: number;
}

export interface InteractionTarget {
  type: 'main_queue' | 'single_queue' | 'gate' | 'dispatch_button' | 'console' | 'none';
  index?: number; // for gates 0-7
  label: string;
  description: string;
  isValid?: boolean;
}

export interface KeybindsConfig {
  moveForward: string;
  moveBackward: string;
  moveLeft: string;
  moveRight: string;
  sprint: string;
  jump: string;
  interact: string;
  deselect: string;
  confirmGroup: string;
  pause: string;
  callMainQueue: string;
  callSingleQueue: string;
  gate1: string;
  gate2: string;
  gate3: string;
  gate4: string;
  gate5: string;
  gate6: string;
  gate7: string;
  gate8: string;
}

export const DEFAULT_KEYBINDS: KeybindsConfig = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  interact: 'KeyE',
  deselect: 'KeyQ',
  confirmGroup: 'Enter',
  pause: 'KeyP',
  callMainQueue: 'KeyM',
  callSingleQueue: 'KeyN',
  gate1: 'Digit1',
  gate2: 'Digit2',
  gate3: 'Digit3',
  gate4: 'Digit4',
  gate5: 'Digit5',
  gate6: 'Digit6',
  gate7: 'Digit7',
  gate8: 'Digit8',
};

export interface GameSettings {
  mouseSensitivity: number;
  soundEnabled: boolean;
  sfxVolume: number;
  musicVolume: number;
  pointerLock: boolean;
  highQualityVisuals: boolean;
  showVisualGuides: boolean;
  autoSelectNext: boolean;
  zenMode: boolean;
  brightness: number; // default 1.45
  fov: number; // default 75
  shadowsEnabled: boolean;
  keybinds: KeybindsConfig;
  groupRandomness: number; // 0.0 to 1.0 (default 0.75 for high variety and randomness)
}
