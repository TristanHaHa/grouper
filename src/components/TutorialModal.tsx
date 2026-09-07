/**
 * Tutorial / Operations Manual Modal for Ride Grouper Simulator.
 * Explains station layout, group sequential filling mechanics, and scoring strategy.
 */

import React from 'react';
import { BookOpen, CheckCircle, HelpCircle, Lightbulb, Users, X, Zap } from 'lucide-react';

interface TutorialModalProps {
  onClose: () => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
          {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🏁</span>
            <h3 className="text-lg font-mono font-bold text-amber-400">MARIO KART • GROUPER MANUAL</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-neutral-300">
          {/* Section 1: Objective */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4">
            <h4 className="font-mono font-bold text-white flex items-center gap-2 mb-1.5 text-xs uppercase tracking-wider">
              <Zap className="w-4 h-4 text-amber-400" />
              Grouper Role & Objectives
            </h4>
            <p className="text-xs text-neutral-400 leading-relaxed">
              As the station <strong className="text-amber-300">Grouper</strong> on <strong className="text-red-400">Mario Kart</strong>, batch guests from the <strong className="text-red-400">Main Queue</strong> and <strong className="text-cyan-400">Single Rider Line</strong> into <strong>8 loading gates</strong> to fill 4 karts (<strong>16 total seats</strong>) before guest patience runs out. Dispatched trains clear the station and the next waiting train rolls in from the staging queue!
            </p>
          </div>

          {/* Section 2: Sequential Filling Rule */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4">
            <h4 className="font-mono font-bold text-white flex items-center gap-2 mb-1.5 text-xs uppercase tracking-wider">
              <Users className="w-4 h-4 text-amber-400" />
              Sequential Gate Assignment Rule
            </h4>
            <p className="text-xs text-neutral-400 leading-relaxed mb-2">
              Each gate has a queue capacity of <strong>4 occupants</strong> (the front 2 board the current train, and 2 can queue behind them). When the first 2 get dispatched, the queued riders automatically move up to the front!
            </p>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 font-mono text-[11px] text-neutral-300 space-y-1">
              <div className="text-sky-300 font-bold">Queueing Example:</div>
              <div>• Assign 2 guests to Gate 1 → <strong>Front row fills (2/4)</strong>, ready for the train.</div>
              <div>• Assign 2 more guests to Gate 1 → <strong>Queue row fills (4/4)</strong> behind them.</div>
              <div>• On dispatch, the first 2 ride off and the queued 2 automatically advance to the front row!</div>
            </div>
          </div>

          {/* Section 3: Pro Tips & Single Riders */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4">
            <h4 className="font-mono font-bold text-white flex items-center gap-2 mb-1.5 text-xs uppercase tracking-wider">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Attendant Strategy & Patience Rewards
            </h4>
            <ul className="text-xs text-neutral-400 space-y-1.5 list-disc list-inside">
              <li><strong>Patience Refill:</strong> Dispatches refill patience based on capacity percentage: <code className="text-emerald-400 font-mono">Reward = MaxReward × (TotalOccupants / 16)</code>.</li>
              <li><strong>Perfect Train (16/16):</strong> Yields maximum patience refill, score multipliers, and builds an Efficiency Streak!</li>
              <li><strong>Odd-numbered Groups:</strong> Always leave odd slots that can be smoothly plugged using the Single Rider line.</li>
            </ul>
          </div>

          {/* Section 4: Controls */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 font-mono text-xs">
            <h4 className="font-bold text-white mb-2 text-xs uppercase tracking-wider">
              Control Summary
            </h4>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">E Key:</span>
                <span className="text-emerald-300 font-bold">Interact (Queue / Dispatch)</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Left Click:</span>
                <span className="text-sky-300 font-bold">Select / Deselect Gate</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Mouse Fwd / Back:</span>
                <span className="text-amber-300 font-bold">Move Gate Selection</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Right Click / Enter:</span>
                <span className="text-emerald-300 font-bold">Let Group Go / Confirm</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">1 – 8 Keys:</span>
                <span className="text-sky-300 font-bold">Direct Gate (1–8)</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">M / N:</span>
                <span className="text-cyan-300 font-bold">Main / Single Queue</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">WASD:</span>
                <span className="text-white font-bold">Walk Platform</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Mouse:</span>
                <span className="text-white font-bold">First-Person Look</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Space:</span>
                <span className="text-white font-bold">Jump</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Esc / Q:</span>
                <span className="text-white font-bold">Deselect</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dismiss Button */}
        <div className="mt-6 pt-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-neutral-950 font-mono font-extrabold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20"
          >
            I UNDERSTAND • RETURN TO STATION
          </button>
        </div>
      </div>
    </div>
  );
};
