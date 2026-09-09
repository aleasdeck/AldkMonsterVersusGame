import type { ArtTier, EventKind, GearTier, LocationId, RoomKind } from '../engine/types';
import { shuffle, type Rng } from '../engine/rng';

export type LocationTier = 1 | 2 | 3;

export interface LocationDef {
  id: LocationId;
  name: string;
  desc: string;
  /**
   * Под какой акт задизайнены числа врагов: 1 — ранний, 2 — средний, 3 — поздний.
   * В забеге локация может выпасть любым актом — враги домножаются под него (см. enemyScale).
   */
  tier: LocationTier;
  encounters: {
    /** Комнаты 1–2: разогрев. */
    fight1: string[][];
    /** Комнаты 4–5: после события, сложнее. */
    fight2: string[][];
    elite: string[][];
    boss: string[][];
  };
}

/** Что выпадает в акте забега — не зависит от того, какая локация выпала. */
export interface ActDef {
  gearTiers: GearTier[];
  artTiers: ArtTier[];
  /** Гарантированная экипировка за босса. null — финальный босс, награды нет. */
  bossGearTier: GearTier | null;
}

export const ACTS: ActDef[] = [
  { gearTiers: [1, 2], artTiers: [1], bossGearTier: 3 },
  { gearTiers: [2, 3], artTiers: [1, 2], bossGearTier: 4 },
  { gearTiers: [3, 4, 5], artTiers: [2, 3], bossGearTier: null },
];

export const ACTS_PER_RUN = ACTS.length;

/**
 * Насколько враги акта сильнее врагов первого: HP/блок/лечение и урон/DoT.
 * Числа сняты с уже отбалансированных Леса, Склепа и Пещер: рядовые враги растут быстрее,
 * элиты и боссы — медленнее (иначе вожак стаи в третьем акте был бы толще дракона).
 */
export type EnemyScale = { hp: number; dmg: number };

export const ACT_SCALE: Record<'normal' | 'elite', EnemyScale[]> = {
  normal: [
    { hp: 1, dmg: 1 },
    { hp: 2.05, dmg: 1.5 },
    { hp: 2.7, dmg: 1.95 },
  ],
  elite: [
    { hp: 1, dmg: 1 },
    { hp: 1.5, dmg: 1.25 },
    { hp: 2.4, dmg: 1.7 },
  ],
};

export const LOCATIONS: LocationDef[] = [
  {
    id: 'forest',
    name: 'Лес',
    desc: 'Звери, гоблины и разбойники.',
    tier: 1,
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
  },
  {
    id: 'swamp',
    name: 'Болота',
    desc: 'Пиявки, жабы и то, что тянет на дно.',
    tier: 1,
    encounters: {
      fight1: [
        ['leech', 'leech', 'leech'],
        ['toad'],
        ['mosquito_swarm', 'rat'],
        ['will_o_wisp', 'will_o_wisp'],
        ['spider'],
        ['triton'],
      ],
      fight2: [
        ['kikimora', 'leech'],
        ['drowned'],
        ['toad', 'mosquito_swarm'],
        ['triton', 'triton'],
        ['ghost', 'will_o_wisp'],
        ['drowned', 'leech', 'leech'],
        ['kikimora', 'spider'],
        ['toad', 'toad'],
      ],
      elite: [['hydra'], ['toad_mother'], ['drowned', 'kikimora', 'triton']],
      boss: [['bog_horror', 'leech']],
    },
  },
  {
    id: 'crypt',
    name: 'Склеп',
    desc: 'Нежить и те, кто её поднимает.',
    tier: 2,
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
  },
  {
    id: 'hive',
    name: 'Осквернённый улей',
    desc: 'Хитин, кислота и выводок, который не кончается.',
    tier: 2,
    encounters: {
      fight1: [
        ['drone', 'larva'],
        ['wasp', 'wasp'],
        ['larva', 'larva', 'larva'],
        ['sporeling'],
        ['egg_cluster', 'larva'],
        ['drone'],
      ],
      fight2: [
        ['beetle'],
        ['wasp', 'drone'],
        ['sporeling', 'egg_cluster'],
        ['cultist', 'larva', 'larva'],
        ['grave_slime', 'wasp'],
        ['drone', 'drone'],
        ['beetle', 'sporeling'],
        ['spider', 'wasp', 'larva'],
      ],
      elite: [['chitin_colossus'], ['wasp_queen'], ['beetle', 'sporeling', 'cultist']],
      boss: [['hive_heart', 'larva', 'larva']],
    },
  },
  {
    id: 'caves',
    name: 'Пещеры огня',
    desc: 'Демоны, элементали и культисты.',
    tier: 3,
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
  },
  {
    id: 'ship',
    name: 'Пиратский корабль',
    desc: 'Команда, которая не спешит умирать, и то, что живёт под килем.',
    tier: 3,
    encounters: {
      fight1: [
        ['rat', 'rat', 'rat'],
        ['parrot', 'pirate'],
        ['powder_monkey', 'rat'],
        ['skeleton_warrior', 'skeleton_archer'],
        ['pirate'],
        ['siren'],
      ],
      fight2: [
        ['pirate', 'gunner'],
        ['bosun', 'rat', 'rat'],
        ['tentacle'],
        ['siren', 'parrot'],
        ['powder_monkey', 'powder_monkey', 'pirate'],
        ['skeleton_warrior', 'skeleton_archer', 'skeleton_archer'],
        ['gunner', 'gunner'],
        ['bosun', 'pirate'],
      ],
      elite: [['first_mate'], ['sea_devil'], ['tentacle', 'tentacle'], ['bosun', 'gunner', 'pirate']],
      boss: [['cursed_captain']],
    },
  },
];

