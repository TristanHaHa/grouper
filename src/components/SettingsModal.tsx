/**
 * Settings Modal for Ride Grouper Simulator.
 * Allows configuring controls sensitivity, difficulty presets, audio volumes, and visual preferences.
 */

import React from 'react';
import { Dice5, Sliders, Users, Volume2, X, Zap } from 'lucide-react';
import { DifficultyConfig, GameSettings } from '../types';

interface SettingsModalProps {
  settings: GameSettings;
  difficulty: DifficultyConfig;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onChangeDifficulty: (diffName: 'TRAINEE' | 'STANDARD' | 'RUSH_HOUR') => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  difficulty,
  onUpdateSettings,
  onChangeDifficulty,
  onClose,
}) => {
  const currentRandomness = settings.groupRandomness ?? 0;
  // The slider's 0–25% range represents the full 0–100% variety range.
  const sliderRandomness = currentRandomness * 0.25;
  const randomnessLabel =
    currentRandomness <= 0.2
      ? 'Standard Party Mix'
      : currentRandomness <= 0.6
      ? 'Moderate Variety'
      : currentRandomness <= 0.85
      ? 'High Variety & Randomness'
      : 'Pure Chaotic Variety (1–16)';

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-mono font-bold text-white">STATION SETTINGS</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Difficulty Preset */}
          <div>
            <label className="text-xs font-mono font-bold text-neutral-300 uppercase tracking-wider block mb-2">
              Difficulty Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['TRAINEE', 'STANDARD', 'RUSH_HOUR'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => onChangeDifficulty(diff)}
                  className={`py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                    difficulty.name === diff
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {diff === 'TRAINEE' ? 'Trainee' : diff === 'STANDARD' ? 'Standard' : 'Rush Hour'}
                </button>
              ))}
            </div>
          </div>

          {/* Group Size Variety & Randomness Slider */}
          <div className="bg-neutral-950/40 p-3.5 rounded-xl border border-neutral-800/80">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-300 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Dice5 className="w-3.5 h-3.5 text-amber-400" />
                <span>GROUP SIZE RANDOMNESS</span>
              </div>
              <span className="text-amber-400 font-extrabold">{Math.round(sliderRandomness * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.25"
              step="0.0125"
              value={sliderRandomness}
              onChange={(e) => onUpdateSettings({ groupRandomness: parseFloat(e.target.value) / 0.25 })}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between items-center text-[10px] font-mono text-neutral-400 mt-1.5">
              <span>Standard Mix</span>
              <span className="text-amber-300/90 font-semibold">{randomnessLabel}</span>
              <span>All 1–16 Even</span>
            </div>
          </div>

          {/* Mouse Look Sensitivity */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-300 mb-2">
              <span>MOUSE LOOK SENSITIVITY</span>
              <span className="text-sky-400">{Math.round(settings.mouseSensitivity * 10000)}</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.006"
              step="0.0005"
              value={settings.mouseSensitivity}
              onChange={(e) => onUpdateSettings({ mouseSensitivity: parseFloat(e.target.value) })}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>

          {/* Sound FX Volume */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-300 mb-2">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                <span>SOUND EFFECTS VOLUME</span>
              </div>
              <span className="text-sky-400">{Math.round(settings.sfxVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.sfxVolume}
              onChange={(e) => onUpdateSettings({ sfxVolume: parseFloat(e.target.value) })}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>

          {/* Ambient Queue Murmur */}
          <div>
            <div className="flex items-center justify-between text-xs font-mono font-bold text-neutral-300 mb-2">
              <span>AMBIENT PARK ATMOSPHERE</span>
              <span className="text-sky-400">{Math.round(settings.musicVolume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.musicVolume}
              onChange={(e) => onUpdateSettings({ musicVolume: parseFloat(e.target.value) })}
              className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        </div>

        {/* Close Button */}
        <div className="mt-6 pt-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-mono font-bold text-xs transition-all cursor-pointer"
          >
            CONFIRM & RESUME
          </button>
        </div>
      </div>
    </div>
  );
};
