import type {
  ArtTier,
  ArtifactInstance,
  EventKind,
  GearInstance,
  GearKind,
  GearTier,
  HeroPersistent,
  LootItem,
  RewardFocus,
  RewardScreen,
  RewardSource,
  RoomKind,
  DerivedStats,
  ShopState,
  StatusId,
} from './types';
import { chance, pick, shuffle, weighted, type Rng } from './rng';
import { ARTIFACT_IDS, artifactCost, artifactDef } from '../data/artifacts';
import { artifactTags } from '../data/archetypes';
import { makeGear } from '../data/gear';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import { EVENT_WEIGHTS, type ActDef } from '../data/locations';
import { POTION_IDS, potionDef } from '../data/potions';
import { isMaxed, socketRefs } from './equipment';
import { heroStatsOf, innateOf } from './stats';

const ARTIFACT_CHANCE = 0.55;

// ─── Зелья ─────────────────────────────────────────────────────────────────

/** Шанс, что после боя (обычного, элиты или босса) с монстра выпадет зелье — отдельным экраном после награды. */
export const POTION_DROP_CHANCE = 0.1;
/** Цена зелья у торговца: расходник, дешевле любого артефакта. */
export const SHOP_POTION_PRICE = 4;

/** Случайное зелье под героя: зелье маны не выпадает тому, у кого маны нет. */
export function rollPotion(rng: Rng, hero: HeroPersistent): string {
  const hasMp = heroStatsOf(heroDef(hero.defId), hero).maxMp > 0;
  const ids = POTION_IDS.filter((id) => hasMp || !potionDef(id).needsMp);
  return pick(rng, ids);
}

/** Экран «с монстра выпало зелье»: одна карточка, взять или пропустить, переброса нет. */
export function potionRewardScreen(potion: string): RewardScreen {
  return { title: 'С монстра выпало зелье', source: 'potion', options: [{ kind: 'potion', potion }], rerolled: true };
}

// ─── Золото ────────────────────────────────────────────────────────────────

export const START_GOLD = 10;
export const REROLL_COST = 5;
const GOLD_REWARD: Record<RoomKind, number> = { fight: 2, event: 0, elite: 4, shop: 0, boss: 6 };

/** Сколько золота даёт победа в комнате этого типа. */
export function goldReward(kind: RoomKind): number {
  return GOLD_REWARD[kind];
}

// ─── Гном-деньгокрад ───────────────────────────────────────────────────────

/**
 * Экономика вора. За бой он успевает срезать два кошеля — это цена переброса плюс лечение у торговца,
 * то есть потеря заметная, но не рушащая забег. Убитый возвращает украденное и отдаёт свой мешок сверху:
 * событие выгоднее алтаря, если гнома добить, и дороже всех прочих, если упустить.
 */
export const GNOME_STEAL = 5;
export const GNOME_BOUNTY = 12;
/** Шанс, что с мешка вора упадёт ещё и артефакт. */
export const GNOME_ART_CHANCE = 0.45;

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

/** Товары магазина из пула текущего акта: экипировка под героя, артефакт из ещё не максимальных, одно зелье. */
export function rollShop(rng: Rng, hero: HeroPersistent, act: ActDef): ShopState {
  return {
    gear: rollGear(rng, hero, act.gearTiers, undefined, act.rareGear),
    artifact: rollArtifact(rng, hero, act.artTiers, []),
    potion: rollPotion(rng, hero),
    healed: false,
    rerolled: false,
  };
}

// ─── Генерация ─────────────────────────────────────────────────────────────

function bump<T extends number>(tiers: T[], max: T): T[] {
  const out = tiers.map((t) => Math.min(t + 1, max) as T);
  return Array.from(new Set(out));
}

/**
 * Может ли артефакт выпасть герою: персональные не выпадают никому (v0.44) — выбранный стал врождённым навыком
 * героя с уровнем по локации, невыбранный в этом забеге не нужен.
 */
export function canDropFor(_hero: HeroPersistent, id: string): boolean {
  return !SIGNATURE_OWNER[id];
}

/** Вещи героя, которые тянут дроп и связки: вставленные артефакты и врождённый навык. */
function heroArts(hero: HeroPersistent): string[] {
  const ids = socketRefs(hero).flatMap((ref) => (ref.art ? [ref.art.id] : []));
  const innate = innateOf(hero);
  return innate ? [...ids, innate.id] : ids;
}

