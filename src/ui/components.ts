import { button, h, type Child, type Tip, type TipFn } from './dom';
import type { ArtTier, ArtifactInstance, ArtifactSlot, Combatant, DerivedStats, EnemyState, GearInstance, GearKind, GearTier, RunState, SlotKind, Status, StatusId } from '../engine/types';
import { STATUS_COLORS, statusIcon, uiIcon, uiIconColor, type UiIconId } from './icons';
import { artifactCostText, artifactDef, artifactFullText } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import { ART_TIER_COLORS, GEAR_TIERS, REACH_NAMES, weaponReach } from '../data/gear';
import { type Collectible, type FoundState } from '../data/collection';
import type { HeroDef } from '../engine/types';
import { ARTIFACT_SLOT_NAME, SLOT_KIND_NAME, canPlaceArtifact, findSameArtifact, gearOf, slotAccepts, slotKindAt, socketRefs } from '../engine/equipment';
import { STATUS_NAMES, freezeAt, onDeathInfo, type ActionPart, type IntentKind } from '../engine/combat';
import type { App } from './app';
import { ARCHETYPES, archetypeCounts, artifactTags, type ArchetypeDef } from '../data/archetypes';
import type { ArchetypeId } from '../engine/types';
import { canPendingSmelt, smeltTargets } from '../engine/run';
import { LIVE_ICON, artTypeItems, artifactCard, gearMiniHead, restValue } from './cards';
import { paramChip, useParams } from './cardParts';
import { statusHint } from './keywords';
import { paramTip, tierDiff, tipAction, tipChip, tipChips, tipHead, tipLines, tipNote, tipPips, tipSection, tipText, turnsWord, whyTip, type TipIcon, type TipLine, type Tone } from './tips';

/** Полоска: заливка и подпись «HP 12/20»; suffix — хвост подписи, у врага так показан блок: «12/20 · ⛨ 3». */
/**
 * Полоска HP. Блок — наложением поверх заливки слева, шириной в долю максимума (первые N HP прикрыты),
 * и «(+N)» цветом щита в подписи; у героя и врагов одинаково.
 */
export function bar(cls: string, cur: number, max: number, label = '', tip: Tip = '', block = 0): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const blockPct = max > 0 ? Math.min(100, (block / max) * 100) : 0;
  return h(
    'div',
    tip ? { class: `bar bar-${cls}`, tip } : { class: `bar bar-${cls}` },
    h('div', { class: 'bar-fill', style: `width:${pct}%` }),
    block > 0 ? h('div', { class: 'bar-block', style: `width:${blockPct}%` }) : null,
    h('span', { class: 'bar-text' }, `${label ? label + ' ' : ''}${cur}/${max}`, block > 0 ? h('span', { class: 'bar-block-text' }, ` (+${block})`) : null),
  );
}

/**
 * Подсказка полоски HP (v0.52): здоровье шапкой, блок — строкой со значком щита и тем, что он погасит.
 * hero — полоска героя: его блок сгорает в начале следующего хода, а врагу подсказка напоминает, что щит держит и заклинания.
 */
export function hpTip(cur: number, max: number, block: number, hero: boolean): TipFn {
  return () => [
    tipHead({ icon: 'hp', title: 'Здоровье', color: uiIconColor('hp'), aside: h('b', { class: 'tip-val' }, `${cur}/${max}`) }),
    block > 0
      ? tipLines([{ icon: 'block', label: `Блок ${block}:`, text: hero ? `первые ${block} урона удара уйдут в него; сгорает в начале следующего хода` : `первые ${block} урона удара или заклинания уйдут в него` }])
      : null,
  ];
}

/**
 * Расходуемый ресурс: полоска во всю ширину, как HP, поделённая на секции —
 * по одному очку. Очки сверх максимума («Кольцо выносливости», «Второе дыхание»: 5/4)
 * дорисовываются своими секциями другого цвета — видно, что это бонус, а не база.
 */
