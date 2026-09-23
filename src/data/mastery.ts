import type { ArchetypeId, RunState } from '../engine/types';
import { ARTIFACTS } from './artifacts';
import { ARCHETYPES } from './archetypes';
import { HERO_LIST, heroDef } from './heroes';

// ─── Метапрогрессия: мастерство героя и открытия (v0.45) ───────────────────────
// docs/plan-reworka.md §6, решение пользователя: вариант A + B. Мета горизонтальная — растёт разнообразие, а не сила:
// прибавок к статам между забегами нет, поэтому коридор бота и плейтест значат одно и то же. Здесь — чистые данные и
// правила; профиль (что накоплено) живёт в ui/save.ts, движок получает только список закрытых вещей забега.

/** Порог опыта для уровня: индекс — уровень − 1. Выше 5 — только косметика (позже). */
export const MASTERY_LEVELS = [0, 40, 100, 180, 300];
export const MAX_MASTERY = MASTERY_LEVELS.length;

/** Уровень мастерства по опыту: 1..5. */
export function masteryLevel(xp: number): number {
  let level = 1;
  for (let i = 0; i < MASTERY_LEVELS.length; i++) if (xp >= MASTERY_LEVELS[i]) level = i + 1;
  return level;
}

/** Сколько опыта нужно до следующего уровня; null — уровень максимальный. */
export function nextLevelXp(level: number): number | null {
  return level < MAX_MASTERY ? MASTERY_LEVELS[level] : null;
}

/**
 * Опыт за забег: пройденные клетки (до 30), 10 за каждого побеждённого босса, 20 за победу.
 * Победный забег даёт около 80, гибель во втором акте — около 25.
 */
export function runXp(run: RunState): number {
  const rooms = Math.min(30, run.stats.roomsCleared);
  const bosses = run.logs.filter((l) => l.kind === 'boss' && l.result === 'won').length;
  return rooms + bosses * 10 + (run.phase === 'victory' ? 20 : 0);
}

/**
 * Опыт задним числом для профиля до v0.45: забеги и победы героя уже сыграны — мастерство не начинается с нуля.
 * Достижения наборов задним числом не считаются: сборок прошлых забегов профиль не помнит.
 */
export function legacyXp(runs: number, wins: number): number {
  return runs * 15 + wins * 40;
}

/** Что открывает каждый уровень героя (только для этого героя, кроме ключевой вещи — она в общий пул). */
export interface HeroMastery {
  /** Уровень 3: ключевая вещь первого сродства героя попадает в общий пул для всех героев. */
  keystone: string;
  /** Уровень 4: вторая черта на выбор перед забегом. */
  trait: string;
  /** Уровень 5: вариант стартового оружия — база из gear.ts. */
  start: string;
}

export const HERO_MASTERY: Record<string, HeroMastery> = {
  warrior: { keystone: 'bastion', trait: 'guard', start: 'hammer' },
  mage: { keystone: 'pyromancer', trait: 'overheat', start: 'wand' },
  assassin: { keystone: 'toxicologist', trait: 'prey', start: 'dagger' },
  paladin: { keystone: 'vow', trait: 'redemption', start: 'spear' },
  berserk: { keystone: 'recklessness', trait: 'thirst', start: 'whip' },
  archer: { keystone: 'cold_blood', trait: 'ambush', start: 'crossbow' },
};

/** Уровень, на котором открывается каждая награда мастерства. */
export const UNLOCK_LEVEL = { signature: 2, keystone: 3, trait: 4, start: 5 } as const;

// ─── Закрытые артефакты (B) ─────────────────────────────────────────────────
// Стартовый пул меньше: ключевые вещи и глубокие выплаты открываются игрой. Новичку меньший пул помогает находить связки
// (условие 4 формулы, ADR 0003), опытному есть за чем охотиться. Правило: в каждом архетипе открыто не меньше четырёх вещей
// (с навыком героя), иначе набор 3/3 для открытия выплаты не собрать.

