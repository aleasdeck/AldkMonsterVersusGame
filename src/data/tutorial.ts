import type { Rng } from '../engine/rng';
import type { ArtTier, ArtifactInstance, EventKind, GearInstance, HeroPersistent, LocationId, LootItem, RewardFocus } from '../engine/types';
import { artifactDef } from './artifacts';
import { parseOfferItem } from './offer';

/**
 * Обучение (v0.58.0, страница обсуждения — tools/tutorial-proto/obuchenie.html): один этаж Леса, Воин, встречи, события
 * и награды заданы, чтобы каждая механика появилась тогда, когда о ней есть что сказать. Числа — честные, первого акта
 * на «Среднем»: движок играет обычный забег и только берёт отсюда то, что в настоящем решает случай. Мысли героя к этому
 * этажу — в ui/tutorial/thoughts.ts.
 */

export const TUTORIAL_HERO = 'warrior';
export const TUTORIAL_SIGNATURE = 'shield_bash';
export const TUTORIAL_TRAIT = 'stance';
/** Сид постоянный: броски кубика и переброс награды у всех одинаковые, пока игрок делает одно и то же. */
export const TUTORIAL_SEED = 580;
export const TUTORIAL_LOCATION: LocationId = 'forest';

/**
 * Встречи по клеткам этажа: роли приходят по одной — рой, страж со стрелком, громила, заклинатель, громила с поддержкой,
 * элита и босс. Ряд всё равно строит роль (`orderByRole`), порядок в записи его не задаёт.
 */
export const TUTORIAL_FIGHTS: Partial<Record<number, string[]>> = {
  0: ['wolf', 'wolf'],
  1: ['goblin', 'bandit_archer'],
  3: ['boar'],
  4: ['spider', 'bat'],
  6: ['cutthroat', 'goblin_shaman'],
  7: ['bear'],
  9: ['alpha_wolf', 'wolf'],
};

/** События: торговец после двух боёв, сундук посередине, привал перед логовом. */
export const TUTORIAL_EVENTS: Partial<Record<number, EventKind>> = { 2: 'shop', 5: 'chest', 8: 'camp' };

/** Зелье с монстра — в обучении не шансом, а наверняка, после боя с пауком: урок про слот зелья. */
export const TUTORIAL_POTION = { room: 4, potion: 'heal_potion' };

/** Вещи «Щита» по типу сокета — для `need:shield:…`: третья вещь набора приходит, какой бы пул игрок ни выбрал. */
const SHIELD_ITEMS: Record<'weapon' | 'armor', string[]> = {
  weapon: ['shield_ram', 'shield_slam'],
  armor: ['mana_shield', 'wanderer_cloak', 'deaf_defense', 'turtle_shell'],
};
/** Если вещи «Щита» этого сокета у героя уже все, — общая вещь вместо неё. */
const SHIELD_FALLBACK: Record<'weapon' | 'armor', string> = { weapon: 'war_cry', armor: 'troll_heart' };

/**
 * Награды за бои и элиту по клеткам, для обоих пулов: урок случается, какой бы пул игрок ни выбрал. Строки — `parseOffer`
 * (data/offer.ts) и два особых вида: `dup:<сокет>|<запас>` — дубликат вставленной вещи этого типа сокета (поднимет её тир),
 * если такой нет — запас; `need:shield:<сокет>` — вещь «Щита» этого сокета, которой у героя ещё нет.
 */
