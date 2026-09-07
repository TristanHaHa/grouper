import type { GateState } from '../types';

export interface GroupSplitAnalysis {
  idealKartCount: number;
  minimumFeasibleKartCount: number;
  actualKartCount: number;
  unnecessaryKarts: number;
  patiencePenalty: number;
  alternativeKartIndices: number[];
  affectedKartIndices: number[];
}

// A group may use only two seats per gate. The two gates in one kart therefore
// offer at most four places, even when that kart is already double-grouped.
const kartCapacity = (gates: GateState[], kartIndex: number) => gates
  .filter(gate => gate.vehicleIndex === kartIndex)
  .reduce((sum, gate) => sum + Math.min(2, Math.max(0, gate.capacity - gate.occupants.length)), 0);

const combinations = (values: number[]) => {
  const result: number[][] = [];
  for (let mask = 1; mask < (1 << values.length); mask++) {
    result.push(values.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return result.sort((a, b) => a.length - b.length || a.join(',').localeCompare(b.join(',')));
};

export function analyzeGroupSplit(groupSize: number, gates: GateState[], allocations: Record<number, number>): GroupSplitAnalysis {
  const idealKartCount = Math.ceil(groupSize / 4);
  const actualKartIndices = [...new Set(Object.entries(allocations)
    .filter(([, riders]) => riders > 0)
    .map(([gateIndex]) => gates[Number(gateIndex)]?.vehicleIndex)
    .filter((kartIndex): kartIndex is number => kartIndex !== undefined))].sort((a, b) => a - b);
  const kartIndices = [...new Set(gates.map(gate => gate.vehicleIndex))].sort((a, b) => a - b);
  const alternativeKartIndices = combinations(kartIndices)
    .find(candidate => candidate.reduce((sum, kartIndex) => sum + kartCapacity(gates, kartIndex), 0) >= groupSize) ?? [];
  const minimumFeasibleKartCount = alternativeKartIndices.length || idealKartCount;
  const actualKartCount = actualKartIndices.length;
  const unnecessaryKarts = Math.max(0, actualKartCount - minimumFeasibleKartCount);

  return {
    idealKartCount,
    minimumFeasibleKartCount,
    actualKartCount,
    unnecessaryKarts,
    patiencePenalty: Math.min(12, unnecessaryKarts * 4),
    alternativeKartIndices,
    affectedKartIndices: unnecessaryKarts > 0 ? actualKartIndices : [],
  };
}