export function segBar(kind: 'sta' | 'mp', cur: number, max: number): HTMLElement {
  const segs: HTMLElement[] = [];
  const total = Math.max(cur, max);
  for (let i = 0; i < total; i++) segs.push(h('div', { class: `seg ${i < cur ? 'on' : ''} ${i >= max ? 'extra' : ''}` }));
  const label = kind === 'sta' ? 'STA' : 'MP';
  const tip = paramTip(
    kind,
    kind === 'sta' ? 'Стамина' : 'Мана',
    kind === 'sta' ? 'Очки действий: удар и «Защититься» — по 1, приёмы — по цене. Полностью восстанавливаются в начале хода' : 'Цена заклинаний. Реген в начале хода, полностью — после комнаты',
    { aside: h('b', { class: 'tip-val' }, `${cur}/${max}`), note: cur > max ? `+${cur - max} сверх максимума` : undefined, noteTone: 'good' },
  );
  return h('div', { class: `bar bar-${kind}`, tip }, h('div', { class: 'segs' }, ...segs), h('span', { class: 'bar-text' }, `${label} ${cur}/${max}`));
}

/**
 * Плитка каталога. Запись закрыта — «???»; у артефакта в углу три метки тиров: горит тот, что был у героя в забеге.
 * Описание закрытого тира в подсказке спрятано, сама запись при этом открыта (см. collectibleLines).
 */
export function collectibleTile(c: Collectible, st: FoundState, lockedHow = ''): HTMLElement {
  if (!st.open) {
    // Закрытая мастерством вещь (v0.45): силуэт с условием — альбом заодно и список целей.
    if (lockedHow) {
      return h(
        'div',
        { class: 'coll-tile locked sealed', tip: paramTip('lock', c.name, undefined, { sub: [c.sub.split(' · ')[0], 'закрыто'], note: `Как открыть: ${lockedHow}`, noteTone: 'accent' }) },
        h('span', { class: 'coll-glyph' }, '🔒'),
        h('span', { class: 'coll-name' }, c.name),
      );
    }
    return h('div', { class: 'coll-tile locked', tip: paramTip('lock', 'Ещё не найдено', 'Запись откроется, когда вещь побывает у героя в руках') }, h('span', { class: 'coll-glyph' }, '?'), h('span', { class: 'coll-name' }, '???'));
  }
  // Метки без своей подсказки: наведение на любую точку плитки должно показывать её описание целиком.
  const pips = st.tiers.length
    ? h('span', { class: 'coll-tiers' }, ...st.tiers.map((ok) => h('i', { class: `coll-pip ${ok ? 'on' : ''}`, style: ok ? `background:${c.color}` : '' })))
    : null;
  return h('div', { class: `coll-tile kind-${c.kind}`, style: `border-color:${c.color}`, tip: collectibleTip(c, st) }, pips, h('span', { class: 'coll-glyph', style: `color:${c.color}` }, c.glyph), h('span', { class: 'coll-name' }, c.name));
}

/** Подсказка записи коллекции: шапка цветом вида вещи, у артефакта — тиры строками (закрытый — «???»), у остального — описание абзацами. */
function collectibleTip(c: Collectible, st: FoundState): TipFn {
  return () => {
    const out: Child[] = [tipHead({ icon: { glyph: c.glyph, color: c.color }, title: c.name, color: c.color, nameColor: 'var(--text)', sub: c.sub.split(' · ') })];
    if (c.tiers) {
      out.push(
        tipLines(
          c.tiers.map((text, i) => {
            const tier = (i + 1) as ArtTier;
            const open = st.tiers[i];
            return { icon: { glyph: '●', color: open ? ART_TIER_COLORS[tier] : '#3a3a5a' }, label: `Тир ${tier}:`, ...(open ? { text } : { value: '???', tone: 'dim' as const }) };
          }),
        ),
      );
    }
    if (c.desc) out.push(...c.desc.split('\n').map((line) => tipText(line)));
    return out;
  };
}

/**
 * Карточка-выбор: подсветка на наведении и клик по всей площади.
 * Клик по кнопке внутри не дублируется — он обрабатывается своим обработчиком.
 */
export function pickable(el: HTMLElement, onclick?: () => void): HTMLElement {
  el.classList.add('pickable');
  if (onclick) {
    el.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      onclick();
    });
  }
  return el;
}

/**
 * Подсказка к имени экипировки: тир словами и лестница из пяти тиров цветами — видно, где предмет на шкале. Бейджа тира нет —
 * его показывает цвет рамки.
 */