/** Как открывается закрытый артефакт: мастерством героя (уровень 3), набором 3/3 в забеге или победой над боссом с набором 3/3. */
export type UnlockHow = { kind: 'mastery'; hero: string } | { kind: 'set'; arch: ArchetypeId } | { kind: 'boss'; arch: ArchetypeId };

const LOCKED_LIST: { id: string; how: UnlockHow }[] = [
  { id: 'blood_bath', how: { kind: 'set', arch: 'blood' } },
  { id: 'blood_oath', how: { kind: 'boss', arch: 'blood' } },
  { id: 'incinerate', how: { kind: 'set', arch: 'fire' } },
  // Ключевые вещи героев — мастерством 3 (HERO_MASTERY), пока артефакта нет в данных, строки не появляется.
  ...Object.entries(HERO_MASTERY).map(([hero, m]) => ({ id: m.keystone, how: { kind: 'mastery', hero } as UnlockHow })),
];

/** Закрытые артефакты: только те, что есть в данных (ключевые вещи будущих архетипов появятся вместе с ними). */
export const LOCKED: Record<string, UnlockHow> = Object.fromEntries(LOCKED_LIST.filter((x) => ARTIFACTS[x.id]).map((x) => [x.id, x.how]));

/** Ключ достижения набора: `set3:blood` — собрать 3/3, `boss3:blood` — победить босса с набором 3/3. */
export function achievementKey(kind: 'set' | 'boss', arch: ArchetypeId): string {
  return `${kind === 'set' ? 'set3' : 'boss3'}:${arch}`;
}

/** Что накоплено в профиле — ровно то, что нужно правилам открытия. */
export interface MasteryState {
  heroXp: Record<string, number>;
  achievements: string[];
}

/** Открыт ли закрытый артефакт; незакрытые открыты всегда. */
export function artifactUnlocked(m: MasteryState, id: string): boolean {
  const how = LOCKED[id];
  if (!how) return true;
  if (how.kind === 'mastery') return masteryLevel(m.heroXp[how.hero] ?? 0) >= UNLOCK_LEVEL.keystone;
  return m.achievements.includes(achievementKey(how.kind, how.arch));
}

/** Какие артефакты ещё закрыты — этот список уходит в забег (`HeroPersistent.locked`), закрытые не выпадают. */
export function lockedArtifacts(m: MasteryState): string[] {
  return Object.keys(LOCKED).filter((id) => !artifactUnlocked(m, id));
}

/** Как открыть закрытый артефакт — строка для коллекции и подсказок. */
export function unlockText(id: string): string {
  const how = LOCKED[id];
  if (!how) return '';
  if (how.kind === 'mastery') return `Мастерство героя «${heroDef(how.hero).name}» ${UNLOCK_LEVEL.keystone}`;
  const arch = ARCHETYPES[how.arch];
  return how.kind === 'set' ? `Собрать набор «${arch.name}» 3/3 в забеге` : `Победить босса с набором «${arch.name}» 3/3`;
}

/** Что откроет следующий уровень героя — для панели мастерства. */
export function nextUnlockText(heroId: string, level: number): string | null {
  const m = HERO_MASTERY[heroId];
  const def = heroDef(heroId);
  switch (level + 1) {
    case UNLOCK_LEVEL.signature:
      return `второй врождённый навык (${ARTIFACTS[def.signatures[1]]?.name ?? def.signatures[1]})`;
    case UNLOCK_LEVEL.keystone:
      return ARTIFACTS[m.keystone] ? `ключевая вещь «${ARTIFACTS[m.keystone].name}» в общий пул` : 'ключевая вещь архетипа в общий пул';
    case UNLOCK_LEVEL.trait:
      return 'вторая черта на выбор';
    case UNLOCK_LEVEL.start:
      return 'вариант стартового оружия';
    default:
      return null;
  }
}

/** Все герои с их наградами мастерства — для проверок в тестах. */
export const MASTERY_HEROES = HERO_LIST.map((h) => h.id);
