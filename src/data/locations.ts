import type { ArtTier, GearTier, LocationId, RoomKind } from '../engine/types';

export interface LocationDef {
  id: LocationId;
  name: string;
  desc: string;
  encounters: {
    fight1: string[][];
    fight2: string[][];
    elite: string[][];
    boss: string[][];
  };
  gearTiers: GearTier[];
  artTiers: ArtTier[];
  /** Гарантированная экипировка за босса. null — финальный босс. */
  bossGearTier: GearTier | null;
}

export const LOCATIONS: LocationDef[] = [
  {
    id: 'forest',
    name: 'Лес',
    desc: 'Звери и разбойники.',
    encounters: {
      fight1: [['wolf', 'wolf'], ['boar']],
      fight2: [
        ['cutthroat', 'bandit_archer'],
        ['wolf', 'wolf', 'wolf'],
        ['boar', 'bandit_archer'],
      ],
      elite: [['bear']],
      boss: [['alpha_wolf', 'wolf']],
    },
    gearTiers: [1, 2],
    artTiers: [1],
    bossGearTier: 3,
  },
  {
    id: 'crypt',
    name: 'Склеп',
    desc: 'Нежить и её хозяева.',
    encounters: {
      fight1: [
        ['skeleton_warrior', 'skeleton_archer'],
        ['ghost', 'ghost'],
      ],
      fight2: [
        ['ghoul', 'skeleton_archer'],
        ['skeleton_warrior', 'skeleton_archer', 'skeleton_archer'],
        ['ghoul', 'ghost'],
      ],
      elite: [['necromancer']],
      boss: [['lich']],
    },
    gearTiers: [2, 3],
    artTiers: [1, 2],
    bossGearTier: 4,
  },
  {
    id: 'caves',
    name: 'Пещеры огня',
    desc: 'Демоны, элементали и культисты.',
    encounters: {
      fight1: [['imp', 'imp'], ['salamander']],
      fight2: [
        ['cultist', 'salamander'],
        ['golem'],
        ['imp', 'imp', 'imp'],
      ],
      elite: [['fire_elemental'], ['golem', 'cultist']],
      boss: [['dragon']],
    },
    gearTiers: [3, 4, 5],
    artTiers: [2, 3],
    bossGearTier: null,
  },
];

export const ROOMS_PER_LOCATION = 5;

export const ROOM_KINDS: RoomKind[] = ['fight', 'fight', 'event', 'elite', 'boss'];

export const ROOM_NAMES: Record<RoomKind, string> = {
  fight: 'Бой',
  event: 'Событие',
  elite: 'Элита',
  boss: 'Босс',
};

export function roomKind(roomIndex: number): RoomKind {
  return ROOM_KINDS[roomIndex] ?? 'boss';
}
