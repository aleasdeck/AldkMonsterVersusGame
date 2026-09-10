import type { ArmorType, DerivedStats, FxSpec, GearAffix, GearInstance, GearKind, GearTier, HeroDef, Mastery, StatMods, WeaponType } from '../engine/types';
import { pick, weighted, type Rng } from '../engine/rng';

type ByTier = [number, number, number, number, number];

export interface TierInfo {
  name: string;
  color: string;
  slots: number;
  /** Кубик обычного (не лёгкого и не тяжёлого) оружия с ровным разбросом; база сдвигает его через heft и spread. */
  dmgMin: number;
  dmgMax: number;
}

export const GEAR_TIERS: Record<GearTier, TierInfo> = {
  1: { name: 'Обычный', color: '#9a9a9a', slots: 1, dmgMin: 3, dmgMax: 5 },
  2: { name: 'Необычный', color: '#4caf50', slots: 2, dmgMin: 4, dmgMax: 8 },
  3: { name: 'Редкий', color: '#42a5f5', slots: 2, dmgMin: 5, dmgMax: 9 },
  4: { name: 'Мифический', color: '#ab47bc', slots: 3, dmgMin: 7, dmgMax: 12 },
  5: { name: 'Легендарный', color: '#ff9800', slots: 4, dmgMin: 9, dmgMax: 14 },
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

/**
 * Вес оружия (v0.15): кубик тира умножается до разброса. Лёгкое (кинжал, стилет, дротики, праща) бьёт слабее,
 * зато несёт сильный перк «на удар»; тяжёлое (топор, молот) — сильнее, перк у него скромный. Магическое оружие веса не имеет:
 * посох и жезл — инструменты кастера, их кубик и так −1 к максимуму. Владение и Сила не трогаются.
 */
export type Heft = 'light' | 'heavy';

export const HEFT_MULT: Record<Heft, number> = {
  light: 0.8,
  heavy: 1.2,
};

export const HEFT_NAMES: Record<Heft, string> = {
  light: 'лёгкое',
  heavy: 'тяжёлое',
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

// ─── Типы брони и умение носить ────────────────────────────────────────────

export const ARMOR_TYPE_NAMES: Record<ArmorType, string> = {
  heavy: 'Тяжёлая',
  medium: 'Средняя',
  light: 'Лёгкая',
};

export const ARMOR_TYPE_GLYPHS: Record<ArmorType, string> = {
  heavy: '◆',
  medium: '◈',
  light: '◇',
};

/**
 * DEF и HP брони по типу и тиру (v0.15): тяжёлая — сталь, держит удар (DEF ×1.5, HP вполовину); средняя — ровная;
 * лёгкая почти не защищает (DEF вполовину, роба 1 тира — 0), зато не сковывает — HP на треть больше — и живёт перком.
 * DEF и HP работают у всех, в отличие от перка. Бот резко чувствует DEF лёгкой брони: −1 на тирах 2–5 стоил Ассасину 7 пунктов,
 * поэтому герои в лёгкой броне получили компенсацию в базе (см. heroes.ts).
 */
export const ARMOR_TYPE_STATS: Record<ArmorType, { def: ByTier; hp: ByTier }> = {
  heavy: { def: [2, 3, 5, 7, 10], hp: [1, 2, 4, 6, 9] },
  medium: { def: [1, 2, 3, 5, 7], hp: [2, 4, 7, 12, 18] },
  light: { def: [0, 1, 2, 3, 4], hp: [3, 6, 10, 16, 24] },
};

/** Веса типа при выпадении брони: тип, который герой умеет носить, вдвое чаще. */
export const ARMOR_DROP_WEIGHT = { skilled: 40, unskilled: 20 };

// ─── Базы ──────────────────────────────────────────────────────────────────

type Gender = 0 | 1 | 2 | 3; // m, f, n, pl

const byTier = (v: ByTier) => (tier: GearTier) => v[tier - 1];

/** Перк базы: чем меч отличается от копья, а латы — от плаща. */
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
  /** Только у оружия: лёгкое бьёт на 20 % слабее кубика тира, тяжёлое — на 20 % сильнее; без поля — обычное. */
  heft?: Heft;
  /** Только у оружия. */
  type?: WeaponType;
  /** Только у брони. */
  armorType?: ArmorType;
  perk?: Perk;
  /** Только стартовая вещь героя: не выпадает в награду и не входит в коллекцию. */
  startOnly?: boolean;
  /** Только у оружия дальнего и магического: цвет снаряда; праща вместо стрелы кидает камень (род orb). */
  fx?: FxSpec;
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
    heft: 'heavy',
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
    heft: 'light',
    name: 'кинжал',
    g: 0,
    spread: 'narrow',
    type: 'melee',
    perk: { name: 'Точный', mods: () => ({ crit: 0.1 }), text: () => '+10 % шанс крита' },
  },
  {
    id: 'stiletto',
    heft: 'light',
    name: 'стилет',
    g: 0,
    spread: 'narrow',
    type: 'melee',
    perk: { name: 'Удар в спину', mods: (t) => ({ backstab: byTier([3, 3, 4, 5, 6])(t) }), text: (t) => `удар из скрытности +${byTier([3, 3, 4, 5, 6])(t)} урона` },
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
    heft: 'heavy',
    name: 'молот',
    g: 0,
    spread: 'wide',
    type: 'melee',
    perk: { name: 'Сокрушение', mods: () => ({ critMult: 1 }), text: () => 'крит бьёт ×3 вместо ×2' },
  },
  // ── Дальнее ──
  {
    id: 'bow',
    fx: { color: '#e9c46a' },
    name: 'лук',
    g: 0,
    spread: 'wide',
    type: 'ranged',
    perk: { name: 'Прицел', mods: (t) => ({ firstHit: byTier([2, 2, 3, 3, 4])(t) }), text: (t) => `первый удар в ходу +${byTier([2, 2, 3, 3, 4])(t)}` },
  },
  {
    id: 'crossbow',
    fx: { color: '#c0392b' },
    name: 'арбалет',
    g: 0,
    spread: 'narrow',
    type: 'ranged',
    perk: { name: 'Павеза', mods: (t) => ({ blockOnHit: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `каждый удар даёт +${byTier([1, 1, 1, 2, 2])(t)} блока` },
  },
  {
    id: 'sling',
    fx: { kind: 'orb', color: '#9aa0a6' },
    heft: 'light',
    name: 'праща',
    g: 1,
    spread: 'wide',
    type: 'ranged',
    perk: { name: 'Оглушающий камень', mods: () => ({ stunOnHit: 0.5 }), text: () => 'каждый удар с шансом 50 % оглушает цель' },
  },
  {
    id: 'darts',
    fx: { color: '#7ddc5a' },
    heft: 'light',
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
    fx: { color: '#c9a227' },
    name: 'посох',
    g: 0,
    type: 'magic',
    perk: { name: 'Резерв', mods: (t) => ({ maxMp: byTier([2, 2, 3, 4, 5])(t) }), text: (t) => `+${byTier([2, 2, 3, 4, 5])(t)} к максимуму маны` },
  },
  {
    id: 'wand',
    fx: { color: '#b388ff' },
    name: 'жезл',
    g: 0,
    type: 'magic',
    perk: { name: 'Фокус', mods: (t) => ({ mpRegen: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `+${byTier([1, 1, 1, 2, 2])(t)} к регену маны` },
  },
  {
    id: 'scepter',
    fx: { color: '#e63946' },
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
    fx: { color: '#5ee0d0' },
    name: 'сфера',
    g: 1,
    type: 'magic',
    perk: { name: 'Отражение', mods: (t) => ({ thorns: byTier([1, 1, 2, 2, 3])(t) }), text: (t) => `+${byTier([1, 1, 2, 2, 3])(t)} шипы` },
  },
];

/**
 * Перки брони — защитные, в пару к перкам оружия: латы держат удар, плащ его избегает, роба прикрывает кастера.
 * Каждая база — одного из трёх типов; перк работает, только если герой умеет носить этот тип (см. canWearArmor).
 */
export const ARMOR_BASES: Base[] = [
  // ── Тяжёлая ──
  {
    id: 'mail',
    name: 'кольчуга',
    g: 1,
    armorType: 'heavy',
    perk: { name: 'Кольца', mods: (t) => ({ hitReduce: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `каждый удар по герою слабее на ${byTier([1, 1, 1, 2, 2])(t)}` },
  },
  {
    id: 'plate',
    name: 'латы',
    g: 3,
    armorType: 'heavy',
    perk: { name: 'Стойкость', mods: (t) => ({ defendBonus: byTier([1, 1, 2, 2, 3])(t) }), text: (t) => `«Защититься» даёт +${byTier([1, 1, 2, 2, 3])(t)} блока` },
  },
  // ── Средняя ──
  {
    id: 'harness',
    name: 'доспех',
    g: 0,
    armorType: 'medium',
    perk: { name: 'Второе дыхание', mods: (t) => ({ firstTurnSta: byTier([1, 1, 1, 2, 2])(t) }), text: (t) => `+${byTier([1, 1, 1, 2, 2])(t)} STA в первый ход боя` },
  },
  {
    id: 'shell',
    name: 'панцирь',
    g: 0,
    armorType: 'medium',
    perk: { name: 'Панцирь', mods: (t) => ({ blockKeep: byTier([2, 2, 3, 4, 5])(t) }), text: (t) => `до ${byTier([2, 2, 3, 4, 5])(t)} блока не сгорает в начале хода` },
  },
  // ── Лёгкая ──
  {
    id: 'robe',
    name: 'роба',
    g: 1,
    armorType: 'light',
    perk: { name: 'Чары', mods: (t) => ({ blockOnSpell: byTier([1, 1, 2, 2, 3])(t) }), text: (t) => `каждое заклинание даёт +${byTier([1, 1, 2, 2, 3])(t)} блока` },
  },
  {
    // Стартовая одежда Берсерка: он не носит броню, и перка у неё нет, чтобы на панели не висела зачёркнутая строка.
    id: 'hide',
    name: 'шкура',
    g: 1,
    armorType: 'light',
    startOnly: true,
  },
  {
    id: 'cloak',
    name: 'плащ',
    g: 0,
    armorType: 'light',
    perk: {
      name: 'Скрытность',
      mods: (t) => ({ dodgeStart: byTier([1, 1, 1, 2, 2])(t) }),
      text: (t) => (byTier([1, 1, 1, 2, 2])(t) === 1 ? 'первая атака врага в бою промахивается' : `первые ${byTier([1, 1, 1, 2, 2])(t)} атаки врага в бою промахиваются`),
    },
  },
  {
    id: 'shroud',
    name: 'покров',
    g: 0,
    armorType: 'light',
    perk: {
      name: 'Тень',
      mods: (t) => ({ stealthStart: byTier([2, 2, 2, 3, 3])(t) }),
      text: (t) => `бой начинается в скрытности на ${byTier([2, 2, 2, 3, 3])(t)} хода`,
    },
  },
];

export function gearBases(kind: GearKind): Base[] {
  return kind === 'weapon' ? WEAPON_BASES : ARMOR_BASES;
}

/** Базы, которые выпадают в награду и числятся в коллекции: без стартовых вещей вроде шкуры Берсерка. */
export function dropBases(kind: GearKind): Base[] {
  return gearBases(kind).filter((b) => !b.startOnly);
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

export function armorType(gear: GearInstance): ArmorType {
  return baseOf('armor', gear.base).armorType ?? 'medium';
}

/** Умеет ли герой носить эту броню. Нет — перк базы не работает, DEF, HP и аффикс остаются. */
export function canWearArmor(def: HeroDef, gear: GearInstance): boolean {
  return def.armorSkill[armorType(gear)];
}

/** Есть ли у базы предмета перк вообще: у стартовой шкуры Берсерка его нет. */
export function hasPerk(gear: GearInstance): boolean {
  return !!baseOf(gear.kind, gear.base).perk;
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

/** Модификаторы перка базы брони (без аффикса). С героем — пусто, если он не умеет носить этот тип. */
export function armorPerkMods(gear: GearInstance, def?: HeroDef): StatMods {
  if (def && !canWearArmor(def, gear)) return {};
  return baseOf('armor', gear.base).perk?.mods(gear.tier) ?? {};
}

/**
 * Строка перка базы: «Прицел: первый удар +2», «Кольца: каждый удар по герою слабее на 1».
 * Тип оружия и его свойство здесь не пишутся: тип показывает иконка у бейджа тира,
 * свойство типа и долю кубика — подсказка строки владения в панели героя.
 */
export function gearPerkText(gear: GearInstance): string {
  const base = baseOf(gear.kind, gear.base);
  return base.perk ? `${base.perk.name}: ${base.perk.text(gear.tier)}` : '';
}

/** Подсказка к иконке типа: «Магическое · Чужое». Проценты и свойство типа — в строке владения героя. */
export function weaponTypeTitle(gear: GearInstance, def?: HeroDef): string {
  const type = weaponType(gear);
  if (!def) return WEAPON_TYPE_NAMES[type];
  return `${WEAPON_TYPE_NAMES[type]} · ${MASTERY_NAMES[masteryOf(def, gear)]}`;
}

/** Подсказка к иконке типа брони: «Тяжёлая броня · Умеет носить» или «… · Не умеет: перк не работает». */
export function armorTypeTitle(gear: GearInstance, def?: HeroDef): string {
  const type = armorType(gear);
  if (!hasPerk(gear)) return `${ARMOR_TYPE_NAMES[type]} броня · без перка`;
  if (!def) return `${ARMOR_TYPE_NAMES[type]} броня`;
  return `${ARMOR_TYPE_NAMES[type]} броня · ${canWearArmor(def, gear) ? 'Умеет носить' : 'Не умеет: перк не работает'}`;
}

/** Подсказка пункта строки умений брони. */
export function armorSkillTitle(type: ArmorType, skilled: boolean): string {
  return `${ARMOR_TYPE_NAMES[type]} броня · ${skilled ? 'Умеет носить: перк базы работает' : 'Не умеет носить: перк базы не работает, DEF, HP и аффикс остаются'}`;
}

/** Свойство типа без привязки к тиру — для подсказки строки владения, где конкретного оружия нет. */
export function weaponTypeHint(type: WeaponType): string {
  if (type === 'magic') return `−1 к максимуму урона, +${MAGIC_SPELL_POWER[0]}…+${MAGIC_SPELL_POWER[4]} к заклинаниям по тиру`;
  return weaponTypeText(type, 1);
}

/** Подсказка пункта строки владения: «Дальнее · Мастер: 100 % кубика оружия\nСвойство типа: не боится шипов врага». */
export function masteryTitle(type: WeaponType, m: Mastery): string {
  return `${WEAPON_TYPE_NAMES[type]} · ${MASTERY_NAMES[m]}: ${Math.round(MASTERY_MULT[m] * 100)} % кубика оружия\nСвойство типа: ${weaponTypeHint(type)}`;
}

/** Разброс урона базы на тире: кубик тира × вес (округление к ближайшему), потом ширина. Лёгкий узкий 1 тира — 3–4, тяжёлый широкий — 3–7. */
export function baseDamage(base: Base, tier: GearTier): { min: number; max: number } {
  const info = GEAR_TIERS[tier];
  const mult = base.heft ? HEFT_MULT[base.heft] : 1;
  let min = Math.round(info.dmgMin * mult);
  let max = Math.round(info.dmgMax * mult);
  if (base.spread === 'narrow') min += 1;
  if (base.spread === 'wide') {
    min = Math.max(1, min - 1);
    max += 1;
  }
  return { min, max: Math.max(min, max) };
}

/** DEF и HP базы брони на тире — по её типу. */
export function baseArmorStats(base: Base, tier: GearTier): { def: number; hp: number } {
  const t = ARMOR_TYPE_STATS[base.armorType ?? 'medium'];
  return { def: t.def[tier - 1], hp: t.hp[tier - 1] };
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

/** База брони под героя: тип, который он умеет носить, выпадает чаще; внутри типа — поровну. */
function pickArmorBase(rng: Rng, armorSkill?: HeroDef['armorSkill']): Base {
  const pool = dropBases('armor');
  if (!armorSkill) return pick(rng, pool);
  const types = (Object.keys(armorSkill) as ArmorType[]).map((type) => ({
    item: type,
    weight: armorSkill[type] ? ARMOR_DROP_WEIGHT.skilled : ARMOR_DROP_WEIGHT.unskilled,
  }));
  const type = weighted(rng, types);
  return pick(
    rng,
    pool.filter((b) => b.armorType === type),
  );
}

/** Предмет случайной базы. С героем оружие выпадает под его владение, броня — под умение носить. */
export function makeGear(rng: Rng, kind: GearKind, tier: GearTier, def?: HeroDef): GearInstance {
  const base = kind === 'weapon' ? pickWeaponBase(rng, def?.mastery) : pickArmorBase(rng, def?.armorSkill);
  const prefix = pick(rng, PREFIXES[tier])[base.g];
  const info = GEAR_TIERS[tier];
  const dmg = baseDamage(base, tier);
  const arm = baseArmorStats(base, tier);
  return {
    kind,
    tier,
    base: base.id,
    name: `${prefix} ${base.name}`,
    dmgMin: kind === 'weapon' ? dmg.min : 0,
    dmgMax: kind === 'weapon' ? dmg.max : 0,
    def: kind === 'armor' ? arm.def : 0,
    hp: kind === 'armor' ? arm.hp : 0,
    affix: rollAffix(rng, kind, tier),
    slots: Array.from({ length: info.slots }, () => null),
  };
}

/**
 * Поднять тир предмета на 1 (кузнец): кубик — по тиру и весу базы, DEF и HP — по тиру и типу брони, аффикс того же стата — по своему тиру,
 * сокеты добавляются пустыми, стоящие артефакты остаются, имя получает префикс нового тира. Тир 5 — предел.
 */
export function upgradeGearTier(rng: Rng, gear: GearInstance): boolean {
  if (gear.tier >= 5) return false;
  const tier = (gear.tier + 1) as GearTier;
  const base = baseOf(gear.kind, gear.base);
  const info = GEAR_TIERS[tier];
  const dmg = baseDamage(base, tier);
  const arm = baseArmorStats(base, tier);
  gear.tier = tier;
  gear.name = `${pick(rng, PREFIXES[tier])[base.g]} ${base.name}`;
  gear.dmgMin = gear.kind === 'weapon' ? dmg.min : 0;
  gear.dmgMax = gear.kind === 'weapon' ? dmg.max : 0;
  gear.def = gear.kind === 'armor' ? arm.def : 0;
  gear.hp = gear.kind === 'armor' ? arm.hp : 0;
  if (gear.affix) {
    const def = (gear.kind === 'weapon' ? WEAPON_AFFIXES : ARMOR_AFFIXES).find((a) => a.stat === gear.affix!.stat);
    if (def && def.values[tier - 1] > 0) gear.affix = { stat: def.stat, value: def.values[tier - 1] };
  }
  while (gear.slots.length < info.slots) gear.slots.push(null);
  return true;
}

/** Что даст кузнец: «Урон 3–5 → 4–8, +1 сокет» или «DEF 1 → 2, HP 2 → 4, +1 сокет»; пусто — предмет на пределе. */
export function upgradePreview(gear: GearInstance): string {
  if (gear.tier >= 5) return '';
  const tier = (gear.tier + 1) as GearTier;
  const base = baseOf(gear.kind, gear.base);
  const info = GEAR_TIERS[tier];
  const parts: string[] = [];
  if (gear.kind === 'weapon') {
    const dmg = baseDamage(base, tier);
    parts.push(`Урон ${gear.dmgMin}–${gear.dmgMax} → ${dmg.min}–${dmg.max}`);
  } else {
    const arm = baseArmorStats(base, tier);
    parts.push(`DEF ${gear.def} → ${arm.def}`, `HP ${gear.hp} → ${arm.hp}`);
  }
  if (base.perk) {
    const now = base.perk.text(gear.tier);
    const next = base.perk.text(tier);
    if (now !== next) parts.push(`${base.perk.name}: ${next}`);
  }
  if (gear.affix) {
    const def = (gear.kind === 'weapon' ? WEAPON_AFFIXES : ARMOR_AFFIXES).find((a) => a.stat === gear.affix!.stat);
    if (def && def.values[tier - 1] > gear.affix.value) parts.push(affixText({ stat: def.stat, value: def.values[tier - 1] }));
  }
  const extra = info.slots - gear.slots.length;
  if (extra > 0) parts.push(`+${extra} сокет${extra > 1 ? 'а' : ''}`);
  return parts.join(', ');
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
      slots: [{ id: def.signature, tier: 1 }],
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
      // Второй стартовый артефакт убран (v0.14): пустой сокет ждёт первую находку.
      slots: [null],
    },
  };
}

/**
 * Характеристики предмета. Для оружия с героем — ещё и кубик в его руках:
 * «Урон 5–9 → 3–6», если владение или тип его меняют. Само владение показывает цвет иконки типа.
 */
export function gearStatText(g: GearInstance, def?: HeroDef): string {
  const parts: string[] = [];
  if (g.kind === 'weapon') {
    let text = `Урон ${g.dmgMin}–${g.dmgMax}`;
    if (def) {
      const d = weaponDice(def, g);
      if (d.min !== g.dmgMin || d.max !== g.dmgMax) text += ` → ${d.min}–${d.max}`;
    }
    parts.push(text);
  } else {
    if (g.def) parts.push(`+${g.def} DEF`);
    if (g.hp) parts.push(`+${g.hp} HP`);
  }
  if (g.affix) parts.push(`✦ ${affixText(g.affix)}`);
  return parts.length ? parts.join(', ') : 'без бонусов';
}
