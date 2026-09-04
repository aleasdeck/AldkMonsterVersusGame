import type { ArtTier, ArtifactInstance, GearInstance, GearKind, HeroPersistent } from './types';

export interface SocketRef {
  kind: GearKind;
  index: number;
  art: ArtifactInstance | null;
}

export function gearOf(hero: HeroPersistent, kind: GearKind): GearInstance {
  return kind === 'weapon' ? hero.weapon : hero.armor;
}

export function socketRefs(hero: HeroPersistent): SocketRef[] {
  const out: SocketRef[] = [];
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    gearOf(hero, kind).slots.forEach((art, index) => out.push({ kind, index, art }));
  }
  return out;
}

export function findSameArtifact(hero: HeroPersistent, id: string): SocketRef | null {
  return socketRefs(hero).find((s) => s.art?.id === id) ?? null;
}

/** Артефакт уже стоит на максимальном тире — дубликат бесполезен. */
export function isMaxed(hero: HeroPersistent, id: string): boolean {
  const s = findSameArtifact(hero, id);
  return !!s?.art && s.art.tier >= 3;
}

export type AddResult = 'placed' | 'upgraded' | 'full' | 'maxed';

/** Вставить артефакт: дубликат апгрейдит стоящий, иначе — в свободный слот. */
export function addArtifact(hero: HeroPersistent, art: ArtifactInstance): AddResult {
  const same = findSameArtifact(hero, art.id);
  if (same?.art) {
    if (same.art.tier >= 3) return 'maxed';
    same.art.tier = Math.min(3, Math.max(same.art.tier + 1, art.tier)) as ArtTier;
    return 'upgraded';
  }
  const free = socketRefs(hero).find((s) => !s.art);
  if (free) {
    gearOf(hero, free.kind).slots[free.index] = { ...art };
    return 'placed';
  }
  return 'full';
}

/** Заменить артефакт в слоте. Возвращает вытесненный. */
export function replaceArtifact(
  hero: HeroPersistent,
  kind: GearKind,
  index: number,
  art: ArtifactInstance,
): ArtifactInstance | null {
  const gear = gearOf(hero, kind);
  if (index < 0 || index >= gear.slots.length) throw new Error('Bad slot index');
  const removed = gear.slots[index];
  gear.slots[index] = { ...art };
  return removed;
}

/** Надеть предмет. Артефакты из старого переезжают; не поместившиеся возвращаются. */
export function equipGear(hero: HeroPersistent, gear: GearInstance): ArtifactInstance[] {
  const old = gearOf(hero, gear.kind);
  const arts = old.slots.filter((s): s is ArtifactInstance => !!s);
  const fresh: GearInstance = { ...gear, slots: gear.slots.map(() => null) };
  const overflow: ArtifactInstance[] = [];
  for (const a of arts) {
    const i = fresh.slots.findIndex((s) => !s);
    if (i >= 0) fresh.slots[i] = a;
    else overflow.push(a);
  }
  if (gear.kind === 'weapon') hero.weapon = fresh;
  else hero.armor = fresh;
  return overflow;
}

export function upgradableSockets(hero: HeroPersistent): SocketRef[] {
  return socketRefs(hero).filter((s) => s.art && s.art.tier < 3);
}