// ─── Сходимость дропа (v0.40) ──────────────────────────────────────────────
// До этого артефакт катился равновероятно из полусотни, и за забег набиралась горсть несвязанных приёмов.
// Теперь у пула есть тяга к тому, что уже в руках: дубликат (кузнец артефакты не улучшает, дубликат — единственный
// путь к тиру 3) и вторая половина связки. Выпадать при этом не перестаёт ничто — меняются только веса.

/** Во сколько раз чаще выпадает артефакт, уже стоящий в сокете: такой дубликат поднимает ему тир. */
const DUPLICATE_WEIGHT = 3;
/** Во сколько раз чаще выпадает вторая половина связки: выплата к статусу, который герой уже вешает, или заводка к его выплате. */
const SYNERGY_WEIGHT = 3;

/** Проклятия, которые читает «Резонанс»: он платит за любое из них, поэтому дружит с любой заводкой. */
const ALL_DEBUFFS: StatusId[] = ['weak', 'bleed', 'burn', 'poison', 'stun', 'vulnerable'];

/** Какие статусы артефакт вешает на врага и на каких у него выплата. */
interface ArtifactStatuses {
  applies: StatusId[];
  pays: StatusId[];
}

/** Состав от тира не зависит, но считается по тиру 3: на первом часть статов ещё нули. Данные неизменны — считаем один раз. */
const artifactStatusCache = new Map<string, ArtifactStatuses>();

function artifactStatuses(id: string): ArtifactStatuses {
  const hit = artifactStatusCache.get(id);
  if (hit) return hit;
  const def = artifactDef(id);
  const applies = new Set<StatusId>();
  const pays = new Set<StatusId>();
  const m = def.mods?.(3) ?? {};
  if (m.onHitBleed) applies.add('bleed');
  if (m.onHitBurn) applies.add('burn');
  if (m.onHitPoison) applies.add('poison');
  if (m.markOnHit) applies.add('vulnerable');
  if (m.stunOnCrit) applies.add('stun');
  if (m.vsBleed || m.bleedMult || m.bleedAdd || m.bleedTwice) pays.add('bleed');
  if (m.burnAdd || m.burnSpread || m.blockPerBurning) pays.add('burn');
  if (m.spellIgniteAll) applies.add('burn');
  if (m.dotLeech) {
    pays.add('bleed');
    pays.add('poison');
  }
  if (m.poisonVuln) pays.add('poison');
  if (m.spellVsBurn) pays.add('burn');
  if (m.stunCrit) pays.add('stun');
  if (m.perDebuff) for (const st of ALL_DEBUFFS) pays.add(st);
  for (const e of def.effects?.(3) ?? []) {
    if (e.type === 'status' && e.target !== 'self') applies.add(e.status);
    // Стихийная заточка вешает случайную из трёх ран — заводит любую выплату по ранам.
    if (e.type === 'enchant') for (const st of ['bleed', 'burn', 'poison'] as StatusId[]) applies.add(st);
    if (e.type === 'detonate' || e.type === 'spread') for (const st of e.statuses) pays.add(st);
    if (e.type === 'scorch') pays.add('burn');
    if (e.type === 'spell' && e.vsWeak) pays.add('weak');
  }
  const out: ArtifactStatuses = { applies: [...applies], pays: [...pays] };
  artifactStatusCache.set(id, out);
  return out;
}

/** Что герой уже вешает на врагов: аффиксы и перки снаряжения (они лежат в статах) плюс эффекты вставленных артефактов. */
function heroApplies(hero: HeroPersistent, s: DerivedStats): Set<StatusId> {
  const out = new Set<StatusId>();
  if (s.onHitBleed > 0) out.add('bleed');
  if (s.onHitBurn > 0) out.add('burn');
  if (s.onHitPoison > 0) out.add('poison');
  if (s.markOnHit > 0) out.add('vulnerable');
  if (s.stunOnCrit > 0) out.add('stun');
  for (const id of heroArts(hero)) for (const st of artifactStatuses(id).applies) out.add(st);
  return out;
}

