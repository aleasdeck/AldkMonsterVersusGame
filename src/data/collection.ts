import type { GearKind, GearTier } from '../engine/types';
import type { Rng } from '../engine/rng';
import { pick } from '../engine/rng';
import { ARTIFACT_IDS, artifactCostText, artifactDef } from './artifacts';
import { GEAR_TIERS, baseDamage, baseTitle, gearBases } from './gear';

/**
 * Каталог всего, что встречается в приключениях: артефакты и базы экипировки.
 * Коллекция — альбом находок, на сам забег она не влияет.
 */

export type CollectibleKind = 'artifact' | 'weapon' | 'armor';

export interface Collectible {
  /** Уникальный id вида «art:fireball» или «weapon:sword». */
  id: string;
  kind: CollectibleKind;
  name: string;
  glyph: string;
  color: string;
  /** Подпись под названием. */
  sub: string;
  /** Что предмет делает — для карточки в коллекции. */
  desc: string;
}

const KIND_COLORS: Record<CollectibleKind, string> = {
  artifact: '#c77dff',
  weapon: '#ffb703',
  armor: '#8ecae6',
};

const KIND_NAMES: Record<CollectibleKind, string> = {
  artifact: 'Артефакт',
  weapon: 'Оружие',
  armor: 'Броня',
};

function artifactEntry(id: string): Collectible {
  const def = artifactDef(id);
  const school = def.kind === 'passive' ? 'пассивный' : def.school === 'magic' ? 'магия' : 'приём';
  const cost = def.kind === 'active' ? ` · ${artifactCostText(def)}` : '';
  return {
    id: `art:${id}`,
    kind: 'artifact',
    name: def.name,
    glyph: def.glyph,
    color: KIND_COLORS.artifact,
    sub: `Артефакт · ${school}${cost}`,
    desc: `Тир 1: ${def.describe(1)}\nТир 3: ${def.describe(3)}`,
  };
}

function gearEntry(kind: GearKind, baseId: string): Collectible {
  const base = gearBases(kind).find((b) => b.id === baseId)!;
  const lo = baseDamage(base, 1);
  const hi = baseDamage(base, 5);
  const spread = base.spread === 'narrow' ? 'узкий разброс' : base.spread === 'wide' ? 'широкий разброс' : 'ровный разброс';
  const t1 = GEAR_TIERS[1 as GearTier];
  const t5 = GEAR_TIERS[5 as GearTier];
  const stats =
    kind === 'weapon'
      ? `Урон ${lo.min}–${lo.max} на 1 тире, ${hi.min}–${hi.max} на 5 тире`
      : `+${t1.def} DEF и +${t1.hp} HP на 1 тире, +${t5.def} DEF и +${t5.hp} HP на 5 тире`;
  return {
    id: `${kind}:${baseId}`,
    kind,
    name: base.name[0].toUpperCase() + base.name.slice(1),
    glyph: kind === 'weapon' ? '⚔' : '⛨',
    color: KIND_COLORS[kind],
    sub: kind === 'weapon' ? `${KIND_NAMES.weapon} · ${spread}` : KIND_NAMES.armor,
    desc: `${stats}\nВстречается от «${baseTitle(base, 1)}» до «${baseTitle(base, 5)}»`,
  };
}

export const COLLECTIBLES: Collectible[] = [
  ...ARTIFACT_IDS.map(artifactEntry),
  ...gearBases('weapon').map((b) => gearEntry('weapon', b.id)),
  ...gearBases('armor').map((b) => gearEntry('armor', b.id)),
];

export const COLLECTIBLE_IDS: string[] = COLLECTIBLES.map((c) => c.id);

const BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

export function collectible(id: string): Collectible | null {
  return BY_ID[id] ?? null;
}

/** Ещё не найденные предметы. */
export function lockedIds(unlocked: readonly string[]): string[] {
  const have = new Set(unlocked);
  return COLLECTIBLE_IDS.filter((id) => !have.has(id));
}

/** Приз из сундука: равномерно из ненайденного. Всё собрано — null. */
export function rollCollectible(rng: Rng, unlocked: readonly string[]): string | null {
  const pool = lockedIds(unlocked);
  return pool.length ? pick(rng, pool) : null;
}

/** Длина ленты сундука и место приза: приз стоит далеко, чтобы лента успела разогнаться. */
export const STRIP_LEN = 44;
export const PRIZE_INDEX = 38;

/** Лента случайных предметов, где на фиксированном месте стоит выигрыш. */
export function buildChestStrip(rng: Rng, prize: string): string[] {
  const strip = Array.from({ length: STRIP_LEN }, () => pick(rng, COLLECTIBLE_IDS));
  strip[PRIZE_INDEX] = prize;
  return strip;
}
