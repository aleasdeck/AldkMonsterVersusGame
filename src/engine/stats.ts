import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef, HeroPersistent, StatMods } from './types';
import { ARTIFACTS } from '../data/artifacts';
import { affixMods, armorPerkMods, canWearArmor, canWieldWeapon, gearPerkText, weaponDice, weaponPerkMods } from '../data/gear';
import { equipGear } from './equipment';
import { archetypeCounts, setMods } from '../data/archetypes';
import { TRAITS } from '../data/traits';

/**
 * Что сверх снаряжения идёт в статы героя в забеге (v0.44): врождённый навык (его пассивка и метка архетипа в наборе)
 * и черта. Без контекста — голое снаряжение: так считают тесты оружия и брони и предпросмотр чужого героя.
 */
export interface StatCtx {
  innate?: ArtifactInstance | null;
  trait?: string | null;
}

/** Врождённый навык героя как артефакт с тиром = уровнем навыка; без уровня (тестовый герой) — нет навыка. */
export function innateOf(hero: HeroPersistent): ArtifactInstance | null {
  return hero.innateTier ? { id: hero.signature, tier: hero.innateTier } : null;
}

/** Контекст героя в забеге: его навык и черта. */
export function statCtxOf(hero: HeroPersistent): StatCtx {
  return { innate: innateOf(hero), trait: hero.trait ?? null };
}

export function socketedArtifacts(weapon: GearInstance, armor: GearInstance): ArtifactInstance[] {
  const out: ArtifactInstance[] = [];
  for (const g of [weapon, armor]) for (const s of g.slots) if (s) out.push(s);
  return out;
}

function applyMods(s: DerivedStats, m: StatMods): void {
  for (const key of Object.keys(m) as (keyof DerivedStats)[]) {
    s[key] += m[key] ?? 0;
  }
}

export const DEFAULT_FATIGUE = 0.7;
/** Крит. урон по умолчанию, проценты от обычного урона: полтора удара. */
export const DEFAULT_CRIT_DMG = 150;

/**
 * Статы героя: база героя → кубик оружия в его руках (владение, тип) → перки оружия и брони
 * (перк работает, только если герой владеет типом оружия и умеет носить тип брони) → аффиксы → пассивные артефакты.
 */
