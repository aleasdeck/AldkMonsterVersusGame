import { h, type Child, type Tip } from './dom';
import type { ArtTier, ArtifactDef } from '../engine/types';
import { artifactCost } from '../data/artifacts';
import { ARTIFACT_SLOT_NAME } from '../engine/equipment';
import { uiIcon, type UiIconId } from './icons';
import { paramTip, turnsWord } from './tips';

// ─── Части карточек (v0.50) ────────────────────────────────────────────────
// Кирпичи карточек артефактов и карточек выбора на старт: параметры приёма с иконками (цена, перезарядка, цель, род, тип сокета).

/** Параметр приёма или предмета: иконка, короткое значение, подсказка. cls — цветовой класс чипа. */
export interface Param {
  icon: UiIconId;
  text: string;
  tip: Tip;
  cls?: string;
  /** Перекрасить иконку (архетип, тип сокета). */
  color?: string;
}

/** Чип параметра: иконка и значение в рамке. */
export function paramChip(p: Param): HTMLElement {
  return h('span', { class: `param ${p.cls ?? ''}`.trim(), tip: p.tip }, uiIcon(p.icon, 14, p.color), p.text ? h('span', { class: 'param-text' }, p.text) : null);
}

/** Род артефакта: пассивка, приём (физический, за стамину) или заклинание (маг., за ману). */
export function kindParam(def: ArtifactDef): Param {
  if (def.kind !== 'active') return { icon: 'passive', text: 'Пассивка', tip: paramTip('passive', 'Пассивка', 'Работает сама, пока артефакт стоит в сокете'), cls: 'k-passive' };
  if (def.school === 'magic') return { icon: 'spell', text: 'Заклинание', tip: paramTip('spell', 'Заклинание', 'Урон не зависит от оружия и усталости, растёт от Силы заклинаний. Стоит маны'), cls: 'k-spell' };
  return { icon: 'skill', text: 'Приём', tip: paramTip('skill', 'Приём', 'Активный приём: применяется в бою плиткой, бьёт оружием или даёт эффект'), cls: 'k-skill' };
}

/** Тип сокета артефакта: оружейный или бронный; универсальный сокет принимает оба. */
export function slotParam(def: ArtifactDef): Param {
  const name = ARTIFACT_SLOT_NAME[def.slot];
  return {
    icon: def.slot === 'weapon' ? 'slotWeapon' : 'slotArmor',
    text: def.slot === 'weapon' ? 'оруж.' : 'брон.',
    tip: paramTip(def.slot === 'weapon' ? 'slotWeapon' : 'slotArmor', `${name.charAt(0).toUpperCase() + name.slice(1)} артефакт`, `Встаёт в ${name} или универсальный сокет`),
    cls: `slot-${def.slot}`,
  };
}

/** Цена приёма: отдельный чип на стамину и на ману; бесплатный — «0». У пассивки цены нет. */
export function costParams(def: ArtifactDef, tier: ArtTier): Param[] {
  if (def.kind !== 'active') return [];
  const c = artifactCost(def, tier);
  const out: Param[] = [];
  if (c.sta === 'all') out.push({ icon: 'sta', text: 'вся', tip: paramTip('sta', 'Цена: вся стамина', 'Нужна полная стамина, уходит целиком'), cls: 'c-sta' });
  else if (c.sta) out.push({ icon: 'sta', text: `${c.sta}`, tip: paramTip('sta', `Цена: ${c.sta} STA`, 'Стамина восстанавливается целиком в начале хода'), cls: 'c-sta' });
  if (c.mp) out.push({ icon: 'mp', text: `${c.mp}`, tip: paramTip('mp', `Цена: ${c.mp} MP`, 'Мана — только реген в начале хода и целиком после комнаты'), cls: 'c-mp' });
  if (out.length === 0) out.push({ icon: 'sta', text: '0', tip: paramTip('sta', 'Бесплатно', 'Ни стамины, ни маны'), cls: 'c-free' });
  return out;
}

/** Перезарядка и лимит за ход: «КД 3», «раз в ход», «2 за ход». Нет ни того ни другого — пусто. */
export function cooldownParam(def: ArtifactDef, tier: ArtTier): Param | null {
  const uses = def.usesPerTurn?.(tier) ?? 0;
  const cd = def.cooldown?.(tier) ?? 0;
  if (uses > 1) return { icon: 'uses', text: `${uses}/ход`, tip: paramTip('uses', `Лимит: ${uses} за ход`, `До ${uses} раз за ход, без перезарядки`), cls: 'c-cd' };
  if (uses === 1 || cd === 1) return { icon: 'uses', text: '1/ход', tip: paramTip('uses', 'Лимит: раз в ход', 'Не чаще раза в ход'), cls: 'c-cd' };
  if (cd > 1) return { icon: 'cd', text: `${cd}`, tip: paramTip('cd', `Перезарядка: ${cd}`, `После применения приём недоступен ${cd} ${turnsWord(cd)}`), cls: 'c-cd' };
  return null;
}

/** Цель приёма: одна, все враги, на себя; с дальностью, если она своя («в упор» — только первый в ряду). */
export function targetParam(def: ArtifactDef): Param | null {
  if (def.kind !== 'active' || !def.target) return null;
  if (def.target === 'self') return { icon: 'self', text: 'на себя', tip: paramTip('self', 'Цель: на себя', 'Применяется сразу, без выбора цели'), cls: 't-self' };
  if (def.target === 'allEnemies') return { icon: 'all', text: 'все', tip: paramTip('all', 'Цель: все враги', 'Бьёт всех врагов разом'), cls: 't-all' };
  const reach = def.reach ?? (def.school === 'magic' ? 'any' : null);
  if (reach === 'melee') return { icon: 'one', text: 'в упор', tip: paramTip('one', 'Цель: в упор', 'Одна цель, только первый в ряду'), cls: 't-one' };
  if (reach === 'any') return { icon: 'one', text: 'любой', tip: paramTip('one', 'Цель: любая', 'Одна цель, любой враг в ряду'), cls: 't-one' };
  return { icon: 'one', text: 'цель', tip: paramTip('one', 'Цель: одна', 'Достаёт как оружие в руках: ближнее — первого в ряду, дальнее и магическое — любого'), cls: 't-one' };
}

/** Все параметры приёма по порядку чтения: цена, перезарядка, цель. У пассивки — пусто. */
export function useParams(def: ArtifactDef, tier: ArtTier): Param[] {
  return [...costParams(def, tier), cooldownParam(def, tier), targetParam(def)].filter((p): p is Param => !!p);
}

/** Строка из детей через точку-разделитель: «a · b · c». */
export function dotted(items: Child[]): Child[] {
  const out: Child[] = [];
  for (const it of items) {
    if (it === null || it === undefined || it === false || it === '') continue;
    if (out.length) out.push(h('span', { class: 'sep' }, '·'));
    out.push(it);
  }
  return out;
}
