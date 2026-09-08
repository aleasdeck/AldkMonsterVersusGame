import { h, type Child } from './dom';
import type { ArtifactInstance, DerivedStats, GearInstance, RunState } from '../engine/types';
import { heroDef } from '../data/heroes';
import { canWearArmor } from '../data/gear';
import { heroStats } from '../engine/run';
import { artifactDef } from '../data/artifacts';
import { previewGearSwap } from '../engine/stats';
import { findSameArtifact, socketRefs } from '../engine/equipment';
import type { App } from './app';

/**
 * Дельты к надетому для карточек награды и магазина: что вырастет зелёным, что пропадёт красным,
 * судьба перка и переезд артефактов отдельными строками. Считает previewGearSwap на копии героя.
 */

const up = (text: string) => h('span', { class: 'up' }, `▲ ${text}`);
const dn = (text: string) => h('span', { class: 'dn' }, `▼ ${text}`);
const same = (text: string) => h('span', { class: 'dim' }, text);

/** Статы, разница по которым показывается отдельным пунктом (кроме урона, DEF и HP — те всегда). */
const EXTRA: { key: keyof DerivedStats; name: string; pct?: boolean }[] = [
  { key: 'crit', name: 'крит', pct: true },
  { key: 'spellPower', name: 'к заклинаниям' },
  { key: 'str', name: 'Сила' },
  { key: 'lifesteal', name: 'вампиризм' },
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
  /** Числа: урон, DEF, HP, сокеты, прочие статы. */
  stats: Child[];
  /** Перк: что пропадёт и что появится. */
  perk: Child[];
  /** Артефакты: сколько переедет, сколько не поместится. */
  arts: Child[];
}

