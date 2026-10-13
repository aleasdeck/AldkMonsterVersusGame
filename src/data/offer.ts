import type { Rng } from '../engine/rng';
import type { ArtTier, DerivedStats, GearAffix, GearInstance, GearKind, GearTier, LootItem, SlotKind } from '../engine/types';
import { GEAR_TIERS, baseArmorStats, baseDamage, baseOf, baseTitle, rollAffix, rollSlotKinds } from './gear';

/**
 * Предметы строкой (v0.50 — отладочный `&offer=`, с v0.58.0 — ещё и награды сценария обучения, data/tutorial.ts):
 * `w:<база>:<тир>[:<стат>=<число>][:s=<сокеты>]` — оружие, `a:…` — броня, `art:<id>:<тир>` — артефакт, `p:<зелье>`; через запятую.
 * Сокеты буквами: w — оружейный, a — бронный, x — универсальный (`s=wx`). Без аффикса в строке он бросается случайно;
 * `none` — без аффикса. Тип сокетов без `s=` тоже бросается.
 */
export function parseOffer(spec: string | null, rng: Rng): LootItem[] {
  const out: LootItem[] = [];
  for (const part of (spec ?? '').split(',').filter(Boolean)) {
    const item = parseOfferItem(part, rng);
    if (item) out.push(item);
  }
  return out;
}

/** Один предмет из строки `parseOffer`; неизвестный вид — null. */
export function parseOfferItem(part: string, rng: Rng): LootItem | null {
  const [kind, id, tierRaw, ...rest] = part.split(':');
  if (kind === 'p') return { kind: 'potion', potion: id };
  if (kind === 'art') return { kind: 'artifact', artifact: { id, tier: Math.max(1, Math.min(3, Number(tierRaw) || 1)) as ArtTier } };
  if (kind !== 'w' && kind !== 'a') return null;
  return { kind: 'gear', gear: offerGear(kind === 'w' ? 'weapon' : 'armor', id, Math.max(1, Math.min(5, Number(tierRaw) || 1)) as GearTier, rest, rng) };
}

function offerGear(gk: GearKind, id: string, tier: GearTier, rest: string[], rng: Rng): GearInstance {
  const base = baseOf(gk, id);
  const dmg = baseDamage(base, tier);
  const arm = baseArmorStats(base, tier);
  const n = GEAR_TIERS[tier].slots;
  let affix: GearAffix | null = rollAffix(rng, gk, tier);
  let kinds: SlotKind[] = rollSlotKinds(rng, gk, n);
  for (const r of rest) {
    const [k, v] = r.split('=');
    if (k === 's') kinds = Array.from({ length: n }, (_, i) => (v[i] === 'w' ? 'weapon' : v[i] === 'a' ? 'armor' : 'any'));
    else if (k === 'none') affix = null;
    else affix = { stat: k as keyof DerivedStats, value: Number(v) };
  }
  return {
    kind: gk,
    tier,
    base: id,
    name: baseTitle(base, tier),
    dmgMin: gk === 'weapon' ? dmg.min : 0,
    dmgMax: gk === 'weapon' ? dmg.max : 0,
    def: gk === 'armor' ? arm.def : 0,
    hp: gk === 'armor' ? arm.hp : 0,
    affix,
    slots: Array.from({ length: n }, () => null),
    slotKinds: kinds,
  };
}
