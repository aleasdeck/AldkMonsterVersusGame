import type { DerivedStats, GearAffix, GearInstance, GearKind, GearTier, HeroDef, Mastery, StatMods, WeaponType } from '../engine/types';
import { pick, weighted, type Rng } from '../engine/rng';

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
  3: { name: 'Редкий', color: '#42a5f5', slots: 2, dmgMin: 5, dmgMax: 9, def: 3, hp: 7 },
  4: { name: 'Мифический', color: '#ab47bc', slots: 3, dmgMin: 7, dmgMax: 12, def: 5, hp: 12 },
  5: { name: 'Легендарный', color: '#ff9800', slots: 4, dmgMin: 9, dmgMax: 14, def: 7, hp: 18 },
};

export const ART_TIER_COLORS: Record<1 | 2 | 3, string> = {
  1: '#9a9a9a',
  2: '#42a5f5',
  3: '#ff9800',
};

// ─── Типы оружия и владение ────────────────────────────────────────────────

export const WEAPON_TYPE_NAMES: Record<WeaponType, string> = {
  melee: 'Ближнее',
  ranged: 'Дальнее',
  magic: 'Магическое',
};

export const WEAPON_TYPE_GLYPHS: Record<WeaponType, string> = {
  melee: '⚔',
  ranged: '➶',
  magic: '✦',
};

export const MASTERY_NAMES: Record<Mastery, string> = {
  master: 'Мастер',
  trained: 'Знаком',
  foreign: 'Чужое',
};

/** Множитель кубика оружия по умению владения. Сила и артефакты не трогаются. */
export const MASTERY_MULT: Record<Mastery, number> = {
  master: 1,
  trained: 0.75,
  foreign: 0.5,
};

/** Веса типа при выпадении оружия: мастерское чаще, чужое реже. */
export const MASTERY_DROP_WEIGHT: Record<Mastery, number> = {
  master: 50,
  trained: 30,
  foreign: 20,
};

/** Бонус к заклинаниям, встроенный в магическое оружие, по тиру. */
export const MAGIC_SPELL_POWER: [number, number, number, number, number] = [1, 1, 2, 3, 4];

/** Что даёт сам тип, помимо перка базы. */
export function weaponTypeMods(type: WeaponType, tier: GearTier): StatMods {
  switch (type) {
    case 'melee':
      return {};
    case 'ranged':
      return { thornsImmune: 1 };
    case 'magic':
      return { spellPower: MAGIC_SPELL_POWER[tier - 1] };
  }
}

export function weaponTypeText(type: WeaponType, tier: GearTier): string {
  switch (type) {
    case 'melee':
      return 'полный урон в упор';
    case 'ranged':
      return 'не боится шипов врага';
    case 'magic':
      return `−1 к максимуму урона, +${MAGIC_SPELL_POWER[tier - 1]} к заклинаниям`;
  }
}

// ─── Базы ──────────────────────────────────────────────────────────────────

type Gender = 0 | 1 | 2 | 3; // m, f, n, pl

type ByTier = [number, number, number, number, number];
const byTier = (v: ByTier) => (tier: GearTier) => v[tier - 1];

/** Перк базы оружия: чем меч отличается от копья. */
export interface Perk {
  name: string;
  mods: (tier: GearTier) => StatMods;
  text: (tier: GearTier) => string;
}

