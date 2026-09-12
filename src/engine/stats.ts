import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef, HeroPersistent, StatMods } from './types';
import { ARTIFACTS } from '../data/artifacts';
import { affixMods, armorPerkMods, canWearArmor, canWieldWeapon, gearPerkText, weaponDice, weaponPerkMods } from '../data/gear';
import { equipGear } from './equipment';

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

export const DEFAULT_FATIGUE = 0.75;
export const DEFAULT_CRIT_MULT = 2;

/**
 * Статы героя: база героя → кубик оружия в его руках (владение, тип) → перки оружия и брони
 * (перк работает, только если герой владеет типом оружия и умеет носить тип брони) → аффиксы → пассивные артефакты.
 */
export function computeStats(def: HeroDef, weapon: GearInstance, armor: GearInstance): DerivedStats {
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
    spellPower: 0,
    firstTurnSta: 0,
    fatigue: def.fatigue ?? DEFAULT_FATIGUE,
    firstHit: 0,
    critMult: DEFAULT_CRIT_MULT,
    pierceBlock: 0,
    thornsImmune: 0,
    splash: 0,
    onHitBleed: 0,
    stunOnCrit: 0,
    blockOnHit: 0,
    spellLeech: 0,
    hitReduce: 0,
    defendBonus: 0,
    blockKeep: 0,
    blockOnSpell: 0,
    dodgeStart: 0,
    stealthStart: 0,
    backstab: 0,
    onKillHeal: 0,
    blockStart: 0,
    markOnHit: 0,
  };
  applyMods(s, weaponPerkMods(weapon, def));
  applyMods(s, armorPerkMods(armor, def));
  applyMods(s, affixMods(weapon));
  applyMods(s, affixMods(armor));
  for (const a of socketedArtifacts(weapon, armor)) {
    const ad = ARTIFACTS[a.id];
    if (ad?.mods) applyMods(s, ad.mods(a.tier));
  }
  s.crit = Math.min(1, s.crit);
  s.fatigue = Math.min(1, s.fatigue);
  return s;
}

export function heroStatsOf(def: HeroDef, hero: HeroPersistent): DerivedStats {
  return computeStats(def, hero.weapon, hero.armor);
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
  const before = computeStats(def, hero.weapon, hero.armor);
  const copy: HeroPersistent = { ...hero, weapon: structuredClone(hero.weapon), armor: structuredClone(hero.armor) };
  const old = gear.kind === 'weapon' ? hero.weapon : hero.armor;
  const overflow = equipGear(copy, gear);
  const fresh = gear.kind === 'weapon' ? copy.weapon : copy.armor;
  const after = computeStats(def, copy.weapon, copy.armor);
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
