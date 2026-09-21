/** Видимый рост тела в логических пикселях боя; ранг и размер файла на него не влияют. */
export const ENEMY_BODY_HEIGHT: Readonly<Record<string, number>> = {
  wolf: 72, boar: 68, rat: 40, bat: 44, spider: 48,
  bandit_archer: 108, cutthroat: 112, goblin: 72, goblin_shaman: 76,
  bear: 140, troll: 156, alpha_wolf: 120,
  skeleton_warrior: 100, skeleton_archer: 100, ghost: 100, ghoul: 92,
  wraith: 108, grave_slime: 64, slimelet: 36, mummy: 108, vampire: 116,
  witch: 108, necromancer: 120, bone_golem: 156, lich: 132, lich_ghost: 132,
  imp: 60, kamikaze_imp: 52, fire_bat: 44, salamander: 64, lava_slime: 64,
  hellhound: 80, cultist: 108, fire_priest: 116, tormentor: 136,
  golem: 148, fire_elemental: 148, minotaur: 156, dragon: 184,
  leech: 36, mosquito_swarm: 48, toad: 56, will_o_wisp: 40,
  kikimora: 92, drowned: 108, triton: 112, hydra: 168, toad_mother: 132, bog_horror: 180,
  drone: 64, wasp: 60, larva: 36, beetle: 88, sporeling: 64, egg_cluster: 48,
  chitin_colossus: 168, wasp_queen: 140, hive_heart: 180,
  pirate: 108, gunner: 108, bosun: 120, parrot: 40, powder_monkey: 56,
  siren: 108, tentacle: 148, first_mate: 116, sea_devil: 140,
  cursed_captain: 124, captain_ghost: 124, gnome_thief: 64, gnome_snatcher: 64,
};

export const HERO_BODY_HEIGHT: Readonly<Record<string, number>> = {
  warrior: 128, mage: 120, assassin: 120, paladin: 132, berserk: 136, archer: 124,
};
