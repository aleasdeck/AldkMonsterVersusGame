import type { RunState } from '../engine/types';
import { SAVE_VERSION } from '../engine/types';

const RUN_KEY = 'mv_run_v1';
const BEST_KEY = 'mv_best_v1';

export interface BestRecord {
  runs: number;
  victories: number;
  /** Пройдено комнат в лучшем забеге. */
  furthest: number;
  furthestHero: string;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState): void {
  try {
    storage()?.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* переполнено или недоступно — играем без сохранения */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = storage()?.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.version !== SAVE_VERSION) return null;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    storage()?.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadBest(): BestRecord {
  try {
    const raw = storage()?.getItem(BEST_KEY);
    if (raw) return JSON.parse(raw) as BestRecord;
  } catch {
    /* ignore */
  }
  return { runs: 0, victories: 0, furthest: 0, furthestHero: '' };
}

export function recordResult(run: RunState): BestRecord {
  const best = loadBest();
  best.runs += 1;
  if (run.phase === 'victory') best.victories += 1;
  if (run.stats.roomsCleared > best.furthest) {
    best.furthest = run.stats.roomsCleared;
    best.furthestHero = run.hero.defId;
  }
  try {
    storage()?.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* ignore */
  }
  return best;
}
