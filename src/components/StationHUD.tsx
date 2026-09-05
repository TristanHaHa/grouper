/**
 * Modern theme park operations HUD overlay.
 * Displays crosshair, active context actions, dynamic patience meter,
 * 8-gate train occupancy visualizer, dispatch controls, and live statistics.
 */

import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  CheckCircle2,
  HelpCircle,
  Infinity as InfinityIcon,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  GameState,
  GateState,
  GroupData,
  InteractionTarget,
  KeybindsConfig,
  SimulationStats,
} from '../types';
import { formatKeyName } from '../utils/keybinds';

interface StationHUDProps {
  gameState: GameState;
  patience: number;
  selectedGroup: GroupData | null;
  selectedGateIndices?: number[];
  pendingAllocations?: { [gateIndex: number]: number };
  gates: GateState[];
  stats: SimulationStats;
  target: InteractionTarget;
  isPointerLocked: boolean;
  soundEnabled: boolean;
  isZenMode: boolean;
  keybinds?: KeybindsConfig;
  activeKartBank?: 0 | 1;
  onSwitchKartBank?: (bank: 0 | 1) => void;
  groupingError?: {
    title: string;
    message: string;
    type?: string;
  } | null;
  onDismissError?: () => void;
  onToggleSound: () => void;
  onRequestPointerLock: () => void;
  onSelectMainQueue: () => void;
  onSelectSingleQueue: () => void;
  onAssignToGate: (gateIndex: number) => void;
  onConfirmGrouping?: () => void;
  onTriggerDispatch: () => void;
  onDeselect: () => void;
  onOpenSettings: () => void;
  onOpenTutorial: () => void;
  onTogglePause: () => void;
}