export const TUTORIAL_REWARDS: Partial<Record<number, Record<RewardFocus, string[]>>> = {
  // Карточка, владение (лук и роба чужие), тир и число гнёзд, тип гнезда.
  0: { attack: ['w:sword:2:s=wx:none', 'art:grapple_hook:1', 'w:bow:2:s=xw:none'], defense: ['a:plate:2:s=ax:none', 'art:mana_shield:1', 'a:robe:2:s=ax:none'] },
  // Знак архетипа и набор 2/3; другой знак; копьё достаёт любого.
  1: { attack: ['art:shield_ram:1', 'art:bleed_cut:1', 'w:spear:1:s=w:none'], defense: ['art:wanderer_cloak:1', 'art:deaf_defense:1', 'art:troll_heart:1'] },
  // Дубликат поднимает тир.
  3: { attack: ['dup:weapon|need:shield:weapon', 'art:war_cry:1', 'w:axe:2:s=wx:none'], defense: ['dup:armor|need:shield:armor', 'art:turtle_shell:1', 'a:harness:2:s=ax:none'] },
  // Третья вещь знака.
  4: { attack: ['w:spear:2:s=wx:none', 'need:shield:weapon', 'art:stun_strike:1'], defense: ['need:shield:armor', 'a:shell:2:s=ax:none', 'art:stamina_ring:1'] },
  6: { attack: ['need:shield:weapon', 'art:echo_strike:1', 'w:hammer:2:s=wx:none'], defense: ['need:shield:armor', 'art:regen_amulet:1', 'a:mail:2:s=ax:none'] },
  // Элита: тир выше и ключевая вещь.
  7: { attack: ['w:sword:3:s=wx:none', 'need:shield:weapon', 'art:momentum:1'], defense: ['art:bastion:1', 'a:plate:3:s=ax:none', 'need:shield:armor'] },
};

/** Сундук на клетке 5: золото и две вещи — оберег «Щита», которого у героя нет, и булава второго тира. */
const TUTORIAL_CHEST = { gold: 6, gear: 'w:mace:2:s=wx:none', artifact: 'need:shield:armor' };

/** Вставленные артефакты героя (без врождённого навыка: он не в сокете). */
function socketArts(hero: HeroPersistent): ArtifactInstance[] {
  return [...hero.weapon.slots, ...hero.armor.slots].filter((a): a is ArtifactInstance => !!a);
}

/** Строка сценария → предмет; `taken` — id артефактов, уже лежащих в этой тройке (вторая такая же карточка не нужна). */
function resolveItem(spec: string, hero: HeroPersistent, taken: Set<string>, rng: Rng): LootItem | null {
  const [head, fallback] = spec.split('|');
  if (head.startsWith('dup:')) {
    const slot = head.slice(4) as 'weapon' | 'armor';
    const dup = socketArts(hero).find((a) => a.tier < 3 && artifactDef(a.id).slot === slot && !taken.has(a.id));
    if (dup) return { kind: 'artifact', artifact: { id: dup.id, tier: 1 } };
    return fallback ? resolveItem(fallback, hero, taken, rng) : null;
  }
  if (head.startsWith('need:shield:')) {
    const slot = head.slice('need:shield:'.length) as 'weapon' | 'armor';
    const have = new Set(socketArts(hero).map((a) => a.id));
    const id = SHIELD_ITEMS[slot].find((x) => !have.has(x) && !taken.has(x)) ?? SHIELD_FALLBACK[slot];
    return { kind: 'artifact', artifact: { id, tier: 1 as ArtTier } };
  }
  return parseOfferItem(head, rng);
}

function resolveList(specs: string[], hero: HeroPersistent, rng: Rng): LootItem[] {
  const taken = new Set<string>();
  const out: LootItem[] = [];
  for (const spec of specs) {
    const item = resolveItem(spec, hero, taken, rng);
    if (!item) continue;
    if (item.kind === 'artifact') taken.add(item.artifact.id);
    out.push(item);
  }
  return out;
}

/** Тройка награды обучения для клетки и пула; null — клетка без своей награды (тогда катится обычная). */
export function tutorialRewards(room: number, focus: RewardFocus, hero: HeroPersistent, rng: Rng): LootItem[] | null {
  const specs = TUTORIAL_REWARDS[room]?.[focus];
  return specs ? resolveList(specs, hero, rng) : null;
}

/** Содержимое сундука обучения: золото и две вещи — два штифта в замке. */
export function tutorialChest(hero: HeroPersistent, rng: Rng): { gold: number; gear: GearInstance | null; artifact: ArtifactInstance | null; potion: string | null } {
  const [gear, art] = resolveList([TUTORIAL_CHEST.gear, TUTORIAL_CHEST.artifact], hero, rng);
  return {
    gold: TUTORIAL_CHEST.gold,
    gear: gear?.kind === 'gear' ? gear.gear : null,
    artifact: art?.kind === 'artifact' ? art.artifact : null,
    potion: null,
  };
}
