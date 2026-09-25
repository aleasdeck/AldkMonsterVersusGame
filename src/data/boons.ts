import type { Difficulty, LocationId } from '../engine/types';
import { trialValue } from './trials';

// ─── Сложность забега и благословения локаций ─────────────────────────────
// Сложность выбирается перед забегом (решение пользователя): «Сложный» — испытание перед каждой локацией (v0.48, trials.ts),
// «Средний» — без выбора, «Лёгкий» — благословение перед каждой локацией по образцу испытаний: по три на локацию,
// два случайных на выбор, одно обязательно, действует до конца локации. Благословения тематические и во многом зеркальны
// испытаниям своей локации («Стая» — «Волчий друг», «Кислота» — …); выбор — «что больше поможет моей сборке».
// Правила живут в движке (combat.ts, run.ts) по id, как у испытаний; здесь — подписи и числа.

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  glyph: string;
  color: string;
  /** Что происходит перед каждой локацией — строка подсказки. */
  desc: string;
}

/** Порядок — слева направо на экране выбора героя. */
export const DIFFICULTY_LIST: DifficultyDef[] = [
  { id: 'easy', name: 'Лёгкий', glyph: '✦', color: '#80ed99', desc: 'Перед каждой локацией — благословение: одно из двух на выбор, действует до конца локации' },
  { id: 'normal', name: 'Средний', glyph: '◆', color: '#ffd166', desc: 'Перед локациями ничего не выбирать: забег как есть' },
  { id: 'hard', name: 'Сложный', glyph: '☠', color: '#ff9f6b', desc: 'Перед каждой локацией — испытание: одно из двух на выбор, действует до конца локации' },
];

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = Object.fromEntries(DIFFICULTY_LIST.map((d) => [d.id, d])) as Record<Difficulty, DifficultyDef>;

/** Сложность нового профиля и забега без выбора. */
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export function isDifficulty(id: unknown): id is Difficulty {
  return typeof id === 'string' && id in DIFFICULTIES;
}

export interface BoonDef {
  id: string;
  location: LocationId;
  name: string;
  glyph: string;
  /** Что делает — строка карточки и подсказки чипа; числа этого акта (растут с актом, как у испытаний, — `trialValue`). */
  desc: (act: number) => string;
  /** Кому помогает — подсказка к выбору. */
  hint: string;
}

/** «Волчий друг»: HP волка-союзника по акту — растёт, как свисток на тирах 1–3, иначе в третьем акте он падает с первого удара. */
export function wolfFriendHp(act: number): number {
  return 12 + [0, 6, 12][Math.max(0, Math.min(2, act))];
}
/** «Бортовой залп»: доля максимума HP, которую каждый третий ход теряют враги (зеркало «Канонады» — только по врагам). */
export const BROADSIDE_PCT = 0.1;
/** «Святая вода»: лечение героя сильнее во столько раз (зеркало «Проклятия склепа»). */
export const HOLY_WATER_MULT = 1.5;
/** «Закалка»: «Защититься» сильнее во столько раз (зеркало «Раскалённого доспеха»). */
export const TEMPERED_MULT = 1.3;

