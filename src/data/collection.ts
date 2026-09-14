import type { ArtTier, GearKind, HeroPersistent } from '../engine/types';
import { ARTIFACT_IDS, artifactCostText, artifactDef } from './artifacts';
import { POTION_IDS, potionDef } from './potions';
import { ARMOR_TYPE_GLYPHS, ARMOR_TYPE_NAMES, HEFT_NAMES, WEAPON_TYPE_GLYPHS, WEAPON_TYPE_NAMES, baseArmorStats, baseDamage, baseTitle, dropBases, gearBases, weaponTypeText } from './gear';
import { HERO_LIST, SIGNATURE_OWNER, heroDef } from './heroes';

/**
 * Каталог всего, что встречается в приключениях: артефакты, базы экипировки и зелья.
 * Коллекция — альбом находок: запись открывается тем, что герой держал в руках в забеге (см. loadoutFinds),
 * артефакт — отдельно по каждому тиру. На сам забег коллекция не влияет.
 */

export type CollectibleKind = 'artifact' | 'weapon' | 'armor' | 'potion';

export interface Collectible {
  /** Уникальный id вида «art:fireball» или «weapon:sword». */
  id: string;
  kind: CollectibleKind;
  name: string;
  glyph: string;
  color: string;
  /** Подпись под названием. */
  sub: string;
  /** Что предмет делает — для подсказки в коллекции. У артефакта пусто: его описание разложено по тирам. */
  desc: string;
  /** Описания по тирам 1–3 (только артефакты): каждый тир открывается отдельно. */
  tiers?: string[];
}

/** Тиры артефакта: открываются по отдельности, в том виде, в каком артефакт был у героя. */
export const ART_TIERS: ArtTier[] = [1, 2, 3];

const KIND_COLORS: Record<CollectibleKind, string> = {
  artifact: '#c77dff',
  weapon: '#ffb703',
  armor: '#8ecae6',
  potion: '#6fd97a',
};

const KIND_NAMES: Record<CollectibleKind, string> = {
  artifact: 'Артефакт',
  weapon: 'Оружие',
  armor: 'Броня',
  potion: 'Зелье',
};

function potionEntry(id: string): Collectible {
  const def = potionDef(id);
  return {
    id: `potion:${id}`,
    kind: 'potion',
    name: def.name,
    glyph: def.glyph,
    color: KIND_COLORS.potion,
    sub: `${KIND_NAMES.potion} · расходник`,
    desc: `${def.describe}\nПьётся в бою бесплатно и пропадает, слот один. Падает с монстров и продаётся у торговца.`,
  };
}

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
    sub: `Артефакт · ${school}${cost}${SIGNATURE_OWNER[id] ? ` · персональный: ${heroDef(SIGNATURE_OWNER[id]).name}` : ''}`,
    desc: '',
    tiers: ART_TIERS.map((t) => def.describe(t)),
  };
}

function gearEntry(kind: GearKind, baseId: string): Collectible {
  const base = gearBases(kind).find((b) => b.id === baseId)!;
  const lo = baseDamage(base, 1);
  const hi = baseDamage(base, 5);
  const spread = base.spread === 'narrow' ? 'узкий разброс' : base.spread === 'wide' ? 'широкий разброс' : 'ровный разброс';
  const heft = base.heft ? `${HEFT_NAMES[base.heft]} · ` : '';
  const a1 = baseArmorStats(base, 1);
  const a5 = baseArmorStats(base, 5);
  const stats =
    kind === 'weapon'
      ? `Урон ${lo.min}–${lo.max} на 1 тире, ${hi.min}–${hi.max} на 5 тире`
      : `+${a1.def} DEF и +${a1.hp} HP на 1 тире, +${a5.def} DEF и +${a5.hp} HP на 5 тире`;
  const type = base.type ?? 'melee';
  const armorType = base.armorType ?? 'medium';
  const perkLines: string[] = [];
  if (kind === 'weapon') {
    const owners = HERO_LIST.filter((h) => h.weaponSkill[type]).map((h) => h.name);
    perkLines.push(`${WEAPON_TYPE_NAMES[type]} оружие: ${weaponTypeText(type, 1)}`);
    perkLines.push(`Перк и полный кубик — только у тех, кто владеет этим типом: ${owners.join(', ')}`);
  }
  if (kind === 'armor') {
    const wearers = HERO_LIST.filter((h) => h.armorSkill[armorType]).map((h) => h.name);
    perkLines.push(`${ARMOR_TYPE_NAMES[armorType]} броня: перк работает только у тех, кто умеет её носить — ${wearers.join(', ')}`);
  }
  if (base.perk) perkLines.push(`${base.perk.name}: ${base.perk.text(1)}; на 5 тире — ${base.perk.text(5)}`);
  return {
    id: `${kind}:${baseId}`,
    kind,
    name: base.name[0].toUpperCase() + base.name.slice(1),
    glyph: kind === 'weapon' ? WEAPON_TYPE_GLYPHS[type] : ARMOR_TYPE_GLYPHS[armorType],
    color: KIND_COLORS[kind],
    sub: kind === 'weapon' ? `${WEAPON_TYPE_NAMES[type]} · ${heft}${spread}` : `${ARMOR_TYPE_NAMES[armorType]} ${KIND_NAMES.armor.toLowerCase()}`,
    desc: [stats, ...perkLines, `Встречается от «${baseTitle(base, 1)}» до «${baseTitle(base, 5)}»`].join('\n'),
  };
}

