import type {
  ArtTier,
  ArtifactInstance,
  EventOption,
  GearInstance,
  GearKind,
  GearTier,
  HeroPersistent,
  LootItem,
  RewardScreen,
  RewardSource,
  RoomKind,
  ShopState,
} from './types';
import { chance, pick, type Rng } from './rng';
import { ARTIFACT_IDS } from '../data/artifacts';
import { makeGear } from '../data/gear';
import { heroDef } from '../data/heroes';
import type { ActDef } from '../data/locations';
import { isMaxed } from './equipment';

const ARTIFACT_CHANCE = 0.55;

// ─── Золото ────────────────────────────────────────────────────────────────

export const START_GOLD = 10;
export const REROLL_COST = 5;
const GOLD_REWARD: Record<RoomKind, number> = { fight: 2, event: 0, elite: 4, boss: 6 };

/** Сколько золота даёт победа в комнате этого типа. */
export function goldReward(kind: RoomKind): number {
  return GOLD_REWARD[kind];
}

// ─── Магазин ───────────────────────────────────────────────────────────────

/** Лекарь: доля максимума HP за визит и цена. 20 %, а не 30 %, как у родника: с 30 % бот выигрывал слишком часто. */
export const SHOP_HEAL_PCT = 0.2;
export const SHOP_HEAL_COST = 5;
/** Цена экипировки по тиру и артефакта по тиру. Переброс товаров стоит как переброс награды. */
export const SHOP_GEAR_PRICE: Record<GearTier, number> = { 1: 7, 2: 9, 3: 12, 4: 15, 5: 18 };
export const SHOP_ART_PRICE: Record<ArtTier, number> = { 1: 6, 2: 9, 3: 12 };

export function gearPrice(gear: GearInstance): number {
  return SHOP_GEAR_PRICE[gear.tier];
}

export function artifactPrice(art: ArtifactInstance): number {
  return SHOP_ART_PRICE[art.tier];
}

/** Товары магазина из пула текущего акта: экипировка под героя, артефакт из ещё не максимальных. */
export function rollShop(rng: Rng, hero: HeroPersistent, act: ActDef): ShopState {
  return {
    gear: rollGear(rng, hero, act.gearTiers),
    artifact: rollArtifact(rng, hero, act.artTiers, []),
    healed: false,
    rerolled: false,
  };
}

// ─── Генерация ─────────────────────────────────────────────────────────────

function bump<T extends number>(tiers: T[], max: T): T[] {
  const out = tiers.map((t) => Math.min(t + 1, max) as T);
  return Array.from(new Set(out));
}

export function rollArtifact(rng: Rng, hero: HeroPersistent, tiers: ArtTier[], exclude: string[]): ArtifactInstance | null {
  const ids = ARTIFACT_IDS.filter((id) => !exclude.includes(id) && !isMaxed(hero, id));
  if (ids.length === 0) return null;
  return { id: pick(rng, ids), tier: pick(rng, tiers) };
}

/** Экипировка под героя: оружие выпадает с учётом его владения, броня — с учётом умения носить. */
export function rollGear(rng: Rng, hero: HeroPersistent, tiers: GearTier[], kind?: GearKind): GearInstance {
  const k = kind ?? pick(rng, ['weapon', 'armor'] as GearKind[]);
  return makeGear(rng, k, pick(rng, tiers), heroDef(hero.defId));
}

export function rollRewards(rng: Rng, hero: HeroPersistent, act: ActDef, source: 'fight' | 'elite'): LootItem[] {
  const gearTiers = source === 'elite' ? bump(act.gearTiers, 5 as GearTier) : act.gearTiers;
  const artTiers = source === 'elite' ? bump(act.artTiers, 3 as ArtTier) : act.artTiers;
  const items: LootItem[] = [];
  const usedArts: string[] = [];
  const gearKinds: GearKind[] = [];
  for (let i = 0; i < 3; i++) {
    if (chance(rng, ARTIFACT_CHANCE)) {
      const a = rollArtifact(rng, hero, artTiers, usedArts);
      if (a) {
        usedArts.push(a.id);
        items.push({ kind: 'artifact', artifact: a });
        continue;
      }
    }
    let kind: GearKind;
    if (gearKinds.includes('weapon') && !gearKinds.includes('armor')) kind = 'armor';
    else if (gearKinds.includes('armor') && !gearKinds.includes('weapon')) kind = 'weapon';
    else kind = pick(rng, ['weapon', 'armor'] as GearKind[]);
    gearKinds.push(kind);
    items.push({ kind: 'gear', gear: rollGear(rng, hero, gearTiers, kind) });
  }
  return items;
}

function rollBossGear(rng: Rng, hero: HeroPersistent, act: ActDef): LootItem[] {
  const gearTier = act.bossGearTier;
  if (!gearTier) return [];
  return [
    { kind: 'gear', gear: rollGear(rng, hero, [gearTier], 'weapon') },
    { kind: 'gear', gear: rollGear(rng, hero, [gearTier], 'armor') },
  ];
}

function rollBossArts(rng: Rng, hero: HeroPersistent, act: ActDef): LootItem[] {
  const arts: LootItem[] = [];
  const used: string[] = [];
  const tiers = bump(act.artTiers, 3 as ArtTier);
  for (let i = 0; i < 3; i++) {
    const a = rollArtifact(rng, hero, tiers, used);
    if (!a) break;
    used.push(a.id);
    arts.push({ kind: 'artifact', artifact: a });
  }
  return arts;
}

/** Варианты награды по источнику — так же перебрасываются за золото. */
export function rollRewardOptions(rng: Rng, hero: HeroPersistent, act: ActDef, source: RewardSource): LootItem[] {
  switch (source) {
    case 'fight':
    case 'elite':
      return rollRewards(rng, hero, act, source);
    case 'bossGear':
      return rollBossGear(rng, hero, act);
    case 'bossArt':
      return rollBossArts(rng, hero, act);
  }
}

export function rollBossRewards(rng: Rng, hero: HeroPersistent, act: ActDef): RewardScreen[] {
  // Финальный босс: забег на этом заканчивается, награда игроку уже не нужна.
  if (!act.bossGearTier) return [];
  const screens: RewardScreen[] = [{ title: 'Трофей босса', source: 'bossGear', options: rollBossGear(rng, hero, act), rerolled: false }];
  const arts = rollBossArts(rng, hero, act);
  if (arts.length > 0) screens.push({ title: 'Артефакт босса', source: 'bossArt', options: arts, rerolled: false });
  return screens;
}

export function rollEvent(rng: Rng, hero: HeroPersistent, act: ActDef): EventOption[] {
  const art = rollArtifact(rng, hero, act.artTiers, []);
  const gear = rollGear(rng, hero, act.gearTiers);
  const opts: EventOption[] = [{ id: 'spring', title: 'Родник', desc: 'Восстановить 30 % максимального HP.' }];
  if (art) {
    opts.push({
      id: 'altar',
      title: 'Алтарь',
      desc: 'Потерять 10 % максимального HP и забрать артефакт.',
      artifact: art,
    });
  }
  opts.push({ id: 'chest', title: 'Сундук', desc: 'Экипировка: наденется сразу, старый предмет пропадёт.', gear });
  return opts;
}