const list: BoonDef[] = [
  // ═══ Лес ═══
  { id: 'wolf_friend', location: 'forest', name: 'Волчий друг', glyph: '♞', desc: (act) => `В каждом бою рядом с героем сражается Волк (${wolfFriendHp(act)} HP): враги бьют его первым`, hint: 'Помогает всем: волк принимает первые удары на себя' },
  { id: 'tracker', location: 'forest', name: 'Следопыт', glyph: '➶', desc: () => 'В первый ход боя все враги Уязвимы', hint: 'Помогает Серии, Тени и площади — тем, кто решает бой первым ходом' },
  { id: 'herbs', location: 'forest', name: 'Целебные травы', glyph: '✿', desc: (act) => `После каждого выигранного боя герой лечится на ${trialValue(4, act)} HP`, hint: 'Помогает тем, кому нечем лечиться в бою' },
  // ═══ Болота ═══
  { id: 'miasma', location: 'swamp', name: 'Болотный смрад', glyph: '☣', desc: (act) => `Все враги начинают бой с Ядом ${trialValue(2, act)} на 3 хода`, hint: 'Помогает Яду и долгим боям' },
  { id: 'hummock', location: 'swamp', name: 'Кочки', glyph: '≋', desc: () => 'В первый ход боя +1 STA', hint: 'Помогает ударам оружием и Серии: лишнее действие в самый нужный ход' },
  { id: 'wisp_guide', location: 'swamp', name: 'Добрые огни', glyph: '✧', desc: () => 'Герой начинает каждый бой с Уклонением от одной атаки', hint: 'Помогает хрупким: первый удар врага уйдёт мимо' },
  // ═══ Склеп ═══
  { id: 'soul_harvest', location: 'crypt', name: 'Жатва душ', glyph: '☥', desc: (act) => `Каждый убитый враг лечит героя на ${trialValue(2, act)} HP`, hint: 'Помогает площади: чем больше смертей, тем больше лечения' },
  { id: 'shroud', location: 'crypt', name: 'Саван', glyph: '❅', desc: () => 'Все враги начинают бой со Слабостью на 2 хода', hint: 'Помогает всем, особенно тем, кто держит удар блоком' },
  { id: 'holy_water', location: 'crypt', name: 'Святая вода', glyph: '✝', desc: () => 'Лечение героя в полтора раза сильнее', hint: 'Помогает Свету и вампиризму' },
  // ═══ Улей ═══
  { id: 'chitin', location: 'hive', name: 'Хитин', glyph: '✵', desc: (act) => `Герой начинает бой с Шипами ${trialValue(2, act)}`, hint: 'Помогает Возмездию и блоку: каждый удар по герою ранит бьющего' },
  { id: 'royal_jelly', location: 'hive', name: 'Маточное молочко', glyph: '◌', desc: (act) => `Герой начинает бой с Регенерацией ${trialValue(1, act)} до конца боя`, hint: 'Помогает долгим боям и тем, кто пережидает за блоком' },
  { id: 'stinger', location: 'hive', name: 'Жало', glyph: '⚚', desc: () => 'Первый удар героя в каждом бою — наверняка критический', hint: 'Помогает крит-сборкам и тяжёлому оружию' },
  // ═══ Пещеры огня ═══
  { id: 'forge_heat', location: 'caves', name: 'Жар горна', glyph: '☀', desc: (act) => `Все враги начинают бой с Горением ${trialValue(2, act)} на 2 хода`, hint: 'Помогает Огню: горящие враги — повод для выплат' },
  { id: 'lava_veins', location: 'caves', name: 'Лавовые жилы', glyph: '♨', desc: (act) => `Каждый убитый враг опаляет живых: ${trialValue(3, act)} урона мимо блока (не добивает)`, hint: 'Помогает тем, кто убивает по одному: каждая смерть бьёт остальных' },
  { id: 'tempered', location: 'caves', name: 'Закалка', glyph: '▣', desc: () => '«Защититься» даёт на 30 % больше блока', hint: 'Помогает Щиту и тем, кто защищается' },
  // ═══ Корабль ═══
  { id: 'tailwind', location: 'ship', name: 'Попутный ветер', glyph: '〰', desc: () => 'Со второго хода боя +1 MP в начале каждого хода', hint: 'Помогает заклинаниям; герою без маны не даст ничего' },
  { id: 'plunder', location: 'ship', name: 'Абордажный азарт', glyph: '⚓', desc: () => 'Каждый убитый враг даёт герою +1 к Силе до конца боя', hint: 'Помогает ударам оружием в боях с несколькими врагами' },
  { id: 'broadside', location: 'ship', name: 'Бортовой залп', glyph: '✹', desc: () => 'В начале каждого третьего хода все враги теряют 10 % максимума HP (не добивает)', hint: 'Помогает долгим боям и против боссов' },
];

export const BOONS: Record<string, BoonDef> = Object.fromEntries(list.map((b) => [b.id, b]));
export const BOON_LIST: BoonDef[] = list;

export function boonDef(id: string): BoonDef {
  const def = BOONS[id];
  if (!def) throw new Error(`Unknown boon: ${id}`);
  return def;
}

/** Благословения локации — три, из них перед локацией показывают два случайных. */
export function boonsOf(loc: LocationId): BoonDef[] {
  return list.filter((b) => b.location === loc);
}