export function computeStats(def: HeroDef, weapon: GearInstance, armor: GearInstance, ctx: StatCtx = {}): DerivedStats {
  const dice = weaponDice(def, weapon);
  const s: DerivedStats = {
    maxHp: def.hp + armor.hp,
    def: def.def + armor.def,
    maxMp: def.mp,
    mpRegen: def.mpRegen,
    sta: def.sta,
    str: 0,
    dmgMin: dice.min,
    dmgMax: dice.max,
    thorns: 0,
    lifesteal: 0,
    regen: 0,
    crit: def.crit ?? 0,
    critDmg: def.critDmg ?? DEFAULT_CRIT_DMG,
    critRamp: 0,
    executeCrit: 0,
    critHeal: 0,
    spellPower: 0,
    firstTurnSta: 0,
    fatigue: def.fatigue ?? DEFAULT_FATIGUE,
    firstHit: 0,
    pierceBlock: 0,
    thornsImmune: 0,
    splash: 0,
    onHitBleed: 0,
    onHitBurn: 0,
    onHitPoison: 0,
    stunOnCrit: 0,
    blockOnHit: 0,
    spellLeech: 0,
    hitReduce: 0,
    dotReduce: 0,
    defendBonus: 0,
    blockKeep: 0,
    blockOnSpell: 0,
    dodgeStart: 0,
    stealthStart: 0,
    backstab: 0,
    onKillHeal: 0,
    blockTurn: 0,
    markOnHit: 0,
    reachAny: 0,
    sweep: 0,
    lowHpStr: 0,
    lowHpSta: 0,
    lowHpReduce: 0,
    riposte: 0,
    vsBleed: 0,
    dotLeech: 0,
    poisonVuln: 0,
    spellVsBurn: 0,
    perDebuff: 0,
    spellSta: 0,
    skillMp: 0,
    stunCrit: 0,
    bleedAdd: 0,
    bleedMult: 0,
    bleedTwice: 0,
    burnAdd: 0,
    burnSpread: 0,
    strikeMult: 0,
    burnImmune: 0,
    blockPerBurning: 0,
    spellIgniteAll: 0,
    spellCharge: 0,
    backstabPoison: 0,
    overhealBlock: 0,
    rageTrait: 0,
    farShot: 0,
  };
  applyMods(s, weaponPerkMods(weapon, def));
  applyMods(s, armorPerkMods(armor, def));
  applyMods(s, affixMods(weapon));
  applyMods(s, affixMods(armor));
  // Врождённый навык (v0.44) — как вставленный артефакт: его пассивка работает, метка идёт в набор.
  const arts = ctx.innate ? [...socketedArtifacts(weapon, armor), ctx.innate] : socketedArtifacts(weapon, armor);
  for (const a of arts) {
    const ad = ARTIFACTS[a.id];
    if (ad?.mods) applyMods(s, ad.mods(a.tier));
  }
  // Бонусы наборов (v0.43): две и три вещи одного архетипа — те же статы, что у пассивок.
  for (const m of setMods(archetypeCounts(arts))) applyMods(s, m);
  // Черта героя (v0.44): растёт вместе с навыком — уровень навыка и есть номер локации.
  const trait = ctx.trait ? TRAITS[ctx.trait] : undefined;
  if (trait) applyMods(s, trait.mods(ctx.innate?.tier ?? 1));
  s.crit = Math.min(1, s.crit);
  // Крит слабее обычного удара не бывает.
  s.critDmg = Math.max(100, s.critDmg);
  s.fatigue = Math.min(1, s.fatigue);
  // Две ключевые вещи с минусом к удару не обнуляют его совсем.
  s.strikeMult = Math.max(-0.9, s.strikeMult);
  return s;
}

export function heroStatsOf(def: HeroDef, hero: HeroPersistent): DerivedStats {
  return computeStats(def, hero.weapon, hero.armor, statCtxOf(hero));
}

export interface GearSwapPreview {
  before: DerivedStats;
  after: DerivedStats;
  /** Число сокетов до и после. */
  slotsBefore: number;
  slotsAfter: number;
  /** Строки перков: пустая — перка нет. У предмета, которым герой не владеет (оружие) или не умеет носить (броня), перк не работает — строка пустая. */
  perkBefore: string;
  perkAfter: string;
  /** Артефакты, которые переедут в новый предмет, и те, которым не хватит сокетов. */
  moved: ArtifactInstance[];
  overflow: ArtifactInstance[];
}

/**
 * Статы героя, как если бы предмет надели: урон, DEF, HP, число сокетов, судьба перка и артефактов.
 * Считает на копии героя правилами equipGear, самого героя не трогает. Из разницы строятся дельты на карточках.
 */
export function previewGearSwap(def: HeroDef, hero: HeroPersistent, gear: GearInstance): GearSwapPreview {
  const before = heroStatsOf(def, hero);
  const copy: HeroPersistent = { ...hero, weapon: structuredClone(hero.weapon), armor: structuredClone(hero.armor) };
  const old = gear.kind === 'weapon' ? hero.weapon : hero.armor;
  const overflow = equipGear(copy, gear);
  const fresh = gear.kind === 'weapon' ? copy.weapon : copy.armor;
  const after = heroStatsOf(def, copy);
  const works = (g: GearInstance) => (g.kind === 'weapon' ? canWieldWeapon(def, g) : canWearArmor(def, g));
  return {
    before,
    after,
    slotsBefore: old.slots.length,
    slotsAfter: gear.slots.length,
    perkBefore: works(old) ? gearPerkText(old) : '',
    perkAfter: works(gear) ? gearPerkText(gear) : '',
    moved: fresh.slots.filter((a): a is ArtifactInstance => !!a),
    overflow,
  };
}
