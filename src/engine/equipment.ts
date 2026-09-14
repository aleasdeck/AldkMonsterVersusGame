import type { ArtTier, ArtifactInstance, ArtifactSlot, GearInstance, GearKind, HeroPersistent, SlotKind } from './types';
import { artifactDef } from '../data/artifacts';

export interface SocketRef {
  kind: GearKind;
  index: number;
  /** Тип сокета: что в него можно ставить. */
  slot: SlotKind;
  art: ArtifactInstance | null;
}

// ─── Типы сокетов ──────────────────────────────────────────────────────────

export const SLOT_KIND_NAME: Record<SlotKind, string> = { weapon: 'оружейный', armor: 'бронный', any: 'универсальный' };
export const ARTIFACT_SLOT_NAME: Record<ArtifactSlot, string> = { weapon: 'оружейный', armor: 'бронный' };

/** Тип сокета по индексу; сокет без записи (старые тесты, отладочный &art=) — универсальный. */
export function slotKindAt(gear: GearInstance, index: number): SlotKind {
  return gear.slotKinds?.[index] ?? 'any';
}

/** Принимает ли сокет такого типа артефакт такого типа. */
export function slotAccepts(slot: SlotKind, art: ArtifactSlot): boolean {
  return slot === 'any' || slot === art;
}

/** Почему артефакт нельзя поставить в сокет; null — можно. Индекс вне предмета — тоже причина, а не исключение. */
export function canPlaceArtifact(hero: HeroPersistent, kind: GearKind, index: number, id: string): string | null {
  const gear = gearOf(hero, kind);
  if (index < 0 || index >= gear.slots.length) return 'Нет такого сокета';
  const art = artifactDef(id).slot;
  const slot = slotKindAt(gear, index);
  if (!slotAccepts(slot, art)) return `${cap(SLOT_KIND_NAME[slot])} сокет: сюда встаёт только ${ARTIFACT_SLOT_NAME[slot as ArtifactSlot]} артефакт`;
  return null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function gearOf(hero: HeroPersistent, kind: GearKind): GearInstance {
  return kind === 'weapon' ? hero.weapon : hero.armor;
}

export function socketRefs(hero: HeroPersistent): SocketRef[] {
  const out: SocketRef[] = [];
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    const gear = gearOf(hero, kind);
    gear.slots.forEach((art, index) => out.push({ kind, index, slot: slotKindAt(gear, index), art }));
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

/**
 * Свободный сокет под артефакт: сначала сокет своего типа, универсальный — только если своих нет,
 * чтобы он остался для артефактов другого типа.
 */
export function freeSocketFor(hero: HeroPersistent, id: string): SocketRef | null {
  const art = artifactDef(id).slot;
  const free = socketRefs(hero).filter((s) => !s.art && slotAccepts(s.slot, art));
  return free.find((s) => s.slot === art) ?? free[0] ?? null;
}

/** Вставить артефакт: дубликат апгрейдит стоящий, иначе — в свободный подходящий сокет. */
export function addArtifact(hero: HeroPersistent, art: ArtifactInstance): AddResult {
  const same = findSameArtifact(hero, art.id);
  if (same?.art) {
    if (same.art.tier >= 3) return 'maxed';
    same.art.tier = Math.min(3, Math.max(same.art.tier + 1, art.tier)) as ArtTier;
    return 'upgraded';
  }
  const free = freeSocketFor(hero, art.id);
  if (free) {
    gearOf(hero, free.kind).slots[free.index] = { ...art };
    return 'placed';
  }
  return 'full';
}

/** Заменить артефакт в слоте. Возвращает вытесненный. Неподходящий сокет — ошибка: вызывающий обязан проверить canPlaceArtifact. */
export function replaceArtifact(
  hero: HeroPersistent,
  kind: GearKind,
  index: number,
  art: ArtifactInstance,
): ArtifactInstance | null {
  const why = canPlaceArtifact(hero, kind, index, art.id);
  if (why) throw new Error(why);
  const gear = gearOf(hero, kind);
  const removed = gear.slots[index];
  gear.slots[index] = { ...art };
  return removed;
}

/**
 * Надеть предмет. Артефакты из старого переезжают в подходящие сокеты нового; не поместившиеся возвращаются.
 * Сначала расселяются те, кому годится только сокет своего типа, потом остальные занимают универсальные —
 * иначе оружейный артефакт мог бы сесть в универсальный сокет и выжить бронный, которому больше некуда.
 */
export function equipGear(hero: HeroPersistent, gear: GearInstance): ArtifactInstance[] {
  const old = gearOf(hero, gear.kind);
  const arts = old.slots.filter((s): s is ArtifactInstance => !!s);
  const fresh: GearInstance = { ...gear, slots: gear.slots.map(() => null), slotKinds: (gear.slotKinds ?? []).slice() };
  const overflow: ArtifactInstance[] = [];
  const place = (a: ArtifactInstance, pass: 'own' | 'any') => {
    const art = artifactDef(a.id).slot;
    const i = fresh.slots.findIndex((s, idx) => !s && (pass === 'own' ? slotKindAt(fresh, idx) === art : slotAccepts(slotKindAt(fresh, idx), art)));
    if (i >= 0) fresh.slots[i] = a;
    return i >= 0;
  };
  const rest = arts.filter((a) => !place(a, 'own'));
  for (const a of rest) if (!place(a, 'any')) overflow.push(a);
  if (gear.kind === 'weapon') hero.weapon = fresh;
  else hero.armor = fresh;
  return overflow;
}

export function upgradableSockets(hero: HeroPersistent): SocketRef[] {
  return socketRefs(hero).filter((s) => s.art && s.art.tier < 3);
}
