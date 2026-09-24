import { button, h } from './dom';
import type { ArtTier, ArtifactInstance, Combatant, EnemyState, GearInstance, GearKind, GearTier, RunState, SlotKind, StatusId } from '../engine/types';
import { statusIcon } from './icons';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import {
  ARMOR_TYPE_GLYPHS,
  ARMOR_TYPE_NAMES,
  ART_TIER_COLORS,
  GEAR_TIERS,
  WEAPON_TYPE_GLYPHS,
  WEAPON_TYPE_NAMES,
  armorSkillTitle,
  armorType,
  armorTypeTitle,
  canWearArmor,
  canWieldWeapon,
  gearPerkText,
  gearStatText,
  hasPerk,
  weaponDice,
  weaponSkillTitle,
  weaponReach,
  weaponReachTitle,
  weaponType,
  weaponTypeTitle,
} from '../data/gear';
import { collectibleLines, type Collectible, type FoundState } from '../data/collection';
import type { ArmorType, HeroDef, WeaponType } from '../engine/types';
import { ARTIFACT_SLOT_NAME, SLOT_KIND_NAME, canPlaceArtifact, findSameArtifact, gearOf, slotAccepts, slotKindAt, socketRefs } from '../engine/equipment';
import { STATUS_HINTS, STATUS_NAMES, onDeathInfo } from '../engine/combat';
import { markKeywords } from './keywords';
import type { App } from './app';
import { ARCHETYPES, archetypeCounts, artifactTags, type ArchetypeDef } from '../data/archetypes';
import type { ArchetypeId } from '../engine/types';
import { canPendingSmelt, smeltTargets } from '../engine/run';
import { artifactCard, gearMiniHead } from './cards';

/** Полоска: заливка и подпись «HP 12/20»; suffix — хвост подписи, у врага так показан блок: «12/20 · ⛨ 3». */
/**
 * Полоска HP. Блок — наложением поверх заливки слева, шириной в долю максимума (первые N HP прикрыты),
 * и «(+N)» цветом щита в подписи; у героя и врагов одинаково.
 */
