import { button, h, type Child } from './dom';
import type { ArtTier, ArtifactInstance, Combatant, DerivedStats, GearInstance, GearKind, GearTier, RunState, StatusId } from '../engine/types';
import { statusIcon } from './icons';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import {
  ARMOR_TYPE_GLYPHS,
  ARMOR_TYPE_NAMES,
  ART_TIER_COLORS,
  GEAR_TIERS,
  WEAPON_TYPE_GLYPHS,
  armorSkillTitle,
  armorType,
  armorTypeTitle,
  canWearArmor,
  gearPerkText,
  gearStatText,
  hasPerk,
  masteryTitle,
  weaponDice,
  weaponType,
  weaponTypeTitle,
} from '../data/gear';
import type { Collectible } from '../data/collection';
import type { ArmorType, HeroDef, WeaponType } from '../engine/types';
import { findSameArtifact, gearOf, socketRefs } from '../engine/equipment';
import { STATUS_HINTS, STATUS_NAMES, defendBlock } from '../engine/combat';
import { markKeywords } from './keywords';
import type { App } from './app';

/** Полоска: заливка и подпись «HP 12/20»; suffix — хвост подписи, у врага так показан блок: «12/20 · ⛨ 3». */
export function bar(cls: string, cur: number, max: number, label = '', tip = '', suffix = ''): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return h(
    'div',
    tip ? { class: `bar bar-${cls}`, tip } : { class: `bar bar-${cls}` },
    h('div', { class: 'bar-fill', style: `width:${pct}%` }),
    h('span', { class: 'bar-text' }, `${label ? label + ' ' : ''}${cur}/${max}`, suffix ? h('span', { class: 'bar-suffix' }, ` · ${suffix}`) : null),
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

/** Плитка предмета каталога: в сетке коллекции и в ленте сундука. */
export function collectibleTile(c: Collectible, locked = false): HTMLElement {
  if (locked) {
    return h('div', { class: 'coll-tile locked', tip: 'Ещё не найдено' }, h('span', { class: 'coll-glyph' }, '?'), h('span', { class: 'coll-name' }, '???'));
  }
  return h(
    'div',
    { class: `coll-tile kind-${c.kind}`, style: `border-color:${c.color}`, tip: `${c.name}\n${c.sub}\n${c.desc}` },
    h('span', { class: 'coll-glyph', style: `color:${c.color}` }, c.glyph),
    h('span', { class: 'coll-name' }, c.name),
  );
}

/** Крупная карточка находки — показывается после крутки сундука. */
export function collectibleCard(c: Collectible): HTMLElement {
  return h(
    'div',
    { class: 'card coll-card', style: `border-color:${c.color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph', style: `color:${c.color}` }, c.glyph), h('span', { class: 'card-name' }, c.name)),
    h('div', { class: 'card-sub', style: `color:${c.color}` }, c.sub),
    ...c.desc.split('\n').map((line) => h('div', { class: 'card-desc' }, line)),
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

export function artifactTitle(inst: ArtifactInstance): string {
  const def = artifactDef(inst.id);
  const lines = [`${def.name} (тир ${inst.tier})`, def.describe(inst.tier)];
  if (def.kind === 'active') lines.push(`Цена: ${artifactCostText(def, inst.tier)}`);
  else lines.push('Пассивный');
  if (inst.tier < 3) lines.push(`Следующий тир: ${def.describe((inst.tier + 1) as ArtTier)}`);
  return lines.join('\n');
}

export function artifactChip(inst: ArtifactInstance | null, opts: { onclick?: () => void; selected?: boolean } = {}): HTMLElement {
  if (!inst) return h('div', { class: 'chip chip-empty', tip: 'Пустой слот' }, '·');
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    {
      class: `chip ${def.kind} ${opts.selected ? 'selected' : ''} ${opts.onclick ? 'clickable' : ''}`,
      style: `border-color:${color}`,
      tip: artifactTitle(inst),
      onclick: opts.onclick,
    },
    h('span', { class: 'chip-glyph' }, def.glyph),
    h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)),
  );
}

/** note — строка перед подвалом: заметка об апгрейде или дельты (diff.ts). footer — кнопка, встаёт справа внизу. */
export function artifactCard(inst: ArtifactInstance, footer?: Child, note?: Child): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: 'card art-card', style: `border-color:${color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, def.glyph), h('span', { class: 'card-name' }, def.name)),
    // Тир не пишем: его показывает цвет рамки и подписи.
    h('div', { class: 'card-sub', style: `color:${color}` }, `Артефакт · ${def.kind === 'active' ? (def.school === 'magic' ? 'магия' : 'приём') : 'пассивный'}`),
    h('div', { class: 'card-desc' }, ...markKeywords(def.describe(inst.tier))),
    def.kind === 'active' ? h('div', { class: 'card-cost' }, `Цена: ${artifactCostText(def, inst.tier)}`) : null,
    note ?? null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

export function slotsRow(gear: GearInstance): HTMLElement {
  return h('div', { class: 'slots' }, ...gear.slots.map((s) => artifactChip(s)));
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

export function potionCard(id: string, footer?: Child, note?: string | null): HTMLElement {
  const def = potionDef(id);
  return h(
    'div',
    { class: 'card potion-card', style: `border-color:${POTION_COLOR}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph', style: `color:${POTION_COLOR}` }, def.glyph), h('span', { class: 'card-name' }, def.name)),
    h('div', { class: 'card-sub', style: `color:${POTION_COLOR}` }, 'Зелье · расходник'),
    h('div', { class: 'card-desc' }, ...markKeywords(def.describe)),
    h('div', { class: 'card-cost' }, 'Пьётся в бою бесплатно'),
    note ? h('div', { class: 'note' }, note) : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/** Иконка типа оружия у бейджа тира. С героем окрашена по владению: зелёный мастер, жёлтый знаком, красный чужое. */
export function weaponTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  const type = weaponType(gear);
  const cls = def ? `mastery-${def.mastery[type]}` : '';
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

/** Строка перка базы: название своим цветом, описание после двоеточия. Броня, которую герой не умеет носить, — перк зачёркнут, причина в подсказке. */
export function perkLine(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  const perk = gearPerkText(gear);
  if (!perk) return null;
  if (gear.kind === 'armor' && def && !canWearArmor(def, gear)) {
    return h(
      'div',
      { class: 'card-perk off', tip: `${def.name} не умеет носить ${ARMOR_TYPE_NAMES[armorType(gear)].toLowerCase()} броню: перк не работает` },
      h('s', null, perk),
    );
  }
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
  return own ? { text, tip: `Кубик оружия ${gear.dmgMin}–${gear.dmgMax}, в руках героя ${d.min}–${d.max}: владение типом оружия` } : { text };
}

function gearStatLine(gear: GearInstance, def?: HeroDef): HTMLElement {
  const { text, tip } = gearStatInfo(gear, def);
  return h('div', tip ? { class: 'card-desc', tip } : { class: 'card-desc' }, text);
}

/**
 * Карточка экипировки в награде и у торговца: в шапке имя (тир — в подсказке и цветом рамки) и иконка типа, кубик в руках героя, дельты к надетому
 * (deltas — строки из diff.ts), перк, внизу сокеты чипами и справа от них кнопка. Число сокетов не пишем: его видно по чипам.
 */
export function gearCard(gear: GearInstance, opts: { def?: HeroDef; footer?: Child; deltas?: HTMLElement[] } = {}): HTMLElement {
  const info = GEAR_TIERS[gear.tier];
  const { def, footer, deltas } = opts;
  const isWeapon = gear.kind === 'weapon';
  return h(
    'div',
    { class: 'card gear-card', style: `border-color:${info.color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, isWeapon ? '⚔' : '⛨'), h('span', { class: 'card-name', tip: tierTip(gear.tier) }, gear.name), gearTypeIcon(gear, def)),
    gearStatLine(gear, def),
    ...(deltas ?? []),
    perkLine(gear, def),
    h('div', { class: 'card-foot' }, slotsRow(gear), footer),
  );
}

/**
 * Умения героя одной строкой: «Оружие: ⚔ ➶ ✦  Броня: ◆ ◈ ◇».
 * Цвет иконки оружия — владение (зелёный мастер, жёлтый знаком, красный чужое), брони — умение носить (зелёный да, красный нет).
 * Названия, доля кубика и свойство типа — в подсказке при наведении на иконку; карточки предметов этого не повторяют.
 */
export function skillLine(def: HeroDef): HTMLElement {
  const weapons: WeaponType[] = ['melee', 'ranged', 'magic'];
  const armors: ArmorType[] = ['heavy', 'medium', 'light'];
  return h(
    'div',
    { class: 'mastery' },
    h('span', { class: 'lbl', tip: 'Владение оружием: зелёный мастер, жёлтый знаком, красный чужое. Наведи на иконку' }, 'Оружие:'),
    ...weapons.map((t) => h('span', { class: `mastery-${def.mastery[t]}`, tip: masteryTitle(t, def.mastery[t]) }, WEAPON_TYPE_GLYPHS[t])),
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
const VALUE_STATUSES: StatusId[] = ['strength', 'bleed', 'burn', 'poison', 'thorns', 'regen', 'dodge'];

export function statusIcons(c: Combatant): HTMLElement {
  return h(
    'div',
    { class: 'statuses' },
    ...c.statuses.map((s) => {
      const showValue = VALUE_STATUSES.includes(s.id) && (s.id !== 'dodge' || s.value > 1);
      const title = `${STATUS_NAMES[s.id]}${showValue ? ` ${s.value}` : ''}${s.turns > 0 ? `, ходов: ${s.turns}` : ''}\n${STATUS_HINTS[s.id]}`;
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

export function statsGrid(s: DerivedStats): HTMLElement {
  const row = (k: string, v: string, tip: string) => h('div', { class: 'stat', tip }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  return h(
    'div',
    { class: 'stats-grid' },
    row('Урон', `${s.dmgMin + s.str}–${s.dmgMax + s.str}`, 'Урон базовой атаки: разброс оружия + Сила'),
    row('DEF', `${s.def}`, `Защита. «Защититься» даёт 80 % от неё${s.defendBonus ? ' и бонуса брони' : ''}, округление вверх: +${defendBlock(s)} блока`),
    row('STA', `${s.sta}${s.firstTurnSta ? ` (+${s.firstTurnSta})` : ''}`, 'Очки действий за ход'),
    row('MP', `${s.maxMp}${s.mpRegen ? ` (+${s.mpRegen})` : ''}`, 'Мана и реген за ход'),
    row('Устал.', `−${Math.round((1 - s.fatigue) * 100)}%`, 'На столько слабее каждая следующая атака в этом ходу'),
    s.crit ? row('Крит', `${Math.round(s.crit * 100)} %`, `Шанс крита (урон ×${s.critMult})`) : null,
    s.firstHit ? row('1-й удар', `+${s.firstHit}`, 'Бонус урона первого удара в ходу') : null,
    s.spellPower ? row('Закл.', `+${s.spellPower}`, 'Бонус к урону заклинаний') : null,
    s.thorns ? row('Шипы', `${s.thorns}`, 'Урон атакующему') : null,
    s.lifesteal ? row('Вамп.', `${s.lifesteal}`, 'Лечение при базовой атаке') : null,
    s.regen ? row('Реген', `${s.regen}`, 'HP в начале хода') : null,
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
  const hasFree = socketRefs(run.hero).some((s) => !s.art);
  const group = (kind: GearKind) => {
    const gear = gearOf(run.hero, kind);
    const info = GEAR_TIERS[gear.tier];
    return h(
      'div',
      { class: 'pm-gear', style: `border-color:${info.color}` },
      h('div', { class: 'gt-head' }, h('span', { class: 'glyph' }, kind === 'weapon' ? '⚔' : '⛨'), h('span', { class: 'gt-name', tip: tierTip(gear.tier) }, gear.name)),
      h(
        'div',
        { class: 'gt-sockets' },
        ...gear.slots.map((a, index) => {
          const isSame = !!same && same.kind === kind && same.index === index;
          return h(
            'button',
            {
              class: `sock pm-sock ${a ? '' : 'empty'} ${isSame ? 'off' : ''}`,
              disabled: isSame,
              tip: a ? `${artifactTitle(a)}\n— заменить: старый артефакт пропадёт` : 'Свободный сокет: вставить сюда',
              onclick: () => app.pendingPlace(kind, index),
            },
            artifactChip(a),
            h('span', { class: 'sock-name' }, a ? `${artifactDef(a.id).name} · ${a.tier}` : 'свободный сокет'),
            h('span', { class: 'pm-act' }, a ? 'Заменить' : 'Вставить'),
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
      h('h2', null, 'Куда вставить артефакт?'),
      h('p', { class: 'dim' }, hasFree ? 'Клик по сокету. Занятый сокет — замена, старый артефакт пропадёт.' : 'Свободных сокетов нет: выберите, какой артефакт заменить.'),
      h('div', { class: 'pm-body' }, artifactCard(art), h('div', { class: 'pm-gears' }, group('weapon'), group('armor'))),
      h(
        'div',
        { class: 'row' },
        p.cancellable ? button('Отмена', () => app.pendingCancel()) : button('Выбросить', () => app.pendingDiscard(), { class: 'danger', tip: 'Артефакт пропадёт' }),
      ),
    ),
  );
}