export function gearDiff(run: RunState, gear: GearInstance): GearDiff {
  const def = heroDef(run.hero.defId);
  const p = previewGearSwap(def, run.hero, gear);
  const b = p.before;
  const a = p.after;
  const stats: Child[] = [];
  if (gear.kind === 'weapon') {
    const bd = `${b.dmgMin + b.str}–${b.dmgMax + b.str}`;
    const ad = `${a.dmgMin + a.str}–${a.dmgMax + a.str}`;
    const avgB = b.dmgMin + b.dmgMax;
    const avgA = a.dmgMin + a.dmgMax;
    stats.push(avgA > avgB ? up(`урон ${bd} → ${ad}`) : avgA < avgB ? dn(`урон ${bd} → ${ad}`) : same(`урон ${ad}`));
  }
  if (a.def !== b.def) stats.push(a.def > b.def ? up(`DEF ${b.def} → ${a.def}`) : dn(`DEF ${b.def} → ${a.def}`));
  else if (gear.kind === 'armor') stats.push(same(`DEF ${a.def}`));
  if (a.maxHp !== b.maxHp) stats.push(a.maxHp > b.maxHp ? up(`HP ${b.maxHp} → ${a.maxHp}`) : dn(`HP ${b.maxHp} → ${a.maxHp}`));
  if (p.slotsAfter !== p.slotsBefore) {
    const t = `${p.slotsAfter} ${plural(p.slotsAfter, 'сокет', 'сокета', 'сокетов')}`;
    stats.push(p.slotsAfter > p.slotsBefore ? up(t) : dn(t));
  }
  for (const x of EXTRA) {
    const d = a[x.key] - b[x.key];
    if (Math.abs(d) < 1e-9) continue;
    const v = x.pct ? `${Math.round(Math.abs(d) * 100)} %` : `${Math.abs(d)}`;
    stats.push(d > 0 ? up(`+${v} ${x.name}`) : dn(`−${v} ${x.name}`));
  }
  const perk: Child[] = [];
  const nameOf = (s: string) => s.split(':')[0];
  if (p.perkBefore && p.perkBefore !== p.perkAfter) perk.push(dn(`${nameOf(p.perkBefore)} пропадёт`));
  if (p.perkAfter && p.perkAfter !== p.perkBefore) perk.push(up(nameOf(p.perkAfter)));
  if (!p.perkAfter && gear.kind === 'armor' && !canWearArmor(def, gear)) perk.push(dn('перк не заработает: не умеет носить'));
  const arts: Child[] = [];
  if (p.moved.length) arts.push(same(`${p.moved.length} ${plural(p.moved.length, 'артефакт переедет', 'артефакта переедут', 'артефактов переедут')}`));
  if (p.overflow.length) arts.push(dn(`${p.overflow.map((x) => artifactDef(x.id).name).join(', ')} — не поместится`));
  return { stats: joined(stats), perk: joined(perk), arts: joined(arts) };
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Строка дельт для карточки: статы, затем перк и артефакты отдельными строками. */
export function gearDiffLines(run: RunState, gear: GearInstance): HTMLElement[] {
  const d = gearDiff(run, gear);
  const lines: HTMLElement[] = [];
  if (d.stats.length) lines.push(h('div', { class: 'diff' }, ...d.stats));
  if (d.perk.length) lines.push(h('div', { class: 'diff' }, ...d.perk));
  if (d.arts.length) lines.push(h('div', { class: 'diff' }, ...d.arts));
  return lines;
}

/** Дельты артефакта: пассивный — по его модификаторам; активный — куда встанет. */
export function artifactDiffLine(run: RunState, inst: ArtifactInstance): HTMLElement | null {
  const def = artifactDef(inst.id);
  const dup = findSameArtifact(run.hero, inst.id);
  if (dup?.art) return null; // заметка про апгрейд стоящего — у карточки своя
  const parts: Child[] = [];
  if (def.kind === 'passive' && def.mods) {
    const m = def.mods(inst.tier);
    const before = heroStats(run);
    for (const [k, v] of Object.entries(m) as [keyof DerivedStats, number][]) {
      if (!v) continue;
      const x = EXTRA.find((e) => e.key === k);
      const name = x?.name ?? (k === 'maxHp' ? 'HP' : k === 'def' ? 'DEF' : k === 'fatigue' ? 'усталость' : k);
      if (k === 'maxHp' || k === 'def') parts.push(v > 0 ? up(`${name} ${before[k]} → ${before[k] + v}`) : dn(`${name} ${before[k]} → ${before[k] + v}`));
      else if (k === 'fatigue') parts.push(up(`усталость мягче на ${Math.round(v * 100)} %`));
      else parts.push(v > 0 ? up(`+${x?.pct ? `${Math.round(v * 100)} %` : v} ${name}`) : dn(`${x?.pct ? `${Math.round(v * 100)} %` : v} ${name}`));
    }
  }
  const free = socketRefs(run.hero).find((s) => !s.art);
  parts.push(free ? same(`свободный сокет: ${free.kind === 'weapon' ? 'оружие' : 'броня'}`) : dn('сокетов нет: заменит стоящий'));
  return h('div', { class: 'diff' }, ...joined(parts));
}

/**
 * Наведение на товар или награду подсвечивает плитку экипировки в консоли, которую предмет заменит,
 * и вместо перка показывает в ней дельты. Пишет прямо в узлы плитки, ничего не сохраняет.
 */
export function bindSwapPreview(app: App, card: HTMLElement, gear: GearInstance): HTMLElement {
  card.addEventListener('mouseenter', () => {
    const run = app.run;
    if (!run) return;
    const tile = app.root.querySelector<HTMLElement>(`.c-gear .gear-tile.${gear.kind}`);
    if (!tile) return;
    const d = gearDiff(run, gear);
    const diffEl = tile.querySelector<HTMLElement>('.gt-diff');
    if (diffEl) diffEl.replaceChildren(h('span', { class: 'gt-diff-title' }, `→ ${gear.name}: `), ...joined([...d.stats, ...d.perk, ...d.arts]).map((c) => (typeof c === 'string' ? document.createTextNode(c) : (c as Node))));
    tile.classList.add('hot');
  });
  card.addEventListener('mouseleave', () => {
    app.root.querySelector('.c-gear .gear-tile.hot')?.classList.remove('hot');
  });
  return card;
}