export function bar(cls: string, cur: number, max: number, label = '', tip = '', block = 0): HTMLElement {
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
 * Расходуемый ресурс: полоска во всю ширину, как HP, поделённая на секции —
 * по одному очку. Очки сверх максимума («Кольцо выносливости», «Второе дыхание»: 5/4)
 * дорисовываются своими секциями другого цвета — видно, что это бонус, а не база.
 */
export function segBar(kind: 'sta' | 'mp', cur: number, max: number): HTMLElement {
  const segs: HTMLElement[] = [];
  const total = Math.max(cur, max);
  for (let i = 0; i < total; i++) segs.push(h('div', { class: `seg ${i < cur ? 'on' : ''} ${i >= max ? 'extra' : ''}` }));
  const label = kind === 'sta' ? 'STA' : 'MP';
  const extra = cur > max ? ` (+${cur - max} сверх максимума)` : '';
  return h(
    'div',
    { class: `bar bar-${kind}`, tip: `${kind === 'sta' ? 'Стамина' : 'Мана'} ${cur}/${max}${extra}` },
    h('div', { class: 'segs' }, ...segs),
    h('span', { class: 'bar-text' }, `${label} ${cur}/${max}`),
  );
}

/**
 * Плитка каталога. Запись закрыта — «???»; у артефакта в углу три метки тиров: горит тот, что был у героя в забеге.
 * Описание закрытого тира в подсказке спрятано, сама запись при этом открыта (см. collectibleLines).
 */
export function collectibleTile(c: Collectible, st: FoundState, lockedHow = ''): HTMLElement {
  if (!st.open) {
    // Закрытая мастерством вещь (v0.45): силуэт с условием — альбом заодно и список целей.
    if (lockedHow) return h('div', { class: 'coll-tile locked sealed', tip: `${c.name}\nЗакрыто. Как открыть: ${lockedHow}` }, h('span', { class: 'coll-glyph' }, '🔒'), h('span', { class: 'coll-name' }, c.name));
    return h('div', { class: 'coll-tile locked', tip: 'Ещё не найдено' }, h('span', { class: 'coll-glyph' }, '?'), h('span', { class: 'coll-name' }, '???'));
  }
  // Метки без своей подсказки: наведение на любую точку плитки должно показывать её описание целиком.
  const pips = st.tiers.length
    ? h('span', { class: 'coll-tiers' }, ...st.tiers.map((ok) => h('i', { class: `coll-pip ${ok ? 'on' : ''}`, style: ok ? `background:${c.color}` : '' })))
    : null;
  return h(
    'div',
    { class: `coll-tile kind-${c.kind}`, style: `border-color:${c.color}`, tip: [c.name, c.sub, ...collectibleLines(c, st)].join('\n') },
    pips,
    h('span', { class: 'coll-glyph', style: `color:${c.color}` }, c.glyph),
    h('span', { class: 'coll-name' }, c.name),
  );
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

/** Подсказка к имени экипировки: тир словами. Бейджа тира нет — его показывает цвет рамки. */
export function tierTip(tier: GearTier): string {
  return `${GEAR_TIERS[tier].name} предмет, тир ${tier}`;
}

// ─── Архетипы (v0.43) ──────────────────────────────────────────────────────

/** Подсказка к метке архетипа: суть и оба порога набора. */
export function archetypeTip(arch: ArchetypeDef, count?: number): string {
  const lines = [`${arch.name}${count !== undefined ? ` ${count}/3` : ''}: ${arch.desc}`];
  for (const n of [2, 3] as const) {
    const b = arch.sets[n];
    if (b) lines.push(`${count !== undefined && count >= n ? '✓' : '·'} ${n} вещи: ${b.text}`);
  }
  if (!arch.sets[2] && !arch.sets[3]) lines.push('Бонусы набора появятся позже');
  return lines.join('\n');
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

export function artifactTitle(inst: ArtifactInstance): string {
  const def = artifactDef(inst.id);
  const lines = [`${def.name} (тир ${inst.tier})`, def.describe(inst.tier)];
  const tags = artifactTags(inst.id);
  if (tags.length) lines.push(`Архетип: ${tags.map((t) => ARCHETYPES[t].name).join(', ')}${def.keystone ? ' · ключевая вещь' : ''}`);
  if (def.kind === 'active') lines.push(`Цена: ${artifactCostText(def, inst.tier)}`);
  else lines.push('Пассивный');
  lines.push(`${cap(ARTIFACT_SLOT_NAME[def.slot])} артефакт: встаёт в ${ARTIFACT_SLOT_NAME[def.slot]} или универсальный сокет`);
  if (inst.tier < 3) lines.push(`Следующий тир: ${def.describe((inst.tier + 1) as ArtTier)}`);
  return lines.join('\n');
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

/** Подсказка к сокету по типу: что в него встаёт. */
export function slotKindTip(kind: SlotKind): string {
  if (kind === 'any') return 'Универсальный сокет: принимает любой артефакт';
  return `${cap(SLOT_KIND_NAME[kind])} сокет: принимает только ${ARTIFACT_SLOT_NAME[kind]} артефакты`;
}

/** Пустой чип сокета с его типом — в подвале карточки экипировки. */
export function socketChip(kind: SlotKind): HTMLElement {
  return h('div', { class: `chip chip-empty k-${kind}`, tip: slotKindTip(kind) }, SLOT_KIND_GLYPH[kind]);
}

export function artifactChip(inst: ArtifactInstance | null, opts: { onclick?: () => void; selected?: boolean } = {}): HTMLElement {
  if (!inst) return h('div', { class: 'chip chip-empty', tip: 'Пустой слот' }, '·');
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    {
      class: `chip ${def.kind} ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${opts.selected ? 'selected' : ''} ${opts.onclick ? 'clickable' : ''}`,
      style: `border-color:${color}`,
      tip: artifactTitle(inst),
      onclick: opts.onclick,
    },
    h('span', { class: 'chip-glyph' }, def.glyph),
    h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)),
  );
}

// ─── Зелья ─────────────────────────────────────────────────────────────────

export const POTION_COLOR = '#6fd97a';

export function potionTitle(id: string): string {
  const def = potionDef(id);
  return `${def.name}\n${def.describe}\nПьётся в бою бесплатно и пропадает. Слот один.`;
}

/** Чип зелья — как чип артефакта, но без тира. Пустой слот — прочерк. */
export function potionChip(id: string | null): HTMLElement {
  if (!id) return h('div', { class: 'chip chip-empty', tip: 'Слот зелья пуст. Зелья падают с монстров и продаются у торговца' }, '·');
  return h('div', { class: 'chip potion', style: `border-color:${POTION_COLOR}`, tip: potionTitle(id) }, h('span', { class: 'chip-glyph' }, potionDef(id).glyph));
}

/** Что вытеснит новое зелье; null — слот пуст. */
export function potionReplaceNote(run: RunState): string | null {
  return run.hero.potion ? `Заменит: ${potionDef(run.hero.potion).name}` : null;
}

/** Иконка типа оружия у бейджа тира. С героем окрашена по владению: зелёный владеет, красный нет. */
export function weaponTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  const type = weaponType(gear);
  const cls = def ? (canWieldWeapon(def, gear) ? 'skill-yes' : 'skill-no') : '';
  return h('span', { class: `wtype-icon ${cls}`.trim(), tip: weaponTypeTitle(gear, def) }, WEAPON_TYPE_GLYPHS[type]);
}

