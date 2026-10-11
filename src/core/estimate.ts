import type { AssignmentType, Ms } from './types';

/** Unpadded starting estimates in minutes, before any learning. */
export const BASE_ESTIMATES: Record<AssignmentType, number> = {
  worksheet: 30,
  reading: 30,
  essay: 90,
  project: 120,
  quizStudy: 30,
  testStudy: 60,
  discussion: 20,
  onlineQuiz: 20,
  lab: 60,
  presentation: 60,
  errand: 30,
  other: 30,
};

export interface EstimateOptions {
  /** User's own base guess, replaces the type default. */
  baseOverrideMin?: number;
  /** Learned actual/estimated ratio for this type; 1 = no learning yet. Clamped to 0.5–2. */
  learnedRatio?: number;
  paddingPct: number;
}

/** Padded estimate, rounded up to 5 minutes, minimum 5. */
export function estimateMinutes(type: AssignmentType, opts: EstimateOptions): number {
  const base = opts.baseOverrideMin ?? BASE_ESTIMATES[type];
  const ratio = Math.min(2, Math.max(0.5, opts.learnedRatio ?? 1));
  const raw = base * ratio * (1 + opts.paddingPct / 100);
  return Math.max(5, Math.ceil(raw / 5 - 1e-9) * 5);
}

/** One assignment timed with Start and Done in the app. */
export interface DoneRecord {
  type: AssignmentType;
  baseMin: number;
  actualMin: number;
  at: Ms;
}

export const MIN_SAMPLES = 3;

/**
 * How long this type really takes compared with its base estimate: the average of the last 10
 * timed assignments, ignoring obvious mis-taps (under 0.25× or over 4×). 1 until there are 3 samples.
 */
export function learnedRatio(history: DoneRecord[], type: AssignmentType): { ratio: number; samples: number } {
  const ratios = history
    .filter((h) => h.type === type && h.baseMin > 0)
    .map((h) => h.actualMin / h.baseMin)
    .filter((r) => r >= 0.25 && r <= 4)
    .slice(-10);
  if (ratios.length < MIN_SAMPLES) return { ratio: 1, samples: ratios.length };
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return { ratio: Math.min(2, Math.max(0.5, avg)), samples: ratios.length };
}

/** Splits a big estimate into roughly hour-long parts, each rounded up to 5 minutes. */
export function splitMinutes(totalMin: number): number[] {
  const n = Math.max(2, Math.ceil(totalMin / 60));
  const each = Math.ceil(totalMin / n / 5) * 5;
  return Array.from({ length: n }, () => each);
}
