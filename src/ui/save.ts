import type { RunState } from '../engine/types';
import { SAVE_VERSION } from '../engine/types';
import type { Difficulty, HeroDef } from '../engine/types';
import { DEFAULT_DIFFICULTY, isDifficulty } from '../data/boons';
import { HEROES, HERO_LIST, defaultSignature } from '../data/heroes';
import { migrateFinds } from '../data/collection';
import { HERO_MASTERY, LOCKED, UNLOCK_LEVEL, achievementKey, legacyXp, lockedArtifacts, masteryLevel, runXp, type MasteryState } from '../data/mastery';

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
  /** Анонимный id игрока для статистики забегов (telemetry.ts): случайная строка, ставится один раз при первом чтении профиля. */
  playerId: string;
  /** Персональный артефакт, выбранный для каждого героя на экране выбора (v0.33); нет записи — первый из пары. */
  sigPick: Record<string, string>;
  /** id персональных артефактов, открытых мимо победы — отладочный `mv.unlockAll()`; обычное открытие — по `heroWins`. */
  unlocks: string[];
  /** Опыт мастерства по героям (v0.45); уровень — функция от опыта (data/mastery.ts), не хранится. */
  heroXp: Record<string, number>;
  /** Достижения наборов (v0.45): `set3:blood` — собран набор 3/3, `boss3:blood` — побеждён босс с ним. Открывают закрытые артефакты. */
  achievements: string[];
  /** Выбранная черта по героям (v0.45); нет записи — первая. */
  traitPick: Record<string, string>;
  /** Выбранное стартовое оружие по героям (v0.45); нет записи — родное. */
  startPick: Record<string, string>;
  /** Отладка `mv.unlockAll()`: открыто всё мастерство — черты, старты, закрытые артефакты. */
  allUnlocked?: boolean;
  /** Сложность последнего забега: с неё начинается следующий выбор на экране героя. Нет — «Средний». */
  difficulty?: Difficulty;
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
    playerId: '',
    sigPick: {},
    unlocks: [],
    heroXp: {},
    achievements: [],
    traitPick: {},
    startPick: {},
  };
}

/** С какой сложностью пойдёт следующий забег: выбор из профиля, иначе «Средний». */
export function pickedDifficulty(p: Profile): Difficulty {
  return isDifficulty(p.difficulty) ? p.difficulty : DEFAULT_DIFFICULTY;
}

/** Запомнить выбор сложности: он общий для всех героев. */
export function saveDifficulty(d: Difficulty): Profile {
  const p = loadProfile();
  p.difficulty = d;
  return saveProfile(p);
}

// ─── Мастерство (v0.45) ─────────────────────────────────────────────────────

/** Опыт героя; профиль до v0.45 получает его задним числом по сыгранным забегам и победам. */
export function heroXpOf(p: Profile, heroId: string): number {
  return p.heroXp[heroId] ?? legacyXp(p.heroRuns[heroId] ?? 0, p.heroWins[heroId] ?? 0);
}

export function heroLevelOf(p: Profile, heroId: string): number {
  return p.allUnlocked ? 5 : masteryLevel(heroXpOf(p, heroId));
}

/** Состояние мастерства для правил открытия артефактов (data/mastery.ts). */
export function masteryState(p: Profile): MasteryState {
  const heroXp: Record<string, number> = {};
  for (const h of HERO_LIST) heroXp[h.id] = heroXpOf(p, h.id);
  return { heroXp, achievements: p.achievements };
}

/** Какие артефакты закрыты для забега из этого профиля. */
export function lockedForRun(p: Profile): string[] {
  return p.allUnlocked ? [] : lockedArtifacts(masteryState(p));
}

/** Открыта ли вторая черта героя: мастерство 4 (или отладка). */
export function traitUnlocked(p: Profile, def: HeroDef, id: string): boolean {
  if (!def.traits.includes(id)) return false;
  return id === def.traits[0] || heroLevelOf(p, def.id) >= UNLOCK_LEVEL.trait;
}

export function pickedTrait(p: Profile, def: HeroDef): string {
  const pick = p.traitPick[def.id];
  return pick && traitUnlocked(p, def, pick) ? pick : def.traits[0];
}

/** Открыт ли вариант стартового оружия: мастерство 5. Родное открыто всегда. */
export function startUnlocked(p: Profile, def: HeroDef, base: string): boolean {
  if (base === def.weapon.base) return true;
  return HERO_MASTERY[def.id]?.start === base && heroLevelOf(p, def.id) >= UNLOCK_LEVEL.start;
}