/** Иконка типа брони у бейджа тира. С героем окрашена по умению носить: зелёный умеет, красный не умеет. Без перка — серая. */
export function armorTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  const cls = def && hasPerk(gear) ? (canWearArmor(def, gear) ? 'skill-yes' : 'skill-no') : '';
  return h('span', { class: `wtype-icon ${cls}`.trim(), tip: armorTypeTitle(gear, def) }, ARMOR_TYPE_GLYPHS[armorType(gear)]);
}

export function gearTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  return gear.kind === 'weapon' ? weaponTypeIcon(gear, def) : armorTypeIcon(gear, def);
}

/**
 * Маркер дальности оружия (v0.26): три точки — ряд врагов. Ближнее оружие красит первую (достаёт только первого),
 * дальнее, магическое, копьё и плеть — все три. С героем — в его руках: плеть у не владеющего красит одну.
 */
export function reachDots(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  if (gear.kind !== 'weapon') return null;
  const reach = weaponReach(gear, def);
  const lit = reach === 'melee' ? 1 : 3;
  return h('span', { class: `reach-dots reach-${reach}`, tip: weaponReachTitle(gear, def) }, ...[0, 1, 2].map((i) => h('i', { class: i < lit ? 'on' : '' })));
}

/** Строка перка базы: название своим цветом, описание после двоеточия. Предмет, которым герой не владеет, — перк зачёркнут, причина в подсказке. */
export function perkLine(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  const perk = gearPerkText(gear);
  if (!perk) return null;
  const off =
    def && gear.kind === 'weapon' && !canWieldWeapon(def, gear)
      ? `${def.name} не владеет ${WEAPON_TYPE_NAMES[weaponType(gear)].toLowerCase()} оружием: перк не работает`
      : def && gear.kind === 'armor' && !canWearArmor(def, gear)
        ? `${def.name} не умеет носить ${ARMOR_TYPE_NAMES[armorType(gear)].toLowerCase()} броню: перк не работает`
        : null;
  if (off) return h('div', { class: 'card-perk off', tip: off }, h('s', null, perk));
  const sep = perk.indexOf(':');
  const name = sep > 0 ? perk.slice(0, sep) : perk;
  const text = sep > 0 ? perk.slice(sep + 1) : '';
  // Полный текст в подсказке: в узких карточках торговца строка перка обрезается.
  return h('div', { class: 'card-perk', tip: perk }, h('span', { class: 'perk-name' }, name), text ? ':' : null, ...markKeywords(text));
}

/**
 * Статы экипировки одной строкой — одинаково в карточке награды и в плитке консоли: «Урон 4–6, ✦ +1 Сила»,
 * «+2 DEF, +4 HP, ✦ +1 шипы». У оружия — кубик в руках героя (владение уже учтено), без «2–6 → 1–4»:
 * исходный кубик и причина — в подсказке. Без героя (коллекция) — как есть.
 */
export function gearStatInfo(gear: GearInstance, def?: HeroDef): { text: string; tip?: string } {
  if (gear.kind !== 'weapon' || !def) return { text: gearStatText(gear) };
  const d = weaponDice(def, gear);
  const own = d.min !== gear.dmgMin || d.max !== gear.dmgMax;
  const text = gearStatText({ ...gear, dmgMin: d.min, dmgMax: d.max });
  return own ? { text, tip: `Кубик оружия ${gear.dmgMin}–${gear.dmgMax}, в руках героя ${d.min}–${d.max}: герой не владеет этим типом оружия` } : { text };
}

