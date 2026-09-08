import { useReducer, useRef, type MutableRefObject, type SetStateAction } from 'react';
import type { TrackType } from '../types';

export const TRACKS = ['inside', 'outside'] as const;

/** A synchronous track scope keeps animation callbacks tied to their originating train. */
export class TrackScope {
  current: TrackType = 'inside';
  run<T>(track: TrackType, action: () => T): T {
    const previous = this.current;
    this.current = track;
    try { return action(); } finally { this.current = previous; }
  }
}

export function createTrackField<T>(scope: TrackScope, initial: () => T) {
  const values: Record<TrackType, T> = { inside: initial(), outside: initial() };
  const ref = {
    get current() { return values[scope.current]; },
    set current(value: T) { values[scope.current] = value; },
  };
  return { values, ref };
}

/** Track-local React state with immediately consistent refs for input and animation callbacks. */
export function useTrackField<T>(scope: TrackScope, initial: () => T):
  [T, (value: SetStateAction<T>) => void, MutableRefObject<T>, Record<TrackType, T>] {
  const [, render] = useReducer(n => n + 1, 0);
  const field = useRef<ReturnType<typeof createTrackField<T>> | null>(null);
  if (!field.current) field.current = createTrackField(scope, initial);
  const { ref, values } = field.current;
  const set = (value: SetStateAction<T>) => {
    ref.current = typeof value === 'function' ? (value as (previous: T) => T)(ref.current) : value;
    render();
  };
  return [ref.current, set, ref, values];
}
