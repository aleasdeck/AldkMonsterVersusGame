import type { ArchetypeId, ArtifactInstance, StatMods } from '../engine/types';
import { ARTIFACTS } from './artifacts';

// ─── Архетипы сборок (v0.43) ────────────────────────────────────────────────
// docs/plan-reworka.md §2. Метка на артефакте говорит, в чей набор он идёт; две и три вещи одного архетипа в сокетах
// (с фазы 3 — ещё и врождённый навык героя) включают бонус набора. Бонус — такие же статы, как у пассивок: считается
// в computeStats и живёт в DerivedStats, поэтому бой, лист персонажа и бот видят его без отдельной механики.
// Порог 4 недостижим: к середине второго акта у героя 2 + 2 сокета, и сигнатура занимает один из них.

/** Бонус набора: статы и строка для листа персонажа и подсказки. */
export interface SetBonus {
  mods: StatMods;
  text: string;
}

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  /** Значок метки на карточке и в листе персонажа. */
  glyph: string;
  color: string;
  /** Суть архетипа одной фразой — для подсказки метки. */
  desc: string;
  /** Бонусы за 2 и 3 вещи. Архетип без бонусов (ещё не введён) метку носит, но набора не даёт. */
  sets: Partial<Record<2 | 3, SetBonus>>;
}

const list: ArchetypeDef[] = [
  {
    id: 'blood',
    name: 'Кровь',
    glyph: '♦',
    color: '#e63946',
    desc: 'Много мелких ударов копят Кровотечение, выплата вскрывает его разом. Ближний бой, одна цель.',
    sets: {
      2: { mods: { bleedAdd: 1 }, text: 'каждое Кровотечение от героя сильнее на 1' },
      // Бой идёт 2–3 хода (v0.42), заводка не успевала окупиться — второй тик за ход окупает её в тот же ход.
      3: { mods: { bleedTwice: 1 }, text: 'Кровотечение на врагах тикает дважды: в их ход и ещё раз перед вашим' },
    },
  },
  {
    id: 'fire',
    name: 'Огонь',
    glyph: '▲',
    color: '#ff7b00',
    desc: 'Поджечь всех, раздуть и взорвать. Заклинания, мана, площадь.',
    sets: {
      2: { mods: { burnAdd: 1 }, text: 'каждое Горение от героя сильнее на 1' },
      3: { mods: { burnSpread: 1 }, text: 'погибший горящий враг поджигает остальных своим Горением' },
    },
  },
  {
    id: 'poison',
    name: 'Яд',
    glyph: '◉',
    color: '#7ddc5a',
    desc: 'Медленный яд по всем: растёт, расходится и ослабляет врага. Защитная связка — отравленный бьёт слабее.',
    sets: {
      2: { mods: { poisonAdd: 1 }, text: 'каждый Яд от героя сильнее на 1' },
      3: { mods: { poisonWeaken: 0.25 }, text: 'отравленный враг бьёт на 25 % слабее' },
    },
  },
  {
    id: 'shield',
    name: 'Щит',
    glyph: '■',
    color: '#8ecae6',
    desc: 'Копить блок и превращать его в урон: Таран, Обвал щита, удары сильнее за стоящий блок.',
    sets: {
      2: { mods: { blockSkillAdd: 2 }, text: '«Защититься» и каждый приём с блоком дают ещё +2 Блока' },
      3: { mods: { blockToDmg: 0.2 }, text: 'удары оружием сильнее на 20 % текущего Блока' },
    },
  },
  {
    id: 'retribution',
    name: 'Возмездие',
    glyph: '✱',
    color: '#c9ccd1',
    desc: 'Пусть бьют: шипы и ответные удары наказывают атакующего, Око за око возвращает полученное.',
    sets: {
      2: { mods: { thorns: 2 }, text: '+2 к Шипам героя' },
      3: { mods: { thornsAll: 1 }, text: 'Шипы колют всех врагов, а не только ударившего' },
    },
  },
  {
    id: 'light',
    name: 'Свет',
    glyph: '✦',
    color: '#ffe9a0',
    desc: 'Лечение, которое не пропадает: избыток становится блоком, а свет — уроном.',
    sets: {
      2: { mods: { healAdd: 1 }, text: 'каждое лечение героя сильнее на 1' },
      3: { mods: { healSmite: 1 }, text: 'каждое лечение жжёт первого врага на столько же (не добивает)' },
    },
  },
  {
    id: 'series',
    name: 'Серия',
    glyph: '»',
    color: '#f4a261',
    desc: 'Много ударов обычной атакой за ход: каждый следующий сильнее, выплаты считают удары.',
    sets: {
      // v0.55.6: 15 % и первый удар без стамины вместо 5 % и каждого третьего — прежний набор почти ничего не давал.
      2: { mods: { fatigue: 0.15 }, text: 'усталость мягче на 15 %' },
      3: { mods: { firstFree: 1 }, text: 'первый удар оружием в ходу не тратит стамину' },
    },
  },
  {
    id: 'shadow',
    name: 'Тень',
    glyph: '☾',
    color: '#b388ff',
    desc: 'Редкий, но смертельный удар: тень, Верный глаз и крит.',
    sets: {
      2: { mods: { crit: 0.15 }, text: '+15 % к шансу крита' },
      3: { mods: { critSta: 1, critDmg: 30 }, text: 'крит. урон +30 %; крит возвращает 1 STA (раз в ход)' },
    },
  },
  {
    id: 'cold',
    name: 'Холод',
    glyph: '❄',
    color: '#7fd7ff',
    desc: 'Копить Холод, заморозить и расколоть: три Холода — враг цепенеет и пропускает ход. Контроль, а не урон.',
    sets: {
      2: { mods: { coldAdd: 1 }, text: 'каждый Холод от героя сильнее на 1' },
      3: { mods: { freezeVuln: 1 }, text: 'оцепеневший враг получает Уязвимость на 2 хода' },
    },
  },
  {
    // v0.56 (вариант Б «Свора», tools/summon-proto): существа из data/allies.ts. Значок — тот же, что у пустого места союзника в бою.
    id: 'summon',
    name: 'Призыв',
    glyph: '☍',
    color: '#5ee6c8',
    desc: 'Существа рядом с героем: призвать, усилить всех разом и пустить в ход — приказом или жертвой. Держат удары врагов.',
    sets: {
      2: { mods: { allyHp: 6, allyDmg: 1 }, text: 'существа появляются с +6 HP и бьют на +1' },
      3: { mods: { allyTwice: 1 }, text: 'каждый удар существа повторяется' },
    },
  },
  {
    // Doom Некробиндера из StS2, вариант А+ со страницы tools/curse-proto. Магический: все приёмы — заклинания за ману.
    id: 'curse',
    name: 'Проклятье',
    glyph: '☠',
    color: '#d96ce6',
    desc: 'Проклятье копится на враге и не убывает; если после своего хода у врага HP не выше Проклятья, он гибнет. Заклинания: проклясть всех, закрыться и дать им умереть.',
    sets: {
      2: { mods: { curseAdd: 2 }, text: 'каждое Проклятье от героя сильнее на 2' },
      3: { mods: { curseSpread: 1 }, text: 'павший от Проклятья передаёт половину его живым врагам и возвращает 1 MP' },
    },
  },
];