export function pickedStart(p: Profile, def: HeroDef): string {
  const pick = p.startPick[def.id];
  return pick && startUnlocked(p, def, pick) ? pick : def.weapon.base;
}

export function savePick(kind: 'traitPick' | 'startPick', heroId: string, id: string): Profile {
  const p = loadProfile();
  p[kind] = { ...p[kind], [heroId]: id };
  return saveProfile(p);
}

/** Что открыл забег — для экрана итогов. */
export interface RunUnlocks {
  hero: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  /** Новые достижения наборов и артефакты, которые они открыли. */
  artifacts: string[];
}

/**
 * Записать достижения наборов забега (в том числе посреди забега — App.render) и вернуть артефакты, которые открылись.
 * Мастерство героя растёт только в конце забега (recordResult).
 */
export function recordAchievements(run: RunState): { profile: Profile; opened: string[] } {
  const p = loadProfile();
  const before = new Set(lockedArtifacts(masteryState(p)));
  let changed = false;
  for (const arch of run.setsReached ?? []) {
    const key = achievementKey('set', arch);
    if (!p.achievements.includes(key)) {
      p.achievements.push(key);
      changed = true;
    }
  }
  for (const arch of run.bossSets ?? []) {
    const key = achievementKey('boss', arch);
    if (!p.achievements.includes(key)) {
      p.achievements.push(key);
      changed = true;
    }
  }
  if (!changed) return { profile: p, opened: [] };
  const after = new Set(lockedArtifacts(masteryState(p)));
  return { profile: saveProfile(p), opened: [...before].filter((id) => !after.has(id) && LOCKED[id]) };
}

/**
 * Открыт ли персональный артефакт героя: первый из пары — всегда, второй — после победы этим героем
 * (или отладочным `unlocks`). Чужие id закрыты.
 */
export function signatureUnlocked(p: Profile, def: HeroDef, id: string): boolean {
  if (!def.signatures.includes(id)) return false;
  // v0.45: мастерство 2 или первая победа — что раньше.
  return id === def.signatures[0] || (p.heroWins[def.id] ?? 0) > 0 || p.unlocks.includes(id) || heroLevelOf(p, def.id) >= UNLOCK_LEVEL.signature;
}

/** С каким персональным артефактом герой пойдёт в забег: выбор из профиля, если он открыт, иначе первый из пары. */
export function pickedSignature(p: Profile, def: HeroDef): string {
  const pick = p.sigPick[def.id];
  return pick && signatureUnlocked(p, def, pick) ? pick : defaultSignature(def);
}

/** Запомнить выбор персонального артефакта героя. */
export function saveSignaturePick(heroId: string, id: string): Profile {
  const p = loadProfile();
  p.sigPick = { ...p.sigPick, [heroId]: id };
  return saveProfile(p);
}

/** Отладка: открыть вторые персональные артефакты всем героям (`mv.unlockAll()` в консоли); `unlockAll(false)` закрывает обратно. */
export function setAllUnlocked(on: boolean): Profile {
  const p = loadProfile();
  p.unlocks = on ? HERO_LIST.map((h) => h.signatures[1]) : [];
  p.allUnlocked = on;
  return saveProfile(p);
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
  const p = readProfile();
  // id ставится один раз и сразу пишется, чтобы все чтения профиля до первого сохранения видели один и тот же
  if (!p.playerId) {
    p.playerId = newPlayerId();
    saveProfile(p);
  }
  return p;
}

/** UUID, где он есть (https и localhost), иначе время и случайный хвост. */
function newPlayerId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* нет crypto — ниже */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readProfile(): Profile {
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

/** Забег закончился: копим общую статистику и мастерство. Сундук за прохождение по-прежнему начисляется впрок (см. chests). */
export function recordResult(run: RunState): { profile: Profile; unlocks: RunUnlocks } {
  const ach = recordAchievements(run);
  const p = ach.profile;
  const hero = run.hero.defId;
  const xpBefore = heroXpOf(p, hero);
  const xpGained = runXp(run);
  const lockedBefore = new Set(lockedArtifacts(masteryState(p)));
  p.heroXp = { ...p.heroXp, [hero]: xpBefore + xpGained };
  const lockedAfter = new Set(lockedArtifacts(masteryState(p)));
  const byMastery = [...lockedBefore].filter((id) => !lockedAfter.has(id));
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
  const unlocks: RunUnlocks = {
    hero,
    xpGained,
    levelBefore: masteryLevel(xpBefore),
    levelAfter: masteryLevel(xpBefore + xpGained),
    artifacts: [...ach.opened, ...byMastery],
  };
  return { profile: saveProfile(p), unlocks };
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
