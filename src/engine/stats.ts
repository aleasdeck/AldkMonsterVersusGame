import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef, HeroPersistent, StatMods } from './types';
import { ARTIFACTS } from '../data/artifacts';
import { affixMods, armorPerkMods, weaponDice, weaponPerkMods } from '../data/gear';

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
 * (перк брони — только если герой умеет носить её тип) → аффиксы → пассивные артефакты.
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
  };
  applyMods(s, weaponPerkMods(weapon));
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
