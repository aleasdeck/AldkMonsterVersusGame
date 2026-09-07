import type { HeroDef } from '../engine/types';

const base = { o: '#1b1b2a', e: '#1a1a1a' };

const list: HeroDef[] = [
  {
    id: 'warrior',
    name: 'Воин',
    role: 'Ровный боец: много действий за ход, крепкий. Эталон для баланса.',
    hp: 44,
    def: 6,
    mp: 2,
    mpRegen: 0,
    sta: 3,
    mastery: { melee: 'master', ranged: 'trained', magic: 'foreign' },
    armorSkill: { heavy: true, medium: true, light: false },
    weapon: { base: 'sword', name: 'Меч', dmgMin: 4, dmgMax: 6 },
    armor: { base: 'mail', name: 'Кольчуга', def: 1, hp: 0 },
    artifacts: ['heavy_strike', 'troll_heart'],
    sprite: {
      type: 'humanoid',
      head: 'helmet',
      palette: { ...base, s: '#f1c27d', h: '#8d99ae', b: '#b23a48', l: '#4a4e69', w: '#dcdcdc' },
    },
  },
  {
    id: 'mage',
    name: 'Маг',
    role: 'Хрупкий, урон через ману, защищается Магическим щитом.',
    hp: 26,
    def: 3,
    mp: 10,
    mpRegen: 2,
    sta: 2,
    mastery: { melee: 'trained', ranged: 'foreign', magic: 'master' },
    armorSkill: { heavy: false, medium: false, light: true },
    weapon: { base: 'staff', name: 'Посох', dmgMin: 3, dmgMax: 6 },
    armor: { base: 'robe', name: 'Роба', def: 0, hp: 0 },
    artifacts: ['fireball', 'mana_shield'],
    sprite: {
      type: 'humanoid',
      head: 'hat',
      palette: { ...base, s: '#f1c27d', h: '#5b3fa0', b: '#3b2f7f', l: '#2a2350', w: '#c9a227' },
    },
  },
  {
    id: 'rogue',
    name: 'Плут',
    role: 'Криты и кровотечение, средняя живучесть. Врождённый шанс крита 10 %.',
    hp: 34,
    def: 5,
    mp: 4,
    mpRegen: 1,
    sta: 3,
    crit: 0.1,
    mastery: { melee: 'master', ranged: 'trained', magic: 'foreign' },
    armorSkill: { heavy: false, medium: true, light: true },
    weapon: { base: 'dagger', name: 'Кинжал', dmgMin: 4, dmgMax: 6 },
    armor: { base: 'cloak', name: 'Кожанка', def: 0, hp: 0 },
    artifacts: ['bleed_cut', 'luck_talisman'],
    sprite: {
      type: 'humanoid',
      head: 'hood',
      palette: { ...base, s: '#e8b88a', h: '#2f3e46', b: '#52796f', l: '#354f52', w: '#9aa6a6' },
    },
  },
  {
    id: 'paladin',
    name: 'Паладин',
    role: 'Танк с самолечением, низкий урон.',
    hp: 34,
    def: 5,
    mp: 6,
    mpRegen: 1,
    sta: 3,
    mastery: { melee: 'master', ranged: 'foreign', magic: 'trained' },
    armorSkill: { heavy: true, medium: true, light: false },
    weapon: { base: 'mace', name: 'Булава', dmgMin: 2, dmgMax: 6 },
    armor: { base: 'plate', name: 'Латы', def: 1, hp: 0 },
    artifacts: ['heal', 'turtle_shell'],
    sprite: {
      type: 'humanoid',
      head: 'plume',
      palette: { ...base, s: '#f1c27d', h: '#d9d9d9', b: '#f4f1de', l: '#8d8d8d', w: '#e63946' },
    },
  },
  {
    id: 'berserk',
    name: 'Берсерк',
    role: 'Почти без защиты и без маны, доспехов не носит: перки брони на нём не работают. Ярость даёт лишние действия и Силу ценой своей крови; серия ударов за ход теряет мало урона.',
    hp: 44,
    def: 3,
    mp: 0,
    mpRegen: 0,
    sta: 3,
    fatigue: 0.85,
    mastery: { melee: 'master', ranged: 'trained', magic: 'foreign' },
    // Броню не носит вовсе: любая для него — только DEF, HP, аффикс и слоты. Стартовая шкура поэтому без перка.
    armorSkill: { heavy: false, medium: false, light: false },
    weapon: { base: 'axe', name: 'Топор', dmgMin: 2, dmgMax: 5 },
    armor: { base: 'hide', name: 'Шкура', def: 0, hp: 0 },
    artifacts: ['war_cry', 'rage'],
    sprite: {
      type: 'humanoid',
      head: 'horns',
      palette: { ...base, s: '#e0ac69', h: '#a0522d', b: '#6b4226', l: '#3d2b1f', w: '#ede0d4' },
    },
  },
  {
    id: 'archer',
    name: 'Лучник',
    role: 'Стрелок: Прицельный выстрел всегда критует, Подсечный ослабляет врага. Хрупкий, защита слабая.',
    hp: 32,
    def: 4,
    mp: 3,
    mpRegen: 1,
    sta: 3,
    mastery: { melee: 'trained', ranged: 'master', magic: 'foreign' },
    armorSkill: { heavy: false, medium: true, light: true },
    weapon: { base: 'bow', name: 'Лук', dmgMin: 3, dmgMax: 7 },
    armor: { base: 'cloak', name: 'Куртка', def: 0, hp: 0 },
    artifacts: ['aimed_shot', 'crippling_shot'],
    sprite: {
      type: 'humanoid',
      head: 'cap',
      palette: { ...base, s: '#f1c27d', h: '#2d6a4f', b: '#588157', l: '#5c4033', w: '#e9c46a' },
    },
  },
];

export const HEROES: Record<string, HeroDef> = Object.fromEntries(list.map((h) => [h.id, h]));
export const HERO_LIST: HeroDef[] = list;

export function heroDef(id: string): HeroDef {
  const def = HEROES[id];
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}