export function tierTip(tier: GearTier): TipFn {
  return () => {
    const info = GEAR_TIERS[tier];
    const tiers = [1, 2, 3, 4, 5] as GearTier[];
    return [
      tipHead({ title: `${info.name} предмет`, color: info.color, nameColor: tier <= 1 ? 'var(--text)' : info.color, aside: `тир ${tier}/5` }),
      h('div', { class: 'tip-ladder' }, ...tiers.map((t) => h('span', { class: `tip-ladder-step ${t === tier ? 'on' : ''}`.trim(), style: `--c:${GEAR_TIERS[t].color}` }, GEAR_TIERS[t].name))),
      tipText('Выше тир — сильнее кубик и броня и больше сокетов. Кузнец поднимает тир на 1'),
    ];
  };
}

// ─── Архетипы (v0.43) ──────────────────────────────────────────────────────

/**
 * Подсказка метки архетипа: суть и оба порога набора строками. С числом вещей у героя — взятые пороги зелёным с галочкой,
 * остальные приглушённо.
 */
export function archetypeTip(arch: ArchetypeDef, count?: number): TipFn {
  return () => {
    const lines: TipLine[] = [];
    for (const n of [2, 3] as const) {
      const b = arch.sets[n];
      if (!b) continue;
      const on = count !== undefined && count >= n;
      lines.push({ icon: on ? 'check' : undefined, label: `${n} вещи:`, text: b.text, tone: count === undefined ? undefined : on ? 'good' : 'dim' });
    }
    return [
      tipHead({
        icon: { glyph: arch.glyph, color: arch.color },
        title: arch.name,
        color: arch.color,
        sub: ['архетип', 'набор из 3 вещей'],
        aside: count !== undefined ? h('b', { class: 'tip-val', style: `color:${arch.color}` }, `${Math.min(count, 3)}/3`) : undefined,
      }),
      tipText(arch.desc),
      lines.length ? tipSection('Бонусы набора', [tipLines(lines)]) : tipNote('Бонусы набора появятся позже'),
    ];
  };
}

/** Счётчики наборов героя: «♦ 2/3» по каждому архетипу, у которого есть хоть одна вещь (лист персонажа). */
export function setCounters(arts: ArtifactInstance[]): HTMLElement | null {
  const counts = archetypeCounts(arts);
  const ids = (Object.keys(counts) as ArchetypeId[]).filter((id) => (counts[id] ?? 0) > 0);
  if (ids.length === 0) return null;
  return h(
    'div',
    { class: 'set-counters' },
    ...ids.map((id) => {
      const arch = ARCHETYPES[id];
      const n = counts[id] ?? 0;
      const on = (n >= 2 && !!arch.sets[2]) || (n >= 3 && !!arch.sets[3]);
      return h('span', { class: `set-counter ${on ? 'on' : ''}`, style: `color:${arch.color}`, tip: archetypeTip(arch, n) }, `${arch.glyph} ${arch.name} ${Math.min(n, 3)}/3`);
    }),
  );
}

// ─── Подсказка артефакта (v0.52) ───────────────────────────────────────────

export interface ArtifactTipOpts {
  /** Статы героя: число «сейчас» чипом рядом с ценой. */
  stats?: DerivedStats;
  /** Оговорка перед хвостом: «Врождённый навык: не занимает сокет». */
  note?: string;
  /** Значок и тон оговорки: по умолчанию корона и акцент (навык героя). */
  noteIcon?: TipIcon;
  noteTone?: Tone;
  /** Что сделает клик: «вставить сюда». */
  action?: string;
  /** Кузница и переплавка: следующий тир — главное, подписан «Станет». */
  upgrade?: boolean;
  /** До какого тира растёт при слиянии: дубликат тира 3 поднимает тир 1 сразу до 3. По умолчанию — на один. */
  to?: ArtTier;
}

/**
 * Подсказка артефакта — та же грамматика, что у карточки: глиф в рамке цвета тира и имя, справа тир; под именем род, архетипы,
 * пометки и тип сокета; параметры применения чипами (цена, КД или лимит, цель, число «сейчас»); описание с иконками статусов;
 * следующий тир под пунктиром — изменившиеся числа выделены.
 */
