import type { DerivedStats, GearInstance, RunState } from '../engine/types';
import { heroDef } from '../data/heroes';
import { artifactDef } from '../data/artifacts';
import { previewGearSwap } from '../engine/stats';

// ─── Сравнение с надетым (v0.50) ───────────────────────────────────────────
// Таблица карточки экипировки «надето → эта»: считает previewGearSwap на копии героя, поэтому владение, перки и аффиксы
// обеих вещей уже учтены. Сокеты не пишутся — их видно в подвале карточки; потерянные артефакты — отдельной строкой.

/** Статы, которые попадают в сравнение, если меняются (урон у оружия и DEF/HP у брони — всегда). */
const EXTRA: { key: keyof DerivedStats; name: string; pct?: boolean }[] = [
  { key: 'crit', name: 'крит', pct: true },
  { key: 'critDmg', name: '% крит. урона' },
  { key: 'spellPower', name: 'к заклинаниям' },
  { key: 'str', name: 'Сила' },
  { key: 'lifesteal', name: 'вампиризм' },
  { key: 'onHitBleed', name: 'кровь с удара' },
  { key: 'onHitBurn', name: 'горение с удара' },
  { key: 'onHitPoison', name: 'яд с удара' },
  { key: 'thorns', name: 'шипы' },
  { key: 'regen', name: 'реген' },
  { key: 'maxMp', name: 'MP' },
  { key: 'mpRegen', name: 'реген MP' },
  { key: 'sta', name: 'STA' },
  { key: 'firstHit', name: 'первый удар' },
];

/** Строка сравнения: стат, было, станет и знак разницы. */
export interface CompareRow {
  key: string;
  name: string;
  before: string;
  after: string;
  /** 1 — лучше, −1 — хуже, 0 — поровну. */
  dir: number;
}

export interface GearCompare {
  rows: CompareRow[];
  /** Имена артефактов, которым в новом предмете не хватит сокета. */
  overflow: string[];
}

/**
 * Сравнение предмета с надетым: урон и DEF/HP всегда (для своего вида предмета), прочие — если меняются.
 * Урон — кубик в руках героя без Силы; Сила — своей строкой.
 */
export function gearCompare(run: RunState, gear: GearInstance): GearCompare {
  const def = heroDef(run.hero.defId);
  const p = previewGearSwap(def, run.hero, gear);
  const b = p.before;
  const a = p.after;
  const rows: CompareRow[] = [];
  const num = (key: string, name: string, vb: number, va: number, fmt = (v: number) => `${v}`, always = false) => {
    if (!always && Math.abs(va - vb) < 1e-9) return;
    rows.push({ key, name, before: fmt(vb), after: fmt(va), dir: Math.sign(va - vb) });
  };
  if (gear.kind === 'weapon') {
    const sb = b.dmgMin + b.dmgMax;
    const sa = a.dmgMin + a.dmgMax;
    rows.push({ key: 'dmg', name: 'урон', before: `${b.dmgMin}–${b.dmgMax}`, after: `${a.dmgMin}–${a.dmgMax}`, dir: Math.sign(sa - sb) });
  }
  num('def', 'DEF', b.def, a.def, undefined, gear.kind === 'armor');
  num('hp', 'HP', b.maxHp, a.maxHp, undefined, gear.kind === 'armor');
  for (const x of EXTRA) num(x.key, x.name, b[x.key], a[x.key], x.pct ? (v) => `${Math.round(v * 100)} %` : undefined);
  return { rows, overflow: p.overflow.map((x) => artifactDef(x.id).name) };
}