export const StationHUD: React.FC<StationHUDProps> = ({
  gameState,
  patience,
  selectedGroup,
  selectedGateIndices = [],
  pendingAllocations = {},
  gates,
  stats,
  target,
  isPointerLocked,
  soundEnabled,
  isZenMode,
  keybinds,
  activeKartBank = 0,
  onSwitchKartBank,
  groupingError,
  onDismissError,
  onToggleSound,
  onRequestPointerLock,
  onSelectMainQueue,
  onSelectSingleQueue,
  onAssignToGate,
  onConfirmGrouping,
  onTriggerDispatch,
  onDeselect,
  onOpenSettings,
  onOpenTutorial,
  onTogglePause,
}) => {
  const totalOccupants = gates.reduce((acc, g) => acc + (g.occupants?.length || 0), 0);
  const isTrainFull = totalOccupants === 16;
  const isTrainReady = totalOccupants > 0 && gameState === 'READY_STATE';
  const efficiency = Math.round((totalOccupants / 16) * 100);

  // Grouping Stage Calculation
  const totalAllocated = (Object.values(pendingAllocations) as number[]).reduce(
    (acc, val) => acc + val,
    0
  );

  // Formatted Hotkeys for HUD Badges:
  // Keys 1-4 correspond to Gates 1-4 when Karts 1-2 are active (activeKartBank === 0)
  // Keys 1-4 correspond to Gates 5-8 when Karts 3-4 are active (activeKartBank === 1)
  const gateKeyLabels = Array.from({ length: 8 }, (_, idx) => {
    if (activeKartBank === 0) {
      if (idx < 4) return `${idx + 1}`;
      return 'Fwd';
    } else {
      if (idx < 4) return 'Back';
      return `${idx - 3}`;
    }
  });

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6 select-none font-sans overflow-hidden">
      {/* --- High-Priority Error Notification Popup --- */}
      {groupingError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-lg w-[92%] animate-in fade-in zoom-in-95 duration-150">
          <div className="bg-neutral-950/95 border-2 border-rose-500 rounded-2xl p-4 shadow-[0_0_35px_rgba(244,63,94,0.45)] flex items-start gap-3.5 backdrop-blur-md">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shrink-0 text-rose-400">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-black text-rose-400 uppercase tracking-wide">
                  {groupingError.title}
                </h4>
                {onDismissError && (
                  <button
                    onClick={onDismissError}
                    className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-neutral-200 mt-1 leading-relaxed font-sans">
                {groupingError.message}
              </p>
              <div className="mt-2 text-[10px] font-mono text-neutral-400 bg-neutral-900 px-2.5 py-1 rounded border border-neutral-800 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                <span>Select or deselect gates with keys <strong className="text-sky-300">1–8</strong> or click the gates.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TOP BAR: Operations Header & Live Metrics --- */}
      <header className="flex items-start justify-between gap-4 pointer-events-auto">
        {/* Ride Status Badge & Coaster Logo */}
        <div className="flex items-center gap-3 bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 rounded-xl px-4 py-2.5 shadow-xl">
          <div className="w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 font-black text-base">
            🏁
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-amber-400 tracking-wider font-extrabold">MARIO KART</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                  gameState === 'READY_STATE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : gameState === 'DISPATCH_STATE'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : gameState === 'RESET_STATE'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-red-500/20 text-red-300 border border-red-500/40'
                }`}
              >
                {gameState.replace('_STATE', '')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                POSITION: GROUPER
              </span>
              <span className="text-xs text-neutral-400 font-medium hidden sm:inline">Station Platform 01</span>
            </div>
          </div>
        </div>

        {/* Live Patience Bar / Zen Mode Gauge */}
        <div className="flex-1 max-w-xl mx-auto px-4 hidden md:block">
          <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 rounded-xl p-3 shadow-xl">
            <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
              <div className="flex items-center gap-1.5 text-neutral-300">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                <span>GUEST PATIENCE</span>
                {isZenMode ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <InfinityIcon className="w-3 h-3" /> ZEN MODE (UNLIMITED)
                  </span>
                ) : (
                  patience <= 25 &&
                  patience > 0 && (
                    <span className="text-rose-400 flex items-center gap-1 animate-bounce text-[10px]">
                      <AlertTriangle className="w-3 h-3" /> CRITICAL
                    </span>
                  )
                )}
              </div>
              <span
                className={`font-mono text-sm font-extrabold flex items-center gap-1 ${
                  isZenMode
                    ? 'text-emerald-400'
                    : patience > 50
                    ? 'text-emerald-400'
                    : patience > 25
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {isZenMode ? (
                  <>
                    <InfinityIcon className="w-4 h-4" />
                    <span className="text-xs opacity-75">(100%)</span>
                  </>
                ) : (
                  `${Math.round(patience)}%`
                )}
              </span>
            </div>

            {/* Patience Meter Bar */}
            <div className="relative w-full h-3.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  isZenMode
                    ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-400'
                    : patience > 50
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : patience > 25
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                    : 'bg-gradient-to-r from-rose-600 to-red-500 animate-pulse'
                }`}
                style={{ width: isZenMode ? '100%' : `${Math.max(0, Math.min(100, patience))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Shift Stats & Control Buttons */}
        <div className="flex items-center gap-2">
          {/* Streak Indicator */}
          {stats.currentStreak > 1 && (
            <div className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/50 text-amber-300 rounded-xl px-3 py-2 text-xs font-mono font-bold backdrop-blur-md shadow-lg animate-bounce">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>STREAK x{stats.currentStreak}</span>
            </div>
          )}

          {/* Trains Dispatched Counter */}
          <div className="bg-neutral-900/90 backdrop-blur-md border border-neutral-700/80 rounded-xl px-3.5 py-2 text-right shadow-xl">
            <div className="text-[10px] text-neutral-400 font-mono">DISPATCHED</div>
            <div className="text-base font-mono font-extrabold text-neutral-100">{stats.trainsDispatched}</div>
          </div>

          {/* Tutorial Button */}
          <button
            onClick={onOpenTutorial}
            title="How to Play"
            className="w-10 h-10 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
            className="w-10 h-10 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-sky-400" /> : <VolumeX className="w-5 h-5 text-neutral-500" />}
          </button>

          {/* Pause / Menu Button */}
          <button
            id="hud-pause-btn"
            onClick={onTogglePause}
            title="Pause & Station Settings [P / ESC]"
            className="h-10 px-3 rounded-xl bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-700/80 text-sky-400 hover:text-sky-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg font-mono text-xs font-bold"
          >
            <Pause className="w-4 h-4 fill-sky-400/20" />
            <span className="hidden sm:inline">PAUSE</span>
          </button>
        </div>
      </header>

      {/* --- CENTER: Dynamic First-Person Crosshair & Raycast Prompts --- */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Dynamic Crosshair */}
        <div className="relative flex items-center justify-center">
          <div
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
              target.type !== 'none' && target.isValid
                ? 'w-7 h-7 border-sky-400 bg-sky-500/20 scale-110 shadow-[0_0_12px_rgba(56,189,248,0.6)]'
                : target.type !== 'none' && !target.isValid
                ? 'w-7 h-7 border-rose-400 bg-rose-500/20 scale-110'
                : 'border-neutral-400/80 bg-neutral-100/10'
            }`}
          />
          <div className="absolute w-1 h-1 bg-white rounded-full" />
        </div>

        {/* Floating Context Prompt below crosshair */}
        {target.type !== 'none' && (
          <div className="mt-5 bg-neutral-950/90 backdrop-blur-md border border-neutral-700 rounded-xl px-4 py-2 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-w-sm">
            <div className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">{target.label}</div>
            <div className="text-xs text-neutral-200 font-medium mt-0.5">{target.description}</div>
          </div>
        )}

        {/* Pointer Lock Hint when not locked */}
        {!isPointerLocked && (
          <button
            onClick={onRequestPointerLock}
            className="mt-6 pointer-events-auto bg-neutral-900/90 hover:bg-neutral-800 border border-sky-500/50 hover:border-sky-400 text-sky-300 hover:text-white px-4 py-2 rounded-xl text-xs font-mono font-bold backdrop-blur-md shadow-2xl transition-all cursor-pointer flex items-center gap-2 group"
          >
            <Play className="w-3.5 h-3.5 fill-current text-sky-400 group-hover:translate-x-0.5 transition-transform" />
            <span>CLICK TO ENGAGE 3D FIRST-PERSON LOOK</span>
          </button>
        )}
      </div>

      {/* --- BOTTOM SECTION: Active Selection, Train Layout Matrix, and Quick Dispatch --- */}
      <footer className="flex flex-col gap-3 pointer-events-auto max-w-5xl mx-auto w-full">
        {/* Active Grouping Stage Callout Card */}
        {selectedGroup && (
          <div className="bg-neutral-900/95 backdrop-blur-md border-2 border-sky-500/80 rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center gap-3.5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center font-mono font-black text-2xl text-white shadow-xl border border-white/20 relative"
                style={{ backgroundColor: selectedGroup.color }}
              >
                {selectedGroup.size}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-extrabold text-sky-400 uppercase tracking-wider bg-sky-950/80 px-2 py-0.5 rounded border border-sky-500/40">
                    GROUPING STAGE
                  </span>
                  <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded font-mono">
                    {selectedGroup.type === 'single' ? 'Single Rider' : 'Main Queue Group'}
                  </span>
                </div>
                <div className="text-sm font-bold text-white mt-1">
                  Assigning {selectedGroup.size} Guest{selectedGroup.size > 1 ? 's' : ''} ({selectedGroup.members.map((m) => m.name).join(', ')})
                </div>
                <div className="text-xs text-neutral-300 flex flex-wrap items-center gap-2 mt-0.5">
                  <span>Press <strong className="text-sky-300 font-mono">1–4</strong> to Select Gates in Active Karts • <strong className="text-amber-300 font-mono">Mouse Forward / Back</strong> to Switch Karts • <strong className="text-emerald-300 font-mono">Right Click</strong> to Let Group Go.</span>
                  {selectedGateIndices.length > 0 && (
                    <span className="text-sky-300 font-mono font-bold">
                      Selected Gates: {selectedGateIndices.slice().sort((a, b) => a - b).map((g) => `Gate ${g + 1}`).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeselect();
                }}
                className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3.5 py-2.5 rounded-xl text-xs font-mono font-bold border border-neutral-700 transition-all cursor-pointer"
              >
                Cancel [Esc / Q]
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmGrouping?.();
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/80 shadow-lg px-5 py-2.5 rounded-xl text-xs font-mono font-extrabold flex items-center gap-2 transition-all cursor-pointer hover:shadow-[0_0_16px_rgba(16,185,129,0.4)]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>CONFIRM GROUP [RIGHT CLICK]</span>
              </button>
            </div>
          </div>
        )}

        {/* 8-Gate Train Visualizer Bar */}
        <div className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 rounded-2xl p-3.5 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-neutral-300">MARIO KART TRAIN OCCUPANCY</span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {totalOccupants} / 16 SEATS ({efficiency}%)
              </span>
            </div>

            {/* Quick Queue Calling Shortcuts */}
            <div className="flex items-center gap-2">
              <button
                onClick={onSelectMainQueue}
                className="bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 text-red-300 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Users className="w-3 h-3" />
                <span>Call Main Queue</span>
                <span className="text-[9px] bg-red-950/80 px-1 py-0.2 rounded border border-red-400/40 text-red-200">
                  [{formatKeyName(keybinds?.callMainQueue || 'KeyM')}]
                </span>
              </button>
              <button
                onClick={onSelectSingleQueue}
                className="bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/50 text-cyan-300 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Users className="w-3 h-3" />
                <span>Call Single Rider</span>
                <span className="text-[9px] bg-cyan-950/80 px-1 py-0.2 rounded border border-cyan-400/40 text-cyan-200">
                  [{formatKeyName(keybinds?.callSingleQueue || 'KeyN')}]
                </span>
              </button>
            </div>
          </div>

          {/* Kart Selection Switcher (Keys 1-4 select Gates 1-4 or 5-8 depending on selected Karts) */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-neutral-950/80 border border-neutral-800 rounded-xl px-3 py-2 mb-2.5 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-neutral-400">ACTIVE KARTS:</span>
              <div className="inline-flex bg-neutral-900 p-0.5 rounded-lg border border-neutral-700/70">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchKartBank?.(0);
                  }}
                  className={`px-3 py-1 rounded-md text-[11px] font-mono font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeKartBank === 0
                      ? 'bg-amber-400 text-neutral-950 shadow-[0_0_12px_rgba(251,191,36,0.35)] ring-1 ring-amber-300'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80'
                  }`}
                  title="Select Karts 1-2 (Gates 1-4). Switch using Mouse Back button or click."
                >
                  <span className="text-[9px] bg-neutral-950/40 px-1 py-0.5 rounded font-mono">◀ Mouse Back</span>
                  <span>KARTS 1–2 (Gates 1–4)</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSwitchKartBank?.(1);
                  }}
                  className={`px-3 py-1 rounded-md text-[11px] font-mono font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeKartBank === 1
                      ? 'bg-amber-400 text-neutral-950 shadow-[0_0_12px_rgba(251,191,36,0.35)] ring-1 ring-amber-300'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80'
                  }`}
                  title="Select Karts 3-4 (Gates 5-8). Switch using Mouse Forward button or click."
                >
                  <span>KARTS 3–4 (Gates 5–8)</span>
                  <span className="text-[9px] bg-neutral-950/40 px-1 py-0.5 rounded font-mono">Mouse Forward ▶</span>
                </button>
              </div>
            </div>
            <div className="text-[11px] font-mono text-sky-400/90 flex items-center gap-1.5">
              <span>Keys</span>
              <span className="font-extrabold text-sky-300 bg-sky-950/80 border border-sky-400/40 px-1.5 py-0.5 rounded">[1] [2] [3] [4]</span>
              <span>map to active Karts</span>
            </div>
          </div>

          {/* 4 Vehicles containing 8 Gates Matrix */}
          <div className="grid grid-cols-4 gap-2.5">
            {[0, 1, 2, 3].map((vIdx) => {
              const gateIdxA = vIdx * 2;
              const gateIdxB = vIdx * 2 + 1;
              const gateA = gates[gateIdxA];
              const gateB = gates[gateIdxB];
              const occA = gateA?.occupants?.length || 0;
              const occB = gateB?.occupants?.length || 0;
              const isSelectedA = selectedGateIndices.includes(gateIdxA);
              const isSelectedB = selectedGateIndices.includes(gateIdxB);
              const isKartActive = (activeKartBank === 0 && (vIdx === 0 || vIdx === 1)) || (activeKartBank === 1 && (vIdx === 2 || vIdx === 3));

              return (
                <div
                  key={vIdx}
                  onClick={() => {
                    if (!isKartActive) {
                      onSwitchKartBank?.(vIdx < 2 ? 0 : 1);
                    }
                  }}
                  className={`rounded-xl p-2 flex flex-col gap-1.5 transition-all ${
                    isKartActive
                      ? 'bg-neutral-950/95 border-2 border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.15)] ring-1 ring-amber-400/30'
                      : 'bg-neutral-950/50 border border-neutral-800/80 opacity-70 hover:opacity-100 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono text-amber-300 font-extrabold tracking-wider">
                      🏎️ KART 0{vIdx + 1}
                    </div>
                    {isKartActive ? (
                      <span className="text-[8px] font-mono font-black px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                        ACTIVE
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSwitchKartBank?.(vIdx < 2 ? 0 : 1);
                        }}
                        className="text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-700 cursor-pointer"
                        title={vIdx < 2 ? 'Switch to Karts 1-2 (Mouse Back)' : 'Switch to Karts 3-4 (Mouse Forward)'}
                      >
                        {vIdx < 2 ? '◀ Back' : 'Fwd ▶'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Gate A */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToGate(gateIdxA);
                      }}
                      title={`Gate ${gateIdxA + 1} (Key: ${gateKeyLabels[gateIdxA]})`}
                      className={`relative p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelectedA
                          ? 'bg-sky-950/80 border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)] ring-1 ring-sky-400'
                          : occA === 2
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : occA === 1
                          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {isSelectedA && (
                        <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-neutral-950 font-mono font-black text-[9px] px-1.5 py-0.2 rounded-full shadow">
                          SEL
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono font-bold">G{gateIdxA + 1}</span>
                        <span className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded border ${
                          isKartActive
                            ? 'bg-neutral-800 text-sky-300 border-neutral-700 ring-1 ring-sky-400/40'
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}>
                          {gateKeyLabels[gateIdxA]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            occA >= 1 ? 'bg-emerald-400' : 'bg-neutral-700'
                          }`}
                        />
                        <div
                          className={`w-2 h-2 rounded-full ${
                            occA === 2 ? 'bg-emerald-400' : 'bg-neutral-700'
                          }`}
                        />
                      </div>
                    </button>

                    {/* Gate B */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToGate(gateIdxB);
                      }}
                      title={`Gate ${gateIdxB + 1} (Key: ${gateKeyLabels[gateIdxB]})`}
                      className={`relative p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelectedB
                          ? 'bg-sky-950/80 border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)] ring-1 ring-sky-400'
                          : occB === 2
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : occB === 1
                          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {isSelectedB && (
                        <span className="absolute -top-1.5 -right-1.5 bg-sky-500 text-neutral-950 font-mono font-black text-[9px] px-1.5 py-0.2 rounded-full shadow">
                          SEL
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-mono font-bold">G{gateIdxB + 1}</span>
                        <span className={`text-[9px] font-mono font-bold px-1 py-0.2 rounded border ${
                          isKartActive
                            ? 'bg-neutral-800 text-sky-300 border-neutral-700 ring-1 ring-sky-400/40'
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}>
                          {gateKeyLabels[gateIdxB]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            occB >= 1 ? 'bg-emerald-400' : 'bg-neutral-700'
                          }`}
                        />
                        <div
                          className={`w-2 h-2 rounded-full ${
                            occB === 2 ? 'bg-emerald-400' : 'bg-neutral-700'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dispatch Action Control Bar */}
          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="text-xs text-neutral-400 font-mono hidden sm:block">
              Controls: <span className="text-sky-300 font-bold">1–4</span> Gate Select • <span className="text-amber-300 font-bold">Mouse Fwd / Back</span> Switch Karts • <span className="text-emerald-300 font-bold">Right Click / Enter</span> Let Group Go • <span className="text-neutral-200">[P]</span> Settings
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onTriggerDispatch();
              }}
              disabled={totalOccupants === 0 || gameState === 'DISPATCH_STATE' || gameState === 'RESET_STATE'}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-mono font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer ${
                totalOccupants === 16
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 border border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-pulse'
                  : totalOccupants > 0
                  ? 'bg-sky-600 hover:bg-sky-500 text-white border border-sky-400'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {totalOccupants === 16
                  ? '⚡ DISPATCH PERFECT TRAIN (16/16)!'
                  : totalOccupants > 0
                  ? `DISPATCH TRAIN (${totalOccupants}/16)`
                  : 'FILL SEATS TO DISPATCH'}
              </span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
