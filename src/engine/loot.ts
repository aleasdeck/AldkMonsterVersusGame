import type { ArtTier, ArtifactInstance, EventOption, GearInstance, GearKind, GearTier, HeroPersistent, LootItem, RewardScreen } from './types';
import { chance, pick, type Rng } from './rng';
import { ARTIFACT_IDS, artifactDef } from '../data/artifacts';
import { makeGear } from '../data/gear';
import type { LocationDef } from '../data/locations';
import { isMaxed } from './equipment';

const ARTIFACT_CHANCE = 0.55;

function bump<T extends number>(tiers: T[], max: T): T[] {
  const out = tiers.map((t) => Math.min(t + 1, max) as T);
  return Array.from(new Set(out));
}

export function rollArtifact(rng: Rng, hero: HeroPersistent, tiers: ArtTier[], exclude: string[]): ArtifactInstance | null {
  const ids = ARTIFACT_IDS.filter((id) => !exclude.includes(id) && !isMaxed(hero, id));
  if (ids.length === 0) return null;
  return { id: pick(rng, ids), tier: pick(rng, tiers) };
}

export function rollGear(rng: Rng, tiers: GearTier[], kind?: GearKind): GearInstance {
  const k = kind ?? pick(rng, ['weapon', 'armor'] as GearKind[]);
  return makeGear(rng, k, pick(rng, tiers));
}

export function rollRewards(rng: Rng, hero: HeroPersistent, loc: LocationDef, source: 'fight' | 'elite'): LootItem[] {
  const gearTiers = source === 'elite' ? bump(loc.gearTiers, 5 as GearTier) : loc.gearTiers;
  const artTiers = source === 'elite' ? bump(loc.artTiers, 3 as ArtTier) : loc.artTiers;
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
    items.push({ kind: 'gear', gear: rollGear(rng, gearTiers, kind) });
  }
  return items;
}

export function rollBossRewards(rng: Rng, hero: HeroPersistent, loc: LocationDef): RewardScreen[] {
  const screens: RewardScreen[] = [];
  if (loc.bossGearTier) {
    screens.push({
      title: 'Трофей босса',
      options: [
        { kind: 'gear', gear: makeGear(rng, 'weapon', loc.bossGearTier) },
        { kind: 'gear', gear: makeGear(rng, 'armor', loc.bossGearTier) },
      ],
    });
  }
  const arts: LootItem[] = [];
  const used: string[] = [];
  const tiers = bump(loc.artTiers, 3 as ArtTier);
  for (let i = 0; i < 3; i++) {
    const a = rollArtifact(rng, hero, tiers, used);
    if (!a) break;
    used.push(a.id);
    arts.push({ kind: 'artifact', artifact: a });
  }
  if (arts.length > 0) screens.push({ title: 'Артефакт босса', options: arts });
  return screens;
}

export function rollEvent(rng: Rng, hero: HeroPersistent, loc: LocationDef): EventOption[] {
  const art = rollArtifact(rng, hero, loc.artTiers, []);
  const gear = rollGear(rng, loc.gearTiers);
  const opts: EventOption[] = [{ id: 'spring', title: 'Родник', desc: 'Восстановить 30 % максимального HP.' }];
  if (art) {
    opts.push({
      id: 'altar',
      title: 'Алтарь',
      desc: `Потерять 10 % максимального HP и получить артефакт: ${artifactDef(art.id).name} (тир ${art.tier}).`,
      artifact: art,
    });
  }
  opts.push({ id: 'chest', title: 'Сундук', desc: `Внутри экипировка: ${gear.name}.`, gear });
  return opts;
}