export const LOCATION_BY_ID: Record<LocationId, LocationDef> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l])) as Record<LocationId, LocationDef>;

export function locationDef(id: LocationId): LocationDef {
  return LOCATION_BY_ID[id];
}

/** Три разные локации на забег в случайном порядке. */
export function pickRunLocations(rng: Rng): LocationId[] {
  return shuffle(
    rng,
    LOCATIONS.map((l) => l.id),
  ).slice(0, ACTS_PER_RUN);
}

/**
 * Надбавка к урону врагов по акту поверх приведения: +40 % в первом, +60 % во втором, +75 % в третьем.
 * Подобрана умным ботом-симулятором (v0.10): с прежними 1 / 1.15 / 1.15 он выигрывал 91–97 % забегов,
 * с этими и блоком 80 % — 42–58 %. Первый акт больше не бесплатный.
 */
export const ACT_DMG_BONUS: [number, number, number] = [1.4, 1.6, 1.75];

/**
 * Множители для врага с «родной» локации tier, попавшего в акт act (0..2):
 * числа врага заданы под его tier, нужно привести их к акту и добавить надбавку акта к урону.
 */
export function enemyScale(homeTier: LocationTier, act: number, rank: 'normal' | 'elite' | 'boss' = 'normal'): EnemyScale {
  const table = ACT_SCALE[rank === 'normal' ? 'normal' : 'elite'];
  const idx = Math.max(0, Math.min(ACTS_PER_RUN - 1, act));
  const from = table[homeTier - 1];
  const to = table[idx];
  return { hp: to.hp / from.hp, dmg: (to.dmg / from.dmg) * ACT_DMG_BONUS[idx] };
}

/**
 * Этаж локации: девять клеток, два случайных события. Торговца и привала как своих клеток нет —
 * они выпадают в событии (EVENT_WEIGHTS), после босса герой лечится на BOSS_HEAL_PCT и сразу идёт в следующую локацию.
 */
export const ROOM_KINDS: RoomKind[] = ['fight', 'fight', 'event', 'fight', 'fight', 'event', 'fight', 'elite', 'boss'];

export const ROOMS_PER_LOCATION = ROOM_KINDS.length;

/** Гарантированных боёв за забег — для статистики и «лучшего результата»; элита из события сверх того. */
export const FIGHTS_PER_RUN = ROOM_KINDS.filter((k) => k !== 'event' && k !== 'shop').length * ACTS_PER_RUN;

export const ROOM_NAMES: Record<RoomKind, string> = {
  fight: 'Бой',
  event: 'Событие',
  elite: 'Элита',
  shop: 'Торговец',
  boss: 'Босс',
};

/** Что может выпасть в клетке «Событие», в процентах. Сумма 100. */
export const EVENT_WEIGHTS: Record<EventKind, number> = {
  camp: 10,
  elite: 5,
  shop: 25,
  chest: 25,
  altar: 25,
  forge: 10,
};

export const EVENT_NAMES: Record<EventKind, string> = {
  camp: 'Привал',
  elite: 'Элита',
  shop: 'Торговец',
  chest: 'Сундук',
  altar: 'Алтарь',
  forge: 'Кузнец',
};

/** Доля максимума HP, которую герой восстанавливает после босса локации. */
export const BOSS_HEAL_PCT = 0.3;

export function roomKind(roomIndex: number): RoomKind {
  return ROOM_KINDS[roomIndex] ?? 'boss';
}