export function artifactTip(inst: ArtifactInstance, o: ArtifactTipOpts = {}): TipFn {
  return () => {
    const def = artifactDef(inst.id);
    const color = ART_TIER_COLORS[inst.tier];
    const next = (o.to ?? Math.min(3, inst.tier + 1)) as ArtTier;
    const live = o.stats ? restValue(inst, o.stats) : null;
    const out: Child[] = [
      tipHead({
        icon: { glyph: def.glyph, color },
        title: def.name,
        color,
        nameColor: inst.tier <= 1 ? 'var(--text)' : color,
        aside: h('span', { style: `color:${color}` }, o.upgrade && inst.tier < 3 ? `тир ${inst.tier} → ${next}` : `тир ${inst.tier}/3`),
        sub: artTypeItems(inst),
      }),
      tipChips([
        ...useParams(def, inst.tier).map(paramChip),
        live ? tipChip(LIVE_ICON[live.kind], h('span', null, `${live.text}${live.all ? ' всем' : ''}`, h('span', { class: 'dim' }, ' сейчас')), 'c-live') : null,
      ]),
      tipText(def.describe(inst.tier)),
    ];
    if (o.note) out.push(tipNote(o.note, o.noteIcon ?? 'crown', o.noteTone ?? 'accent'));
    if (inst.tier < 3) {
      // Цена меняется с тиром у немногих (Дымовая шашка) — тогда и она в сравнении.
      const c0 = artifactCostText(def, inst.tier);
      const c1 = artifactCostText(def, next);
      const cur = artifactFullText(def, inst.tier) + (c0 !== c1 ? `. Цена ${c0}` : '');
      const nxt = artifactFullText(def, next) + (c0 !== c1 ? `. Цена ${c1}` : '');
      out.push(tipSection(o.upgrade ? `Станет, тир ${next}:` : `Тир ${next}:`, tierDiff(cur, nxt), ART_TIER_COLORS[next]));
    } else if (o.upgrade) out.push(tipNote('Уже максимальный тир', 'star'));
    if (o.action) out.push(tipAction(o.action));
    return out;
  };
}

/** Подпись персонального артефакта: чей он. Пусто для общих. */
export function signatureNote(id: string): string {
  const owner = SIGNATURE_OWNER[id];
  return owner ? `Персональный артефакт: ${heroDef(owner).name}` : '';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Типы сокетов (v0.31) ──────────────────────────────────────────────────

/** Значок типа сокета: оружейный, бронный, универсальный. */
export const SLOT_KIND_GLYPH: Record<SlotKind, string> = { weapon: '⚔', armor: '⛨', any: '◇' };

/** Пиксельная иконка типа сокета — в консоли, листе и подсказках. */
export const SLOT_ICON: Record<SlotKind, UiIconId> = { weapon: 'slotWeapon', armor: 'slotArmor', any: 'slotAny' };

const SLOT_PLURAL: Record<ArtifactSlot, string> = { weapon: 'оружейные', armor: 'бронные' };

/** Подсказка к сокету по типу: что в него встаёт; state — «свободен», action — что сделает клик. */
export function slotKindTip(kind: SlotKind, o: { state?: string; action?: string } = {}): TipFn {
  return () => [
    tipHead({ icon: SLOT_ICON[kind], title: `${cap(SLOT_KIND_NAME[kind])} сокет`, color: uiIconColor(SLOT_ICON[kind]), aside: o.state }),
    tipText(kind === 'any' ? 'Принимает любой артефакт: и оружейный, и бронный' : `Принимает только ${SLOT_PLURAL[kind]} артефакты`),
    o.action ? tipAction(o.action) : null,
  ];
}

/** Пустой чип сокета с его типом — в подвале карточки экипировки. */
export function socketChip(kind: SlotKind): HTMLElement {
  return h('div', { class: `chip chip-empty k-${kind}`, tip: slotKindTip(kind, { state: 'свободен' }) }, SLOT_KIND_GLYPH[kind]);
}

export function artifactChip(inst: ArtifactInstance | null, opts: { onclick?: () => void; selected?: boolean; note?: string; stats?: DerivedStats } = {}): HTMLElement {
  if (!inst) return h('div', { class: 'chip chip-empty', tip: 'Пустой слот' }, '·');
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    {
      class: `chip ${def.kind} ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${opts.selected ? 'selected' : ''} ${opts.onclick ? 'clickable' : ''}`,
      style: `border-color:${color}`,
      tip: artifactTip(inst, { note: opts.note, stats: opts.stats }),
      onclick: opts.onclick,
    },
    h('span', { class: 'chip-glyph' }, def.glyph),
    h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)),
  );
}

// ─── Зелья ─────────────────────────────────────────────────────────────────

