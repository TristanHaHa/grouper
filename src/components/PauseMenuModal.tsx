/**
 * Pause Menu & Operations Configuration Modal.
 * Offers comprehensive graphics adjustment (Brightness, FOV, Shadows),
 * Zen Mode toggle (unlimited patience), audio mixer, difficulty presets, and shift management.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  HelpCircle,
  Infinity as InfinityIcon,
  Keyboard,
  Monitor,
  Moon,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { DifficultyConfig, GameSettings, KeybindsConfig, SimulationStats, DEFAULT_KEYBINDS } from '../types';
import { KEYBIND_DEFINITIONS, formatKeyName } from '../utils/keybinds';

interface PauseMenuModalProps {
  isOpen: boolean;
  settings: GameSettings;
  difficulty: DifficultyConfig;
  stats: SimulationStats;
  onResume: () => void;
  onRestart: () => void;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onChangeDifficulty: (diffName: 'TRAINEE' | 'STANDARD' | 'RUSH_HOUR') => void;
  onOpenTutorial: () => void;
}

export const PauseMenuModal: React.FC<PauseMenuModalProps> = ({
  isOpen,
  settings,
  difficulty,
  stats,
  onResume,
  onRestart,
  onUpdateSettings,
  onChangeDifficulty,
  onOpenTutorial,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'graphics' | 'audio' | 'controls'>('general');
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [rebindingAction, setRebindingAction] = useState<keyof KeybindsConfig | null>(null);

  const currentKeybinds: KeybindsConfig = settings.keybinds || DEFAULT_KEYBINDS;

  // Key Listener for Rebinding Action
  useEffect(() => {
    if (!rebindingAction) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setRebindingAction(null);
        return;
      }

      // Apply new keybinding
      const updatedKeybinds: KeybindsConfig = {
        ...currentKeybinds,
        [rebindingAction]: e.code,
      };

      onUpdateSettings({ keybinds: updatedKeybinds });
      setRebindingAction(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [rebindingAction, currentKeybinds, onUpdateSettings]);

  if (!isOpen) return null;

  return (
    <div
      id="pause-menu-backdrop"
      className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      <div
        id="pause-menu-card"
        className="bg-neutral-900 border border-neutral-700/80 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Top Banner */}
        <div className="bg-gradient-to-r from-sky-950/80 via-neutral-900 to-neutral-900 p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-mono font-extrabold text-white tracking-wider">STATION PAUSED</h2>
                {settings.zenMode ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <InfinityIcon className="w-3 h-3" /> ZEN MODE
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {difficulty.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 font-sans mt-0.5">Control console and coaster operations suspended</p>
            </div>
          </div>

          <button
            id="pause-modal-close-btn"
            onClick={onResume}
            className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-neutral-700/50"
            title="Resume [ESC / P]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Shift Progress Header Stats */}
        <div className="grid grid-cols-4 bg-neutral-950/60 border-b border-neutral-800 text-center py-2.5 px-3 gap-2">
          <div>
            <div className="text-[10px] font-mono text-neutral-400">TRAINS SENT</div>
            <div className="text-sm font-mono font-bold text-sky-400">{stats.trainsDispatched}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-400">GUESTS SEATED</div>
            <div className="text-sm font-mono font-bold text-emerald-400">{stats.guestsProcessed}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-400">EFFICIENCY</div>
            <div className="text-sm font-mono font-bold text-amber-400">{stats.averageEfficiency}%</div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-neutral-400">SHIFT SCORE</div>
            <div className="text-sm font-mono font-bold text-purple-400">{stats.score.toLocaleString()}</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-neutral-900 px-4 pt-3 gap-1">
          <button
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'general'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            MODES & GENERAL
          </button>
          <button
            onClick={() => setActiveTab('graphics')}
            className={`pb-2.5 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'graphics'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            GRAPHICS & BRIGHTNESS
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`pb-2.5 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'audio'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            AUDIO
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            className={`pb-2.5 px-3 text-xs font-mono font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === 'controls'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            CONTROLS
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* TAB 1: MODES & GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              {/* Zen Mode Banner & Toggle */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  settings.zenMode
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                    : 'bg-neutral-950/50 border-neutral-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <InfinityIcon className={`w-4 h-4 ${settings.zenMode ? 'text-emerald-400' : 'text-neutral-400'}`} />
                      <span className="font-mono font-bold text-sm text-white">ZEN MODE (UNLIMITED PATIENCE)</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Removes guest patience decay completely. Enjoy stress-free, peaceful grouper operations and perfect
                      train dispatching at your own relaxed pace.
                    </p>
                  </div>

                  <button
                    id="toggle-zen-mode-btn"
                    onClick={() => onUpdateSettings({ zenMode: !settings.zenMode })}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.zenMode ? 'bg-emerald-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.zenMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Timed Difficulty Presets (Enabled only if Zen Mode is off) */}
              <div className={`space-y-2 ${settings.zenMode ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-neutral-300 uppercase">
                    Timed Challenge Preset
                  </label>
                  {settings.zenMode && (
                    <span className="text-[10px] font-mono text-emerald-400">Active when Zen Mode is disabled</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['TRAINEE', 'STANDARD', 'RUSH_HOUR'] as const).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => onChangeDifficulty(diff)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer text-center ${
                        difficulty.name === diff
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <div>{diff === 'TRAINEE' ? 'Trainee' : diff === 'STANDARD' ? 'Standard' : 'Rush Hour'}</div>
                      <div className="text-[10px] font-normal text-neutral-400 mt-0.5">
                        {diff === 'TRAINEE' ? '45s Bar' : diff === 'STANDARD' ? '28s Bar' : '18s Rush'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Select Next Group Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950/40 rounded-xl border border-neutral-800">
                <div>
                  <div className="text-xs font-mono font-bold text-neutral-200">AUTO-ADVANCE QUEUE FOCUS</div>
                  <div className="text-[11px] text-neutral-400">Keep interaction ready after assigning groups</div>
                </div>
                <button
                  onClick={() => onUpdateSettings({ autoSelectNext: !settings.autoSelectNext })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.autoSelectNext ? 'bg-sky-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      settings.autoSelectNext ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Group Size Randomness Slider */}
              <div className="p-3.5 bg-neutral-950/40 rounded-xl border border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>GROUP SIZE VARIETY & RANDOMNESS</span>
                  </div>
                  <span className="text-purple-400 font-mono text-sm">
                    {Math.round((settings.groupRandomness ?? 0.85) * 100)}%
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Controls guest party size variety. Higher values create unpredictable queue variety from single riders up to large parties.
                </p>
                <input
                  id="group-randomness-slider"
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={settings.groupRandomness ?? 0.85}
                  onChange={(e) => onUpdateSettings({ groupRandomness: parseFloat(e.target.value) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-purple-400"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                  <span>Traditional (Pairs & Quads)</span>
                  <span className="text-purple-300 font-bold">High Variety (85% Default)</span>
                  <span>Max Random (100%)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GRAPHICS & BRIGHTNESS */}
          {activeTab === 'graphics' && (
            <div className="space-y-6">
              {/* Station Brightness Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span>STATION BRIGHTNESS & EXPOSURE</span>
                  </div>
                  <span className="text-amber-400 font-mono text-sm">
                    {Math.round((settings.brightness / 1.45) * 100)}%
                  </span>
                </div>
                <input
                  id="brightness-slider"
                  type="range"
                  min="0.6"
                  max="2.4"
                  step="0.05"
                  value={settings.brightness}
                  onChange={(e) => onUpdateSettings({ brightness: parseFloat(e.target.value) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                  <span>Dim Industrial (60%)</span>
                  <span>Default Bright (100%)</span>
                  <span>Vivid Daylight (165%)</span>
                </div>
              </div>

              {/* Field of View (FOV) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-sky-400" />
                    <span>FIELD OF VIEW (FOV)</span>
                  </div>
                  <span className="text-sky-400 font-mono text-sm">{settings.fov}°</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="95"
                  step="1"
                  value={settings.fov}
                  onChange={(e) => onUpdateSettings({ fov: parseInt(e.target.value, 10) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
                <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                  <span>Narrow (60°)</span>
                  <span>Standard (75°)</span>
                  <span>Ultra-Wide (95°)</span>
                </div>
              </div>

              {/* Dynamic Soft Shadows Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950/40 rounded-xl border border-neutral-800">
                <div>
                  <div className="text-xs font-mono font-bold text-neutral-200">DYNAMIC SOFT SHADOWS</div>
                  <div className="text-[11px] text-neutral-400">Realistic spotlight & NPC shadow casting</div>
                </div>
                <button
                  onClick={() => onUpdateSettings({ shadowsEnabled: !settings.shadowsEnabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.shadowsEnabled ? 'bg-sky-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      settings.shadowsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Visual Guides Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950/40 rounded-xl border border-neutral-800">
                <div>
                  <div className="text-xs font-mono font-bold text-neutral-200">HOLOGRAPHIC GATE HIGHLIGHTS</div>
                  <div className="text-[11px] text-neutral-400">Live preview ghost silhouettes when aiming at gates</div>
                </div>
                <button
                  onClick={() => onUpdateSettings({ showVisualGuides: !settings.showVisualGuides })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.showVisualGuides ? 'bg-sky-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      settings.showVisualGuides ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: AUDIO */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              {/* Sound FX Volume */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-sky-400" />
                    <span>STATION SOUND FX VOLUME</span>
                  </div>
                  <span className="text-sky-400 font-mono text-sm">{Math.round(settings.sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.sfxVolume}
                  onChange={(e) => onUpdateSettings({ sfxVolume: parseFloat(e.target.value) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>

              {/* Ambient Atmosphere Volume */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>PARK CROWD & BACKGROUND AMBIENCE</span>
                  </div>
                  <span className="text-sky-400 font-mono text-sm">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => onUpdateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>

              {/* Master Audio Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-neutral-950/40 rounded-xl border border-neutral-800">
                <div>
                  <div className="text-xs font-mono font-bold text-neutral-200">ENABLE AUDIO SYNTHESIZER</div>
                  <div className="text-[11px] text-neutral-400">Pneumatic sounds, ratchets, gates, chimes</div>
                </div>
                <button
                  onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    settings.soundEnabled ? 'bg-sky-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                      settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CONTROLS & KEYBINDS */}
          {activeTab === 'controls' && (
            <div className="space-y-6">
              {/* Quick Number Key Grouping Banner */}
              <div className="p-4 bg-sky-950/40 rounded-xl border border-sky-500/40 space-y-1.5 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-sky-400" />
                    Number Keys 1 – 8 Quick Grouping
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-400/40">
                    Active
                  </span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Press number keys <span className="text-white font-mono font-bold bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">1</span> through <span className="text-white font-mono font-bold bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700">8</span> during gameplay to instantly route groups to loading Gates 1–8.
                </p>
              </div>

              {/* Header & Reset Defaults */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Keyboard className="w-4 h-4 text-sky-400" />
                    Custom Keybinds & Shortcuts
                  </h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Click any key badge below to rebind it.</p>
                </div>

                <button
                  onClick={() => onUpdateSettings({ keybinds: { ...DEFAULT_KEYBINDS } })}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white border border-neutral-700 text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Reset all bindings to default layout"
                >
                  <RotateCcw className="w-3 h-3 text-neutral-400" />
                  <span>Reset Defaults</span>
                </button>
              </div>

              {/* Rebinding Warning / Helper Modal Notification */}
              {rebindingAction && (
                <div className="p-3 bg-amber-950/60 border border-amber-500/60 rounded-xl flex items-center justify-between text-amber-200 text-xs font-mono animate-pulse">
                  <span>
                    Press any key to bind to <strong className="text-white font-bold">{KEYBIND_DEFINITIONS.find((k) => k.id === rebindingAction)?.label}</strong>...
                  </span>
                  <button
                    onClick={() => setRebindingAction(null)}
                    className="px-2 py-0.5 rounded bg-amber-900/80 hover:bg-amber-800 text-white font-mono text-[10px] cursor-pointer"
                  >
                    Cancel [ESC]
                  </button>
                </div>
              )}

              {/* Section 1: Number Keys 1-8 (Gate Routing) */}
              <div className="space-y-2">
                <div className="text-[11px] font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span>Gate Routing (1 – 8 Number Keys)</span>
                  <span className="text-[10px] text-neutral-500 font-normal">Directly fills cars</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KEYBIND_DEFINITIONS.filter((k) => k.category === 'gate').map((item) => {
                    const isRebinding = rebindingAction === item.id;
                    const boundCode = currentKeybinds[item.id];
                    const keyLabel = formatKeyName(boundCode);

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          isRebinding
                            ? 'bg-amber-950/40 border-amber-400 shadow-md'
                            : 'bg-neutral-950/60 border-neutral-800/90 hover:border-neutral-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-neutral-200 truncate">{item.label}</div>
                          <div className="text-[10px] text-neutral-400 truncate">{item.description}</div>
                        </div>

                        <button
                          onClick={() => setRebindingAction(item.id)}
                          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                            isRebinding
                              ? 'bg-amber-500 text-neutral-950 border-amber-300 animate-bounce'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-sky-300 hover:text-white border-neutral-700 hover:border-sky-400 shadow'
                          }`}
                        >
                          {isRebinding ? 'Press Key...' : keyLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Queue & Operations */}
              <div className="space-y-2">
                <div className="text-[11px] font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span>Queue & Coaster Operations</span>
                  <span className="text-[10px] text-neutral-500 font-normal">Console & Lines</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KEYBIND_DEFINITIONS.filter((k) => k.category === 'queue').map((item) => {
                    const isRebinding = rebindingAction === item.id;
                    const boundCode = currentKeybinds[item.id];
                    const keyLabel = formatKeyName(boundCode);

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          isRebinding
                            ? 'bg-amber-950/40 border-amber-400 shadow-md'
                            : 'bg-neutral-950/60 border-neutral-800/90 hover:border-neutral-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-neutral-200 truncate">{item.label}</div>
                          <div className="text-[10px] text-neutral-400 truncate">{item.description}</div>
                        </div>

                        <button
                          onClick={() => setRebindingAction(item.id)}
                          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                            isRebinding
                              ? 'bg-amber-500 text-neutral-950 border-amber-300 animate-bounce'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-sky-300 hover:text-white border-neutral-700 hover:border-sky-400 shadow'
                          }`}
                        >
                          {isRebinding ? 'Press Key...' : keyLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Movement */}
              <div className="space-y-2">
                <div className="text-[11px] font-mono font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between border-b border-neutral-800 pb-1">
                  <span>Operator Platform Movement</span>
                  <span className="text-[10px] text-neutral-500 font-normal">First-person navigation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KEYBIND_DEFINITIONS.filter((k) => k.category === 'movement').map((item) => {
                    const isRebinding = rebindingAction === item.id;
                    const boundCode = currentKeybinds[item.id];
                    const keyLabel = formatKeyName(boundCode);

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                          isRebinding
                            ? 'bg-amber-950/40 border-amber-400 shadow-md'
                            : 'bg-neutral-950/60 border-neutral-800/90 hover:border-neutral-700'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-neutral-200 truncate">{item.label}</div>
                          <div className="text-[10px] text-neutral-400 truncate">{item.description}</div>
                        </div>

                        <button
                          onClick={() => setRebindingAction(item.id)}
                          className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                            isRebinding
                              ? 'bg-amber-500 text-neutral-950 border-amber-300 animate-bounce'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-sky-300 hover:text-white border-neutral-700 hover:border-sky-400 shadow'
                          }`}
                        >
                          {isRebinding ? 'Press Key...' : keyLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mouse Look Sensitivity Slider */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-200">
                  <span>MOUSE LOOK SENSITIVITY</span>
                  <span className="text-sky-400 font-mono text-sm">
                    {Math.round(settings.mouseSensitivity * 10000)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.001"
                  max="0.006"
                  step="0.0005"
                  value={settings.mouseSensitivity}
                  onChange={(e) => onUpdateSettings({ mouseSensitivity: parseFloat(e.target.value) })}
                  className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-neutral-950/80 p-4 border-t border-neutral-800 flex items-center justify-between gap-3">
          {/* Restart Confirmation */}
          {showRestartConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-300 font-mono">Restart Shift?</span>
              <button
                onClick={() => {
                  setShowRestartConfirm(false);
                  onRestart();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold cursor-pointer"
              >
                Yes, Reset
              </button>
              <button
                onClick={() => setShowRestartConfirm(false)}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRestartConfirm(true)}
                className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-neutral-800 hover:border-rose-800 font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESTART SHIFT</span>
              </button>

              <button
                onClick={onOpenTutorial}
                className="px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800 font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>GUIDE</span>
              </button>
            </div>
          )}

          {/* Primary Resume Button */}
          <button
            id="pause-modal-resume-btn"
            onClick={onResume}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-400 hover:to-teal-400 text-white font-mono font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>RESUME SHIFT [ESC / P]</span>
          </button>
        </div>
      </div>
    </div>
  );
};
