import type { DerivedStats, GearAffix, GearInstance, GearKind, GearTier, HeroDef, StatMods } from '../engine/types';
import { pick, type Rng } from '../engine/rng';

export interface TierInfo {
  name: string;
  color: string;
  slots: number;
  dmgMin: number;
  dmgMax: number;
  def: number;
  hp: number;
}

export const GEAR_TIERS: Record<GearTier, TierInfo> = {
  1: { name: 'Обычный', color: '#9a9a9a', slots: 1, dmgMin: 3, dmgMax: 5, def: 1, hp: 2 },
  2: { name: 'Необычный', color: '#4caf50', slots: 2, dmgMin: 4, dmgMax: 8, def: 2, hp: 4 },
  3: { name: 'Редкий', color: '#42a5f5', slots: 2, dmgMin: 6, dmgMax: 10, def: 3, hp: 7 },
  4: { name: 'Мифический', color: '#ab47bc', slots: 3, dmgMin: 8, dmgMax: 14, def: 5, hp: 12 },
  5: { name: 'Легендарный', color: '#ff9800', slots: 4, dmgMin: 11, dmgMax: 17, def: 7, hp: 18 },
};

export const ART_TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: '#9a9a9a',
  2: '#42a5f5',
  3: '#ff9800',
};

type Gender = 0 | 1 | 2 | 3; // m, f, n, pl

interface Base {
  name: string;
  g: Gender;
  /** narrow — разброс уже (мин +1), wide — шире (мин −1, макс +1). */
  spread?: 'narrow' | 'wide';
}

const WEAPON_BASES: Base[] = [
  { name: 'меч', g: 0 },
  { name: 'топор', g: 0, spread: 'wide' },
  { name: 'булава', g: 1 },
  { name: 'кинжал', g: 0, spread: 'narrow' },
  { name: 'посох', g: 0 },
  { name: 'копьё', g: 2 },
  { name: 'молот', g: 0, spread: 'wide' },
];

const ARMOR_BASES: Base[] = [
  { name: 'кольчуга', g: 1 },
  { name: 'латы', g: 3 },
  { name: 'доспех', g: 0 },
  { name: 'роба', g: 1 },
  { name: 'панцирь', g: 0 },
  { name: 'плащ', g: 0 },
];

/** Формы прилагательного: [м, ж, ср, мн]. */
const PREFIXES: Record<GearTier, string[][]> = {
  1: [
    ['Ржавый', 'Ржавая', 'Ржавое', 'Ржавые'],
    ['Потёртый', 'Потёртая', 'Потёртое', 'Потёртые'],
  ],
  2: [
    ['Стальной', 'Стальная', 'Стальное', 'Стальные'],
    ['Добротный', 'Добротная', 'Добротное', 'Добротные'],
  ],
  3: [
    ['Закалённый', 'Закалённая', 'Закалённое', 'Закалённые'],
    ['Мастерский', 'Мастерская', 'Мастерское', 'Мастерские'],
  ],
  4: [
    ['Рунный', 'Рунная', 'Рунное', 'Рунные'],
    ['Зачарованный', 'Зачарованная', 'Зачарованное', 'Зачарованные'],
  ],
  5: [
    ['Драконий', 'Драконья', 'Драконье', 'Драконьи'],
    ['Древний', 'Древняя', 'Древнее', 'Древние'],
  ],
};

// ─── Аффиксы ───────────────────────────────────────────────────────────────

interface AffixDef {
  stat: keyof DerivedStats;
  /** Значение по тиру 1..5; 0 — на этом тире не выпадает. */
  values: [number, number, number, number, number];
}

const WEAPON_AFFIXES: AffixDef[] = [
  { stat: 'str', values: [1, 1, 2, 2, 3] },
  { stat: 'crit', values: [0.05, 0.08, 0.1, 0.12, 0.15] },
  { stat: 'lifesteal', values: [1, 1, 2, 2, 3] },
  { stat: 'spellPower', values: [1, 1, 2, 3, 4] },
];

