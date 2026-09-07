/**
 * Game Over Debrief Modal for Ride Grouper Simulator.
 * Shows performance metrics, final operator rank, efficiency streaks, and replay options.
 */

import React from 'react';
import { Award, CheckCircle2, Clock, RotateCcw, Sparkles, TrendingUp, UserMinus, Users, Zap } from 'lucide-react';
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

  const insideDispatched = stats.insideTrainsDispatched ?? 0;
  const outsideDispatched = stats.outsideTrainsDispatched ?? 0;
  const gpm = stats.guestsPerMinute ?? (stats.timeElapsed > 0 ? Math.round((stats.guestsProcessed / (stats.timeElapsed / 60)) * 10) / 10 : 0);
  const avgWait = stats.avgDispatchIntervalSeconds ?? (stats.trainsDispatched > 0 ? Math.round(stats.timeElapsed / stats.trainsDispatched) : 0);
  const groupsLeft = stats.groupsDeparted ?? 0;

  return (
    <div data-controller-menu className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black font-mono text-white tracking-wide">SHIFT CONCLUDED</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Guest Satisfaction depleted. Here is your station operations debrief.
          </p>
        </div>

        {/* Rating Badge */}
        <div className={`p-4 rounded-xl border flex items-center justify-between mb-5 ${rankColor}`}>
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

        {/* Performance Statistics Grid - Enhanced 6-Stat Layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6 font-mono">
          {/* 1. Total Guests */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>TOTAL GUESTS</span>
            </div>
            <div className="text-lg font-bold text-white">{stats.guestsProcessed}</div>
            <div className="text-[10px] text-neutral-500">Boarded seats</div>
          </div>

          {/* 2. Throughput: Guests per Minute */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>GUESTS / MIN</span>
            </div>
            <div className="text-lg font-bold text-emerald-400">{gpm}</div>
            <div className="text-[10px] text-neutral-500">Hourly pace</div>
          </div>

          {/* 3. Trains Dispatched (Dual track breakdown) */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
              <span>DISPATCHES</span>
            </div>
            <div className="text-lg font-bold text-white">{stats.trainsDispatched}</div>
            <div className="text-[10px] text-sky-400 font-semibold">
              In: {insideDispatched} • Out: {outsideDispatched}
            </div>
          </div>

          {/* 4. Average Wait / Dispatch Interval */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-purple-400" />
              <span>AVG WAIT TIME</span>
            </div>
            <div className="text-lg font-bold text-purple-300">{avgWait > 0 ? `${avgWait}s` : '--'}</div>
            <div className="text-[10px] text-neutral-500">Per dispatch cycle</div>
          </div>

          {/* 5. Groups Left (Walkouts) */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <UserMinus className="w-3.5 h-3.5 text-rose-400" />
              <span>GROUPS LEFT</span>
            </div>
            <div className={`text-lg font-bold ${groupsLeft > 0 ? 'text-rose-400' : 'text-neutral-300'}`}>
              {groupsLeft}
            </div>
            <div className="text-[10px] text-neutral-500">Patience walkouts</div>
          </div>

          {/* 6. Avg Efficiency & Streaks */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-2.5">
            <div className="text-[11px] text-neutral-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>EFFICIENCY</span>
            </div>
            <div className="text-lg font-bold text-yellow-300">{stats.averageEfficiency}%</div>
            <div className="text-[10px] text-yellow-500">Best streak: x{stats.bestStreak}</div>
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