export const COLLECTIBLES: Collectible[] = [
  ...ARTIFACT_IDS.map(artifactEntry),
  ...dropBases('weapon').map((b) => gearEntry('weapon', b.id)),
  ...dropBases('armor').map((b) => gearEntry('armor', b.id)),
  ...POTION_IDS.map(potionEntry),
];

export const COLLECTIBLE_IDS: string[] = COLLECTIBLES.map((c) => c.id);

const BY_ID: Record<string, Collectible> = Object.fromEntries(COLLECTIBLES.map((c) => [c.id, c]));

export function collectible(id: string): Collectible | null {
  return BY_ID[id] ?? null;
}

// ─── Находки: что профиль помнит о забегах ─────────────────────────────────

/** Ключ находки в профиле: артефакт запоминается вместе с тиром («art:fireball@2»), остальное — целиком. */
export function findKey(id: string, tier?: ArtTier): string {
  return tier ? `${id}@${tier}` : id;
}

/**
 * Что герой держит в руках прямо сейчас — ключи находок для коллекции: обе базы экипировки,
 * артефакты в их сокетах со своими тирами и зелье в слоте. Стартовое снаряжение считается наравне с добытым.
 * Проверка через каталог: «Шкура» Берсерка в него не входит (startOnly) и записи не открывает.
 */
export function loadoutFinds(hero: HeroPersistent): string[] {
  const keys: string[] = [];
  const add = (id: string, tier?: ArtTier) => {
    if (BY_ID[id]) keys.push(findKey(id, tier));
  };
  for (const gear of [hero.weapon, hero.armor]) {
    add(`${gear.kind}:${gear.base}`);
    for (const slot of gear.slots) if (slot) add(`art:${slot.id}`, slot.tier);
  }
  if (hero.potion) add(`potion:${hero.potion}`);
  return keys;
}

/** Что открыто в записи: сама запись и найденные тиры (у артефакта — три флага, у остальных пусто). */
export interface FoundState {
  open: boolean;
  tiers: boolean[];
}

export function foundState(found: ReadonlySet<string>, c: Collectible): FoundState {
  if (!c.tiers) return { open: found.has(c.id), tiers: [] };
  const tiers = ART_TIERS.map((t) => found.has(findKey(c.id, t)));
  return { open: tiers.some(Boolean), tiers };
}

/** Строки записи для подсказки: у артефакта закрытые тиры спрятаны за «???». */
export function collectibleLines(c: Collectible, st: FoundState): string[] {
  const lines = c.desc ? c.desc.split('\n') : [];
  c.tiers?.forEach((text, i) => lines.push(`Тир ${i + 1}: ${st.tiers[i] ? text : '???'}`));
  return lines;
}

/**
 * Старый профиль: сундук за забег открывал запись артефакта целиком, без тиров.
 * Такие ключи (без «@») раскладываем на все три тира, чтобы собранное до v0.25 не закрылось обратно.
 */
export function migrateFinds(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const art = key.startsWith('art:') && !key.includes('@') ? ART_TIERS.map((t) => findKey(key, t)) : [key];
    for (const k of art) if (!out.includes(k)) out.push(k);
  }
  return out;
}
