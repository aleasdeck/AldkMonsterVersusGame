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
  { id: 'poison', name: 'Яд', glyph: '◉', color: '#7ddc5a', desc: 'Медленный яд по всем: растёт, расходится и ослабляет врага.', sets: {} },
  { id: 'shield', name: 'Щит', glyph: '■', color: '#8ecae6', desc: 'Копить блок и превращать его в урон.', sets: {} },
  { id: 'retribution', name: 'Возмездие', glyph: '✱', color: '#c9ccd1', desc: 'Пусть бьют: шипы и ответные удары наказывают атакующего.', sets: {} },
  { id: 'light', name: 'Свет', glyph: '✦', color: '#ffe9a0', desc: 'Лечение, которое не пропадает: избыток становится блоком и уроном.', sets: {} },
  { id: 'series', name: 'Серия', glyph: '»', color: '#f4a261', desc: 'Много ударов обычной атакой за ход: каждый следующий сильнее, выплаты считают удары.', sets: {} },
  { id: 'shadow', name: 'Тень', glyph: '☾', color: '#b388ff', desc: 'Редкий, но смертельный удар: тень, прицел и крит.', sets: {} },
  { id: 'cold', name: 'Холод', glyph: '❄', color: '#7fd7ff', desc: 'Копить Холод, заморозить и расколоть.', sets: {} },
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
