import type { AssignmentType } from './types';

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
