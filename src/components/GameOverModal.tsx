/**
 * Game Over Debrief Modal for Ride Grouper Simulator.
 * Shows performance metrics, final operator rank, efficiency streaks, and replay options.
 */

import React from 'react';
import { Award, CheckCircle2, RotateCcw, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';
import { SimulationStats } from '../types';

interface GameOverModalProps {
  stats: SimulationStats;
  onRestart: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({ stats, onRestart }) => {
  const rankColor =
    stats.shiftRating === 'MASTER GROUPER' || stats.shiftRating === 'LEGEND'
      ? 'text-amber-400 border-amber-500/50 bg-amber-500/10'
      : stats.shiftRating === 'SPECIALIST'
      ? 'text-sky-400 border-sky-500/50 bg-sky-500/10'
      : 'text-neutral-300 border-neutral-700 bg-neutral-800/50';

  return (
    <div data-controller-menu className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black font-mono text-white tracking-wide">SHIFT CONCLUDED</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Guest Satisfaction depleted. Here is your station operations debrief.
          </p>
        </div>

        {/* Rating Badge */}
        <div className={`p-4 rounded-xl border flex items-center justify-between mb-6 ${rankColor}`}>
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-current" />
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider opacity-80">STATION OPERATOR RANK</div>
              <div className="text-lg font-black font-mono tracking-wide">{stats.shiftRating}</div>
            </div>
          </div>
          <div className="text-right font-mono">
            <div className="text-xs opacity-75">FINAL SCORE</div>
            <div className="text-xl font-extrabold">{stats.score.toLocaleString()}</div>
          </div>
        </div>

        {/* Performance Statistics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 font-mono">
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3">
            <div className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
              <span>TRAINS DISPATCHED</span>
            </div>
            <div className="text-xl font-bold text-white">{stats.trainsDispatched}</div>
          </div>

          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3">
            <div className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>AVG EFFICIENCY</span>
            </div>
            <div className="text-xl font-bold text-white">{stats.averageEfficiency}%</div>
          </div>

          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3">
            <div className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>GUESTS PROCESSED</span>
            </div>
            <div className="text-xl font-bold text-white">{stats.guestsProcessed}</div>
          </div>

          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3">
            <div className="text-xs text-neutral-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>BEST STREAK (16/16)</span>
            </div>
            <div className="text-xl font-bold text-white">x{stats.bestStreak}</div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onRestart}
          className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 font-mono font-extrabold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-sky-500/20"
        >
          <RotateCcw className="w-4 h-4" />
          <span>START NEW SHIFT</span>
        </button>
      </div>
    </div>
  );
};
