import type { HeroDef } from '../engine/types';

const base = { o: '#1b1b2a', e: '#1a1a1a' };

const list: HeroDef[] = [
  {
    id: 'warrior',
    // Эталон: минимальный крит, базовый крит. урон.
    crit: 0.05,
    critDmg: 150,
    name: 'Воин',
    role: 'Ровный боец: много действий за ход, крепкий. Эталон для баланса.',
    // 46, а не 40 (v0.14): без стартового Сердца тролля (+6 HP) бот падал до 36 %, с 46 — 43 %.
    hp: 46,
    def: 6,
    mp: 2,
    mpRegen: 0,
    sta: 3,
    weaponSkill: { melee: true, ranged: false, magic: false },
    armorSkill: { heavy: true, medium: true, light: false },
    weapon: { base: 'sword', name: 'Меч', dmgMin: 4, dmgMax: 6 },
    armor: { base: 'mail', name: 'Кольчуга', def: 1, hp: 0 },
    signature: 'shield_bash',
    sprite: {
      type: 'humanoid',
      head: 'helmet',
      palette: { ...base, s: '#f1c27d', h: '#8d99ae', b: '#b23a48', l: '#4a4e69', w: '#dcdcdc' },
    },
  },
  {
    id: 'mage',
    // Бьёт заклинаниями — крит ему почти не нужен.
    crit: 0.05,
    critDmg: 150,
    name: 'Маг',
    role: 'Хрупкий, урон через ману: Волшебная стрела бьёт каждый ход без перезарядки.',
    // 26, а не 23 (v0.14): без стартового Магического щита бот падал до 39 %, с 26 — 44 %.
    // 29 (v0.15): роба стала почти без DEF, бот падал до 37 %; +3 HP вернули 41 %.
    hp: 29,
    def: 3,
    // 7, а не 10 (v0.14.1): с 10 маны и Волшебной стрелой без лимита Маг был «имбой» по отзыву пользователя.
    // 5 (v0.19.1): по просьбе пользователя, вместе с лимитом стрелы 2/3/4. Симулятором правка не мерялась.
    mp: 5,
    mpRegen: 2,
    sta: 2,
    weaponSkill: { melee: false, ranged: false, magic: true },
    armorSkill: { heavy: false, medium: false, light: true },
    weapon: { base: 'staff', name: 'Посох', dmgMin: 3, dmgMax: 6 },
    armor: { base: 'robe', name: 'Роба', def: 0, hp: 0 },
    signature: 'magic_missile',
    sprite: {
      type: 'humanoid',
      head: 'hat',
      palette: { ...base, s: '#f1c27d', h: '#5b3fa0', b: '#3b2f7f', l: '#2a2350', w: '#c9a227' },
    },
  },
  {
    id: 'assassin',
    // Крит — его профиль: удар из тени и так всегда критический.
    crit: 0.2,
    critDmg: 190,
    name: 'Ассасин',
    role: 'Входит в бой в тени: враги его не видят, а любая атака из скрытности — удар в спину, всегда крит. Дымовая шашка возвращает в тень, яд не выдаёт.',
    hp: 31,
    // 5, а не 4 (v0.15): лёгкая броня почти без DEF, бот падал до 40 %; своя защита +1 вернула 44 %.
    def: 5,
    mp: 3,
    mpRegen: 1,
    sta: 3,
    weaponSkill: { melee: true, ranged: false, magic: false },
    armorSkill: { heavy: false, medium: false, light: true },
    // Стилет — лёгкое оружие: кубик ниже меча Воина (4–6), удар в спину добирает своё.
    weapon: { base: 'stiletto', name: 'Стилет', dmgMin: 3, dmgMax: 5 },
    armor: { base: 'shroud', name: 'Тёмный покров', def: 0, hp: 0 },
    signature: 'smoke_bomb',
    sprite: {
      type: 'humanoid',
      head: 'mask',
      palette: { ...base, s: '#e8b88a', h: '#1f1f2e', b: '#2b2d42', l: '#1b1b2a', w: '#8d99ae' },
    },
  },
  {
    id: 'paladin',
    // Танк: урон не его дело.
    crit: 0.05,
    critDmg: 140,
    name: 'Паладин',
    role: 'Танк: Молот света бьёт и лечит, низкий урон.',
    hp: 31,
    def: 5,
    mp: 6,
    mpRegen: 1,
    sta: 3,
    weaponSkill: { melee: true, ranged: false, magic: false },
    armorSkill: { heavy: true, medium: true, light: false },
    weapon: { base: 'mace', name: 'Булава', dmgMin: 2, dmgMax: 6 },
    armor: { base: 'plate', name: 'Латы', def: 1, hp: 0 },
    signature: 'light_hammer',
    sprite: {
      type: 'humanoid',
      head: 'plume',
      palette: { ...base, s: '#f1c27d', h: '#d9d9d9', b: '#f4f1de', l: '#8d8d8d', w: '#e63946' },
    },
  },
  {
    id: 'berserk',
    // Много ударов за ход — шансу крита есть где сработать.
    crit: 0.1,
    critDmg: 160,
    name: 'Берсерк',
    role: 'Почти без защиты и без маны, доспехов не носит: перки брони на нём не работают. Ярость даёт лишние действия и Силу ценой своей крови; серия ударов за ход теряет мало урона.',
    hp: 44,
    def: 3,
    mp: 0,
    mpRegen: 0,
    sta: 3,
    fatigue: 0.85,
    weaponSkill: { melee: true, ranged: false, magic: false },
    // Броню не носит вовсе: любая для него — только DEF, HP, аффикс и слоты. Стартовая шкура поэтому без перка.
    armorSkill: { heavy: false, medium: false, light: false },
    // Топор — тяжёлое оружие: 3–6 вместо 2–5 (v0.15), всё ещё ниже меча Воина, Силу добирает Ярость.
    weapon: { base: 'axe', name: 'Топор', dmgMin: 3, dmgMax: 6 },
    armor: { base: 'hide', name: 'Шкура', def: 0, hp: 0 },
    signature: 'rage',
    sprite: {
      type: 'humanoid',
      head: 'horns',
      palette: { ...base, s: '#e0ac69', h: '#a0522d', b: '#6b4226', l: '#3d2b1f', w: '#ede0d4' },
    },
  },
  {
    id: 'archer',
    // Прицельный выстрел всегда критует, крит. урон решает.
    crit: 0.12,
    critDmg: 170,
    name: 'Лучник',
    role: 'Стрелок: Прицельный выстрел всегда критует, Подсечный ослабляет врага. Хрупкий, защита слабая.',
    hp: 29,
    // 5, а не 4 (v0.15): куртка почти без DEF — та же компенсация, что у Ассасина.
    def: 5,
    mp: 3,
    mpRegen: 1,
    sta: 3,
    weaponSkill: { melee: false, ranged: true, magic: false },
    armorSkill: { heavy: false, medium: true, light: true },
    weapon: { base: 'bow', name: 'Лук', dmgMin: 3, dmgMax: 7 },
    armor: { base: 'cloak', name: 'Куртка', def: 0, hp: 0 },
    signature: 'aimed_shot',
    sprite: {
      type: 'humanoid',
      head: 'cap',
      palette: { ...base, s: '#f1c27d', h: '#2d6a4f', b: '#588157', l: '#5c4033', w: '#e9c46a' },
    },
  },
];

export const HEROES: Record<string, HeroDef> = Object.fromEntries(list.map((h) => [h.id, h]));
export const HERO_LIST: HeroDef[] = list;

/** id артефакта → id героя, которому он принадлежит. Остальным героям персональные артефакты не выпадают. */
export const SIGNATURE_OWNER: Record<string, string> = Object.fromEntries(list.map((h) => [h.signature, h.id]));

export function heroDef(id: string): HeroDef {
  const def = HEROES[id];
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}
