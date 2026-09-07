/**
 * Theme Park Ride Grouper Simulator - Main Application Component.
 * Integrates 3D station simulation, state machine, patience decay, queue managers,
 * sequential gate allocation, audio engine, and HUD overlays.
 */

import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { soundEngine } from './audio/soundEngine';
import { DIFFICULTY_PRESETS, GATE_COUNT } from './game/constants';
import { createInitialQueues, generateGroup } from './game/npcGenerator';
import { RideStation3D } from './game/threeScene';
import { GameOverModal } from './components/GameOverModal';
import { PauseMenuModal } from './components/PauseMenuModal';
import { StationHUD } from './components/StationHUD';
import { TutorialModal } from './components/TutorialModal';
import {
  DifficultyConfig,
  GameState,
  GateState,
  GameSettings,
  GroupData,
  InteractionTarget,
  NPCData,
  SimulationStats,
} from './types';

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RideStation3D | null>(null);

  // Core Simulation State
  const [gameState, setGameState] = useState<GameState>('LOAD_STATE');
  const [difficulty, setDifficulty] = useState<DifficultyConfig>(DIFFICULTY_PRESETS.STANDARD);
  const [patience, setPatience] = useState<number>(100);
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);
  const [pendingAllocations, setPendingAllocations] = useState<{ [gateIndex: number]: number }>({});
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Queues State
  const [mainQueue, setMainQueue] = useState<GroupData[]>([]);
  const [singleQueue, setSingleQueue] = useState<GroupData[]>([]);

  // 8 Gates State
  const [gates, setGates] = useState<GateState[]>(() =>
    Array.from({ length: GATE_COUNT }, (_, i) => ({
      index: i,
      occupants: [],
      capacity: 4,
      status: 'empty',
      vehicleIndex: Math.floor(i / 2),
    }))
  );

  // Session Statistics
  const [stats, setStats] = useState<SimulationStats>({
    score: 0,
    trainsDispatched: 0,
    perfectTrains: 0,
    guestsProcessed: 0,
    totalSeatsFilled: 0,
    totalSeatsAvailable: 0,
    averageEfficiency: 100,
    currentStreak: 0,
    bestStreak: 0,
    timeElapsed: 0,
    shiftRating: 'ROOKIE',
  });

  // Target interaction under crosshair
  const [target, setTarget] = useState<InteractionTarget>({
    type: 'none',
    label: '',
    description: '',
  });

  // Modals & Settings (Zen Mode is enabled by default, Default Brightness upped to 1.45)
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [settings, setSettings] = useState<GameSettings>({
    mouseSensitivity: 0.0022,
    soundEnabled: true,
    sfxVolume: 0.85,
    musicVolume: 0.6,
    pointerLock: false,
    highQualityVisuals: true,
    showVisualGuides: true,
    autoSelectNext: true,
    zenMode: true,
    brightness: 1.75,
    fov: 75,
    shadowsEnabled: true,
    groupRandomness: 0.85,
  });

  const lastConfirmTimeRef = useRef<number>(0);
  const lastCycleTimeRef = useRef<number>(0);
  const lastClickToggleTimeRef = useRef<number>(0);
  const [hoveredGateIndex, setHoveredGateIndex] = useState<number | null>(null);
  const hoveredGateIndexRef = useRef<number | null>(null);
  hoveredGateIndexRef.current = hoveredGateIndex;
  // Aliases for compatibility
  const focusedGateIndex = hoveredGateIndex;
  const setFocusedGateIndex = setHoveredGateIndex;
  const focusedGateIndexRef = hoveredGateIndexRef;

  // Grouping validation error notification state
  const [groupingError, setGroupingError] = useState<{
    title: string;
    message: string;
    type?: string;
  } | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerGroupingError = (
    title: string = 'INVALID SELECTION',
    message: string = 'Invalid gate selection. Please adjust your gates before confirming.',
    type: string = 'invalid'
  ) => {
    soundEngine.playError();
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setGroupingError({ title, message, type });
    errorTimerRef.current = setTimeout(() => {
      setGroupingError(null);
    }, 4500);
  };

  const dismissGroupingError = () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setGroupingError(null);
  };

  // Selected Gate Indices during active Grouping Stage
  const [selectedGateIndices, setSelectedGateIndices] = useState<number[]>([]);
  const selectedGateIndicesRef = useRef<number[]>([]);
  selectedGateIndicesRef.current = selectedGateIndices;

  // Active Kart Set Selection (0 = Karts 1-2 / Gates 1-4; 1 = Karts 3-4 / Gates 5-8)
  const [activeKartBank, setActiveKartBank] = useState<0 | 1>(0);
  const activeKartBankRef = useRef<0 | 1>(0);
  activeKartBankRef.current = activeKartBank;

  const handleSwitchKartBank = (newBank: 0 | 1) => {
    if (activeKartBankRef.current === newBank) return;
    activeKartBankRef.current = newBank;
    setActiveKartBank(newBank);
    soundEngine.playSelectGroup(1);
    if (sceneRef.current) {
      sceneRef.current.setActiveKartBank(newBank);
    }
  };

  // Reference hooks for state to avoid stale closures
  const mainQueueRef = useRef(mainQueue);
  mainQueueRef.current = mainQueue;

  const singleQueueRef = useRef(singleQueue);
  singleQueueRef.current = singleQueue;

  const patienceRef = useRef(patience);
  patienceRef.current = patience;

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const selectedGroupRef = useRef(selectedGroup);
  selectedGroupRef.current = selectedGroup;

  const pendingAllocationsRef = useRef(pendingAllocations);
  pendingAllocationsRef.current = pendingAllocations;

  const gatesRef = useRef(gates);
  gatesRef.current = gates;

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      if (sceneRef.current) {
        sceneRef.current.setPaused(next);
      }
      return next;
    });
  };

  // --- Initialize 3D Engine & Queues on Mount ---
  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Queues with default randomness
    const { mainQueue: initialMain, singleQueue: initialSingle } = createInitialQueues(0.85);
    setMainQueue(initialMain);
    setSingleQueue(initialSingle);
    mainQueueRef.current = initialMain;
    singleQueueRef.current = initialSingle;

    // Initialize 3D Scene
    const scene = new RideStation3D(containerRef.current, {
      onTargetChange: (newTarget) => {
        setTarget(newTarget);
      },
      onSelectMainQueue: () => {
        handleSelectMainQueue();
      },
      onSelectSingleQueue: () => {
        handleSelectSingleQueue();
      },
      onAssignToGate: (gateIndex) => {
        handleAssignToGate(gateIndex);
      },
      onConfirmGrouping: () => {
        handleConfirmGrouping();
      },
      onTriggerDispatch: () => {
        handleTriggerDispatch();
      },
      onDeselect: () => {
        handleDeselect();
      },
      onTogglePause: () => {
        handleTogglePause();
      },
      onSwitchKartBank: (bank) => {
        handleSwitchKartBank(bank);
      },
      onCycleGate: (direction) => {
        handleCycleGate(direction);
      },
      onToggleGateSelection: (gateIndex) => {
        handleToggleGateSelection(gateIndex);
      },
      onGateHover: (gateIndex) => {
        handleHoverGate(gateIndex, false);
      },
    });

    sceneRef.current = scene;
    scene.setActiveKartBank(activeKartBankRef.current);
    scene.setZenMode(settingsRef.current.zenMode);
    scene.setBrightness(settingsRef.current.brightness);
    scene.syncQueues(initialMain, initialSingle);
    scene.updateGates(gatesRef.current);

    // Check pointer lock state periodically
    const pointerInterval = setInterval(() => {
      if (sceneRef.current) {
        setIsPointerLocked(sceneRef.current.isPointerLocked);
      }
    }, 200);

    return () => {
      clearInterval(pointerInterval);
      scene.dispose();
    };
  }, []);

  // --- Global Keyboard and Mouse Action Listeners ---
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently interacting with an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Check Pause / Escape
      if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (e.code === 'Escape') {
        if (selectedGroupRef.current) {
          handleDeselect();
        } else {
          handleTogglePause();
        }
        return;
      }

      if (isPausedRef.current || gameStateRef.current === 'PAUSED' || gameStateRef.current === 'GAME_OVER') {
        return;
      }

      // Tab key: Cycle forward (or Shift+Tab: cycle back)
      if (e.code === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCycleGate(e.shiftKey ? -1 : 1);
        return;
      }

      // Forward key (BrowserForward, RightBracket, ArrowRight): cycle to next gate (wrapping)
      if (
        e.code === 'BrowserForward' ||
        e.key === 'BrowserForward' ||
        e.code === 'BracketRight' ||
        e.key === ']' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCycleGate(1);
        return;
      }

      // Back key (BrowserBack, LeftBracket, ArrowLeft): cycle to previous gate (wrapping)
      if (
        e.code === 'BrowserBack' ||
        e.key === 'BrowserBack' ||
        e.code === 'BracketLeft' ||
        e.key === '[' ||
        e.code === 'ArrowLeft'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCycleGate(-1);
        return;
      }

      // Direct check for numeric keys '1' through '8' (Gates 1 - 8)
      const keyInt = parseInt(e.key, 10);
      if (!isNaN(keyInt) && keyInt >= 1 && keyInt <= 8) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (selectedGroupRef.current) {
          handleHoverGate(keyInt - 1, true);
        }
        return;
      }

      // Check code names Digit1-Digit8 or Numpad1-Numpad8
      const digitMatch = e.code.match(/^(?:Digit|Numpad)([1-8])$/);
      if (digitMatch) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (selectedGroupRef.current) {
          const gateIdx = parseInt(digitMatch[1], 10) - 1;
          handleHoverGate(gateIdx, true);
        }
        return;
      }

      // Deselect with Q
      if (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleDeselect();
        return;
      }

      // Interact with E (Queues and Dispatch console)
      if (e.code === 'KeyE' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        sceneRef.current?.handleInteraction();
        return;
      }

      // Call Main Queue with M
      if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleSelectMainQueue();
        return;
      }

      // Call Single Rider Queue with N
      if (e.code === 'KeyN' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleSelectSingleQueue();
        return;
      }

      // Confirm Group with Enter or NumpadEnter
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleConfirmGrouping();
        return;
      }
    };

    const handleGlobalPointerDown = (e: PointerEvent) => {
      // Mouse Forward (button 4): cycle to next gate
      if (e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCycleGate(1);
        return;
      }

      // Mouse Back (button 3): cycle to previous gate
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        handleCycleGate(-1);
        return;
      }
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Mouse Forward/Back buttons (3 and 4) are handled exclusively in handleGlobalPointerDown
      // to avoid double-cycling when browsers fire both pointerdown and mousedown.
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return;
      }

      // Right click button 2: Confirm grouping stage
      if (e.button === 2) {
        e.preventDefault();
        handleConfirmGrouping();
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleConfirmGrouping();
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    window.addEventListener('pointerdown', handleGlobalPointerDown, true);
    window.addEventListener('pointerup', handleGlobalPointerUp, true);
    window.addEventListener('mousedown', handleGlobalMouseDown, true);
    window.addEventListener('mouseup', handleGlobalMouseUp, true);
    window.addEventListener('auxclick', handleAuxClick, true);
    window.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
      window.removeEventListener('pointerup', handleGlobalPointerUp, true);
      window.removeEventListener('mousedown', handleGlobalMouseDown, true);
      window.removeEventListener('mouseup', handleGlobalMouseUp, true);
      window.removeEventListener('auxclick', handleAuxClick, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, []);

  // --- Patience Drain Game Loop ---
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        gameStateRef.current === 'GAME_OVER' ||
        gameStateRef.current === 'PAUSED' ||
        isPausedRef.current ||
        settingsRef.current.zenMode
      ) {
        return;
      }

      // During active loading or ready states, drain patience in standard mode
      if (gameStateRef.current === 'LOAD_STATE' || gameStateRef.current === 'READY_STATE') {
        const drain = difficultyRef.current.passiveDrainRate * 0.1;
        const nextPatience = Math.max(0, patienceRef.current - drain);
        setPatience(nextPatience);

        if (sceneRef.current) {
          sceneRef.current.setPatience(nextPatience);
        }

        // Low patience warning alert
        if (nextPatience <= 20 && Math.floor(nextPatience) % 3 === 0) {
          soundEngine.playPatienceAlert();
        }

        // Game Over trigger (only if not in Zen mode)
        if (nextPatience <= 0) {
          setGameState('GAME_OVER');
          soundEngine.playGameOver();
          if (sceneRef.current) {
            sceneRef.current.setGameState('GAME_OVER');
            sceneRef.current.exitPointerLock();
          }
        }
      }
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // --- Hover Gate (Intermediate Pre-Selection Stage) ---
  // Default hover state; gate is NOT selected until left clicked!
  // Hovering is ONLY allowed when a queue is selected!
  const handleHoverGate = (gateIndex: number | null, playAudio: boolean = false) => {
    // Guard: Do not allow hovering until a queue is selected!
    if (!selectedGroupRef.current || gateIndex === null) {
      setHoveredGateIndex(null);
      hoveredGateIndexRef.current = null;
      if (sceneRef.current) {
        sceneRef.current.setHoveredGate(null);
      }
      return;
    }

    soundEngine.init();
    const normalized = (gateIndex + 8) % 8;
    setHoveredGateIndex(normalized);
    hoveredGateIndexRef.current = normalized;

    // Automatically sync active kart bank so the UI and 3D scene focus on the kart with the hovered gate
    const targetKartBank: 0 | 1 = normalized < 4 ? 0 : 1;
    if (activeKartBankRef.current !== targetKartBank) {
      activeKartBankRef.current = targetKartBank;
      setActiveKartBank(targetKartBank);
      if (sceneRef.current) {
        sceneRef.current.setActiveKartBank(targetKartBank);
      }
    }

    if (playAudio) {
      soundEngine.playGateHover(normalized + 1);
    }

    if (sceneRef.current) {
      sceneRef.current.setHoveredGate(normalized);
    }
  };

  // --- Toggle Gate Selection (Left Click) ---
  // Left click is EXCLUSIVELY reserved for selecting/deselecting the gate!
  const handleToggleGateSelection = (targetGateIndex?: number) => {
    soundEngine.init();
    const now = Date.now();
    if (now - lastClickToggleTimeRef.current < 150) {
      return;
    }
    lastClickToggleTimeRef.current = now;

    // Do NOT allow selecting gates unless a queue is selected!
    const group = selectedGroupRef.current;
    if (!group) {
      return;
    }

    const targetIdx = targetGateIndex !== undefined ? targetGateIndex : hoveredGateIndexRef.current;
    if (targetIdx === null || targetIdx === undefined) {
      return;
    }

    handleHoverGate(targetIdx, false);

    const curSelected = selectedGateIndicesRef.current;
    let newSelected: number[];

    if (curSelected.includes(targetIdx)) {
      // Toggle off / deselect THIS gate only
      newSelected = curSelected.filter((idx) => idx !== targetIdx);
      soundEngine.playGateDeselect();
    } else {
      // Add this gate to selected gates! It stays selected alongside other selected gates!
      newSelected = [...curSelected, targetIdx];
      soundEngine.playGateToggle(targetIdx + 1);
    }

    // Calculate allocation across all currently selected gates in order of selection
    // Pass 1: Fill boarding row capacity (seats 1-2) across all selected gates
    // Pass 2: If remaining members exist, allocate into queue staging rows behind (seats 3-4)
    const newPending: { [gateIndex: number]: number } = {};
    if (newSelected.length > 0) {
      const currentGates = gatesRef.current;
      let remainingToPlace = group.size;

      // Pass 1: Boarding seats (up to 2 per gate)
      for (const sIdx of newSelected) {
        if (remainingToPlace <= 0) {
          newPending[sIdx] = 0;
          continue;
        }
        const occ = currentGates[sIdx]?.occupants?.length || 0;
        const boardingCapacity = Math.max(0, 2 - occ);
        const toBoard = Math.min(boardingCapacity, remainingToPlace);
        newPending[sIdx] = toBoard;
        remainingToPlace -= toBoard;
      }

      // Pass 2: Queue staging seats (up to 4 total per gate)
      if (remainingToPlace > 0) {
        for (const sIdx of newSelected) {
          if (remainingToPlace <= 0) break;
          const occ = currentGates[sIdx]?.occupants?.length || 0;
          const currentAlloc = newPending[sIdx] || 0;
          const queueCapacity = Math.max(0, 4 - (occ + currentAlloc));
          const toQueue = Math.min(queueCapacity, remainingToPlace);
          newPending[sIdx] = currentAlloc + toQueue;
          remainingToPlace -= toQueue;
        }
      }
    }

    setSelectedGateIndices(newSelected);
    selectedGateIndicesRef.current = newSelected;
    setPendingAllocations(newPending);
    pendingAllocationsRef.current = newPending;
    if (sceneRef.current) {
      sceneRef.current.setPendingGateAllocations(newPending, newSelected);
    }
  };

  // --- Assign to Single Gate (Direct/Forced Selection or HUD click) ---
  const handleAssignToGate = (
    gateIndex: number,
    _forceSelect: boolean = false,
    _overrideGroup?: GroupData | null,
    _playAudio: boolean = true
  ) => {
    handleToggleGateSelection(gateIndex);
  };

  // --- Call Next Main Queue Group (Initiate Grouping Stage) ---
  const handleSelectMainQueue = () => {
    soundEngine.init();
    if (selectedGroupRef.current && selectedGroupRef.current.type === 'main') {
      return;
    }
    let curQueue = [...mainQueueRef.current];
    if (curQueue.length === 0) {
      // Auto replenish
      const newGrp = generateGroup('main');
      curQueue = [newGrp];
      setMainQueue(curQueue);
      mainQueueRef.current = curQueue;
    }
    const frontGroup = curQueue[0];
    setSelectedGroup(frontGroup);
    selectedGroupRef.current = frontGroup;
    soundEngine.playSelectGroup(frontGroup.size);
    // Clear any prior selection so the new group starts cleanly in hover pre-selection stage
    setSelectedGateIndices([]);
    selectedGateIndicesRef.current = [];
    setPendingAllocations({});
    pendingAllocationsRef.current = {};
    if (sceneRef.current) {
      sceneRef.current.setSelectedGroup(frontGroup);
      sceneRef.current.setPendingGateAllocations({}, []);
    }
    // Highlight the first gate (Gate 1, index 0) in the pre-selection stage!
    // It is NOT selected until left clicked.
    handleHoverGate(0, true);
  };

  // --- Call Solo Single Rider (Initiate Grouping Stage) ---
  const handleSelectSingleQueue = () => {
    soundEngine.init();
    if (selectedGroupRef.current && selectedGroupRef.current.type === 'single') {
      return;
    }
    let curQueue = [...singleQueueRef.current];
    if (curQueue.length === 0) {
      const newSolo = generateGroup('single');
      curQueue = [newSolo];
      setSingleQueue(curQueue);
      singleQueueRef.current = curQueue;
    }
    const frontSolo = curQueue[0];
    setSelectedGroup(frontSolo);
    selectedGroupRef.current = frontSolo;
    soundEngine.playSelectGroup(1);
    // Clear any prior selection so the new solo rider starts cleanly in hover pre-selection stage
    setSelectedGateIndices([]);
    selectedGateIndicesRef.current = [];
    setPendingAllocations({});
    pendingAllocationsRef.current = {};
    if (sceneRef.current) {
      sceneRef.current.setSelectedGroup(frontSolo);
      sceneRef.current.setPendingGateAllocations({}, []);
    }
    // Highlight the first gate (Gate 1, index 0) in the pre-selection stage!
    // It is NOT selected until left clicked.
    handleHoverGate(0, true);
  };

  // --- Deselect / Cancel Grouping Stage ---
  const handleDeselect = () => {
    if (selectedGroupRef.current || selectedGateIndicesRef.current.length > 0) {
      soundEngine.playDeselect();
      setSelectedGroup(null);
      selectedGroupRef.current = null;
      setSelectedGateIndices([]);
      selectedGateIndicesRef.current = [];
      setPendingAllocations({});
      pendingAllocationsRef.current = {};
      setHoveredGateIndex(null);
      hoveredGateIndexRef.current = null;
      if (sceneRef.current) {
        sceneRef.current.setSelectedGroup(null);
        sceneRef.current.setPendingGateAllocations({}, []);
        sceneRef.current.setHoveredGate(null);
      }
    }
  };

  // --- Cycle Through Gates (Mouse Forward / Back) ---
  // Cycles the hovered gate by 1 gate only (+1 or -1 with wrapping)
  // Does NOT select until left click is pressed!
  const handleCycleGate = (direction: 1 | -1) => {
    soundEngine.init();
    if (!selectedGroupRef.current) {
      return;
    }
    const now = Date.now();
    // Cooldown prevents double-cycling from synthetic or rapid browser events (pointerdown + mousedown + BrowserForward)
    if (now - lastCycleTimeRef.current < 150) {
      return;
    }
    lastCycleTimeRef.current = now;

    // Move exactly 1 gate forward (+1) or 1 gate back (-1) with wrapping (0-7)
    const currentHover = hoveredGateIndexRef.current ?? 0;
    const nextGateIndex = (currentHover + direction + 8) % 8;

    // Intermediate pre-selection stage: hover only, do NOT select!
    handleHoverGate(nextGateIndex, true);
  };

  // --- Confirm Grouping Stage (Pressed Enter or clicked Confirm) ---
  const handleConfirmGrouping = () => {
    soundEngine.init();
    const group = selectedGroupRef.current;
    if (!group) return;

    const now = Date.now();
    if (now - lastConfirmTimeRef.current < 200) return;
    lastConfirmTimeRef.current = now;

    const curPending = pendingAllocationsRef.current;
    const selectedGatesList = selectedGateIndicesRef.current;

    // Check if grouping confirmation is invalid (no gates, too few seats, or unused gate selected)
    const totalAllocated = (Object.values(curPending) as number[]).reduce(
      (acc, val) => acc + val,
      0
    );

    const isInvalid =
      selectedGatesList.length === 0 ||
      totalAllocated < group.size ||
      totalAllocated <= 0;

    if (isInvalid) {
      let message = 'Invalid gate selection. Please adjust your gate before confirming.';
      if (selectedGatesList.length === 0) {
        message = 'Please select a gate (Keys 1-4 or Mouse Fwd/Back) to assign this group.';
      } else if (totalAllocated === 0) {
        message = `Gate ${selectedGatesList[0] + 1} is full (4/4)! Switch gates with Keys 1-4 or Mouse Fwd/Back.`;
      } else if (totalAllocated < group.size) {
        message = `Gate ${selectedGatesList[0] + 1} only has ${totalAllocated} available seat${totalAllocated === 1 ? '' : 's'} for this group of ${group.size}. Switch to an empty gate!`;
      }
      triggerGroupingError(
        'INVALID SELECTION',
        message,
        'invalid'
      );
      // Explicitly preserve current selection upon failed confirm
      return;
    }

    // Valid confirmation - dismiss any active error
    dismissGroupingError();

    // 1. Build assignments list in ascending gate order
    const currentGates = gatesRef.current;
    const updatedGates = currentGates.map((g) => ({ ...g, occupants: [...g.occupants] }));
    const assignments: { gateIndex: number; seatSlot: number; npc: NPCData }[] = [];
    const remainingMembers = [...group.members];

    const sortedGateIndices = Object.keys(curPending)
      .map(Number)
      .sort((a, b) => a - b);

    for (const gIdx of sortedGateIndices) {
      const count = curPending[gIdx];
      if (count <= 0) continue;
      const targetGate = updatedGates[gIdx];
      for (let s = 0; s < count; s++) {
        if (remainingMembers.length === 0) break;
        const npc = remainingMembers.shift()!;
        const slot = targetGate.occupants.length;
        targetGate.occupants.push(npc);
        assignments.push({ gateIndex: gIdx, seatSlot: slot, npc });
      }
    }

    // 2. Update Gates state and trigger NPC walk animation
    setGates(updatedGates);
    gatesRef.current = updatedGates;
    if (sceneRef.current) {
      sceneRef.current.walkGroupToGates(group, assignments);
      sceneRef.current.updateGates(updatedGates);
    }

    // Sound effects
    soundEngine.playGroupConfirm();
    const isNowFull = updatedGates.some((g) => g.occupants.length === 2);
    soundEngine.playAssignSuccess(isNowFull);

    // 3. Pop group from queue and replenish continuous queue stream with configured randomness
    if (group.type === 'main') {
      const curMain = mainQueueRef.current;
      const newMainQueue = curMain.slice(1);
      while (newMainQueue.length < 12) {
        newMainQueue.push(generateGroup('main', undefined, settingsRef.current.groupRandomness ?? 0.75));
      }
      setMainQueue(newMainQueue);
      mainQueueRef.current = newMainQueue;
      if (sceneRef.current) {
        sceneRef.current.syncQueues(newMainQueue, singleQueueRef.current);
      }
    } else {
      const curSingle = singleQueueRef.current;
      const newSingleQueue = curSingle.slice(1);
      while (newSingleQueue.length < 12) {
        newSingleQueue.push(generateGroup('single'));
      }
      setSingleQueue(newSingleQueue);
      singleQueueRef.current = newSingleQueue;
      if (sceneRef.current) {
        sceneRef.current.syncQueues(mainQueueRef.current, newSingleQueue);
      }
    }

    // 4. End Grouping Stage: Clear selection and pending allocations
    setSelectedGroup(null);
    selectedGroupRef.current = null;
    setSelectedGateIndices([]);
    selectedGateIndicesRef.current = [];
    setPendingAllocations({});
    pendingAllocationsRef.current = {};
    setHoveredGateIndex(null);
    hoveredGateIndexRef.current = null;
    if (sceneRef.current) {
      sceneRef.current.setSelectedGroup(null);
      sceneRef.current.setPendingGateAllocations({});
      sceneRef.current.setHoveredGate(null);
    }

    // 5. Transition state to READY_STATE if at least 1 occupant is present
    const totalFilled = updatedGates.reduce((acc, g) => acc + g.occupants.length, 0);
    if (totalFilled > 0 && gameStateRef.current === 'LOAD_STATE') {
      setGameState('READY_STATE');
      gameStateRef.current = 'READY_STATE';
      if (sceneRef.current) {
        sceneRef.current.setGameState('READY_STATE');
      }
    }
  };

  // --- Trigger Train Dispatch ---
  const handleTriggerDispatch = () => {
    soundEngine.init();
    const currentGates = gatesRef.current;
    // Up to 2 front passengers per gate board the 16-seat train
    const totalDispatchedRiders = currentGates.reduce(
      (acc, g) => acc + Math.min(2, g.occupants.length),
      0
    );

    if (totalDispatchedRiders === 0 || gameStateRef.current === 'DISPATCH_STATE' || gameStateRef.current === 'RESET_STATE') {
      return;
    }

    setGameState('DISPATCH_STATE');
    if (sceneRef.current) {
      sceneRef.current.setGameState('DISPATCH_STATE');
    }

    // Calculate Efficiency & Refill Patience
    const efficiencyRatio = totalDispatchedRiders / 16;
    const isPerfect = totalDispatchedRiders === 16;
    const patienceReward = difficulty.maxReward * efficiencyRatio;
    const nextPatience = Math.min(100, patienceRef.current + patienceReward);
    if (!settings.zenMode) {
      setPatience(nextPatience);
    }

    // Score calculations
    const baseScore = totalDispatchedRiders * 100;
    const streakBonus = isPerfect ? (stats.currentStreak + 1) * 350 : 0;
    const perfectBonus = isPerfect ? 1000 : 0;
    const addedScore = baseScore + streakBonus + perfectBonus;

    const newStreak = isPerfect ? stats.currentStreak + 1 : 0;
    const bestStreak = Math.max(stats.bestStreak, newStreak);
    const newDispatched = stats.trainsDispatched + 1;
    const newGuests = stats.guestsProcessed + totalDispatchedRiders;
    const newSeatsFilled = stats.totalSeatsFilled + totalDispatchedRiders;
    const newSeatsAvailable = stats.totalSeatsAvailable + 16;
    const avgEfficiency = Math.round((newSeatsFilled / newSeatsAvailable) * 100);

    // Calculate Shift Operator Rating
    let rating: SimulationStats['shiftRating'] = 'ROOKIE';
    if (newDispatched >= 8 && avgEfficiency >= 95) rating = 'LEGEND';
    else if (newDispatched >= 5 && avgEfficiency >= 90) rating = 'MASTER GROUPER';
    else if (newDispatched >= 3 && avgEfficiency >= 80) rating = 'SPECIALIST';
    else if (newDispatched >= 1) rating = 'OPERATOR';

    setStats({
      score: stats.score + addedScore,
      trainsDispatched: newDispatched,
      perfectTrains: stats.perfectTrains + (isPerfect ? 1 : 0),
      guestsProcessed: newGuests,
      totalSeatsFilled: newSeatsFilled,
      totalSeatsAvailable: newSeatsAvailable,
      averageEfficiency: avgEfficiency,
      currentStreak: newStreak,
      bestStreak: bestStreak,
      timeElapsed: stats.timeElapsed,
      shiftRating: rating,
    });

    // Confetti celebration on full 16/16 train!
    if (isPerfect) {
      soundEngine.playPerfectTrainFanfare();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#38bdf8', '#34d399', '#fbbf24', '#f43f5e'],
        });
      } catch {
        // ignore confetti errors
      }
    }

    // Trigger 3D Launch Animation
    if (sceneRef.current) {
      if (!settings.zenMode) {
        sceneRef.current.setPatience(nextPatience);
      }
      sceneRef.current.triggerDispatchAnimation(() => {
        // Once train speeds away, advance next train (RESET_STATE)
        setGameState('RESET_STATE');
        if (sceneRef.current) {
          sceneRef.current.setGameState('RESET_STATE');
          sceneRef.current.triggerResetAnimation(() => {
            // Front 2 guests boarded; the queued guests automatically move up to the front
            const updatedGates: GateState[] = gatesRef.current.map((g) => {
              const remainingOccupants = g.occupants.slice(2);
              return {
                ...g,
                occupants: remainingOccupants,
                capacity: 4,
                status: remainingOccupants.length === 0 ? 'empty' : remainingOccupants.length >= 2 ? 'full' : 'partial',
              };
            });
            setGates(updatedGates);
            gatesRef.current = updatedGates;
            if (sceneRef.current) {
              sceneRef.current.updateGates(updatedGates);
            }
            const hasOccupants = updatedGates.some((g) => g.occupants.length > 0);
            const nextState: GameState = hasOccupants ? 'READY_STATE' : 'LOAD_STATE';
            setGameState(nextState);
            if (sceneRef.current) {
              sceneRef.current.setGameState(nextState);
            }
          });
        }
      });
    }
  };

  // --- Restart New Shift ---
  const handleRestart = () => {
    const { mainQueue: newMain, singleQueue: newSingle } = createInitialQueues(settingsRef.current.groupRandomness ?? 0.85);
    setMainQueue(newMain);
    setSingleQueue(newSingle);

    const emptyGates: GateState[] = Array.from({ length: GATE_COUNT }, (_, i) => ({
      index: i,
      occupants: [],
      capacity: 4,
      status: 'empty',
      vehicleIndex: Math.floor(i / 2),
    }));
    setGates(emptyGates);

    setPatience(settings.zenMode ? 100 : difficulty.initialPatience);
    setSelectedGroup(null);
    setGameState('LOAD_STATE');
    setIsPaused(false);

    setStats({
      score: 0,
      trainsDispatched: 0,
      perfectTrains: 0,
      guestsProcessed: 0,
      totalSeatsFilled: 0,
      totalSeatsAvailable: 0,
      averageEfficiency: 100,
      currentStreak: 0,
      bestStreak: 0,
      timeElapsed: 0,
      shiftRating: 'ROOKIE',
    });

    if (sceneRef.current) {
      sceneRef.current.syncQueues(newMain, newSingle);
      sceneRef.current.updateGates(emptyGates);
      sceneRef.current.setPatience(settings.zenMode ? 100 : difficulty.initialPatience);
      sceneRef.current.setGameState('LOAD_STATE');
      sceneRef.current.setSelectedGroup(null);
      sceneRef.current.setPaused(false);
    }
  };

  // --- Sound & Setting Handlers ---
  const handleToggleSound = () => {
    soundEngine.init();
    const next = !settings.soundEnabled;
    setSettings((prev) => ({ ...prev, soundEnabled: next }));
    soundEngine.setMuted(!next);
  };

  const handleUpdateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (newSettings.mouseSensitivity && sceneRef.current) {
        sceneRef.current.mouseSensitivity = newSettings.mouseSensitivity;
      }
      if (newSettings.brightness !== undefined && sceneRef.current) {
        sceneRef.current.setBrightness(updated.brightness);
      }
      if (
        (newSettings.shadowsEnabled !== undefined || newSettings.fov !== undefined) &&
        sceneRef.current
      ) {
        sceneRef.current.setGraphicsConfig({
          shadows: updated.shadowsEnabled,
          fov: updated.fov,
        });
      }
      if (newSettings.zenMode !== undefined) {
        if (sceneRef.current) {
          sceneRef.current.setZenMode(updated.zenMode);
          if (updated.zenMode) {
            sceneRef.current.setPatience(100);
          }
        }
        if (updated.zenMode) {
          setPatience(100);
        }
      }
      if (newSettings.sfxVolume !== undefined || newSettings.musicVolume !== undefined) {
        soundEngine.setVolume(updated.sfxVolume, updated.musicVolume);
      }
      return updated;
    });
  };

  const handleChangeDifficulty = (diffName: 'TRAINEE' | 'STANDARD' | 'RUSH_HOUR') => {
    const diff = DIFFICULTY_PRESETS[diffName];
    setDifficulty(diff);
    if (!settings.zenMode) {
      setPatience(diff.initialPatience);
      if (sceneRef.current) {
        sceneRef.current.setPatience(diff.initialPatience);
      }
    }
  };

  const handleRequestPointerLock = () => {
    soundEngine.init();
    if (sceneRef.current && !isPaused) {
      sceneRef.current.requestPointerLock();
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    if (sceneRef.current) {
      sceneRef.current.setPaused(false);
    }
  };

  return (
    <main className="relative w-screen h-screen bg-neutral-950 overflow-hidden font-sans select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-crosshair focus:outline-none"
        tabIndex={0}
      />

      {/* Main Operations HUD Overlay */}
      <StationHUD
        gameState={gameState}
        patience={patience}
        selectedGroup={selectedGroup}
        hoveredGateIndex={hoveredGateIndex}
        selectedGateIndices={selectedGateIndices}
        pendingAllocations={pendingAllocations}
        gates={gates}
        stats={stats}
        target={target}
        isPointerLocked={isPointerLocked}
        soundEnabled={settings.soundEnabled}
        isZenMode={settings.zenMode}
        keybinds={settings.keybinds}
        groupingError={groupingError}
        onDismissError={dismissGroupingError}
        onToggleSound={handleToggleSound}
        onRequestPointerLock={handleRequestPointerLock}
        onSelectMainQueue={handleSelectMainQueue}
        onSelectSingleQueue={handleSelectSingleQueue}
        onAssignToGate={handleAssignToGate}
        onConfirmGrouping={handleConfirmGrouping}
        onTriggerDispatch={handleTriggerDispatch}
        onDeselect={handleDeselect}
        onOpenSettings={() => handleTogglePause()}
        onOpenTutorial={() => setShowTutorial(true)}
        onTogglePause={handleTogglePause}
      />

      {/* Pause & Station Settings Menu Modal */}
      <PauseMenuModal
        isOpen={isPaused}
        settings={settings}
        difficulty={difficulty}
        stats={stats}
        onResume={handleResume}
        onRestart={() => {
          setIsPaused(false);
          handleRestart();
        }}
        onUpdateSettings={handleUpdateSettings}
        onChangeDifficulty={handleChangeDifficulty}
        onOpenTutorial={() => {
          setShowTutorial(true);
        }}
      />

      {/* Tutorial / Manual Modal */}
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* Game Over Shift Debrief */}
      {gameState === 'GAME_OVER' && <GameOverModal stats={stats} onRestart={handleRestart} />}
    </main>
  );
}
