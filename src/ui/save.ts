import type { RunState } from '../engine/types';
import { SAVE_VERSION } from '../engine/types';
import { HEROES } from '../data/heroes';
import { migrateFinds } from '../data/collection';

const RUN_KEY = 'mv_run_v1';
const PROFILE_KEY = 'mv_profile_v1';
/** Старый формат «лучшего результата» — переносится в профиль один раз. */
const BEST_KEY = 'mv_best_v1';

/**
 * Профиль игрока: живёт между забегами и переживает смену SAVE_VERSION.
 * Хранит общую статистику, найденные предметы и открытые записи бестиария.
 */
export interface Profile {
  runs: number;
  victories: number;
  /** Пройдено комнат в лучшем забеге. */
  furthest: number;
  furthestHero: string;
  kills: number;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  /** Забегов и побед по каждому герою. */
  heroRuns: Record<string, number>;
  heroWins: Record<string, number>;
  /**
   * Нераспечатанные сундуки за забеги. Экран сундука убран (ADR 0002), счётчик копится дальше:
   * вернётся экран — вернутся и сундуки за сыгранные тем временем забеги.
   */
  chests: number;
  /** Ключи находок каталога: «weapon:sword», «potion:heal_potion», у артефактов с тиром — «art:fireball@2». */
  collection: string[];
  /** id врагов, которые хоть раз показались в бою — открытые записи бестиария. */
  bestiary: string[];
}

function emptyProfile(): Profile {
  return {
    runs: 0,
    victories: 0,
    furthest: 0,
    furthestHero: '',
    kills: 0,
    turns: 0,
    damageDealt: 0,
    damageTaken: 0,
    heroRuns: {},
    heroWins: {},
    chests: 0,
    collection: [],
    bestiary: [],
  };
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
    // Героя убрали из игры — такой забег не продолжить.
    if (!HEROES[run.hero.defId]) return null;
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

export function loadProfile(): Profile {
  const p = emptyProfile();
  try {
    const raw = storage()?.getItem(PROFILE_KEY);
    if (raw) {
      const saved = { ...p, ...(JSON.parse(raw) as Partial<Profile>) };
      saved.collection = migrateFinds(saved.collection);
      return saved;
    }
    // первый запуск после обновления: подтянуть старую запись о забегах
    const old = storage()?.getItem(BEST_KEY);
    if (old) {
      const b = JSON.parse(old) as Partial<Profile>;
      p.runs = b.runs ?? 0;
      p.victories = b.victories ?? 0;
      p.furthest = b.furthest ?? 0;
      p.furthestHero = b.furthestHero ?? '';
    }
  } catch {
    /* ignore */
  }
  return p;
}

export function saveProfile(p: Profile): Profile {
  try {
    storage()?.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
  return p;
}

/** Забег закончился: копим общую статистику. Сундук за прохождение по-прежнему начисляется впрок (см. chests). */
export function recordResult(run: RunState): Profile {
  const p = loadProfile();
  const hero = run.hero.defId;
  p.runs += 1;
  p.heroRuns[hero] = (p.heroRuns[hero] ?? 0) + 1;
  if (run.phase === 'victory') {
    p.victories += 1;
    p.heroWins[hero] = (p.heroWins[hero] ?? 0) + 1;
  }
  if (run.stats.roomsCleared > p.furthest) {
    p.furthest = run.stats.roomsCleared;
    p.furthestHero = hero;
  }
  p.kills += run.stats.kills;
  p.turns += run.stats.turns;
  p.damageDealt += run.stats.damageDealt;
  p.damageTaken += run.stats.damageTaken;
  p.chests += 1;
  return saveProfile(p);
}

/** Записать находки забега в коллекцию. Список приходит уже без дубликатов и уже открытого (см. loadoutFinds). */
export function recordFinds(keys: string[]): Profile {
  const p = loadProfile();
  for (const key of keys) if (!p.collection.includes(key)) p.collection.push(key);
  return saveProfile(p);
}

/** Записать встреченных врагов в бестиарий. Список приходит уже без дубликатов и уже открытых. */
export function recordEnemies(ids: string[]): Profile {
  const p = loadProfile();
  for (const id of ids) if (!p.bestiary.includes(id)) p.bestiary.push(id);
  return saveProfile(p);
}
