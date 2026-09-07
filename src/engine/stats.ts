import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef, HeroPersistent, StatMods } from './types';
import { ARTIFACTS } from '../data/artifacts';
import { affixMods } from '../data/gear';

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

export function computeStats(def: HeroDef, weapon: GearInstance, armor: GearInstance): DerivedStats {
  const s: DerivedStats = {
    maxHp: def.hp + armor.hp,
    def: def.def + armor.def,
    maxMp: def.mp,
    mpRegen: def.mpRegen,
    sta: def.sta,
    str: 0,
    dmgMin: weapon.dmgMin,
    dmgMax: weapon.dmgMax,
    thorns: 0,
    lifesteal: 0,
    regen: 0,
    crit: def.crit ?? 0,
    spellPower: 0,
    firstTurnSta: 0,
  };
  applyMods(s, affixMods(weapon));
  applyMods(s, affixMods(armor));
  for (const a of socketedArtifacts(weapon, armor)) {
    const ad = ARTIFACTS[a.id];
    if (ad?.mods) applyMods(s, ad.mods(a.tier));
  }
  s.crit = Math.min(1, s.crit);
  return s;
}

export function heroStatsOf(def: HeroDef, hero: HeroPersistent): DerivedStats {
  return computeStats(def, hero.weapon, hero.armor);
}