/**
 * Умения героя одной строкой: «Оружие: ⚔ ➶ ✦  Броня: ◆ ◈ ◇».
 * Цвет иконки — владение и умение носить: зелёный да, красный нет.
 * Названия, доля кубика и свойство типа — в подсказке при наведении на иконку; карточки предметов этого не повторяют.
 */
export function skillLine(def: HeroDef): HTMLElement {
  const weapons: WeaponType[] = ['melee', 'ranged', 'magic'];
  const armors: ArmorType[] = ['heavy', 'medium', 'light'];
  return h(
    'div',
    { class: 'skill-line' },
    h('span', { class: 'lbl', tip: 'Владение оружием: зелёный владеет, красный нет — кубик вдвое и перк базы не работает. Наведи на иконку' }, 'Оружие:'),
    ...weapons.map((t) => h('span', { class: def.weaponSkill[t] ? 'skill-yes' : 'skill-no', tip: weaponSkillTitle(t, def.weaponSkill[t]) }, WEAPON_TYPE_GLYPHS[t])),
    h('span', { class: 'lbl', tip: 'Умение носить броню: зелёный перк работает, красный нет. Наведи на иконку' }, 'Броня:'),
    ...armors.map((t) => h('span', { class: def.armorSkill[t] ? 'skill-yes' : 'skill-no', tip: armorSkillTitle(t, def.armorSkill[t]) }, ARMOR_TYPE_GLYPHS[t])),
  );
}

/** Золотая монета в тексте: «Перебросить за 5 ◉». */
export function coin(): HTMLElement {
  return h('span', { class: 'coin' }, '◉');
}

export function goldBadge(gold: number): HTMLElement {
  return h('span', { class: 'gold', tip: 'Золото: капает за бои, тратится на переброс награды' }, `◉ ${gold}`);
}

/** Статусы, у которых число — сила эффекта, а не служебная единица. */
const VALUE_STATUSES: StatusId[] = ['strength', 'bleed', 'burn', 'poison', 'thorns', 'regen', 'dodge', 'evade', 'enchant'];

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
      const doom = s.id === 'doom' && enemy ? onDeathInfo(enemy) : null;
      const hint = doom ? `${doom.name} — ${doom.detail}.\nСработает, когда враг погибнет` : s.element ? `Стихия: ${STATUS_NAMES[s.element]}. ${STATUS_HINTS[s.id]}` : STATUS_HINTS[s.id];
      const title = `${STATUS_NAMES[s.id]}${showValue ? ` ${s.value}` : ''}${s.turns > 0 ? `, ходов: ${s.turns}` : ''}\n${hint}`;
      return h(
        'span',
        { class: `status status-${s.id}`, tip: title },
        statusIcon(s.id, 18),
        showValue ? h('span', { class: 'status-val' }, `${s.value}`) : null,
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
              tip: why ?? (a ? `${artifactTitle(a)}\n— заменить: вытесненный встанет в очередь` : `${slotKindTip(sk)}\n— вставить сюда`),
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
        p.cancellable ? button('Отмена', () => app.pendingCancel()) : button('Выбросить', () => app.pendingDiscard(), { class: 'danger', tip: 'Артефакт пропадёт' }),
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
    h('span', { class: 'dim', tip: tags.length ? 'Переплавить этот артефакт: он пропадёт, а артефакт того же архетипа в сокете получит +1 тир' : 'Общая вещь: переплавляется в тир любому артефакту в сокете' }, 'Переплавить в:'),
    ...targets.map((t) =>
      button(
        `${artifactDef(t.art!.id).name} ${t.art!.tier}→${t.art!.tier + 1}`,
        () => {
          if (!canPendingSmelt(run, t.kind, t.index)) app.pendingSmelt(t.kind, t.index);
        },
        { class: 'small', tip: `${artifactTitle(t.art!)}\n— получит тир ${t.art!.tier + 1}, ${artifactDef(art.id).name} пропадёт` },
      ),
    ),
  );
}
