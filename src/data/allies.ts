import type { ArtTier, EnemyAction } from '../engine/types';

// ─── Существа героя (v0.56, архетип «Призыв») ───────────────────────────────
// Союзник — не копия врага: числа врага записаны под его «родной» акт (скелет-воин Склепа — под третий), а существу нужны
// свои, растущие с тиром призывающего артефакта. Тир и есть рост по актам: артефакты выпадают тиром 1 в первом акте, 1–2
// во втором и 2–3 в третьем (решение пользователя — второго роста «по акту» существам не нужно). Шаг тира крутой и растит
// и HP, и удар: враги от первого акта к третьему крепнут почти втрое, и волк с прежними 12/16/20 HP и укусом 5 на всех тирах
// к третьему акту падал с двух ударов и ничего не решал.
//
// Ходят существа сами после хода героя, по кругу `order`, и принимают на себя обычные удары врагов (combat.ts, actAlly).
// Лепку и спрайт берут у врага того же вида (`look`): лист зеркалится, как у волка до v0.56.
//
// HP у существ нарочно невелики, а набор «Призыв» 2 даёт +6: одиночный призыв «на всякий случай» в чужой сборке — щит
// на один-два удара, а сила — у того, кто собирает существ. Первый проход (скелет 16/26/38, оса 6/10/14 за 2 MP с КД 2,
// волк 12/20/30, набор +4) поднимал бота на +10 пунктов в среднем — призыв брали все как дешёвую защиту (GDD §13 v0.56).

const t = <T>(a: T, b: T, c: T) => (tier: ArtTier): T => [a, b, c][tier - 1];

export interface AllyDef {
  id: string;
  name: string;
  /** Враг, чья лепка и спрайт рисуют существо. */
  look: string;
  hp: (tier: ArtTier) => number;
  /** Приёмы существа по тиру призыва; эффекты — те же, что у врагов (attack, block, buffStr, heal, debuff на цель удара). */
  actions: (tier: ArtTier) => EnemyAction[];
  /** Круг: id приёмов по порядку, повторы разрешены. */
  order: string[];
  /** Круг словами для описания артефакта — из тех же чисел: «Укус 5, Укус 5, Вой — Сила +2 волкам». */
  circle: (tier: ArtTier) => string;
}

const WOLF_BITE = t(5, 7, 9);
const WOLF_HOWL = t(2, 2, 3);
const SKELETON_GUARD = t(4, 6, 8);
const SKELETON_HIT = t(3, 5, 7);
const WASP_STING = t(2, 3, 4);
const WASP_POISON = t(1, 1, 2);

const list: AllyDef[] = [
  {
    id: 'wolf',
    name: 'Волк',
    look: 'wolf',
    hp: t(10, 16, 24),
    actions: (tier) => [
      { id: 'bite', name: 'Укус', effects: [{ type: 'attack', amount: WOLF_BITE(tier) }] },
      { id: 'howl', name: 'Вой', effects: [{ type: 'buffStr', amount: WOLF_HOWL(tier), target: 'kind' }] },
    ],
    order: ['bite', 'bite', 'howl'],
    circle: (tier) => `Укус ${WOLF_BITE(tier)}, Укус ${WOLF_BITE(tier)}, Вой — Сила +${WOLF_HOWL(tier)} волкам`,
  },
  {
    // Страж: щит себе раз в круг держит удары, которые иначе пришли бы в героя.
    id: 'skeleton',
    name: 'Скелет',
    look: 'skeleton_warrior',
    hp: t(6, 10, 16),
    actions: (tier) => [
      { id: 'guard', name: 'Щит', effects: [{ type: 'block', amount: SKELETON_GUARD(tier), target: 'self' }] },
      { id: 'strike', name: 'Удар', effects: [{ type: 'attack', amount: SKELETON_HIT(tier) }] },
    ],
    order: ['guard', 'strike', 'strike'],
    circle: (tier) => `Щит — Блок ${SKELETON_GUARD(tier)} себе, Удар ${SKELETON_HIT(tier)}, Удар ${SKELETON_HIT(tier)}`,
  },
  {
    // Хрупкая и злая: жалит дважды каждый ход и травит цель — Яд существа считается Ядом героя (наборы Яда его растят).
    id: 'wasp',
    name: 'Оса',
    look: 'wasp',
    hp: t(4, 6, 9),
    actions: (tier) => [{ id: 'sting', name: 'Жало', effects: [{ type: 'attack', amount: WASP_STING(tier), hits: 2 }, { type: 'debuff', status: 'poison', value: WASP_POISON(tier), turns: -1 }] }],
    order: ['sting'],
    circle: (tier) => `каждый ход Жало ${WASP_STING(tier)} × 2 и Яд ${WASP_POISON(tier)} цели`,
  },
];

export const ALLY_LIST = list;
export const ALLIES: Record<string, AllyDef> = Object.fromEntries(list.map((a) => [a.id, a]));

export function allyDef(id: string): AllyDef {
  const def = ALLIES[id];
  if (!def) throw new Error(`Unknown ally: ${id}`);
  return def;
}

/** Приём существа по id на его тире. */
export function allyAction(def: AllyDef, tier: ArtTier, id: string): EnemyAction {
  const a = def.actions(tier).find((x) => x.id === id);
  if (!a) throw new Error(`Ally ${def.id} has no action ${id}`);
  return a;
}

/** Первый бьющий приём круга — его существо делает по приказу «Натравить». */
export function allyStrikeAction(def: AllyDef, tier: ArtTier): EnemyAction | null {
  for (const id of def.order) {
    const a = allyAction(def, tier, id);
    if (a.effects.some((e) => e.type === 'attack')) return a;
  }
  return null;
}
