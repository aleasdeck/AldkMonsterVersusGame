import type { ArtTier, GearTier, LocationId, RoomKind } from '../engine/types';

export interface LocationDef {
  id: LocationId;
  name: string;
  desc: string;
  encounters: {
    /** Комнаты 1–2: разогрев. */
    fight1: string[][];
    /** Комнаты 4–5: после события, сложнее. */
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
    desc: 'Звери, гоблины и разбойники.',
    encounters: {
      fight1: [
        ['wolf', 'wolf'],
        ['boar'],
        ['rat', 'rat', 'rat'],
        ['bat', 'bat'],
        ['spider'],
        ['goblin', 'rat'],
      ],
      fight2: [
        ['cutthroat', 'bandit_archer'],
        ['wolf', 'wolf', 'wolf'],
        ['boar', 'bandit_archer'],
        ['spider', 'bat'],
        ['goblin_shaman', 'goblin'],
        ['cutthroat', 'rat', 'rat'],
        ['boar', 'spider'],
        ['goblin', 'goblin', 'bat'],
      ],
      elite: [['bear'], ['troll'], ['cutthroat', 'goblin_shaman', 'bandit_archer']],
      boss: [['alpha_wolf', 'wolf']],
    },
    gearTiers: [1, 2],
    artTiers: [1],
    bossGearTier: 3,
  },
  {
    id: 'crypt',
    name: 'Склеп',
    desc: 'Нежить и те, кто её поднимает.',
    encounters: {
      fight1: [
        ['skeleton_warrior', 'skeleton_archer'],
        ['ghost', 'ghost'],
        ['grave_slime'],
        ['mummy'],
        ['wraith'],
        ['skeleton_archer', 'skeleton_archer'],
      ],
      fight2: [
        ['ghoul', 'skeleton_archer'],
        ['skeleton_warrior', 'skeleton_archer', 'skeleton_archer'],
        ['ghoul', 'ghost'],
        ['vampire'],
        ['witch', 'skeleton_warrior'],
        ['wraith', 'ghost'],
        ['mummy', 'skeleton_archer'],
        ['grave_slime', 'ghoul'],
      ],
      elite: [['necromancer'], ['bone_golem'], ['vampire', 'witch']],
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
      fight1: [
        ['imp', 'imp'],
        ['salamander'],
        ['fire_bat', 'fire_bat'],
        ['hellhound'],
        ['kamikaze_imp', 'imp'],
        ['lava_slime'],
      ],
      fight2: [
        ['cultist', 'salamander'],
        ['golem'],
        ['imp', 'imp', 'imp'],
        ['tormentor'],
        ['fire_priest', 'hellhound'],
        ['lava_slime', 'fire_bat'],
        ['kamikaze_imp', 'kamikaze_imp', 'cultist'],
        ['hellhound', 'hellhound'],
      ],
      elite: [['fire_elemental'], ['golem', 'cultist'], ['minotaur'], ['tormentor', 'fire_priest']],
      boss: [['dragon']],
    },
    gearTiers: [3, 4, 5],
    artTiers: [2, 3],
    bossGearTier: null,
  },
];

export const ROOM_KINDS: RoomKind[] = ['fight', 'fight', 'event', 'fight', 'fight', 'elite', 'boss'];

export const ROOMS_PER_LOCATION = ROOM_KINDS.length;

/** Боёв за забег — для статистики и «лучшего результата». */
export const FIGHTS_PER_RUN = ROOM_KINDS.filter((k) => k !== 'event').length * LOCATIONS.length;

export const ROOM_NAMES: Record<RoomKind, string> = {
  fight: 'Бой',
  event: 'Событие',
  elite: 'Элита',
  boss: 'Босс',
};

export function roomKind(roomIndex: number): RoomKind {
  return ROOM_KINDS[roomIndex] ?? 'boss';
}
