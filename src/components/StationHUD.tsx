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
  hoveredGateIndex?: number | null;
  selectedGateIndices?: number[];
  pendingAllocations?: { [gateIndex: number]: number };
  gates: GateState[];
  stats: SimulationStats;
  target: InteractionTarget;
  isPointerLocked: boolean;
  soundEnabled: boolean;
  isZenMode: boolean;
  keybinds?: KeybindsConfig;
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
  hoveredGateIndex = 0,
  selectedGateIndices = [],
  pendingAllocations = {},
  gates,
  stats,
  target,
  isPointerLocked,
  soundEnabled,
  isZenMode,
  keybinds,
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
  const boardingSeats = gates.reduce((acc, g) => acc + Math.min(2, g.occupants?.length || 0), 0);
  const queuedGuests = gates.reduce((acc, g) => acc + Math.max(0, (g.occupants?.length || 0) - 2), 0);
  const isTrainFull = boardingSeats === 16;
  const isTrainReady = boardingSeats > 0 && gameState === 'READY_STATE';
  const efficiency = Math.round((boardingSeats / 16) * 100);

  // Grouping Stage Calculation
  const totalAllocated = (Object.values(pendingAllocations) as number[]).reduce(
    (acc, val) => acc + val,
    0
  );

  // Formatted Hotkeys for HUD Badges: Keys 1-8 map directly to Gates 1-8
  const gateKeyLabels = Array.from({ length: 8 }, (_, idx) => `${idx + 1}`);

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
                <span>Select or deselect gates with keys <strong className="text-sky-300">1–4</strong> for active karts.</span>
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

      {/* --- BOTTOM SECTION: Train Layout Matrix, Compact Assignment Info, and Dispatch --- */}
      <footer className="flex flex-col gap-2 pointer-events-auto max-w-5xl mx-auto w-full">
        {/* Mario Kart Train Occupancy & Operations Bar (Fixed Height - Never Expands) */}
        <div className={`bg-neutral-900/95 backdrop-blur-md rounded-2xl p-3 shadow-2xl transition-colors ${
          selectedGroup
            ? 'border border-sky-500/70 shadow-[0_0_16px_rgba(56,189,248,0.15)]'
            : 'border border-neutral-700/80'
        }`}>
          {/* Header Row: Title, Seat Stats, Compact Party Chip (Zero Box Expansion), and Actions */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-neutral-800/80">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono font-black text-amber-400 tracking-wider flex items-center gap-1.5 shrink-0">
                🏎️ MARIO KART TRAIN OCCUPANCY
              </span>
              <span className="text-xs font-mono font-bold text-amber-300 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-700 shrink-0">
                {boardingSeats} / 16 SEATS ({efficiency}%)
              </span>
              {queuedGuests > 0 && (
                <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/40 shrink-0">
                  +{queuedGuests} Q
                </span>
              )}

              {/* Compact Inline Party Indicator: No extra box, zero height growth */}
              {selectedGroup && (
                <div className="flex items-center gap-1.5 bg-neutral-950 border border-sky-500/50 rounded-md px-2 py-0.5 shrink-0 animate-in fade-in duration-150">
                  <span
                    className="w-3.5 h-3.5 rounded text-[9px] font-mono font-black text-white flex items-center justify-center border border-white/25 shrink-0"
                    style={{ backgroundColor: selectedGroup.color }}
                  >
                    {selectedGroup.size}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-white whitespace-nowrap">
                    {selectedGroup.type === 'single' ? 'Single Rider' : `Party of ${selectedGroup.size}`}
                  </span>
                  <span className={`text-[10px] font-mono font-extrabold px-1.5 py-0.2 rounded border whitespace-nowrap ${
                    totalAllocated === selectedGroup.size
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                      : 'bg-amber-950 text-amber-300 border-amber-500/60'
                  }`}>
                    {totalAllocated === selectedGroup.size
                      ? '✓ Ready'
                      : `${totalAllocated}/${selectedGroup.size} Placed`}
                  </span>
                </div>
              )}
            </div>

            {/* Right Side: If group active -> Cancel & Let Group Go; If no group -> Call Queue Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedGroup ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeselect();
                    }}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-2 py-1 rounded-lg text-[11px] font-mono font-bold border border-neutral-700 transition-all cursor-pointer"
                    title="Cancel selection [Esc / Q]"
                  >
                    Cancel [Esc]
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmGrouping?.();
                    }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-mono font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      totalAllocated === selectedGroup.size
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400 border border-neutral-700'
                    }`}
                    title="Confirm gate assignments and let group board [Right Click / Enter]"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>LET GROUP GO [R-CLICK]</span>
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>

          {/* Station Status & Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between bg-neutral-950/85 border border-neutral-800 rounded-xl px-3.5 py-1.5 mb-2 gap-2 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-amber-300 flex items-center gap-1.5">
                <span>ROLLER COASTER TRAIN</span>
                <span className="text-neutral-600">•</span>
                <span className="text-neutral-400 font-normal">4 Karts (8 Gates)</span>
              </span>
            </div>
            <div className="text-[11px] font-mono text-sky-400/90 flex items-center gap-1.5 truncate max-w-full">
              {selectedGroup ? (
                <>
                  <span className="text-neutral-400">Party:</span>
                  <span className="text-neutral-200 font-semibold truncate max-w-[120px] md:max-w-xs" title={selectedGroup.members.map((m) => m.name).join(', ')}>
                    {selectedGroup.members.map((m) => m.name).join(', ')} ({selectedGroup.size}p)
                  </span>
                  <span className="text-neutral-600">•</span>
                  {selectedGateIndices.length === 0 ? (
                    <>
                      {hoveredGateIndex !== null && (
                        <>
                          <span className="text-amber-300 font-bold">Gate 0{hoveredGateIndex + 1}</span>
                          <span className="text-neutral-600">•</span>
                        </>
                      )}
                      <span className="text-sky-300 font-bold">[Left Click]</span>
                      <span className="text-neutral-300">Select Gate</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-amber-300 font-bold">Fwd/Back</span>
                      <span className="text-neutral-400">Cycle Gate</span>
                    </>
                  ) : (
                    <>
                      <span className="text-sky-300 font-bold">
                        {selectedGateIndices.length === 1
                          ? `Gate 0${selectedGateIndices[0] + 1} Selected`
                          : `${selectedGateIndices.length} Gates Selected (${selectedGateIndices.map((i) => `G${i + 1}`).join(', ')})`}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-emerald-300 font-bold">[Right Click / Enter]</span>
                      <span className="text-neutral-300">Let Group Go</span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-sky-300 font-bold">[Left Click]</span>
                      <span className="text-neutral-400">Toggle Selection</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="text-emerald-300 font-bold">[E]</span>
                  <span className="text-neutral-300">Call Main Queue or Single Rider Line</span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-400">Select a queue to begin grouping riders</span>
                </>
              )}
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
              const isHoveredA = selectedGroup !== null && hoveredGateIndex === gateIdxA;
              const isHoveredB = selectedGroup !== null && hoveredGateIndex === gateIdxB;
              const pendingA = pendingAllocations[gateIdxA] || 0;
              const pendingB = pendingAllocations[gateIdxB] || 0;

              return (
                <div
                  key={vIdx}
                  className="rounded-xl p-2 flex flex-col gap-1.5 bg-neutral-950/85 border border-neutral-800 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-mono text-amber-300 font-extrabold tracking-wider">
                      🏎️ KART 0{vIdx + 1}
                    </div>
                    <span className="text-[9px] font-mono text-neutral-500 font-semibold">
                      Gates {gateIdxA + 1} &amp; {gateIdxB + 1}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Gate A */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToGate?.(gateIdxA);
                      }}
                      title={`Gate ${gateIdxA + 1} (${occA}/4: ${Math.min(2, occA)} boarding, ${Math.max(0, occA - 2)} in queue) • Left Click to Select/Deselect`}
                      className={`relative p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer select-none text-left w-full ${
                        isSelectedA
                          ? 'bg-sky-950/90 border-sky-400 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.5)] ring-2 ring-sky-400'
                          : isHoveredA
                          ? 'bg-amber-950/50 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-2 ring-amber-400/80'
                          : occA === 4
                          ? 'bg-cyan-950/70 border-cyan-400/80 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                          : occA >= 2
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : occA === 1
                          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {isSelectedA && (
                        <span className="absolute -top-1.5 -right-1.5 bg-sky-400 text-neutral-950 font-mono font-black text-[9px] px-1.5 py-0.2 rounded-full shadow">
                          {pendingA > 0 ? `+${pendingA}` : 'SEL'}
                        </span>
                      )}
                      {/* Underline indication: only appears if currently hovered */}
                      {isHoveredA && (
                        <div className="absolute -bottom-1 left-1.5 right-1.5 h-1 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.95)] animate-pulse" />
                      )}
                      <div className="flex items-center justify-between w-full px-0.5">
                        <span className="text-[10px] font-mono font-bold">G{gateIdxA + 1}</span>
                        <span className="text-[9px] font-mono text-neutral-400 font-semibold">
                          {occA}{pendingA > 0 ? <span className="text-sky-300 font-bold">+{pendingA}</span> : ''}/4
                        </span>
                        <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded border ${
                          isSelectedA
                            ? 'bg-sky-400 text-neutral-950 border-sky-300'
                            : isHoveredA
                            ? 'bg-amber-400 text-neutral-950 border-amber-300'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                        }`}>
                          {gateKeyLabels[gateIdxA]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1" title={`${Math.min(2, occA)} ready to board, ${Math.max(0, occA - 2)} queued behind`}>
                        {/* Front row (boarding) */}
                        <div className="flex items-center gap-0.5">
                          <div className={`w-2 h-2 rounded-full transition-colors ${occA >= 1 ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]' : 'bg-neutral-700'}`} />
                          <div className={`w-2 h-2 rounded-full transition-colors ${occA >= 2 ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]' : 'bg-neutral-700'}`} />
                        </div>
                        {/* Queue divider */}
                        <div className="w-px h-2.5 bg-neutral-700/80" />
                        {/* Queue row (waiting behind) */}
                        <div className="flex items-center gap-0.5">
                          <div className={`w-2 h-2 rounded-sm transition-colors ${occA >= 3 ? 'bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.7)]' : 'bg-neutral-800 border border-neutral-700'}`} />
                          <div className={`w-2 h-2 rounded-sm transition-colors ${occA >= 4 ? 'bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.7)]' : 'bg-neutral-800 border border-neutral-700'}`} />
                        </div>
                      </div>
                    </button>

                    {/* Gate B */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignToGate?.(gateIdxB);
                      }}
                      title={`Gate ${gateIdxB + 1} (${occB}/4: ${Math.min(2, occB)} boarding, ${Math.max(0, occB - 2)} in queue) • Left Click to Select/Deselect`}
                      className={`relative p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer select-none text-left w-full ${
                        isSelectedB
                          ? 'bg-sky-950/90 border-sky-400 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.5)] ring-2 ring-sky-400'
                          : isHoveredB
                          ? 'bg-amber-950/50 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.4)] ring-2 ring-amber-400/80'
                          : occB === 4
                          ? 'bg-cyan-950/70 border-cyan-400/80 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                          : occB >= 2
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : occB === 1
                          ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {isSelectedB && (
                        <span className="absolute -top-1.5 -right-1.5 bg-sky-400 text-neutral-950 font-mono font-black text-[9px] px-1.5 py-0.2 rounded-full shadow">
                          {pendingB > 0 ? `+${pendingB}` : 'SEL'}
                        </span>
                      )}
                      {/* Underline indication: only appears if currently hovered */}
                      {isHoveredB && (
                        <div className="absolute -bottom-1 left-1.5 right-1.5 h-1 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.95)] animate-pulse" />
                      )}
                      <div className="flex items-center justify-between w-full px-0.5">
                        <span className="text-[10px] font-mono font-bold">G{gateIdxB + 1}</span>
                        <span className="text-[9px] font-mono text-neutral-400 font-semibold">
                          {occB}{pendingB > 0 ? <span className="text-sky-300 font-bold">+{pendingB}</span> : ''}/4
                        </span>
                        <span className={`text-[8px] font-mono font-bold px-1 py-0.2 rounded border ${
                          isSelectedB
                            ? 'bg-sky-400 text-neutral-950 border-sky-300'
                            : isHoveredB
                            ? 'bg-amber-400 text-neutral-950 border-amber-300'
                            : 'bg-neutral-800 text-neutral-300 border-neutral-700'
                        }`}>
                          {gateKeyLabels[gateIdxB]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1" title={`${Math.min(2, occB)} ready to board, ${Math.max(0, occB - 2)} queued behind`}>
                        {/* Front row (boarding) */}
                        <div className="flex items-center gap-0.5">
                          <div className={`w-2 h-2 rounded-full transition-colors ${occB >= 1 ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]' : 'bg-neutral-700'}`} />
                          <div className={`w-2 h-2 rounded-full transition-colors ${occB >= 2 ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]' : 'bg-neutral-700'}`} />
                        </div>
                        {/* Queue divider */}
                        <div className="w-px h-2.5 bg-neutral-700/80" />
                        {/* Queue row (waiting behind) */}
                        <div className="flex items-center gap-0.5">
                          <div className={`w-2 h-2 rounded-sm transition-colors ${occB >= 3 ? 'bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.7)]' : 'bg-neutral-800 border border-neutral-700'}`} />
                          <div className={`w-2 h-2 rounded-sm transition-colors ${occB >= 4 ? 'bg-sky-400 shadow-[0_0_5px_rgba(56,189,248,0.7)]' : 'bg-neutral-800 border border-neutral-700'}`} />
                        </div>
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
              {selectedGroup ? (
                <span>
                  Assigning <strong className="text-white">{selectedGroup.size} guests</strong> •{' '}
                  <span className="text-amber-300 font-bold">Forward / Back</span> Cycle Gate •{' '}
                  <span className="text-sky-300 font-bold">Left Click</span> Select/Deselect Gate •{' '}
                  <span className="text-emerald-300 font-bold">Right Click / Enter</span> Let Group Go
                </span>
              ) : (
                <span>
                  Controls: <span className="text-emerald-300 font-bold">[E]</span> Call Queue / Dispatch •{' '}
                  <span className="text-amber-300 font-bold">Forward / Back</span> Cycle Gate •{' '}
                  <span className="text-sky-300 font-bold">Left Click</span> Select/Deselect Gate
                </span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onTriggerDispatch();
              }}
              disabled={boardingSeats === 0 || gameState === 'DISPATCH_STATE' || gameState === 'RESET_STATE'}
              className={`flex-1 sm:flex-none px-6 py-2.5 rounded-xl font-mono font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer ${
                boardingSeats === 16
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 border border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.5)] animate-pulse'
                  : boardingSeats > 0
                  ? 'bg-sky-600 hover:bg-sky-500 text-white border border-sky-400'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {boardingSeats === 16
                  ? '⚡ DISPATCH PERFECT TRAIN (16/16)!'
                  : boardingSeats > 0
                  ? `DISPATCH TRAIN (${boardingSeats}/16)`
                  : 'FILL SEATS TO DISPATCH'}
              </span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