/** На каких статусах у героя уже есть выплата: взрыв ран, заражение, «Гниль», «Раздуть», крит по оглушённым. */
function heroPaysFor(hero: HeroPersistent): Set<StatusId> {
  const out = new Set<StatusId>();
  for (const id of heroArts(hero)) for (const st of artifactStatuses(id).pays) out.add(st);
  return out;
}

/**
 * Множитель дропа для приёмов, которые стоят маны (v0.40.1): ступени по текущему максимуму MP героя.
 * Берсерку с нулевой маной заклинание — мёртвая карточка, Магу и Паладину оно и есть игра, а до этого
 * всем сыпалось одинаково: Ледяной осколок был самым частым приёмом Лучника и вторым у Ассасина.
 * Ключ — цена, а не школа: Молот света помечен физическим, но стоит 1 MP и без маны бесполезен.
 */
function manaWeight(maxMp: number): number {
  if (maxMp <= 0) return 0;
  if (maxMp <= 2) return 0.5;
  if (maxMp <= 4) return 1;
  return 2;
}

/** Стоит ли приём маны хоть на одном тире: цена бывает функцией тира, поэтому смотрим все три. */
const manaCostCache = new Map<string, boolean>();

function costsMana(id: string): boolean {
  const hit = manaCostCache.get(id);
  if (hit !== undefined) return hit;
  const def = artifactDef(id);
  const out = ([1, 2, 3] as ArtTier[]).some((tier) => (artifactCost(def, tier).mp ?? 0) > 0);
  manaCostCache.set(id, out);
  return out;
}

/** Во сколько раз реже выпадает ключевая вещь архетипа (v0.43): её находят, а не получают с первой награды. */
const KEYSTONE_WEIGHT = 0.5;

/**
 * Вес артефакта в броске: втрое за дубликат, втрое за связку с тем, что уже в руках — по статусам или по общей метке
 * архетипа (v0.43), — ступень маны у приёмов с ценой MP и половина у ключевых вещей.
 */
function artifactWeight(id: string, owned: Set<string>, applies: Set<StatusId>, pays: Set<StatusId>, tags: Set<string>, spell: number): number {
  const st = artifactStatuses(id);
  const linked = st.pays.some((s) => applies.has(s)) || st.applies.some((s) => pays.has(s)) || artifactTags(id).some((t) => tags.has(t));
  const key = artifactDef(id).keystone ? KEYSTONE_WEIGHT : 1;
  return (owned.has(id) ? DUPLICATE_WEIGHT : 1) * (linked ? SYNERGY_WEIGHT : 1) * (costsMana(id) ? spell : 1) * key;
}

/** Артефакт из пула: `slot` сужает до оружейных или бронных (пул награды «Нападение» / «Защита»); торговец, алтарь и вор катят из всех. */
export function rollArtifact(rng: Rng, hero: HeroPersistent, tiers: ArtTier[], exclude: string[], slot?: GearKind): ArtifactInstance | null {
  const ids = ARTIFACT_IDS.filter((id) => !exclude.includes(id) && !isMaxed(hero, id) && canDropFor(hero, id) && (!slot || artifactDef(id).slot === slot));
  if (ids.length === 0) return null;
  const stats = heroStatsOf(heroDef(hero.defId), hero);
  const applies = heroApplies(hero, stats);
  const pays = heroPaysFor(hero);
  const owned = new Set(socketRefs(hero).flatMap((ref) => (ref.art ? [ref.art.id] : [])));
  // Метки навыка тоже тянут дроп: это и есть сродство героя с его архетипом (v0.44).
  const tags = new Set<string>(heroArts(hero).flatMap((id) => artifactTags(id)));
  const spell = manaWeight(stats.maxMp);
  const items = ids.map((candidate) => ({ item: candidate, weight: artifactWeight(candidate, owned, applies, pays, tags, spell) }));
  // Весь пул обнулился (у безманового героя остались одни заклинания) — берём равновероятно, иначе weighted бросит.
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  const id = total > 0 ? weighted(rng, items) : pick(rng, ids);
  // Ключевая вещь приходит тиром 1: её сила — в правиле, а не в числах, выше тир поднимают дубликат, привал и переплавка.
  const tier = pick(rng, tiers);
  return { id, tier: artifactDef(id).keystone ? 1 : tier };
}

