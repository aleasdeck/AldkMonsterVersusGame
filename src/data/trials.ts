import type { LocationId } from '../engine/types';

// ─── Испытания локаций (v0.48) ─────────────────────────────────────────────
// docs/plan-reworka.md §4, ADR 0004 (решение пользователя: только тематические усложнения, по три на локацию, перед локацией
// два случайных, выбрать одно обязательно). Выбор — «что меньше бьёт по моей сборке», поэтому он зависит от сборки.
// Действует до конца локации. Сами правила живут в движке (combat.ts, run.ts) по id; здесь — подписи и числа.

export interface TrialDef {
  id: string;
  location: LocationId;
  name: string;
  glyph: string;
  /** Что делает — строка карточки и подсказки чипа; числа первого акта (растут с актом, см. `trialValue`). */
  desc: (act: number) => string;
  /** Кого бьёт и чем отвечать — подсказка к выбору. */
  hint: string;
}

/** Числа испытаний растут с актом, как урон врагов, но мягче: ×1 / ×1.5 / ×2. */
export function trialValue(base: number, act: number): number {
  return Math.max(1, Math.round(base * [1, 1.5, 2][Math.max(0, Math.min(2, act))]));
}

/** Доля максимума HP, которую раз в три хода снимает «Канонада». */
export const CANNONADE_PCT = 0.1;
/** «Кислота»: блок героя слабее на столько. */
export const ACID_BLOCK_MULT = 0.75;
/** «Раскалённый доспех»: «Защититься» слабее на столько. */
export const HOT_ARMOR_MULT = 0.7;
/** «Проклятие склепа»: лечение героя слабее на столько. */
export const CRYPT_CURSE_MULT = 0.5;

const list: TrialDef[] = [
  // ═══ Лес ═══
  { id: 'pack', location: 'forest', name: 'Стая', glyph: '♞', desc: () => 'В каждом бою, кроме босса, к врагам присоединяется Волк (если есть место)', hint: 'Бьёт всех понемногу; площадь и удары по всем отвечают' },
  { id: 'ambush', location: 'forest', name: 'Засада', glyph: '⚠', desc: () => 'В начале боя враги успевают сходить раньше героя', hint: 'Бьёт хрупких; блок и уклонение на старте боя отвечают' },
  { id: 'thicket', location: 'forest', name: 'Чаща', glyph: '♣', desc: () => 'В первый ход боя намерения врагов скрыты', hint: 'Бьёт того, кто считает точно: контроль и блок наугад' },
  // ═══ Болота ═══
  { id: 'mire', location: 'swamp', name: 'Трясина', glyph: '☣', desc: (act) => `Герой начинает каждый бой с Ядом ${trialValue(1, act)} на 3 хода`, hint: 'Бьёт долгие бои; Мазь знахаря и Травяной отвар отвечают' },
  { id: 'bog', location: 'swamp', name: 'Топь', glyph: '≋', desc: () => 'В первый ход боя −1 STA', hint: 'Бьёт Серию и Тень — тех, кто решает бой первым ходом' },
  { id: 'wisps', location: 'swamp', name: 'Болотные огни', glyph: '✧', desc: () => 'Каждый враг начинает бой с Уклонением от одной атаки', hint: 'Бьёт одиночные сильные удары; раны, заклинания и площадь отвечают' },
  // ═══ Склеп ═══
  { id: 'restless', location: 'crypt', name: 'Неупокоенные', glyph: '☥', desc: () => 'Первый убитый в бою враг (не босс) встаёт с половиной HP', hint: 'Бьёт прямой урон; раны и пожар Огня отвечают' },
  { id: 'grave_chill', location: 'crypt', name: 'Могильный холод', glyph: '❅', desc: () => 'Слабость на герое первые 2 хода боя', hint: 'Бьёт удары оружием; заклинания и раны отвечают' },
  { id: 'crypt_curse', location: 'crypt', name: 'Проклятие склепа', glyph: '✝', desc: () => 'Лечение героя вдвое слабее', hint: 'Бьёт Свет и вампиризм' },
  // ═══ Улей ═══
  { id: 'hive_thorns', location: 'hive', name: 'Рой', glyph: '✵', desc: (act) => `Все враги начинают бой с Шипами ${trialValue(1, act)}`, hint: 'Бьёт Серию и многоударные приёмы; заклинания и раны отвечают' },
  { id: 'acid', location: 'hive', name: 'Кислота', glyph: '⚗', desc: () => 'Блок героя на 25 % слабее', hint: 'Бьёт Щит; Возмездие и лечение отвечают' },
  { id: 'clutch', location: 'hive', name: 'Кладка', glyph: '◌', desc: () => 'В каждом бою, кроме босса, к врагам добавляется Кладка (если есть место)', hint: 'Бьёт медленные сборки; площадь отвечает' },
  // ═══ Пещеры огня ═══
  { id: 'heat', location: 'caves', name: 'Зной', glyph: '☀', desc: () => 'Герой начинает бой с Горением 1 на 3 хода, и Горение на нём тикает на 1 сильнее', hint: 'Бьёт всех; Жаропрочность и Мазь знахаря отвечают' },
  { id: 'fire_blood', location: 'caves', name: 'Огненная кровь', glyph: '♨', desc: (act) => `Каждый убитый враг поджигает героя: Горение ${trialValue(2, act)} на 2 хода`, hint: 'Бьёт Серию и площадь — много смертей за ход; блок и лечение отвечают' },
  { id: 'hot_armor', location: 'caves', name: 'Раскалённый доспех', glyph: '▣', desc: () => '«Защититься» даёт на 30 % меньше блока', hint: 'Бьёт Щит; нападение отвечает' },
  // ═══ Корабль ═══
  { id: 'rolling', location: 'ship', name: 'Качка', glyph: '〰', desc: () => 'В первый ход боя −1 STA и −1 MP', hint: 'Бьёт всех понемногу' },
  { id: 'boarding', location: 'ship', name: 'Абордаж', glyph: '⚓', desc: () => 'Каждая смерть врага даёт живым врагам +1 к Силе до конца боя', hint: 'Бьёт тех, кто убивает по одному; площадь и раны на всех отвечают' },
  { id: 'cannonade', location: 'ship', name: 'Канонада', glyph: '✹', desc: () => 'В начале каждого третьего хода все бойцы теряют 10 % максимума HP (не добивает)', hint: 'Бьёт долгие бои; напор отвечает' },
];

export const TRIALS: Record<string, TrialDef> = Object.fromEntries(list.map((t) => [t.id, t]));
export const TRIAL_LIST: TrialDef[] = list;

export function trialDef(id: string): TrialDef {
  const def = TRIALS[id];
  if (!def) throw new Error(`Unknown trial: ${id}`);
  return def;
}

/** Испытания локации — три, из них перед локацией показывают два случайных. */
export function trialsOf(loc: LocationId): TrialDef[] {
  return list.filter((t) => t.location === loc);
}