export interface Base {
  id: string;
  name: string;
  g: Gender;
  /** narrow — разброс уже (мин +1), wide — шире (мин −1, макс +1). */
  spread?: 'narrow' | 'wide';
  /** Только у оружия. */
  type?: WeaponType;
  perk?: Perk;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export const WEAPON_BASES: Base[] = [
  // ── Ближнее ──
  {
    id: 'sword',
    name: 'меч',
    g: 0,
    type: 'melee',
    perk: { name: 'Парирование', mods: (t) => ({ def: byTier([1, 1, 2, 2, 3])(t) }), text: (t) => `+${byTier([1, 1, 2, 2, 3])(t)} к Защите` },
  },
  {
    id: 'axe',
    name: 'топор',
    g: 0,
    spread: 'wide',
    type: 'melee',
    perk: {
      name: 'Свирепость',
      mods: (t) => ({ fatigue: byTier([0.05, 0.05, 0.08, 0.08, 0.1])(t) }),
      text: (t) => `усталость мягче на ${pct(byTier([0.05, 0.05, 0.08, 0.08, 0.1])(t))}`,
    },
  },
  {
    id: 'mace',
    name: 'булава',
    g: 1,
    type: 'melee',
    perk: { name: 'Дробящая', mods: () => ({ pierceBlock: 1 }), text: () => 'удары игнорируют блок врага' },
  },
  {
    id: 'dagger',
    name: 'кинжал',
    g: 0,
    spread: 'narrow',
    type: 'melee',
    perk: { name: 'Точный', mods: () => ({ crit: 0.1 }), text: () => '+10 % шанс крита' },
  },
  {
    id: 'spear',
    name: 'копьё',
    g: 2,
    type: 'melee',
    perk: {
      name: 'Сквозной удар',
      mods: (t) => ({ splash: byTier([0.3, 0.3, 0.4, 0.4, 0.5])(t) }),
      text: (t) => `${pct(byTier([0.3, 0.3, 0.4, 0.4, 0.5])(t))} урона удара достаётся следующему врагу`,
    },
  },
  {
    id: 'hammer',
    name: 'молот',
    g: 0,
    spread: 'wide',
    type: 'melee',
    perk: { name: 'Сокрушение', mods: () => ({ critMult: 1 }), text: () => 'крит бьёт ×3 вместо ×2' },
  },
  // ── Дальнее ──
  {
    id: 'bow',
    name: 'лук',
    g: 0,
    spread: 'wide',
    type: 'ranged',
    perk: { name: 'Прицел', mods: (t) => ({ firstHit: byTier([2, 2, 3, 3, 4])(t) }), text: (t) => `первый удар в ходу +${byTier([2, 2, 3, 3, 4])(t)}` },
  },
  {
    id: 'crossbow',
    name: 'арбалет',
    g: 0,
    spread: 'narrow',
    type: 'ranged',
    perk: { name: 'Павеза', mods: (t) => ({ blockOnHit: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `каждый удар даёт +${byTier([1, 1, 1, 2, 2])(t)} блока` },
  },
  {
    id: 'sling',
    name: 'праща',
    g: 1,
    spread: 'wide',
    type: 'ranged',
    perk: { name: 'Оглушающий камень', mods: () => ({ stunOnCrit: 1 }), text: () => 'крит оглушает цель' },
  },
  {
    id: 'darts',
    name: 'дротики',
    g: 3,
    spread: 'narrow',
    type: 'ranged',
    perk: {
      name: 'Отравленные',
      mods: (t) => ({ onHitBleed: byTier([1, 1, 2, 2, 3])(t) }),
      text: (t) => `каждый удар вешает ${byTier([1, 1, 2, 2, 3])(t)} кровотечения на 2 хода`,
    },
  },
  // ── Магическое ──
  {
    id: 'staff',
    name: 'посох',
    g: 0,
    type: 'magic',
    perk: { name: 'Резерв', mods: (t) => ({ maxMp: byTier([2, 2, 3, 4, 5])(t) }), text: (t) => `+${byTier([2, 2, 3, 4, 5])(t)} к максимуму маны` },
  },
  {
    id: 'wand',
    name: 'жезл',
    g: 0,
    type: 'magic',
    perk: { name: 'Фокус', mods: (t) => ({ mpRegen: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `+${byTier([1, 1, 1, 2, 2])(t)} к регену маны` },
  },
  {
    id: 'scepter',
    name: 'скипетр',
    g: 0,
    type: 'magic',
    perk: {
      name: 'Вытягивание',
      mods: (t) => ({ spellLeech: byTier([1, 1, 2, 2, 3])(t) }),
      text: (t) => `каждое заклинание лечит на ${byTier([1, 1, 2, 2, 3])(t)}`,
    },
  },
  {
    id: 'orb',
    name: 'сфера',
    g: 1,
    type: 'magic',
    perk: { name: 'Отражение', mods: (t) => ({ thorns: byTier([1, 1, 2, 2, 3])(t) }), text: (t) => `+${byTier([1, 1, 2, 2, 3])(t)} шипы` },
  },
];

export const ARMOR_BASES: Base[] = [
  { id: 'mail', name: 'кольчуга', g: 1 },
  { id: 'plate', name: 'латы', g: 3 },
  { id: 'harness', name: 'доспех', g: 0 },
  { id: 'robe', name: 'роба', g: 1 },
  { id: 'shell', name: 'панцирь', g: 0 },
  { id: 'cloak', name: 'плащ', g: 0 },
];

export function gearBases(kind: GearKind): Base[] {
  return kind === 'weapon' ? WEAPON_BASES : ARMOR_BASES;
}

export function baseOf(kind: GearKind, id: string): Base {
  const b = gearBases(kind).find((x) => x.id === id);
  if (!b) throw new Error(`Unknown ${kind} base: ${id}`);
  return b;
}

export function weaponBase(gear: GearInstance): Base {
  return baseOf('weapon', gear.base);
}

export function weaponType(gear: GearInstance): WeaponType {
  return weaponBase(gear).type ?? 'melee';
}

export function masteryOf(def: HeroDef, gear: GearInstance): Mastery {
  return def.mastery[weaponType(gear)];
}

/** Итоговый кубик оружия в руках героя: владение, штраф магического типа. */
export function weaponDice(def: HeroDef, gear: GearInstance): { min: number; max: number } {
  const mult = MASTERY_MULT[masteryOf(def, gear)];
  const min = Math.max(1, Math.floor(gear.dmgMin * mult));
  let max = Math.max(min, Math.floor(gear.dmgMax * mult));
  if (weaponType(gear) === 'magic') max = Math.max(min, max - 1);
  return { min, max };
}

/** Модификаторы самого оружия: тип + перк базы (без аффикса). */
export function weaponPerkMods(gear: GearInstance): StatMods {
  const base = weaponBase(gear);
  const out: StatMods = { ...weaponTypeMods(base.type ?? 'melee', gear.tier) };
  const perk = base.perk?.mods(gear.tier) ?? {};
  for (const key of Object.keys(perk) as (keyof DerivedStats)[]) out[key] = (out[key] ?? 0) + (perk[key] ?? 0);
  return out;
}

/** Строка перков оружия: «Дальнее: не боится шипов · Прицел: первый удар +2». */
export function weaponPerkText(gear: GearInstance): string {
  const base = weaponBase(gear);
  const type = base.type ?? 'melee';
  const parts = [`${WEAPON_TYPE_NAMES[type]}: ${weaponTypeText(type, gear.tier)}`];
  if (base.perk) parts.push(`${base.perk.name}: ${base.perk.text(gear.tier)}`);
  return parts.join(' · ');
}

/** Разброс урона базы на тире — с учётом её ширины. */
export function baseDamage(base: Base, tier: GearTier): { min: number; max: number } {
  const info = GEAR_TIERS[tier];
  let min = info.dmgMin;
  let max = info.dmgMax;
  if (base.spread === 'narrow') min += 1;
  if (base.spread === 'wide') {
    min = Math.max(1, min - 1);
    max += 1;
  }
  return { min, max };
}

/** Название базы с префиксом тира: «Драконий меч». */
export function baseTitle(base: Base, tier: GearTier, variant = 0): string {
  const forms = PREFIXES[tier][variant % PREFIXES[tier].length];
  return `${forms[base.g]} ${base.name}`;
}

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
  values: ByTier;
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

/** База оружия под героя: тип выбирается по весам владения, внутри типа — поровну. */
function pickWeaponBase(rng: Rng, mastery?: HeroDef['mastery']): Base {
  if (!mastery) return pick(rng, WEAPON_BASES);
  const types = (Object.keys(mastery) as WeaponType[]).map((type) => ({ item: type, weight: MASTERY_DROP_WEIGHT[mastery[type]] }));
  const type = weighted(rng, types);
  return pick(
    rng,
    WEAPON_BASES.filter((b) => b.type === type),
  );
}

export function makeGear(rng: Rng, kind: GearKind, tier: GearTier, mastery?: HeroDef['mastery']): GearInstance {
  const base = kind === 'weapon' ? pickWeaponBase(rng, mastery) : pick(rng, ARMOR_BASES);
  const prefix = pick(rng, PREFIXES[tier])[base.g];
  const info = GEAR_TIERS[tier];
  const dmg = baseDamage(base, tier);
  const dmgMin = kind === 'weapon' ? dmg.min : 0;
  const dmgMax = kind === 'weapon' ? dmg.max : 0;
  return {
    kind,
    tier,
    base: base.id,
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
      base: def.weapon.base,
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
      base: def.armor.base,
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

/**
 * Характеристики предмета. Для оружия с героем — ещё и кубик в его руках:
 * «Урон 5–9 → 3–6 (Чужое)», если владение или тип его меняют.
 */
export function gearStatText(g: GearInstance, def?: HeroDef): string {
  const parts: string[] = [];
  if (g.kind === 'weapon') {
    let text = `Урон ${g.dmgMin}–${g.dmgMax}`;
    if (def) {
      const d = weaponDice(def, g);
      const m = masteryOf(def, g);
      if (d.min !== g.dmgMin || d.max !== g.dmgMax || m !== 'master') text += ` → ${d.min}–${d.max} (${MASTERY_NAMES[m]})`;
    }
    parts.push(text);
  } else {
    if (g.def) parts.push(`+${g.def} DEF`);
    if (g.hp) parts.push(`+${g.hp} HP`);
  }
  if (g.affix) parts.push(`✦ ${affixText(g.affix)}`);
  return parts.length ? parts.join(', ') : 'без бонусов';
}