export const POTION_COLOR = '#6fd97a';

/** Подсказка зелья: глиф и имя зелёным, «бесплатно» чипом, эффект абзацем. */
export function potionTip(id: string): TipFn {
  return () => {
    const def = potionDef(id);
    return [
      tipHead({ icon: { glyph: def.glyph, color: POTION_COLOR }, title: def.name, color: POTION_COLOR, sub: [h('span', { class: 'potion-kind' }, 'Зелье'), 'расходник'] }),
      tipChips([tipChip('sta', 'бесплатно', 'c-free')]),
      tipText(def.describe),
      tipNote('Пьётся в бою и пропадает. Слот зелья один'),
    ];
  };
}

/** Пустой слот зелья: откуда они берутся. */
export const EMPTY_POTION_TIP = paramTip({ glyph: '·', color: POTION_COLOR }, 'Слот зелья пуст', 'Зелья падают с монстров и продаются у торговца', { color: POTION_COLOR });

/** Чип зелья — как чип артефакта, но без тира. Пустой слот — прочерк. */
export function potionChip(id: string | null): HTMLElement {
  if (!id) return h('div', { class: 'chip chip-empty', tip: EMPTY_POTION_TIP }, '·');
  return h('div', { class: 'chip potion', style: `border-color:${POTION_COLOR}`, tip: potionTip(id) }, h('span', { class: 'chip-glyph' }, potionDef(id).glyph));
}

/** Что вытеснит новое зелье; null — слот пуст. */
export function potionReplaceNote(run: RunState): string | null {
  return run.hero.potion ? `Заменит: ${potionDef(run.hero.potion).name}` : null;
}

/**
 * Маркер дальности оружия (v0.26): три точки — ряд врагов. Ближнее оружие красит первую (достаёт только первого),
 * дальнее, магическое, копьё и плеть — все три. С героем — в его руках: плеть у не владеющего красит одну.
 */
export function reachDots(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  if (gear.kind !== 'weapon') return null;
  const reach = weaponReach(gear, def);
  const lit = reach === 'melee' ? 1 : 3;
  const cells = () => [0, 1, 2].map((i) => h('i', { class: i < lit ? 'on' : '' }));
  // Подсказка: те же три клетки ряда покрупнее и словами, кого достаёт удар; у плети в чужих руках — почему только первого.
  const lost = def && weaponReach(gear) === 'row' && reach === 'melee';
  const tip = paramTip(reach === 'melee' ? 'one' : 'all', 'Дальность', cap(REACH_NAMES[reach]), {
    color: 'var(--accent)',
    aside: h('span', { class: `reach-dots reach-${reach}` }, ...cells()),
    note: lost ? `Перк «Хлёст» не работает: ${def!.name} не владеет ближним оружием` : undefined,
    noteTone: 'bad',
  });
  return h('span', { class: `reach-dots reach-${reach}`, tip }, ...cells());
}

/** Золотая монета в тексте: «Перебросить за 5 ◉». */
export function coin(): HTMLElement {
  return h('span', { class: 'coin' }, '◉');
}

export function goldBadge(gold: number): HTMLElement {
  const tip = paramTip({ glyph: '◉', color: 'var(--accent)' }, 'Золото', 'Капает за бои и события. Тратится у торговца, кузнеца и на переброс награды', { color: 'var(--accent)', aside: h('b', { class: 'tip-val' }, `${gold}`) });
  return h('span', { class: 'gold', tip }, `◉ ${gold}`);
}

// ─── Статусы ───────────────────────────────────────────────────────────────

/** Статусы, у которых число — сила эффекта, а не служебная единица. */
const VALUE_STATUSES: StatusId[] = ['strength', 'bleed', 'burn', 'poison', 'thorns', 'regen', 'dodge', 'evade', 'enchant'];

/** Значок строки эффекта приёма врага по виду; статус — своей иконкой, замах — стрелкой «дальше». */
const PART_ICON: Record<IntentKind, TipIcon> = { attack: 'dmg', defend: 'block', buff: 'str', debuff: 'skull', heal: 'heal', summon: { glyph: '☍', color: '#ffab91' }, special: 'star' };