export const ARCHETYPE_LIST: ArchetypeDef[] = list;
export const ARCHETYPES = Object.fromEntries(list.map((a) => [a.id, a])) as Record<ArchetypeId, ArchetypeDef>;

export function archetypeDef(id: ArchetypeId): ArchetypeDef {
  const def = ARCHETYPES[id];
  if (!def) throw new Error(`Unknown archetype: ${id}`);
  return def;
}

/** Метки артефакта по id; у общих — пусто. */
export function artifactTags(id: string): ArchetypeId[] {
  return ARTIFACTS[id]?.tags ?? [];
}

/** Сколько вещей каждого архетипа у героя: каждый артефакт считается один раз за каждую свою метку. */
export function archetypeCounts(arts: ArtifactInstance[]): Partial<Record<ArchetypeId, number>> {
  const out: Partial<Record<ArchetypeId, number>> = {};
  for (const a of arts) for (const tag of artifactTags(a.id)) out[tag] = (out[tag] ?? 0) + 1;
  return out;
}

/** Действующий бонус набора: архетип, сколько вещей и какие пороги сработали. */
export interface ActiveSet {
  arch: ArchetypeDef;
  count: number;
  bonuses: SetBonus[];
}

/** Наборы, в которых сработал хотя бы порог 2 (у архетипа без бонусов — никогда). */
export function activeSets(counts: Partial<Record<ArchetypeId, number>>): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const arch of list) {
    const count = counts[arch.id] ?? 0;
    const bonuses = ([2, 3] as const).filter((n) => count >= n && arch.sets[n]).map((n) => arch.sets[n]!);
    if (bonuses.length > 0) out.push({ arch, count, bonuses });
  }
  return out;
}

/** Статы всех сработавших бонусов наборов — прибавляются в computeStats после пассивок. */
export function setMods(counts: Partial<Record<ArchetypeId, number>>): StatMods[] {
  return activeSets(counts).flatMap((s) => s.bonuses.map((b) => b.mods));
}