/** Экипировка под героя: оружие выпадает с учётом его владения, броня — с учётом умения носить. */
/** Предмет из пула тиров; rare — редкий тир акта, выпадает вместо пула со своим шансом (обычная награда, торговец, сундук). */
export function rollGear(rng: Rng, hero: HeroPersistent, tiers: GearTier[], kind?: GearKind, rare?: ActDef['rareGear']): GearInstance {
  const k = kind ?? pick(rng, ['weapon', 'armor'] as GearKind[]);
  const tier = rare && chance(rng, rare.chance) ? rare.tier : pick(rng, tiers);
  return makeGear(rng, k, tier, heroDef(hero.defId));
}

/** Какой тип предметов и сокетов соответствует пулу награды. */
export function focusGearKind(focus: RewardFocus): GearKind {
  return focus === 'attack' ? 'weapon' : 'armor';
}

/** Роли карточек в тройке (v0.40): предмет и артефакт закреплены, третья катится как раньше. Порядок на экране перемешивается. */
const REWARD_ROLES = ['gear', 'artifact', 'free'] as const;

/**
 * Три варианта награды из выбранного пула (v0.39): «Нападение» — оружие и оружейные артефакты, «Защита» — броня и бронные.
 * Состав тройки закреплён (v0.40): предмет, артефакт и свободная карточка с шансом ARTIFACT_CHANCE. Раньше все три катились
 * независимо, и каждая десятая награда приходила вовсе без артефакта, а каждая одиннадцатая — без предмета: игрок, которому
 * нужна была одна из двух половин сборки, регулярно получал тройку из другой. Когда артефакты пула у героя все на максимуме,
 * вместо артефакта катится предмет.
 */
export function rollRewards(rng: Rng, hero: HeroPersistent, act: ActDef, source: 'fight' | 'elite', focus: RewardFocus): LootItem[] {
  const gearTiers = source === 'elite' ? bump(act.gearTiers, 5 as GearTier) : act.gearTiers;
  const artTiers = source === 'elite' ? bump(act.artTiers, 3 as ArtTier) : act.artTiers;
  const kind = focusGearKind(focus);
  const items: LootItem[] = [];
  const usedArts: string[] = [];
  for (const role of REWARD_ROLES) {
    if (role === 'artifact' || (role === 'free' && chance(rng, ARTIFACT_CHANCE))) {
      const a = rollArtifact(rng, hero, artTiers, usedArts, kind);
      if (a) {
        usedArts.push(a.id);
        items.push({ kind: 'artifact', artifact: a });
        continue;
      }
    }
    items.push({ kind: 'gear', gear: rollGear(rng, hero, gearTiers, kind, source === 'fight' ? act.rareGear : undefined) });
  }
  // Иначе предмет всегда лежал бы первым, а артефакт вторым.
  return shuffle(rng, items);
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

/** Варианты награды по источнику — так же перебрасываются за золото. Награде за бой нужен выбранный пул. */
export function rollRewardOptions(rng: Rng, hero: HeroPersistent, act: ActDef, source: RewardSource, focus?: RewardFocus): LootItem[] {
  switch (source) {
    case 'fight':
    case 'elite':
      if (!focus) return [];
      return rollRewards(rng, hero, act, source, focus);
    case 'bossGear':
      return rollBossGear(rng, hero, act);
    case 'bossArt':
      return rollBossArts(rng, hero, act);
    case 'potion':
      return [{ kind: 'potion', potion: rollPotion(rng, hero) }];
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

// ─── События ───────────────────────────────────────────────────────────────

/** Что выпало в клетке «Событие» — по весам EVENT_WEIGHTS. */
export function rollEventKind(rng: Rng): EventKind {
  return weighted(
    rng,
    (Object.keys(EVENT_WEIGHTS) as EventKind[]).map((kind) => ({ item: kind, weight: EVENT_WEIGHTS[kind] })),
  );
}

/** Алтарь: молитва лечит долю максимума HP, жертва отнимает долю и даёт артефакт. */
export const ALTAR_HEAL_PCT = 0.3;
export const ALTAR_SACRIFICE_PCT = 0.1;

/** Кузнец: поднять тир предмета на 1 стоит как покупка предмета нового тира — аффикс, сокеты и артефакты при этом остаются. */
export function forgePrice(gear: GearInstance): number {
  return SHOP_GEAR_PRICE[Math.min(5, gear.tier + 1) as GearTier];
}