/** Эффекты приёма врага строками со значками — подсказка намерения, «Предсмертия» и союзника. */
export function actionPartLines(parts: ActionPart[]): HTMLElement | null {
  return tipLines(
    parts.map((p) => {
      let icon: TipIcon = p.next ? 'arrow' : p.status ? { status: p.status } : PART_ICON[p.kind];
      // Кража и отъём ресурсов — значком того, что уходит.
      if (!p.status && /маны/.test(p.text)) icon = 'mp';
      else if (!p.status && /золота/.test(p.text)) icon = { glyph: '◉', color: 'var(--accent)' };
      return { icon, text: p.text, tone: p.next ? 'dim' : undefined };
    }),
  );
}

/**
 * Подсказка статуса на бойце: иконка и имя цветом статуса, справа сила, под именем срок; правило — с подставленным числом
 * («4 урона в начале хода»). Холод на враге — шкалой до Оцепенения, «Предсмертие» — эффектами при гибели строками.
 */
export function statusTip(s: Status, enemy?: EnemyState): TipFn {
  return () => {
    const color = STATUS_COLORS[s.id];
    const showValue = VALUE_STATUSES.includes(s.id) && (s.id !== 'dodge' || s.value > 1);
    // Холод на враге (v0.51.1): «накоплено/порог» — сколько осталось до Оцепенения; порог у каждого врага свой (лёд крепчает).
    const coldCap = s.id === 'cold' && enemy ? freezeAt(enemy) : 0;
    const sub: Child[] = [];
    if (s.turns > 0) sub.push(h('span', null, uiIcon('cd', 12), `ещё ${s.turns} ${turnsWord(s.turns)}`));
    else if (s.turns < 0 && s.id !== 'doom') sub.push('до конца боя');
    if (s.element) sub.push(h('span', null, 'стихия ', statusIcon(s.element, 12), ` ${STATUS_NAMES[s.element]}`));
    const val = coldCap ? `${s.value}/${coldCap}` : showValue ? `${s.value}` : '';
    const out: Child[] = [tipHead({ icon: { status: s.id }, title: STATUS_NAMES[s.id], color, sub, aside: val ? h('b', { class: 'tip-val', style: `color:${color}` }, val) : undefined })];
    if (coldCap) {
      const left = Math.max(0, coldCap - s.value);
      out.push(h('div', { class: 'tip-text' }, tipPips(coldCap, s.value, color), ' ', h('span', { class: 'tip-accent' }, `ещё ${left} — и враг оцепенеет`)));
    }
    const doom = s.id === 'doom' && enemy ? onDeathInfo(enemy) : null;
    if (doom) {
      out.push(tipText(`Погибнув, враг напоследок применит «${doom.name}»:`));
      out.push(actionPartLines(doom.parts));
    } else out.push(tipText(statusHint(s.id, showValue ? s.value : null)));
    return out;
  };
}

/**
 * Статусы бойца. Для врага передаётся он сам: «Предсмертие» тогда расписывает в подсказке
 * его onDeath с числами под акт («Вспышка: Атака 6, Горение 3 на 2 хода»).
 */
export function statusIcons(c: Combatant, enemy?: EnemyState): HTMLElement {
  return h(
    'div',
    { class: 'statuses' },
    ...c.statuses.map((s) => {
      const showValue = VALUE_STATUSES.includes(s.id) && (s.id !== 'dodge' || s.value > 1);
      const coldCap = s.id === 'cold' && enemy ? freezeAt(enemy) : 0;
      const valueText = coldCap ? `${s.value}/${coldCap}` : showValue ? `${s.value}` : '';
      return h(
        'span',
        { class: `status status-${s.id}`, tip: statusTip(s, enemy) },
        statusIcon(s.id, 18),
        valueText ? h('span', { class: 'status-val' }, valueText) : null,
        s.turns > 0 ? h('span', { class: 'status-turns' }, `${s.turns}`) : null,
      );
    }),
  );
}

/**
 * Модалка выбора слота для артефакта: карточка артефакта слева, справа оружие и броня со своими сокетами
 * в той же сетке 2×2, что и в консоли. Пустой сокет — «Вставить», занятый — «Заменить», старый артефакт пропадёт.
 */