const ARMOR_AFFIXES: AffixDef[] = [
  { stat: 'maxHp', values: [3, 5, 8, 10, 15] },
  { stat: 'def', values: [1, 1, 2, 2, 3] },
  { stat: 'maxMp', values: [2, 3, 4, 5, 6] },
  { stat: 'mpRegen', values: [0, 1, 1, 1, 2] },
  { stat: 'regen', values: [1, 1, 1, 2, 2] },
  { stat: 'thorns', values: [1, 1, 2, 2, 3] },
];

export function rollAffix(rng: Rng, kind: GearKind, tier: GearTier): GearAffix {
  const pool = (kind === 'weapon' ? WEAPON_AFFIXES : ARMOR_AFFIXES).filter((a) => a.values[tier - 1] > 0);
  const a = pick(rng, pool);
  return { stat: a.stat, value: a.values[tier - 1] };
}

export function affixText(affix: GearAffix): string {
  const v = affix.value;
  switch (affix.stat) {
    case 'str':
      return `+${v} Сила`;
    case 'crit':
      return `+${Math.round(v * 100)} % крит`;
    case 'lifesteal':
      return `+${v} вампиризм`;
    case 'spellPower':
      return `+${v} к заклинаниям`;
    case 'maxHp':
      return `+${v} HP`;
    case 'def':
      return `+${v} DEF`;
    case 'maxMp':
      return `+${v} MP`;
    case 'mpRegen':
      return `+${v} реген MP`;
    case 'regen':
      return `+${v} реген HP`;
    case 'thorns':
      return `+${v} шипы`;
    default:
      return `+${v} ${affix.stat}`;
  }
}

export function affixMods(gear: GearInstance): StatMods {
  return gear.affix ? { [gear.affix.stat]: gear.affix.value } : {};
}

// ─── Генерация ─────────────────────────────────────────────────────────────

export function makeGear(rng: Rng, kind: GearKind, tier: GearTier): GearInstance {
  const base = pick(rng, kind === 'weapon' ? WEAPON_BASES : ARMOR_BASES);
  const prefix = pick(rng, PREFIXES[tier])[base.g];
  const info = GEAR_TIERS[tier];
  let dmgMin = 0;
  let dmgMax = 0;
  if (kind === 'weapon') {
    dmgMin = info.dmgMin;
    dmgMax = info.dmgMax;
    if (base.spread === 'narrow') dmgMin += 1;
    if (base.spread === 'wide') {
      dmgMin = Math.max(1, dmgMin - 1);
      dmgMax += 1;
    }
  }
  return {
    kind,
    tier,
    name: `${prefix} ${base.name}`,
    dmgMin,
    dmgMax,
    def: kind === 'armor' ? info.def : 0,
    hp: kind === 'armor' ? info.hp : 0,
    affix: rollAffix(rng, kind, tier),
    slots: Array.from({ length: info.slots }, () => null),
  };
}

export function makeStartingGear(def: HeroDef): { weapon: GearInstance; armor: GearInstance } {
  return {
    weapon: {
      kind: 'weapon',
      tier: 1,
      name: def.weapon.name,
      dmgMin: def.weapon.dmgMin,
      dmgMax: def.weapon.dmgMax,
      def: 0,
      hp: 0,
      affix: null,
      slots: [{ id: def.artifacts[0], tier: 1 }],
    },
    armor: {
      kind: 'armor',
      tier: 1,
      name: def.armor.name,
      dmgMin: 0,
      dmgMax: 0,
      def: def.armor.def,
      hp: def.armor.hp,
      affix: null,
      slots: [{ id: def.artifacts[1], tier: 1 }],
    },
  };
}

export function gearStatText(g: GearInstance): string {
  const parts: string[] = [];
  if (g.kind === 'weapon') parts.push(`Урон ${g.dmgMin}–${g.dmgMax}`);
  else {
    if (g.def) parts.push(`+${g.def} DEF`);
    if (g.hp) parts.push(`+${g.hp} HP`);
  }
  if (g.affix) parts.push(`✦ ${affixText(g.affix)}`);
  return parts.length ? parts.join(', ') : 'без бонусов';
}
