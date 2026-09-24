import { h, type Child } from './dom';
import type { DerivedStats, GearInstance, RunState } from '../engine/types';
import { heroDef } from '../data/heroes';
import { artifactDef } from '../data/artifacts';
import { previewGearSwap } from '../engine/stats';

/**
 * Дельты к надетому для карточек награды и магазина: что вырастет зелёным, что пропадёт красным.
 * Считает previewGearSwap на копии героя. Только знак и величина («▼ урон», «▲ +2 DEF»), без «было → станет»
 * и без строк про то, что не меняется; без судьбы перка и переезда артефактов — перк карточка и так пишет,
 * а переезд игроку очевиден. Только «не поместится» остаётся: это потеря артефакта.
 */

const up = (text: string) => h('span', { class: 'up' }, `▲ ${text}`);
const dn = (text: string) => h('span', { class: 'dn' }, `▼ ${text}`);

/** Статы, разница по которым показывается отдельным пунктом (кроме урона, DEF и HP — те всегда). */
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

function joined(items: Child[]): Child[] {
  const out: Child[] = [];
  for (const it of items) {
    if (!it) continue;
    if (out.length) out.push(' · ');
    out.push(it);
  }
  return out;
}

export interface GearDiff {
  /** Числа: урон, DEF, HP, прочие статы. Сокеты не считаем — они нарисованы чипами. */
  stats: Child[];
  /** Артефакты, которые не поместятся в новые сокеты. */
  arts: Child[];
}

/** «▲ +2 DEF» / «▼ −4 HP» — знак и величина, без «было → станет». */
const signed = (d: number, name: string) => (d > 0 ? up(`+${d} ${name}`) : dn(`−${-d} ${name}`));

export function gearDiff(run: RunState, gear: GearInstance): GearDiff {
  const def = heroDef(run.hero.defId);
  const p = previewGearSwap(def, run.hero, gear);
  const b = p.before;
  const a = p.after;
  const stats: Child[] = [];
  if (gear.kind === 'weapon') {
    // Кубик уже написан строкой выше — только направление по среднему.
    const avgB = b.dmgMin + b.dmgMax;
    const avgA = a.dmgMin + a.dmgMax;
    if (avgA !== avgB) stats.push(avgA > avgB ? up('урон') : dn('урон'));
  }
  if (a.def !== b.def) stats.push(signed(a.def - b.def, 'DEF'));
  if (a.maxHp !== b.maxHp) stats.push(signed(a.maxHp - b.maxHp, 'HP'));
  for (const x of EXTRA) {
    const d = a[x.key] - b[x.key];
    if (Math.abs(d) < 1e-9) continue;
    const v = x.pct ? `${Math.round(Math.abs(d) * 100)} %` : `${Math.abs(d)}`;
    stats.push(d > 0 ? up(`+${v} ${x.name}`) : dn(`−${v} ${x.name}`));
  }
  const arts: Child[] = [];
  if (p.overflow.length) arts.push(dn(`${p.overflow.map((x) => artifactDef(x.id).name).join(', ')} — не поместится`));
  return { stats: joined(stats), arts: joined(arts) };
}


/** Строка сравнения с надетым для прототипов карточек (v0.50): стат, было, станет и знак разницы. */
export interface CompareRow {
  key: string;
  name: string;
  before: string;
  after: string;
  /** 1 — лучше, −1 — хуже, 0 — поровну. */
  dir: number;
  /** Короткая дельта для чипа: «+2 DEF», «урон». */
  delta: string;
}

export interface GearCompare {
  rows: CompareRow[];
  /** Имена артефактов, которым в новом предмете не хватит сокета. */
  overflow: string[];
  slotsBefore: number;
  slotsAfter: number;
}

/**
 * Сравнение предмета с надетым по тем же статам, что и дельты: урон и DEF/HP всегда (для своего вида предмета), прочие — если меняются.
 * Урон — кубик в руках героя без Силы, как крупное число на карточке; Сила — своей строкой.
 */
export function gearCompare(run: RunState, gear: GearInstance): GearCompare {
  const def = heroDef(run.hero.defId);
  const p = previewGearSwap(def, run.hero, gear);
  const b = p.before;
  const a = p.after;
  const rows: CompareRow[] = [];
  const num = (key: string, name: string, vb: number, va: number, fmt = (v: number) => `${v}`, always = false) => {
    if (!always && Math.abs(va - vb) < 1e-9) return;
    const d = va - vb;
    rows.push({ key, name, before: fmt(vb), after: fmt(va), dir: Math.sign(d), delta: Math.abs(d) < 1e-9 ? '' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} ${name}` });
  };
  if (gear.kind === 'weapon') {
    const sb = b.dmgMin + b.dmgMax;
    const sa = a.dmgMin + a.dmgMax;
    rows.push({ key: 'dmg', name: 'урон', before: `${b.dmgMin}–${b.dmgMax}`, after: `${a.dmgMin}–${a.dmgMax}`, dir: Math.sign(sa - sb), delta: sa === sb ? '' : 'урон' });
  }
  num('def', 'DEF', b.def, a.def, undefined, gear.kind === 'armor');
  num('hp', 'HP', b.maxHp, a.maxHp, undefined, gear.kind === 'armor');
  for (const x of EXTRA) num(x.key, x.name, b[x.key], a[x.key], x.pct ? (v) => `${Math.round(v * 100)} %` : undefined);
  return { rows, overflow: p.overflow.map((x) => artifactDef(x.id).name), slotsBefore: p.slotsBefore, slotsAfter: p.slotsAfter };
}

/** Строки дельт для карточки: статы и, если есть, «не поместится». */
export function gearDiffLines(run: RunState, gear: GearInstance): HTMLElement[] {
  const d = gearDiff(run, gear);
  const lines: HTMLElement[] = [];
  if (d.stats.length) lines.push(h('div', { class: 'diff' }, ...d.stats));
  if (d.arts.length) lines.push(h('div', { class: 'diff' }, ...d.arts));
  return lines;
}
