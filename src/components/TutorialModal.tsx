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
              Each gate holds <strong>2 occupants</strong>. When a group of size $N$ is placed at Gate $G$, members fill available seats sequentially across Gates $G, G+1, \dots$
            </p>
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 font-mono text-[11px] text-neutral-300 space-y-1">
              <div className="text-sky-300 font-bold">Example:</div>
              <div>• Group of 3 assigned to Gate 1 → <strong>Gate 1 gets 2 members</strong>, <strong>Gate 2 gets 1 member</strong>.</div>
              <div>• Now Gate 2 has 1 open seat remaining! Use a <span className="text-cyan-400 font-bold">Single Rider (1)</span> to perfectly fill Gate 2!</div>
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
                <span className="text-neutral-400">1 – 4 Keys:</span>
                <span className="text-sky-300 font-bold">Select Gate (Active Karts)</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Mouse Fwd / Back:</span>
                <span className="text-amber-300 font-bold">Switch Karts (1-2 ⇋ 3-4)</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Right Click / Enter:</span>
                <span className="text-emerald-300 font-bold">Let Group Go / Confirm</span>
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
                <span className="text-neutral-400">Left Click:</span>
                <span className="text-white font-bold">Interact / Select</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Space:</span>
                <span className="text-white font-bold">Dispatch Train</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">Esc / Q:</span>
                <span className="text-white font-bold">Deselect</span>
              </div>
              <div className="flex justify-between bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                <span className="text-neutral-400">P:</span>
                <span className="text-white font-bold">Pause & Settings</span>
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
