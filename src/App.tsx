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
import { TRACKS, TrackScope, useTrackField } from './game/trackState';
import { ControllerInput } from './game/controller';
import { activeControllerMenu, navigateControllerMenu } from './utils/controllerMenu';
import { advancePatience, completedDoubleGates, dispatchRewards, groupsSplitAcrossTrains, SPLIT_TRAIN_PATIENCE_PENALTY, initialPatienceClock, PatienceNotice } from './game/patience';
import { advanceQueuePressure, balancedService, initialQueuePressure, initialServiceTargets, observeServiceTargets, QUEUE_NAMES, queueExtraDrain, queueServiceBonus } from './game/queueService';
import { analyzeGroupSplit } from './game/groupSplit';
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
  TrackType,
} from './types';

export default function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<RideStation3D | null>(null);
  const controllerRef = useRef(new ControllerInput());
  const [controllerFamily, setControllerFamily] = useState<'xbox' | 'playstation' | null>(null);

  const [scope] = useState(() => new TrackScope());
  const [activeTrack, setActiveTrack] = useState<TrackType>('inside');
  const [sessionOver, setSessionOver] = useState(false);
  const sessionOverRef = useRef(false);
  const runTrack = <T,>(track: TrackType, action: () => T): T =>
    scope.run(track, () => sceneRef.current ? sceneRef.current.withTrack(track, action) : action());

  // Core Simulation State
  const [gameState, setGameState, gameStateRef, gameStateByTrack] = useTrackField<GameState>(scope, () => ('LOAD_STATE'));
  const [difficulty, setDifficulty] = useState<DifficultyConfig>(DIFFICULTY_PRESETS.STANDARD);
  const [patience, setPatience] = useState<number>(100);
  const [patienceClock, setPatienceClock] = useState(initialPatienceClock);
  const patienceClockRef = useRef(patienceClock);
  const [patienceNotices, setPatienceNotices] = useState<PatienceNotice[]>([]);
  const [patienceLossFlash, setPatienceLossFlash] = useState(false);
  const patienceLossFlashTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noticeIdRef = useRef(0);
  const departureInProgressRef = useRef(false);
  const splitTrainGroupsRef = useRef(new Set<string>());
  const [queuePressure, setQueuePressure, queuePressureRef, queuePressureByTrack] = useTrackField<ReturnType<typeof initialQueuePressure>>(scope, () => (initialQueuePressure()));
  const [serviceTargets, setServiceTargets, serviceTargetsRef, serviceTargetsByTrack] = useTrackField<ReturnType<typeof initialServiceTargets>>(scope, () => (initialServiceTargets()));
  const [dispatchProgress, setDispatchProgress, dispatchProgressRef, dispatchProgressByTrack] = useTrackField<{ label: string; seconds: number } | null>(scope, () => (null));
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null);
  const selectedGroupRef = useRef<GroupData | null>(null);
  selectedGroupRef.current = selectedGroup;
  const selectedQueueSourceRef = useRef<TrackType | 'single'>('inside');
  const [pendingAllocations, setPendingAllocations, pendingAllocationsRef, pendingAllocationsByTrack] = useTrackField<{ [gateIndex: number]: number }>(scope, () => ({}));
  const [splitPenaltyKartIndices, setSplitPenaltyKartIndices] = useState<number[]>([]);
  const splitPenaltyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Queues State
  const [mainQueue, setMainQueue, mainQueueRef, mainQueueByTrack] = useTrackField<GroupData[]>(scope, () => ([]));
  const [singleQueue, setSingleQueue] = useState<GroupData[]>([]);

  // 8 Gates State
  const [gates, setGates, gatesRef, gatesByTrack] = useTrackField<GateState[]>(scope, () =>
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
    groupsDeparted: 0,
    guestsPerMinute: 0,
    avgDispatchIntervalSeconds: 0,
    insideTrainsDispatched: 0,
    outsideTrainsDispatched: 0,
    shiftRating: 'ROOKIE',
  });
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // Target interaction under crosshair
  const [target, setTarget] = useState<InteractionTarget>({
    type: 'none',
    label: '',
    description: '',
  });

  // Modals & Settings (Zen Mode is enabled by default, Default Brightness upped to 1.45)
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [controllerEngaged, setControllerEngaged] = useState(false);
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
    zenMode: false,
    brightness: 1.75,
    fov: 75,
    shadowsEnabled: true,
    groupRandomness: 0,
  });

  const lastConfirmTimeRef = useRef<number>(0);
  const lastCycleTimeRef = useRef<number>(0);
  const lastClickToggleTimeRef = useRef<number>(0);
  const lastPointerSideButtonTimeRef = useRef<number>(0);
  const [hoveredGateIndex, setHoveredGateIndex, hoveredGateIndexRef, hoveredGateIndexByTrack] = useTrackField<number | null>(scope, () => (null));
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
  const [queueNotification, setQueueNotification] = useState<{ message: string; submessage?: string; icon?: string } | null>(null);
  const queueNotificationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const announceQueueSwitch = (queue: 'main' | 'single') => {
    if (queueNotificationTimerRef.current) clearTimeout(queueNotificationTimerRef.current);
    setQueueNotification({
      icon: queue === 'main' ? '👥' : '🎫',
      message: queue === 'main' ? `${scope.current === 'inside' ? 'Inside' : 'Outside'} group queue selected` : 'Shared single-rider queue selected',
      submessage: 'Gate choices and hover preserved',
    });
    queueNotificationTimerRef.current = setTimeout(() => setQueueNotification(null), 1800);
  };

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

  const triggerSplitNotification = (
    title: string = 'GROUP SPLIT UNNECESSARILY',
    message: string = 'A group was split up unnecessarily.'
  ) => {
    soundEngine.playNotice();
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setGroupingError({ title, message, type: 'split' });
    errorTimerRef.current = setTimeout(() => {
      setGroupingError(null);
    }, 4000);
  };

  const dismissGroupingError = () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setGroupingError(null);
  };

  // Selected Gate Indices during active Grouping Stage
  const [selectedGateIndices, setSelectedGateIndices, selectedGateIndicesRef, selectedGateIndicesByTrack] = useTrackField<number[]>(scope, () => ([]));

  // Active Kart Set Selection (0 = Karts 1-2 / Gates 1-4; 1 = Karts 3-4 / Gates 5-8)
  const [activeKartBank, setActiveKartBank, activeKartBankRef, activeKartBankByTrack] = useTrackField<0 | 1>(scope, () => (0));

  const handleSwitchKartBank = (newBank: 0 | 1) => {
    if (activeKartBankRef.current === newBank) return;
    activeKartBankRef.current = newBank;
    setActiveKartBank(newBank);
    soundEngine.playSelectGroup(1);
    if (sceneRef.current) {
      sceneRef.current.setActiveKartBank(newBank);
    }
  };

  const selectTrack = (next: TrackType) => {
    if (isPausedRef.current || sessionOverRef.current) return;
    scope.current = next;
    setActiveTrack(next);
    sceneRef.current?.setActiveTrack(next);
    setPendingAllocations(selectedGroupRef.current ? getPendingAllocations(selectedGroupRef.current, selectedGateIndicesRef.current) : {});
    sceneRef.current?.setSelectedGroup(selectedGroupRef.current);
    sceneRef.current?.setPendingGateAllocations(pendingAllocationsRef.current, selectedGateIndicesRef.current);
    sceneRef.current?.setHoveredGate(hoveredGateIndexRef.current);
  };
  const handleSwitchTrack = () => selectTrack(scope.current === 'inside' ? 'outside' : 'inside');

  // Reference hooks for state to avoid stale closures

  const singleQueueRef = useRef(singleQueue);
  singleQueueRef.current = singleQueue;

  const patienceRef = useRef(patience);
  patienceRef.current = patience;


  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;




  const updatePatience = (value: number) => {
    patienceRef.current = value;
    setPatience(value);
    sceneRef.current?.setPatience(value);
  };

  const rewardPatience = (amount: number, label: string, gateIndex?: number) => {
    if (amount <= 0 || settingsRef.current.zenMode) return;
    updatePatience(Math.min(100, patienceRef.current + amount));
    const nextClock = { ...patienceClockRef.current, recoveryRemaining: null };
    patienceClockRef.current = nextClock;
    setPatienceClock(nextClock);
    const notice = { id: ++noticeIdRef.current, amount, label, gateIndex, remaining: 4 };
    setPatienceNotices(previous => [...previous.slice(-11), notice]);
  };

  const applyPatiencePenalty = (amount: number, label: string) => {
    if (amount <= 0 || settingsRef.current.zenMode) return;
    updatePatience(Math.max(0, patienceRef.current - amount));
    const nextClock = { ...patienceClockRef.current, recoveryRemaining: null };
    patienceClockRef.current = nextClock;
    setPatienceClock(nextClock);
    if (patienceLossFlashTimerRef.current) clearTimeout(patienceLossFlashTimerRef.current);
    setPatienceLossFlash(true);
    patienceLossFlashTimerRef.current = setTimeout(() => setPatienceLossFlash(false), 700);
    const notice = { id: ++noticeIdRef.current, amount: -amount, label, remaining: 4 };
    setPatienceNotices(previous => [...previous.slice(-11), notice]);
  };

  const singlePressureRef = useRef(initialQueuePressure().single);
  const resetPatienceClock = () => {
    const clock = initialPatienceClock();
    patienceClockRef.current = clock;
    setPatienceClock(clock);
    setPatienceNotices([]);
    singlePressureRef.current = initialQueuePressure().single;
    for (const track of TRACKS) runTrack(track, () => {
    const pressure = advanceQueuePressure(initialQueuePressure(), mainQueueRef.current, singleQueueRef.current, 0);
    queuePressureRef.current = pressure;
    setQueuePressure(pressure);
    sceneRef.current?.setQueuePressure(pressure);
    });
  };

  const refreshSharedSelection = () => {
    if (!selectedGroupRef.current) return;
    const source = selectedQueueSourceRef.current;
    const queue = source === 'single' ? singleQueueRef.current : mainQueueByTrack[source];
    if (selectedGroupRef.current === queue[0]) return;
    const next = queue[0] ?? null;
    runTrack(sceneRef.current?.activeTrack ?? scope.current, () => {
      selectedGroupRef.current = next;
      setSelectedGroup(next);
      setPendingAllocations(next ? getPendingAllocations(next, selectedGateIndicesRef.current) : {});
      sceneRef.current?.setSelectedGroup(next);
      sceneRef.current?.setPendingGateAllocations(pendingAllocationsRef.current, selectedGateIndicesRef.current);
    });
  };

  const syncQueueService = (seconds = 0, newTrain = false, singleSeconds = seconds) => {
    singlePressureRef.current = advanceQueuePressure({ main: initialQueuePressure().main, single: singlePressureRef.current }, [], singleQueueRef.current, singleSeconds).single;
    const pressure = { ...advanceQueuePressure(queuePressureRef.current, mainQueueRef.current, singleQueueRef.current, seconds), single: singlePressureRef.current };
    queuePressureRef.current = pressure;
    setQueuePressure(pressure);
    sceneRef.current?.setQueuePressure(pressure);
    const targets = observeServiceTargets(newTrain ? initialServiceTargets() : serviceTargetsRef.current,
      mainQueueRef.current, singleQueueRef.current, gatesRef.current);
    serviceTargetsRef.current = targets;
    setServiceTargets(targets);
    refreshSharedSelection();
  };

  const handleTogglePause = () => {
    if (sessionOverRef.current) return;
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
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
    const { mainQueue: initialMain, singleQueue: initialSingle } = createInitialQueues(settingsRef.current.groupRandomness ?? 0);
    setMainQueue(initialMain);
    setSingleQueue(initialSingle);
    mainQueueRef.current = initialMain;
    singleQueueRef.current = initialSingle;
    runTrack('outside', () => {
      setMainQueue(createInitialQueues(settingsRef.current.groupRandomness ?? 0).mainQueue);
      syncQueueService(0, true);
    });
    syncQueueService(0, true);

    // Initialize 3D Scene
    const scene = new RideStation3D(containerRef.current, {
      onTargetChange: (newTarget) => {
        setTarget(newTarget);
      },
      onSelectMainQueue: (track) => {
        handleSelectMainQueue(track);
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
      onSwitchTrack: () => handleSwitchTrack(),
      onSelectTrack: track => selectTrack(track),
      onTriggerDispatchTrack: (track) => runTrack(track, () => handleTriggerDispatch()),
      onCycleGate: (direction) => {
        handleCycleGate(direction);
      },
      onToggleGateSelection: (gateIndex) => {
        handleToggleGateSelection(gateIndex);
      },
      onGateHover: (gateIndex) => {
        handleHoverGate(gateIndex, false);
      },
      onDispatchProgress: (label, seconds, track) => runTrack(track, () => setDispatchProgress({ label, seconds })),
      onGuestReactionEvent: (event) => runTrack(event.track ?? scope.current, () => {
        if (event.type !== 'departure' || settingsRef.current.zenMode || isPausedRef.current
) return;
        const queue = event.queue === 'main' ? mainQueueRef.current : singleQueueRef.current;
        const group = queue[0];
        if (!group || group.id !== event.groupId || group.members[0]?.id !== event.leaderId
          || group.members.some(npc => npc.isWalking)) return;
        const remaining = queue.slice(1);
        while (remaining.length < 10) {
          remaining.push(generateGroup(event.queue, event.queue === 'single' ? 1 : undefined, settingsRef.current.groupRandomness ?? 0));
        }
        if (event.queue === 'main') {
          mainQueueRef.current = remaining;
          setMainQueue(remaining);
        } else {
          singleQueueRef.current = remaining;
          setSingleQueue(remaining);
        }
        sceneRef.current?.removeDepartedGroup(event.groupId);
        sceneRef.current?.syncQueues(mainQueueRef.current, singleQueueRef.current);
        syncQueueService();
        // One fixed penalty per group, regardless of its size.
        applyPatiencePenalty(4, `${QUEUE_NAMES[event.queue]} group left`);
        setStats(previous => ({ ...previous, groupsDeparted: (previous.groupsDeparted ?? 0) + 1 }));
      }),
    });

    sceneRef.current = scene;
    scene.setQueuePressure(queuePressureRef.current);
    scene.setActiveKartBank(activeKartBankRef.current);
    scene.setZenMode(settingsRef.current.zenMode);
    scene.setBrightness(settingsRef.current.brightness);
    scene.syncQueues(initialMain, initialSingle);
    scene.updateGates(gatesRef.current);
    runTrack('outside', () => {
      scene.syncQueues(mainQueueRef.current, singleQueueRef.current);
      scene.updateGates(gatesRef.current);
      scene.setQueuePressure(queuePressureRef.current);
    });

    // Begin with the front Main Queue group ready for gate assignment.
    const initialMainGroup = initialMain[0];
    setSelectedGroup(initialMainGroup);
    selectedGroupRef.current = initialMainGroup;
    setHoveredGateIndex(0);
    hoveredGateIndexRef.current = 0;
    scene.setSelectedGroup(initialMainGroup);
    scene.setHoveredGate(0);

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

  // Shift metrics are based on playable station time only.
  useEffect(() => {
    const timer = setInterval(() => {
      if (isPausedRef.current || sessionOverRef.current) return;
      setStats(previous => {
        const timeElapsed = previous.timeElapsed + 1;
        return {
          ...previous,
          timeElapsed,
          guestsPerMinute: timeElapsed ? Math.round((previous.guestsProcessed / (timeElapsed / 60)) * 10) / 10 : 0,
          avgDispatchIntervalSeconds: previous.trainsDispatched ? Math.round(timeElapsed / previous.trainsDispatched) : 0,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
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
        e.stopImmediatePropagation();
        handleTogglePause();
        return;
      }

      if (e.code === 'Escape') {
        e.stopImmediatePropagation();
        if (selectedGroupRef.current) {
          handleDeselect();
        } else {
          handleTogglePause();
        }
        return;
      }

      if (isPausedRef.current || gameStateRef.current === 'PAUSED' || sessionOverRef.current) {
        return;
      }

      // Synthetic BrowserForward / BrowserBack keys generated by mouse side buttons
      if (e.code === 'BrowserForward' || e.key === 'BrowserForward') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // If mouse button 4 was clicked recently, ignore synthetic keydown to prevent double-cycling
        if (Date.now() - lastPointerSideButtonTimeRef.current < 500) {
          return;
        }
        if (e.repeat) return;
        handleCycleGate(1);
        return;
      }

      if (e.code === 'BrowserBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // If mouse button 3 was clicked recently, ignore synthetic keydown to prevent double-cycling
        if (Date.now() - lastPointerSideButtonTimeRef.current < 500) {
          return;
        }
        if (e.repeat) return;
        handleCycleGate(-1);
        return;
      }

      // Tab key: Cycle forward (or Shift+Tab: cycle back)
      if (e.code === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        handleCycleGate(e.shiftKey ? -1 : 1);
        return;
      }

      // Forward key (RightBracket, ArrowRight): cycle to next gate (wrapping)
      if (
        e.code === 'BracketRight' ||
        e.key === ']' ||
        e.code === 'ArrowRight'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        handleCycleGate(1);
        return;
      }

      // Back key (LeftBracket, ArrowLeft): cycle to previous gate (wrapping)
      if (
        e.code === 'BracketLeft' ||
        e.key === '[' ||
        e.code === 'ArrowLeft'
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.repeat) return;
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

      if (e.code === 'KeyT') { e.preventDefault(); handleSwitchTrack(); return; }

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
        lastPointerSideButtonTimeRef.current = Date.now();
        handleCycleGate(1);
        return;
      }

      // Mouse Back (button 3): cycle to previous gate
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        lastPointerSideButtonTimeRef.current = Date.now();
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

      // Right-click confirmation is handled globally for pointer-locked play.
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
    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const seconds = Math.min(0.25, (now - lastTick) / 1000);
      lastTick = now;
      if (
        sessionOverRef.current ||
        gameStateRef.current === 'PAUSED' ||
        isPausedRef.current
      ) {
        return;
      }

      setPatienceNotices(previous => previous.length === 0 ? previous : previous
        .map(notice => ({ ...notice, remaining: notice.remaining - seconds }))
        .filter(notice => notice.remaining > 0));
      // During active loading or ready states, drain patience in standard mode
      const loadingTracks = TRACKS;
      if (loadingTracks.length > 0) {
        // Queue pressure is separate from the overall patience meter.
        const pressureSeconds = settingsRef.current.zenMode ? 0 : Math.max(0, seconds - patienceClockRef.current.graceRemaining);
        for (const track of TRACKS) runTrack(track, () => syncQueueService(loadingTracks.includes(track) ? pressureSeconds : 0, false, track === 'inside' ? pressureSeconds : 0));
        if (settingsRef.current.zenMode) return;
        const previousPatience = patienceRef.current;
        const next = advancePatience(previousPatience, patienceClockRef.current,
          difficultyRef.current.passiveDrainRate + Math.min(0.3, queueExtraDrain(queuePressureByTrack.inside) + queueExtraDrain({ main: queuePressureByTrack.outside.main, single: initialQueuePressure().single })), seconds);
        updatePatience(next.patience);
        patienceClockRef.current = next.clock;
        setPatienceClock(next.clock);

        // Warn on entering critical patience, rather than sounding every tick.
        if (previousPatience > 20 && next.patience <= 20) {
          soundEngine.playPatienceAlert();
        }

        if (next.gameOver) {
          sessionOverRef.current = true;
          setSessionOver(true);
          gameStateRef.current = 'GAME_OVER';
          setGameState('GAME_OVER');
          soundEngine.playGameOver();
          sceneRef.current?.setPaused(true);
          sceneRef.current?.exitPointerLock();
        }
      }
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // One shared single-rider stream and an independent group stream for each side.
  useEffect(() => {
    const timer = setInterval(() => {
      if (isPausedRef.current || sessionOverRef.current) return;
      const nextSingle = [...singleQueueRef.current, generateGroup('single')];
      singleQueueRef.current = nextSingle; setSingleQueue(nextSingle);
      for (const track of TRACKS) runTrack(track, () => {
        const nextMain = [...mainQueueRef.current, generateGroup('main', undefined, settingsRef.current.groupRandomness ?? 0)];
        setMainQueue(nextMain);
        sceneRef.current?.syncQueues(nextMain, nextSingle);
      });
    }, 3000);
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

  // Gate choices belong to the player, not the queue. Recalculate only the
  // per-gate rider counts when the active group changes.
  const getPendingAllocations = (group: GroupData, selectedGates: number[]) => {
    const pending: { [gateIndex: number]: number } = {};
    let remainingToPlace = group.size;
    for (const gateIndex of selectedGates) {
      if (remainingToPlace <= 0) {
        pending[gateIndex] = 0;
        continue;
      }
      const occupiedSeats = gatesRef.current[gateIndex]?.occupants.length || 0;
      const availableSeats = Math.max(0, 4 - occupiedSeats);
      const toBoard = Math.min(2, availableSeats, remainingToPlace);
      pending[gateIndex] = toBoard;
      remainingToPlace -= toBoard;
    }
    return pending;
  };

  // --- Toggle Gate Selection (Left Click) ---
  // Left click is reserved for selecting/deselecting the gate.
  const handleToggleGateSelection = (targetGateIndex?: number) => {
    if (isPausedRef.current || sessionOverRef.current) return;
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

    const newPending = getPendingAllocations(group, newSelected);

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
  const chooseQueue = (source: TrackType | 'single') => {
    if (isPausedRef.current || sessionOverRef.current) return;
    selectedQueueSourceRef.current = source;
    const queue = source === 'single' ? singleQueueRef.current : mainQueueByTrack[source];
    const group = queue[0] ?? null;
    selectedGroupRef.current = group;
    setSelectedGroup(group);
    setPendingAllocations(group ? getPendingAllocations(group, selectedGateIndicesRef.current) : {});
    sceneRef.current?.setSelectedGroup(group);
    sceneRef.current?.setPendingGateAllocations(pendingAllocationsRef.current, selectedGateIndicesRef.current);
    soundEngine.playSelectGroup(group?.size ?? 1);
  };
  const handleSelectMainQueue = (track: TrackType = scope.current) => chooseQueue(track);
  const handleSelectSingleQueue = () => chooseQueue('single');

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
  // Starts at Gate 1 (index 0), then goes to Gate 2, then Gate 3, etc.
  // Does NOT select until left click is pressed!
  const handleCycleGate = (direction: 1 | -1) => {
    soundEngine.init();
    if (!selectedGroupRef.current) {
      return;
    }
    const now = Date.now();
    // Cooldown prevents double-cycling from synthetic or rapid browser events (pointerdown + mousedown + BrowserForward)
    if (now - lastCycleTimeRef.current < 180) {
      return;
    }
    lastCycleTimeRef.current = now;

    // Move exactly 1 gate forward (+1) or 1 gate back (-1) with wrapping (0-7):
    // When no gate is hovered yet:
    // - Forward (+1) starts at Gate 1 (index 0)
    // - Backward (-1) starts at Gate 8 (index 7)
    let nextGateIndex: number;
    if (hoveredGateIndexRef.current === null) {
      nextGateIndex = direction === 1 ? 0 : 7;
    } else {
      nextGateIndex = (hoveredGateIndexRef.current + direction + 8) % 8;
    }

    // Intermediate pre-selection stage: hover only, do NOT select!
    handleHoverGate(nextGateIndex, true);
  };

  // --- Confirm Grouping Stage (Pressed Enter or clicked Confirm) ---
  const handleConfirmGrouping = () => {
    // Dispatch/reset animations no longer lock the next group out of confirmation.
    if (isPausedRef.current || sessionOverRef.current || gameStateRef.current === 'GAME_OVER') return;
    soundEngine.init();
    const group = selectedGroupRef.current;
    if (!group) return;

    const now = Date.now();
    if (now - lastConfirmTimeRef.current < 200) return;
    lastConfirmTimeRef.current = now;

    const curPending = pendingAllocationsRef.current;
    const selectedGatesList = selectedGateIndicesRef.current;

    // Total allocated riders across all gates
    const totalAllocated = (Object.values(curPending) as number[]).reduce(
      (acc, val) => acc + val,
      0
    );

    // A confirmation always boards the complete group. Gates that cannot
    // receive riders (or an over-selection) are invalid rather than partial.
    const allocatedGateCount = (Object.values(curPending) as number[]).filter(allocation => allocation > 0).length;
    if (selectedGatesList.length === 0 || totalAllocated !== group.size || selectedGatesList.length !== allocatedGateCount) {
      triggerGroupingError();
      return;
    }

    // Valid confirmation - dismiss any active error
    dismissGroupingError();
    const source = selectedQueueSourceRef.current;
    const liveQueue = source === 'single' ? singleQueueRef.current : mainQueueByTrack[source];
    if (liveQueue[0]?.id !== group.id) {
      chooseQueue(source);
      return;
    }
    const split = analyzeGroupSplit(group.size, gatesRef.current, curPending);

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

    // A strict confirmation above guarantees every member is assigned.
    const isPartialSplit = false;
    const isKartSplit = split.unnecessaryKarts > 0;
    // Seats 0–1 board the current train; seats 2–3 remain staged for the next.
    // A party spanning both rows has been split across two trains.
    const isTrainSplit = new Set(assignments.map(assignment => assignment.seatSlot < 2 ? 'current' : 'next')).size > 1;
    const isSplitUnnecessarily = isPartialSplit || isKartSplit || isTrainSplit;

    if (isSplitUnnecessarily) {
      const noticeMessage = isTrainSplit
        ? 'This party was placed across the current and next train.'
        : isPartialSplit
        ? `A group was split up unnecessarily: ${assignments.length} of ${group.size} guests seated (${remainingMembers.length} remain in queue).`
        : `A group was split up unnecessarily across ${split.actualKartCount} karts (could fit in ${split.minimumFeasibleKartCount}).`;
      triggerSplitNotification(isTrainSplit ? 'GROUP SPLIT ACROSS TRAINS' : 'GROUP SPLIT UNNECESSARILY', noticeMessage);
    }

    // 2. Update Gates state and trigger NPC walk animation
    setGates(updatedGates);
    gatesRef.current = updatedGates;
    // Assignment rewards and a split consequence resolve as one satisfaction update.
    const doubleGrouped = completedDoubleGates(currentGates, updatedGates);
    const assignmentReward = assignments.length
      + queueServiceBonus(source === 'single' ? singlePressureRef.current.waitSeconds : queuePressureByTrack[source].main.waitSeconds, assignments.length)
      + doubleGrouped.length * 2;
    const splitPenalty = Math.min(12, split.patiencePenalty + (isTrainSplit ? 6 : 0));

    if (!settingsRef.current.zenMode) {
      const nextSatisfaction = Math.max(0, Math.min(100, patienceRef.current + assignmentReward - splitPenalty));
      updatePatience(nextSatisfaction);
      const nextClock = { ...patienceClockRef.current, recoveryRemaining: null };
      patienceClockRef.current = nextClock;
      setPatienceClock(nextClock);
      const notices: PatienceNotice[] = [];
      if (assignmentReward > 0) notices.push({ id: ++noticeIdRef.current, amount: assignmentReward, label: 'Group assigned', remaining: 4 });
      doubleGrouped.forEach(gateIndex => notices.push({ id: ++noticeIdRef.current, amount: 2, label: 'Double grouped', gateIndex, remaining: 4 }));
      if (splitPenalty > 0) notices.push({ id: ++noticeIdRef.current, amount: -splitPenalty, label: isTrainSplit ? 'Group split across trains' : 'Group split unnecessarily', remaining: 4 });
      if (notices.length) setPatienceNotices(previous => [...previous.slice(-11), ...notices]);
      if (nextSatisfaction === 0) {
        sessionOverRef.current = true;
        setSessionOver(true);
        gameStateRef.current = 'GAME_OVER';
        setGameState('GAME_OVER');
        soundEngine.playGameOver();
        sceneRef.current?.setPaused(true);
        sceneRef.current?.exitPointerLock();
      }
    }
    if (splitPenalty > 0) {
      if (splitPenaltyTimerRef.current) clearTimeout(splitPenaltyTimerRef.current);
      setSplitPenaltyKartIndices(split.affectedKartIndices.length > 0 ? split.affectedKartIndices : sortedGateIndices.map(g => Math.floor(g / 2)));
      splitPenaltyTimerRef.current = setTimeout(() => setSplitPenaltyKartIndices([]), 1200);
      if (patienceLossFlashTimerRef.current) clearTimeout(patienceLossFlashTimerRef.current);
      setPatienceLossFlash(true);
      patienceLossFlashTimerRef.current = setTimeout(() => setPatienceLossFlash(false), 700);
      sceneRef.current?.showSplitDisappointment(group);
    }
    if (sceneRef.current) {
      sceneRef.current.walkGroupToGates(group, assignments);
      sceneRef.current.updateGates(updatedGates);
    }

    // Sound effects
    soundEngine.playGroupConfirm();
    const isNowFull = updatedGates.some((g) => g.occupants.length === 2);
    soundEngine.playAssignSuccess(isNowFull);

    // Consume the selected source queue, independently of the destination track.
    const remainingQueue = liveQueue.slice(1);
    while (remainingQueue.length < 10) remainingQueue.push(generateGroup(group.type, group.type === 'single' ? 1 : undefined, settingsRef.current.groupRandomness ?? 0));
    if (source === 'single') {
      singleQueueRef.current = remainingQueue; setSingleQueue(remainingQueue);
      sceneRef.current?.syncQueues(mainQueueRef.current, remainingQueue);
    } else runTrack(source, () => {
      setMainQueue(remainingQueue);
      sceneRef.current?.syncQueues(remainingQueue, singleQueueRef.current);
      syncQueueService();
    });
    const nextGroup = remainingQueue[0];
    syncQueueService();

    // 4. Start grouping the next group from the same queue at the same gate.
    const nextHoveredGateIndex = hoveredGateIndexRef.current ?? 0;
    setSelectedGroup(nextGroup);
    selectedGroupRef.current = nextGroup;
    setSelectedGateIndices([]);
    selectedGateIndicesRef.current = [];
    setPendingAllocations({});
    pendingAllocationsRef.current = {};
    setHoveredGateIndex(nextHoveredGateIndex);
    hoveredGateIndexRef.current = nextHoveredGateIndex;
    if (sceneRef.current) {
      sceneRef.current.setSelectedGroup(nextGroup);
      sceneRef.current.setPendingGateAllocations({});
      sceneRef.current.setHoveredGate(nextHoveredGateIndex);
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
    const dispatchTrack = scope.current;
    if (sceneRef.current?.isTrackInTransit(dispatchTrack)) return;
    if (isPausedRef.current || sessionOverRef.current || !['LOAD_STATE', 'READY_STATE'].includes(gameStateRef.current)) return;
    soundEngine.init();
    const currentGates = gatesRef.current;
    const rewards = dispatchRewards(currentGates, difficultyRef.current.maxReward);
    // Capture availability and boarding membership before departure changes gates.
    syncQueueService();
    const serviceReward = balancedService(currentGates, serviceTargetsRef.current);
    // Up to 2 front passengers per gate board the 16-seat train
    const totalDispatchedRiders = rewards.boarding;

    if (totalDispatchedRiders === 0) {
      return;
    }

    gameStateRef.current = 'DISPATCH_STATE';
    setGameState('DISPATCH_STATE');
    if (sceneRef.current) {
      sceneRef.current.setGameState('DISPATCH_STATE');
    }

    // Calculate Efficiency & Refill Patience
    const isPerfect = totalDispatchedRiders === 16;
    rewardPatience(rewards.patience, isPerfect ? 'Full train' : 'Train dispatched');
    rewardPatience(serviceReward.patience, 'Balanced service');
    const splitGroups = groupsSplitAcrossTrains(currentGates, splitTrainGroupsRef.current);
    for (const id of splitGroups) splitTrainGroupsRef.current.add(id);
    applyPatiencePenalty(splitGroups.length * SPLIT_TRAIN_PATIENCE_PENALTY, 'Group split across trains');
    const currentStats = statsRef.current;

    // Score calculations
    const baseScore = totalDispatchedRiders * 100;
    const streakBonus = isPerfect ? (currentStats.currentStreak + 1) * 350 : 0;
    const perfectBonus = isPerfect ? 1000 : 0;
    const addedScore = baseScore + streakBonus + perfectBonus + rewards.doubleGroupScore + serviceReward.score;

    const newStreak = isPerfect ? currentStats.currentStreak + 1 : 0;
    const bestStreak = Math.max(currentStats.bestStreak, newStreak);
    const newDispatched = currentStats.trainsDispatched + 1;
    const newGuests = currentStats.guestsProcessed + totalDispatchedRiders;
    const newSeatsFilled = currentStats.totalSeatsFilled + totalDispatchedRiders;
    const newSeatsAvailable = currentStats.totalSeatsAvailable + 16;
    const avgEfficiency = Math.round((newSeatsFilled / newSeatsAvailable) * 100);

    // Calculate Shift Operator Rating
    let rating: SimulationStats['shiftRating'] = 'ROOKIE';
    if (newDispatched >= 8 && avgEfficiency >= 95) rating = 'LEGEND';
    else if (newDispatched >= 5 && avgEfficiency >= 90) rating = 'MASTER GROUPER';
    else if (newDispatched >= 3 && avgEfficiency >= 80) rating = 'SPECIALIST';
    else if (newDispatched >= 1) rating = 'OPERATOR';

    const dispatchedStats: SimulationStats = {
      score: currentStats.score + addedScore,
      trainsDispatched: newDispatched,
      perfectTrains: currentStats.perfectTrains + (isPerfect ? 1 : 0),
      guestsProcessed: newGuests,
      totalSeatsFilled: newSeatsFilled,
      totalSeatsAvailable: newSeatsAvailable,
      averageEfficiency: avgEfficiency,
      currentStreak: newStreak,
      bestStreak: bestStreak,
      timeElapsed: currentStats.timeElapsed,
      groupsDeparted: currentStats.groupsDeparted ?? 0,
      guestsPerMinute: currentStats.timeElapsed > 0 ? Math.round((newGuests / (currentStats.timeElapsed / 60)) * 10) / 10 : 0,
      avgDispatchIntervalSeconds: newDispatched > 0 ? Math.round(currentStats.timeElapsed / newDispatched) : 0,
      insideTrainsDispatched: (currentStats.insideTrainsDispatched ?? 0) + (dispatchTrack === 'inside' ? 1 : 0),
      outsideTrainsDispatched: (currentStats.outsideTrainsDispatched ?? 0) + (dispatchTrack === 'outside' ? 1 : 0),
      shiftRating: rating,
    };
    statsRef.current = dispatchedStats;
    setStats(dispatchedStats);

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
      sceneRef.current.triggerDispatchAnimation(() => runTrack(dispatchTrack, () => {
        // Once train speeds away, advance next train (RESET_STATE)
        gameStateRef.current = 'RESET_STATE';
        setGameState('RESET_STATE');
        setDispatchProgress({ label: 'Next train arriving', seconds: 0 });
        if (sceneRef.current) {
          sceneRef.current.setGameState('RESET_STATE');
          sceneRef.current.triggerResetAnimation(() => runTrack(dispatchTrack, () => {
            setDispatchProgress(null);
            const hasOccupants = gatesRef.current.some((g) => g.occupants.length > 0);
            const nextState: GameState = hasOccupants ? 'READY_STATE' : 'LOAD_STATE';
            gameStateRef.current = nextState;
            setGameState(nextState);
            if (sceneRef.current) {
              sceneRef.current.setGameState(nextState);
            }
          }));
        }
      }));
      // The departing train owns the front row now. Promote the staged row
      // immediately so the next group can be selected without a five-second lockout.
      const updatedGates: GateState[] = gatesRef.current.map(gate => {
        const occupants = gate.occupants.slice(2);
        return { ...gate, occupants, capacity: 4, status: occupants.length === 0 ? 'empty' : occupants.length >= 2 ? 'full' : 'partial' };
      });
      setGates(updatedGates);
      gatesRef.current = updatedGates;
      syncQueueService(0, true);
      rewardPatience(rewards.stagedPatience, 'Staged riders advanced');
      sceneRef.current.releaseBoardingRow(updatedGates);

    }
  };

  // --- Restart New Shift ---
  const handleRestart = () => {
    splitTrainGroupsRef.current.clear();
    sceneRef.current?.resetRide();
    sessionOverRef.current = false;
    setSessionOver(false);
    for (const track of TRACKS) runTrack(track, () => {
      setMainQueue(createInitialQueues(settingsRef.current.groupRandomness ?? 0).mainQueue);
      setGates(Array.from({ length: GATE_COUNT }, (_, index) => ({ index, occupants: [], capacity: 4, status: 'empty', vehicleIndex: Math.floor(index / 2) })));
      setGameState('LOAD_STATE');
      setSelectedGateIndices([]); setPendingAllocations({}); setHoveredGateIndex(0); setDispatchProgress(null);
      sceneRef.current?.setGameState('LOAD_STATE');
      sceneRef.current?.updateGates(gatesRef.current);
      syncQueueService(0, true);
    });
    resetPatienceClock();
    setDispatchProgress(null);
    const { mainQueue: newMain, singleQueue: newSingle } = createInitialQueues(settingsRef.current.groupRandomness ?? 0);
    setMainQueue(newMain);
    setSingleQueue(newSingle);
    mainQueueRef.current = newMain;
    singleQueueRef.current = newSingle;

    const emptyGates: GateState[] = Array.from({ length: GATE_COUNT }, (_, i) => ({
      index: i,
      occupants: [],
      capacity: 4,
      status: 'empty',
      vehicleIndex: Math.floor(i / 2),
    }));
    setGates(emptyGates);
    gatesRef.current = emptyGates;
    syncQueueService(0, true);

    updatePatience(settingsRef.current.zenMode ? 100 : difficultyRef.current.initialPatience);
    selectedQueueSourceRef.current = scope.current;
    const initialGroup = newMain[0] ?? null;
    setSelectedGroup(initialGroup);
    selectedGroupRef.current = initialGroup;
    setSelectedGateIndices([]);
    selectedGateIndicesRef.current = [];
    setPendingAllocations({});
    pendingAllocationsRef.current = {};
    setHoveredGateIndex(0);
    hoveredGateIndexRef.current = 0;
    setGameState('LOAD_STATE');
    gameStateRef.current = 'LOAD_STATE';
    setIsPaused(false);
    isPausedRef.current = false;

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
      groupsDeparted: 0,
      guestsPerMinute: 0,
      avgDispatchIntervalSeconds: 0,
      insideTrainsDispatched: 0,
      outsideTrainsDispatched: 0,
      shiftRating: 'ROOKIE',
    });

    if (sceneRef.current) {
      sceneRef.current.syncQueues(newMain, newSingle);
      sceneRef.current.updateGates(emptyGates);
      sceneRef.current.setPatience(settings.zenMode ? 100 : difficulty.initialPatience);
      sceneRef.current.setGameState('LOAD_STATE');
      sceneRef.current.setSelectedGroup(initialGroup);
      sceneRef.current.setPendingGateAllocations({}, []);
      sceneRef.current.setHoveredGate(0);
      sceneRef.current.setPaused(false);
      for (const track of TRACKS) runTrack(track, () => {
        sceneRef.current?.syncQueues(mainQueueRef.current, singleQueueRef.current);
        syncQueueService(0, true);
      });
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
    if (newSettings.zenMode !== undefined && newSettings.zenMode !== settingsRef.current.zenMode) {
      resetPatienceClock();
      if (newSettings.zenMode) updatePatience(100);
    }
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      settingsRef.current = updated;
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
    difficultyRef.current = diff;
    resetPatienceClock();
    if (!settings.zenMode) {
      setPatience(diff.initialPatience);
      patienceRef.current = diff.initialPatience;
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
    isPausedRef.current = false;
    setIsPaused(false);
    if (sceneRef.current) {
      sceneRef.current.setPaused(false);
    }
  };

  // Controller polling is frame-based so analog sticks retain their magnitude.
  useEffect(() => {
    let frame = 0;
    let wasConnected = false;
    const poll = (now: number) => {
      const menu = activeControllerMenu();
      const mode = menu || isPausedRef.current || showTutorial || sessionOverRef.current ? 'menu' : 'gameplay';
      const sample = controllerRef.current.sample(navigator.getGamepads?.() ?? [], now, mode);
      if (sample.connected) {
        wasConnected = true;
        setControllerFamily(previous => previous === sample.family ? previous : sample.family);
        if (sample.active) setControllerEngaged(true);
      } else if (sample.disconnected && wasConnected) {
        wasConnected = false;
        setControllerEngaged(false);
        sceneRef.current?.setControllerInput(0, 0, 0, 0, false);
        if (!isPausedRef.current) handleTogglePause();
      }
      if (mode === 'menu' && menu) {
        sample.actions.forEach(action => navigateControllerMenu(menu, action));
      } else {
        sceneRef.current?.setControllerInput(sample.axes.moveX, sample.axes.moveY, sample.axes.lookX, sample.axes.lookY, sample.axes.sprint);
        sample.actions.forEach(action => {
          if (action === 'previousGate') handleCycleGate(-1);
          else if (action === 'nextGate') handleCycleGate(1);
          else if (action === 'selectGate') handleToggleGateSelection();
          else if (action === 'confirmGroup') handleConfirmGrouping();
          else if (action === 'mainQueue') handleSelectMainQueue();
          else if (action === 'singleQueue') handleSelectSingleQueue();
          else if (action === 'switchTrack') handleSwitchTrack();
          else if (action === 'cancel') handleDeselect();
          else if (action === 'interact') sceneRef.current?.handleInteraction();
          else if (action === 'jump') sceneRef.current?.controllerJump();
          else if (action === 'pause') handleTogglePause();
        });
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(frame); controllerRef.current.reset(); sceneRef.current?.setControllerInput(0, 0, 0, 0, false); };
  }, [showTutorial]);

  const groupSplitPreview = selectedGroup
    ? analyzeGroupSplit(selectedGroup.size, gates, pendingAllocations)
    : null;

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
        gameState={sessionOver ? 'GAME_OVER' : gameState}
        patience={patience}
        patienceClock={patienceClock}
        patienceNotices={patienceNotices}
        patienceLossFlash={patienceLossFlash}
        queuePressure={queuePressure}
        serviceTargets={serviceTargets}
        dispatchProgress={dispatchProgress}
        selectedGroup={selectedGroup}
        activeTrack={activeTrack}
        insideGameState={gameStateByTrack.inside}
        outsideGameState={gameStateByTrack.outside}
        insideSeatsCount={gatesByTrack.inside.reduce((sum, gate) => sum + Math.min(2, gate.occupants.length), 0)}
        outsideSeatsCount={gatesByTrack.outside.reduce((sum, gate) => sum + Math.min(2, gate.occupants.length), 0)}
        onTriggerDispatchTrack={track => runTrack(track, () => handleTriggerDispatch())}
        onSwitchTrack={handleSwitchTrack}
        selectedQueueType={selectedGroup?.type ?? null}
        notification={queueNotification}
        hoveredGateIndex={hoveredGateIndex}
        selectedGateIndices={selectedGateIndices}
        pendingAllocations={pendingAllocations}
        groupSplitPreview={groupSplitPreview}
        splitPenaltyKartIndices={splitPenaltyKartIndices}
        gates={gates}
        stats={stats}
        target={target}
        isPointerLocked={isPointerLocked}
        controllerEngaged={controllerEngaged}
        soundEnabled={settings.soundEnabled}
        isZenMode={settings.zenMode}
        keybinds={settings.keybinds}
        groupingError={groupingError}
        onDismissError={dismissGroupingError}
        onToggleSound={handleToggleSound}
        onRequestPointerLock={handleRequestPointerLock}
        onSelectMainQueue={() => handleSelectMainQueue()}
        onSelectQueue={chooseQueue}
        selectedQueueSource={selectedQueueSourceRef.current}
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
      {sessionOver && <GameOverModal stats={stats} onRestart={handleRestart} />}
    </main>
  );
}