export function pendingModal(app: App): HTMLElement | null {
  const run = app.run;
  const p = run?.pending;
  const art = p?.artifacts[0];
  if (!run || !p || !art) return null;
  const same = findSameArtifact(run.hero, art.id);
  const slot = artifactDef(art.id).slot;
  const fitting = socketRefs(run.hero).filter((s) => slotAccepts(s.slot, slot));
  const hasFree = fitting.some((s) => !s.art);
  const displaced = !!p.displaced?.includes(art.id);
  const hint =
    fitting.length === 0
      ? `Подходящих сокетов нет: ${ARTIFACT_SLOT_NAME[slot]} артефакт встаёт только в ${ARTIFACT_SLOT_NAME[slot]} или универсальный сокет.`
      : hasFree
        ? 'Клик по сокету. Занятый сокет — замена, вытесненный артефакт спросит, куда его деть.'
        : 'Свободных подходящих сокетов нет: выберите, какой артефакт заменить, — вытесненный спросит, куда его деть.';
  const group = (kind: GearKind) => {
    const gear = gearOf(run.hero, kind);
    const info = GEAR_TIERS[gear.tier];
    return h(
      'div',
      { class: 'pm-gear', style: `border-color:${info.color}` },
      gearMiniHead(gear),
      h(
        'div',
        { class: 'gt-sockets' },
        ...gear.slots.map((a, index) => {
          const isSame = !!same && same.kind === kind && same.index === index;
          const sk = slotKindAt(gear, index);
          // Сокет чужого типа — без disabled, а классом off: подсказка с причиной должна показываться (см. CLAUDE.md).
          const why = canPlaceArtifact(run.hero, kind, index, art.id);
          const off = isSame || !!why;
          return h(
            'button',
            {
              class: `sock pm-sock k-${sk} ${a ? '' : 'empty'} ${off ? 'off' : ''}`,
              tip: why ? whyTip(why, 'Сюда нельзя') : a ? artifactTip(a, { action: 'Заменить: вытесненный встанет в очередь' }) : slotKindTip(sk, { state: 'свободен', action: 'Вставить сюда' }),
              onclick: () => {
                if (!off) app.pendingPlace(kind, index);
              },
            },
            a ? artifactChip(a) : socketChip(sk),
            a ? h('span', { class: 'sock-name' }, `${artifactDef(a.id).name} · ${a.tier}`) : null,
            h('span', { class: 'pm-act' }, why ? 'Нельзя' : a ? 'Заменить' : 'Вставить'),
          );
        }),
      ),
    );
  };
  return h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel modal' },
      h('h2', null, displaced ? 'Вытесненный артефакт: куда переставить?' : 'Куда вставить артефакт?'),
      h('p', { class: 'dim' }, hint),
      h('div', { class: 'pm-body' }, artifactCard(art, undefined, undefined, run), h('div', { class: 'pm-gears' }, group('weapon'), group('armor'))),
      smeltRow(app, art),
      h(
        'div',
        { class: 'row' },
        p.cancellable ? button('Отмена', () => app.pendingCancel()) : button('Выбросить', () => app.pendingDiscard(), { class: 'danger', tip: paramTip('cross', 'Выбросить', 'Артефакт пропадёт насовсем', { color: '#ff6b6b' }) }),
      ),
    ),
  );
}

/**
 * Переплавка (v0.43): кнопка на каждую цель — артефакт того же архетипа в сокете (у общей вещи — любой) не на максимуме.
 * Лишняя находка не пропадает, а поднимает тир своему архетипу; нечего переплавлять — строки нет.
 */
function smeltRow(app: App, art: ArtifactInstance): HTMLElement | null {
  const run = app.run!;
  const targets = smeltTargets(run, art.id);
  if (targets.length === 0) return null;
  const tags = artifactTags(art.id);
  return h(
    'div',
    { class: 'smelt-row' },
    h(
      'span',
      {
        class: 'dim',
        tip: paramTip(
          'star',
          'Переплавка',
          tags.length ? 'Этот артефакт пропадёт, а артефакт того же архетипа в сокете получит +1 тир' : 'Общая вещь: переплавляется в тир любому артефакту в сокете',
        ),
      },
      'Переплавить в:',
    ),
    ...targets.map((t) =>
      button(
        `${artifactDef(t.art!.id).name} ${t.art!.tier}→${t.art!.tier + 1}`,
        () => {
          if (!canPendingSmelt(run, t.kind, t.index)) app.pendingSmelt(t.kind, t.index);
        },
        { class: 'small', tip: artifactTip(t.art!, { upgrade: true, action: `Переплавить: «${artifactDef(art.id).name}» пропадёт` }) },
      ),
    ),
  );
}
